// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Derive a subtree-dirty predicate from the Mutative `pendingEditPatches`.
 *
 * Patch paths are rooted at the editor store draft, e.g.
 *   ['nodes', '<nodeId>', 'data', 'attributes', 0, 'name'].
 *
 * Two patch shapes are produced by the editor store:
 *  - Granular (from in-place mutations like addAttribute/removeAttribute):
 *      e.g. ['nodes', nodeId, 'data', 'attributes', 0, 'name']
 *  - Whole-node (from renameType, which does draft.nodes.set(newNodeId, {...})):
 *      e.g. ['nodes', nodeId]  (only 2 segments)
 *
 * A whole-node replace must dirty the ENTIRE subtree of that node, so the dirty
 * check must match when EITHER path is a prefix of the other (bidirectional).
 * A one-directional "patch has query as prefix" check would miss the whole-node
 * case for any query deeper than ['nodes', nodeId] — rename would be silently lost.
 */

import type { Patches } from 'mutative';

type PathSeg = string | number;
export interface DirtyIndex {
  /** All patch paths that target the `nodes` draft, normalized to arrays. */
  readonly paths: ReadonlyArray<ReadonlyArray<PathSeg>>;
}

export function buildDirtyIndex(patches: Patches): DirtyIndex {
  const paths: PathSeg[][] = [];
  for (const p of patches) {
    const path = p.path as PathSeg[];
    if (Array.isArray(path) && path[0] === 'nodes') paths.push(path);
  }
  return { paths };
}

/**
 * Returns true if the two paths share all segments up to the shorter length —
 * i.e. one path is a prefix of (or equal to) the other.
 * Comparison is loose: Mutative may emit numeric indices as numbers or strings.
 */
function related(a: ReadonlyArray<PathSeg>, b: ReadonlyArray<PathSeg>): boolean {
  const m = Math.min(a.length, b.length);
  for (let i = 0; i < m; i++) if (String(a[i]) !== String(b[i])) return false;
  return true;
}

export function isNodeDirty(index: DirtyIndex, nodeId: string): boolean {
  const prefix: PathSeg[] = ['nodes', nodeId];
  return index.paths.some((p) => related(p, prefix));
}

export function isSubtreeDirty(index: DirtyIndex, nodeId: string, dataPath: PathSeg[]): boolean {
  const prefix: PathSeg[] = ['nodes', nodeId, 'data', ...dataPath];
  return index.paths.some((p) => related(p, prefix));
}
