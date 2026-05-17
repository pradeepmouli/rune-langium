// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Shared types for the Structure View feature.
 * See docs/superpowers/specs/2026-05-12-structure-view-design.md.
 */

/** MIME type used for drag-drop payloads. */
export const TYPE_REF_PAYLOAD_MIME = 'application/x-rune-type-ref';

/**
 * Drag payload emitted by NamespaceExplorer items and consumed by drop targets.
 *
 * **Field semantics:**
 * - `typeId`   — canonical node id in `ns::Name` format (e.g. `cdm.trade::Trade`).
 *               Used by `setInheritance` and other operations that reference nodes
 *               by their fully-qualified id.
 * - `typeName` — bare display/AST name (e.g. `Trade`) used in `$refText` writes,
 *               e.g. `updateAttributeType`. This is what the grammar stores as the
 *               unqualified cross-reference text.
 *
 * Drag sources MUST set both fields.
 */
export interface TypeRefPayload {
  readonly rune: 'type-ref';
  readonly namespaceUri: string;
  /** Canonical node id in `ns::Name` format. Used by setInheritance. */
  readonly typeId: string;
  /** Bare AST/display name used in $refText writes. Used by updateAttributeType. */
  readonly typeName: string;
  readonly kind: 'Data' | 'Choice' | 'Enum' | 'BasicType';
}

/**
 * Kind-scoped MIME variant so drop targets can filter by `accept` during
 * dragover, when the browser security model makes `getData` return empty.
 *
 * **Recommended drag-source contract:** register BOTH the canonical
 * `TYPE_REF_PAYLOAD_MIME` (with the JSON payload) AND `typeRefMimeForKind(kind)`
 * (with empty value, just a marker). The dual-MIME pattern gives drop targets
 * accept-policy enforcement during the dragover phase.
 *
 * **Single-MIME fallback:** drag sources that register only the canonical MIME
 * will still trigger drop, but accept-policy filtering moves to drop time —
 * the hook can't filter by kind during dragover, so hover may briefly show
 * "accepting" before the drop is rejected if the payload kind isn't in `accept`.
 */
export function typeRefMimeForKind(kind: TypeRefPayload['kind']): string {
  return `${TYPE_REF_PAYLOAD_MIME}+${kind.toLowerCase()}`;
}

/** Type guard for parsed drag payloads. */
export function isTypeRefPayload(value: unknown): value is TypeRefPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.rune === 'type-ref' &&
    typeof v.namespaceUri === 'string' &&
    typeof v.typeId === 'string' &&
    typeof v.typeName === 'string' &&
    (v.kind === 'Data' || v.kind === 'Choice' || v.kind === 'Enum' || v.kind === 'BasicType')
  );
}

/**
 * Key used in the expansion map; encodes namespace + type + attribute, plus
 * an optional per-instance discriminator.
 *
 * **Per-instance semantics (Phase 14d, spec 020).** Each visible occurrence of
 * a type tracks its own expansion state — matching XmlSpy / Altova UModel /
 * Liquid Studio / Oxygen XML conventions. The `instancePath` carries the chain
 * of React Flow instance ids of the ancestors leading TO this row's owner (NOT
 * including the owner itself). Two placements of the same type at the same
 * depth produce different `instancePath`s because their parent instance ids
 * differ (e.g. `Trade::buyer::Party` vs `Trade::seller::Party`), so chevrons
 * inside them stay independent.
 *
 * The separator inside the path uses `>` (not `:`) because `:` is already the
 * field separator and we need to round-trip the path through a single string.
 */
export interface StructureExpansionKey {
  readonly namespaceUri: string;
  readonly typeId: string;
  readonly attrName: string;
  /**
   * Chain of React Flow instance ids of ancestors leading to this row's owner,
   * NOT including the owner. Empty/undefined = root-level instance (no ancestors).
   */
  readonly instancePath?: ReadonlyArray<string>;
}

/**
 * Serialise an expansion key for use as a Map / Record key.
 *
 * **Format:**
 * - No `instancePath` (or empty): `${namespaceUri}::${typeId}::${attrName}`
 * - With `instancePath`: `${namespaceUri}::${typeId}::${attrName}::${path.join('>')}`
 *
 * This is the single deterministic per-instance key shape. Root-level rows
 * (empty `instancePath`) serialize without a suffix; nested rows append the
 * ancestor chain. `expansionKey` is the sole serializer — use it everywhere.
 */
export function expansionKey(k: StructureExpansionKey): string {
  const base = `${k.namespaceUri}::${k.typeId}::${k.attrName}`;
  if (!k.instancePath || k.instancePath.length === 0) return base;
  return `${base}::${k.instancePath.join('>')}`;
}

/** Single row inside a Data node, as the Structure View sees it. */
export interface StructureRow {
  readonly attrName: string;
  readonly typeName: string;
  readonly typeKind: 'Data' | 'Choice' | 'Enum' | 'BasicType' | 'Unresolved';
  readonly targetNodeId?: string;
  readonly targetNamespaceUri?: string;
  readonly cardinality: string;
  readonly isOptional: boolean;
  readonly isInherited: boolean;
  /** Range in the source document (for diagnostic binding + cursor sync). */
  readonly astRange?: { start: number; end: number };
}

/** A Data node in the Structure View graph. */
export interface StructureDataNode {
  /**
   * CANONICAL node id (e.g. `cdm.trade::Party`). Cells / editors look up the
   * shared type description by this id. Multiple visible instances of the same
   * type share the same `id` — they are distinguished by `instanceId`.
   */
  readonly id: string;
  /**
   * Per-instance discriminator id (Phase 14e). The adapter emits one
   * StructureDataNode per visible occurrence of a type; each carries its own
   * `expansions` map so chevrons on different instances don't bleed into each
   * other (e.g. `buyer.Party` vs `seller.Party`).
   *
   * For root placements this equals the canonical `id`. For nested instances
   * it follows the layout's instance-id format
   * (`${parentInstanceId}::${attrName}::${canonicalId}`).
   *
   * The `nodes` map in `StructureGraphInput` is keyed on `instanceId` when
   * the adapter populates it. Layout-only test fixtures may omit `instanceId`;
   * the layout falls back to `id` so existing fixtures continue to work.
   */
  readonly instanceId?: string;
  readonly kind: 'data';
  readonly name: string;
  readonly namespaceUri: string;
  readonly extendsName?: string;
  readonly extendsNodeId?: string;
  readonly rows: ReadonlyArray<StructureRow>;
  /**
   * Direct expansions (attrName → child INSTANCE id). The child id keys into
   * `StructureGraphInput.nodes` (which is per-instance keyed).
   */
  readonly expansions: ReadonlyMap<string, string>;
}

/**
 * A Choice arm — represents one option in a Choice. Unlike Data attributes,
 * Choice arms have no `name` of their own (their identity IS their type) and
 * no cardinality (they are alternatives, not multi-valued).
 */
export interface StructureChoiceArm {
  /** The arm's type name as written in source (e.g., "CashPayment"). */
  readonly typeName: string;
  /** Classification of the referenced type, mirroring StructureRow.typeKind. */
  readonly typeKind: 'Data' | 'Choice' | 'Enum' | 'Builtin' | 'Unresolved';
  /** Canonical id of the referenced node, when resolvable. */
  readonly targetNodeId?: string;
}

/** A Choice node in the Structure View graph. */
export interface StructureChoiceNode {
  /** Canonical node id; see `StructureDataNode.id` for the per-instance contract. */
  readonly id: string;
  /** Per-instance discriminator (Phase 14e); see `StructureDataNode.instanceId`. */
  readonly instanceId?: string;
  readonly kind: 'choice';
  readonly name: string;
  readonly namespaceUri: string;
  readonly options: ReadonlyArray<StructureChoiceArm>;
}

/** A base-type GroupContainer wrap. */
export interface StructureBaseContainer {
  /**
   * Canonical wrapper id (e.g. `cdm.trade::Trade::__base::cdm.trade::TradeBase`).
   * Multiple instances of the same wrapper (one per visible occurrence of the
   * outer type) share the canonical id but differ in `instanceId`.
   */
  readonly id: string;
  /** Per-instance discriminator (Phase 14e); see `StructureDataNode.instanceId`. */
  readonly instanceId?: string;
  readonly kind: 'base';
  readonly baseTypeName: string;
  readonly baseTypeNamespaceUri: string;
  readonly baseRows: ReadonlyArray<StructureRow>;
  /** INSTANCE id of the child Data node inside this base container. */
  readonly childNodeId: string;
  /**
   * Containment edges from this base level's inherited rows into expanded
   * target nodes (Data/Choice that the user clicked to expand). Values are
   * INSTANCE ids (mirroring StructureDataNode.expansions). Spec §3.2 — base
   * level rows can carry their own expansion edges, scoped per-instance.
   */
  readonly expansions: ReadonlyMap<string, string>;
}

export type StructureNode = StructureDataNode | StructureChoiceNode | StructureBaseContainer;

/** Full graph input produced by the adapter. */
export interface StructureGraphInput {
  /**
   * INSTANCE id of the root node. Keys into `nodes`. For the root placement
   * the instance id equals the canonical id of the outermost wrapper, so
   * existing callers that pass canonical ids through this field continue to
   * work for non-nested roots.
   */
  readonly rootNodeId: string;
  /**
   * Per-instance node map. Keys are `StructureNode.instanceId`; each visible
   * occurrence of a type is its own entry with its own `expansions` map.
   * Look up a node's shared canonical metadata via `.id`.
   */
  readonly nodes: ReadonlyMap<string, StructureNode>;
}
