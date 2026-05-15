// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Shared types for the Structure View feature.
 * See docs/superpowers/specs/2026-05-12-structure-view-design.md.
 */

/** MIME type used for drag-drop payloads. */
export const TYPE_REF_PAYLOAD_MIME = 'application/x-rune-type-ref';

/** Drag payload emitted by NamespaceExplorer items and consumed by drop targets. */
export interface TypeRefPayload {
  readonly rune: 'type-ref';
  readonly namespaceUri: string;
  readonly typeId: string;
  readonly kind: 'Data' | 'Choice' | 'Enum' | 'BasicType';
}

/**
 * Kind-scoped MIME variant so drop targets can filter by `accept` during
 * dragover, when the browser security model makes `getData` return empty.
 * Drag sources should call `setData(TYPE_REF_PAYLOAD_MIME, json)` AND
 * `setData(typeRefMimeForKind(kind), '')` so the target's dragover handler
 * can read `types` and match against an accept list.
 */
export function typeRefMimeForKind(kind: TypeRefPayload['kind']): string {
  return `${TYPE_REF_PAYLOAD_MIME}+${kind}`;
}

/** Type guard for parsed drag payloads. */
export function isTypeRefPayload(value: unknown): value is TypeRefPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.rune === 'type-ref' &&
    typeof v.namespaceUri === 'string' &&
    typeof v.typeId === 'string' &&
    (v.kind === 'Data' || v.kind === 'Choice' || v.kind === 'Enum' || v.kind === 'BasicType')
  );
}

/** Key used in the expansion map; encodes namespace + type + attribute. */
export interface StructureExpansionKey {
  readonly namespaceUri: string;
  readonly typeId: string;
  readonly attrName: string;
}

/** Serialise an expansion key for use as a Map / Record key. */
export function expansionKey(k: StructureExpansionKey): string {
  return `${k.namespaceUri}::${k.typeId}::${k.attrName}`;
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

/** A Choice node in the Structure View graph. */
export interface StructureChoiceNode {
  readonly id: string;
  readonly kind: 'choice';
  readonly name: string;
  readonly namespaceUri: string;
  readonly options: ReadonlyArray<StructureRow>;
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
