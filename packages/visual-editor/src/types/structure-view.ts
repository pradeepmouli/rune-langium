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
 * **Back-compat / migration.** When `instancePath` is omitted or empty, the
 * serialized form is identical to the pre-Phase-14d format (no suffix added).
 * This means:
 *   1. Old persisted keys deserialize and behave as "root-level" / no-ancestor
 *      expansions — no data loss, no migration step required.
 *   2. The root node always has `instancePath = []`, so its rows preserve the
 *      old key shape and continue to work after a load from old persistence.
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
   * NOT including the owner. Empty/undefined = root-level instance (back-compat).
   */
  readonly instancePath?: ReadonlyArray<string>;
}

/**
 * Serialise an expansion key for use as a Map / Record key.
 *
 * **Format:**
 * - No `instancePath` (or empty): `${namespaceUri}::${typeId}::${attrName}` (legacy form)
 * - With `instancePath`: `${namespaceUri}::${typeId}::${attrName}::${path.join('>')}`
 *
 * The legacy form is preserved exactly so old persisted maps round-trip
 * without migration. See `StructureExpansionKey` doc for the full rationale.
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
  readonly id: string;
  readonly kind: 'data';
  readonly name: string;
  readonly namespaceUri: string;
  readonly extendsName?: string;
  readonly extendsNodeId?: string;
  readonly rows: ReadonlyArray<StructureRow>;
  /** Direct expansions (attrName → child node id). */
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
  readonly id: string;
  readonly kind: 'choice';
  readonly name: string;
  readonly namespaceUri: string;
  readonly options: ReadonlyArray<StructureChoiceArm>;
}

/** A base-type GroupContainer wrap. */
export interface StructureBaseContainer {
  readonly id: string;
  readonly kind: 'base';
  readonly baseTypeName: string;
  readonly baseTypeNamespaceUri: string;
  readonly baseRows: ReadonlyArray<StructureRow>;
  readonly childNodeId: string;
  /**
   * Containment edges from this base level's inherited rows into expanded
   * target nodes (Data/Choice that the user clicked to expand). Mirrors
   * StructureDataNode.expansions; spec §3.2 says containment is uniform
   * across inheritance and type-reference, so a row's owner — whether base
   * level or derived level — must be able to carry its own expansion edges.
   */
  readonly expansions: ReadonlyMap<string, string>;
}

export type StructureNode = StructureDataNode | StructureChoiceNode | StructureBaseContainer;

/** Full graph input produced by the adapter. */
export interface StructureGraphInput {
  readonly rootNodeId: string;
  readonly nodes: ReadonlyMap<string, StructureNode>;
}
