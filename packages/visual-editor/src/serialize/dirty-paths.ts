// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Derive a subtree-dirty predicate from the Mutative `pendingEditPatches`.
 *
 * Patch paths are rooted at the editor store draft, e.g.
 *   ['nodes', '<nodeId>', 'data', 'attributes', 0, 'name'].
 * A node's subtree at `['nodes', nodeId, 'data', ...dataPath]` is dirty iff some
 * patch path is at-or-under it (the patch path has that path as a prefix).
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

function hasPrefix(path: ReadonlyArray<PathSeg>, prefix: PathSeg[]): boolean {
  if (path.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    // Compare loosely: Mutative may emit numeric indices as numbers or strings.
    if (String(path[i]) !== String(prefix[i])) return false;
  }
  return true;
}

export function isNodeDirty(index: DirtyIndex, nodeId: string): boolean {
  const prefix: PathSeg[] = ['nodes', nodeId];
  return index.paths.some((p) => hasPrefix(p, prefix));
}

export function isSubtreeDirty(index: DirtyIndex, nodeId: string, dataPath: PathSeg[]): boolean {
  const prefix: PathSeg[] = ['nodes', nodeId, 'data', ...dataPath];
  return index.paths.some((p) => hasPrefix(p, prefix));
}
