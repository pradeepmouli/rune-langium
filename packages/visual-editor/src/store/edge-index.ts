// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import type { TypeGraphEdge } from '../types.js';

/**
 * Forward/reverse edge index derived from `edgesById`.
 *
 * READ-SIDE ONLY (spec §2): the index carries no `$refText`, so it has none
 * to go stale — inline `{$refText}` on node data remains the authoritative
 * serialized form. Writes are ADDRESSED by this index (renameType walks
 * `byTarget`), they never flow through it.
 */
export interface EdgeIndex {
  bySource(id: string): readonly TypeGraphEdge[];
  byTarget(id: string): readonly TypeGraphEdge[];
}

const EMPTY: readonly TypeGraphEdge[] = [];

let cacheKey: ReadonlyMap<string, TypeGraphEdge> | null = null;
let cacheValue: EdgeIndex | null = null;

/**
 * Memoized on the Map's identity — the store swaps the `edgesById` reference
 * on every `mutateGraph`, so an unchanged reference returns the cached
 * instance (same single-slot pattern as `selectNodeRepository`; a single
 * cache slot is correctness-safe for Studio's single store).
 */
export function selectEdgeIndex(edgesById: ReadonlyMap<string, TypeGraphEdge>): EdgeIndex {
  if (edgesById === cacheKey && cacheValue !== null) return cacheValue;
  const bySource = new Map<string, TypeGraphEdge[]>();
  const byTarget = new Map<string, TypeGraphEdge[]>();
  for (const edge of edgesById.values()) {
    let s = bySource.get(edge.source);
    if (s === undefined) {
      s = [];
      bySource.set(edge.source, s);
    }
    s.push(edge);
    let t = byTarget.get(edge.target);
    if (t === undefined) {
      t = [];
      byTarget.set(edge.target, t);
    }
    t.push(edge);
  }
  const index: EdgeIndex = {
    bySource: (id) => bySource.get(id) ?? EMPTY,
    byTarget: (id) => byTarget.get(id) ?? EMPTY
  };
  cacheKey = edgesById;
  cacheValue = index;
  return index;
}
