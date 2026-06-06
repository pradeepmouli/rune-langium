// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * node-projection — the SINGLE owner of node-shape knowledge for the visual
 * editor: id construction, edge-id construction, the GraphMetadata field set +
 * AST projection, per-kind member-container access, and array↔Map derivation.
 *
 * No node-shape fact should live anywhere else. (Node-KIND resolution stays in
 * `model-helpers.ts`'s `resolveNodeKind`; this module re-exports it for a single
 * import surface but does not re-implement it.)
 *
 * NOTE: the node-id separator is `::` here; the `::`→`.` unification is a
 * separate follow-up that only changes the two functions below.
 */

import type { EdgeKind, AnyGraphNode, TypeGraphNode, TypeGraphEdge } from '../types.js';

// Re-export so callers can import EdgeKind from a single surface.
export type { EdgeKind };

const NODE_ID_SEPARATOR = '::';

/** Build the canonical top-level node id `${namespace}::${name}`. */
export function makeNodeId(namespace: string, name: string): string {
  return `${namespace}${NODE_ID_SEPARATOR}${name}`;
}

/** The trailing simple name of a node id (everything after the last separator). */
export function nameFromNodeId(nodeId: string): string {
  const parts = nodeId.split(NODE_ID_SEPARATOR);
  return parts.length > 1 ? parts[parts.length - 1]! : nodeId;
}

/** Split a node id into `{ namespace, name }`; namespace is '' when absent. */
export function splitNodeId(nodeId: string): { namespace: string; name: string } {
  const idx = nodeId.lastIndexOf(NODE_ID_SEPARATOR);
  if (idx < 0) return { namespace: '', name: nodeId };
  return { namespace: nodeId.slice(0, idx), name: nodeId.slice(idx + NODE_ID_SEPARATOR.length) };
}

// ---------------------------------------------------------------------------
// V3 edge-id builders
// ---------------------------------------------------------------------------

const EDGE_SEPARATOR = '--';
const LABEL_BEARING: ReadonlySet<EdgeKind> = new Set(['attribute-ref', 'choice-option']);

/**
 * All known EdgeKind values — kept in sync with the `EdgeKind` union in `types.ts`.
 * Satisfies `ReadonlySet<EdgeKind>` so the compiler catches any drift.
 */
const KNOWN_EDGE_KINDS: ReadonlySet<EdgeKind> = new Set([
  'extends', 'attribute-ref', 'choice-option', 'enum-extends', 'type-alias-ref'
] satisfies EdgeKind[]);

/**
 * Build an edge id. Label-bearing kinds (`attribute-ref`, `choice-option`) encode
 * `${source}--${kind}--${label}--${target}`; others encode `${source}--${kind}--${target}`.
 *
 * The format decision is driven by KIND (matching `parseEdgeId`), not by whether
 * `label` is present. A label-bearing kind with no label degrades to an empty label
 * segment; a label-less kind silently ignores any stray label argument.
 */
export function makeEdgeId(kind: EdgeKind, parts: { source: string; target: string; label?: string }): string {
  const { source, target, label } = parts;
  return LABEL_BEARING.has(kind)
    ? `${source}${EDGE_SEPARATOR}${kind}${EDGE_SEPARATOR}${label ?? ''}${EDGE_SEPARATOR}${target}`
    : `${source}${EDGE_SEPARATOR}${kind}${EDGE_SEPARATOR}${target}`;
}

/** Parse an edge id back to its parts, or `null` if it isn't a well-formed edge id. */
export function parseEdgeId(
  id: string
): { kind: EdgeKind; source: string; target: string; label?: string } | null {
  const segs = id.split(EDGE_SEPARATOR);
  if (segs.length < 3) return null;
  const kind = segs[1] as EdgeKind;
  if (!KNOWN_EDGE_KINDS.has(kind)) return null;
  if (LABEL_BEARING.has(kind)) {
    if (segs.length !== 4) return null;
    return { kind, source: segs[0]!, label: segs[2], target: segs[3]! };
  }
  if (segs.length !== 3) return null;
  return { kind, source: segs[0]!, target: segs[2]! };
}

// ---------------------------------------------------------------------------
// V2 metadata field set + AST projection
// ---------------------------------------------------------------------------

/**
 * The GraphMetadata keys stripped when extracting the AST model. Mirrors the old
 * `GRAPH_META_KEYS` exactly — `deferred` is intentionally NOT included (deferred
 * placeholder nodes are stripped via their absence from the real node set, not
 * via this key set).
 */
export const GRAPH_METADATA_KEYS: ReadonlySet<string> = new Set([
  'namespace', 'position', 'errors', 'isReadOnly', 'hasExternalRefs', 'comments'
]);

/**
 * Fields excluded from the content fingerprint (positional / derived view state).
 * Mirrors the inline exclusion in `computeContentFingerprint` exactly —
 * changing this set would cause every model to re-serialize on upgrade.
 */
const FINGERPRINT_EXCLUDED: ReadonlySet<string> = new Set(['position', 'errors', 'hasExternalRefs']);

/** Strip GraphMetadata view fields, leaving only AST-relevant fields. */
export function stripGraphMetadata(data: AnyGraphNode): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!GRAPH_METADATA_KEYS.has(key)) result[key] = value;
  }
  return result;
}

/**
 * The "what counts as content" projection for fingerprinting — excludes
 * `position`, `errors`, and `hasExternalRefs` so positional-only mutations
 * (drag, layout, fit-view) don't trigger the serialization pipeline.
 */
export function astRelevantProjection(data: AnyGraphNode): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!FINGERPRINT_EXCLUDED.has(key)) result[key] = value;
  }
  return result;
}

/**
 * Inverse of `stripGraphMetadata`: merge AST data with GraphMetadata fields
 * into a graph-node data object. The caller supplies exactly the metadata
 * fields the site currently sets (e.g. `namespace`, `position`, `errors`,
 * `isReadOnly`, `hasExternalRefs`; optionally `deferred`).
 */
export function withGraphMetadata(
  astData: Record<string, unknown>,
  meta: Record<string, unknown>
): AnyGraphNode {
  return { ...astData, ...meta } as unknown as AnyGraphNode;
}

// ---------------------------------------------------------------------------
// V4 member-array accessors
// ---------------------------------------------------------------------------

/** Per-kind member-container field. The single owner of this map (V4). */
const MEMBER_FIELD_BY_KIND: Readonly<Record<string, string>> = {
  Data: 'attributes',
  Annotation: 'attributes',
  Choice: 'attributes',
  RosettaEnumeration: 'enumValues',
  RosettaFunction: 'inputs',
  RosettaRecordType: 'features'
};

/** The member array + its field name for a node, or null if the kind has none. */
export function getMemberArray(node: { $type?: string } & Record<string, unknown>): { field: string; members: unknown[] } | null {
  const field = node.$type ? MEMBER_FIELD_BY_KIND[node.$type] : undefined;
  if (!field) return null;
  const members = node[field];
  return { field, members: Array.isArray(members) ? members : [] };
}

/** Ensure the member array exists on the node, returning it (initializes `[]`). */
export function ensureMemberArray(node: { $type?: string } & Record<string, unknown>): unknown[] {
  const field = node.$type ? MEMBER_FIELD_BY_KIND[node.$type] : undefined;
  if (!field) return []; // no-op for unknown kinds (returns a disconnected [])
  if (!Array.isArray(node[field])) node[field] = [];
  return node[field] as unknown[];
}

/** Iterate the members of a node (no-op when the kind has no member container). */
export function forEachMember(node: { $type?: string } & Record<string, unknown>, fn: (member: unknown, index: number) => void): void {
  const got = getMemberArray(node);
  if (got) got.members.forEach(fn);
}

// ---------------------------------------------------------------------------
// V5/V6 array↔Map derivation primitives
// ---------------------------------------------------------------------------

/** Build the id→node Map (insertion order preserved). */
export function toNodesById(nodes: readonly TypeGraphNode[]): Map<string, TypeGraphNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

/** Derive the node array from the Map (= [...map.values()]). */
export function nodesFromMap(map: ReadonlyMap<string, TypeGraphNode>): TypeGraphNode[] {
  return [...map.values()];
}

/** Build the id→edge Map. */
export function toEdgesById(edges: readonly TypeGraphEdge[]): Map<string, TypeGraphEdge> {
  return new Map(edges.map((e) => [e.id, e]));
}

/** Derive the edge array from the Map. */
export function edgesFromMap(map: ReadonlyMap<string, TypeGraphEdge>): TypeGraphEdge[] {
  return [...map.values()];
}

// ---------------------------------------------------------------------------
// Node-kind resolution (re-exported so node-projection.ts is the single
// import surface for structural projections — the implementation lives in
// model-helpers.ts and is NOT re-implemented here).
// ---------------------------------------------------------------------------
export { resolveNodeKind } from '../adapters/model-helpers.js';
