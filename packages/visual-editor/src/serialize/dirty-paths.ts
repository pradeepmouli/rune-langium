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

declare const _dirtyIndexBrand: unique symbol;
/**
 * Opaque index of patch paths produced by {@link buildDirtyIndex}.
 * Pass only to {@link isNodeDirty} or {@link isSubtreeDirty} — internal
 * structure (`.paths`) is not part of the public API.
 */
export type DirtyIndex = { readonly [_dirtyIndexBrand]: true };

/** Internal shape kept separate so callers cannot access `.paths`. */
type DirtyIndexData = { paths: ReadonlyArray<ReadonlyArray<PathSeg>> };
function _data(idx: DirtyIndex): DirtyIndexData {
  return idx as unknown as DirtyIndexData;
}

export function buildDirtyIndex(patches: Patches): DirtyIndex {
  const paths: PathSeg[][] = [];
  for (const p of patches) {
    const path = p.path as PathSeg[];
    if (Array.isArray(path) && path[0] === 'nodes') paths.push(path);
  }
  return { paths } as unknown as DirtyIndex;
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
  return _data(index).paths.some((p) => related(p, prefix));
}

export function isSubtreeDirty(index: DirtyIndex, nodeId: string, dataPath: PathSeg[]): boolean {
  const prefix: PathSeg[] = ['nodes', nodeId, 'data', ...dataPath];
  return _data(index).paths.some((p) => related(p, prefix));
}
