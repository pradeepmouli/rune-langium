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

import type { EdgeKind } from '../types.js';

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
 * Build an edge id. Label-bearing kinds (`attribute-ref`, `choice-option`) encode
 * `${source}--${kind}--${label}--${target}`; others encode `${source}--${kind}--${target}`.
 */
export function makeEdgeId(kind: EdgeKind, parts: { source: string; target: string; label?: string }): string {
  const { source, target, label } = parts;
  return label !== undefined
    ? `${source}${EDGE_SEPARATOR}${kind}${EDGE_SEPARATOR}${label}${EDGE_SEPARATOR}${target}`
    : `${source}${EDGE_SEPARATOR}${kind}${EDGE_SEPARATOR}${target}`;
}

/** Parse an edge id back to its parts, or `null` if it isn't a well-formed edge id. */
export function parseEdgeId(
  id: string
): { kind: EdgeKind; source: string; target: string; label?: string } | null {
  const segs = id.split(EDGE_SEPARATOR);
  if (segs.length < 3) return null;
  const kind = segs[1] as EdgeKind;
  if (LABEL_BEARING.has(kind)) {
    if (segs.length !== 4) return null;
    return { kind, source: segs[0]!, label: segs[2], target: segs[3]! };
  }
  if (segs.length !== 3) return null;
  return { kind, source: segs[0]!, target: segs[2]! };
}
