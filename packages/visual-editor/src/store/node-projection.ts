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
