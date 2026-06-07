// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * edit-reconcile — id-keyed Mutative patch foundation for surviving re-parses.
 *
 * The editor graph (`nodes`/`edges`) is rebuilt from a parse every time the
 * source is re-parsed. A user edit that is still "in flight" (made after the
 * source was saved but before the reparse of that save lands) would be wiped by
 * the rebuild. This module captures user edits as **id-keyed** Mutative patches
 * and replays the not-yet-round-tripped ones on top of each fresh parse.
 *
 * Why id-keyed (a `Map<id, node>` projection) rather than the raw arrays:
 * Mutative patch paths address array elements by INDEX (`nodes[3]…`). A reparse
 * re-derives + re-lays-out the array, so indices shift and an index-addressed
 * patch would mutate the WRONG node. Projecting to `Map<id, …>` makes every
 * patch path id-rooted (`['nodes', '<id>', 'data', …]`) and therefore stable
 * across reparses. The store keeps arrays (React Flow needs them); this module
 * is the array⇄map boundary.
 *
 * This module is pure (no store, no React) so the data-critical replay logic is
 * unit-tested in isolation — see edit-reconcile.test.ts.
 */

import { create, apply, type Patches, type Patch } from 'mutative';
import type { TypeGraphNode, TypeGraphEdge } from '../types.js';
import { toNodesById, toEdgesById, nodesFromMap, edgesFromMap } from './node-projection.js';

/** Id-keyed projection of the editable graph — the unit Mutative patches address. */
export interface GraphDraft {
  nodes: Map<string, TypeGraphNode>;
  edges: Map<string, TypeGraphEdge>;
}

/** Recipe operating on the id-keyed draft (mutate `draft.nodes`/`draft.edges`). */
export type GraphEditRecipe = (draft: GraphDraft) => void;

export function projectGraph(nodes: readonly TypeGraphNode[], edges: readonly TypeGraphEdge[]): GraphDraft {
  return { nodes: toNodesById(nodes), edges: toEdgesById(edges) };
}

export function flattenGraph(draft: GraphDraft): { nodes: TypeGraphNode[]; edges: TypeGraphEdge[] } {
  return { nodes: nodesFromMap(draft.nodes), edges: edgesFromMap(draft.edges) };
}

/**
 * Run a user edit through Mutative on the id-keyed projection, returning the
 * new arrays AND the id-rooted patches describing the change. The caller
 * accumulates the patches as pending user intent.
 */
export function commitGraphEdit(
  nodes: readonly TypeGraphNode[],
  edges: readonly TypeGraphEdge[],
  recipe: GraphEditRecipe
): { nodes: TypeGraphNode[]; edges: TypeGraphEdge[]; patches: Patches } {
  const [next, patches] = create(projectGraph(nodes, edges), recipe, { enablePatches: true });
  return { ...flattenGraph(next), patches };
}

/** Cheap structural equality for patch values (small, JSON-safe graph data). */
function valueEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** Navigate `root` along a patch path; report whether it exists and its value. */
function readPath(root: GraphDraft, path: ReadonlyArray<string | number>): { found: boolean; value: unknown } {
  let cur: unknown = root;
  for (const key of path) {
    if (cur == null) return { found: false, value: undefined };
    if (cur instanceof Map) {
      if (!cur.has(key as string)) return { found: false, value: undefined };
      cur = cur.get(key as string);
    } else if (Array.isArray(cur)) {
      const i = key as number;
      if (typeof i !== 'number' || i < 0 || i >= cur.length) return { found: false, value: undefined };
      cur = cur[i];
    } else if (typeof cur === 'object') {
      if (!(key in (cur as Record<string, unknown>))) return { found: false, value: undefined };
      cur = (cur as Record<string, unknown>)[key as string];
    } else {
      return { found: false, value: undefined };
    }
  }
  return { found: true, value: cur };
}

/**
 * Has the freshly-parsed graph already round-tripped this edit? An add/replace
 * is satisfied when the parse already holds the patched value at that path; a
 * remove is satisfied when the path is already absent. Satisfied patches are
 * dropped (the source caught up), so edits don't replay forever or resurrect a
 * value the user later changed through the source editor.
 */
export function patchAlreadySatisfied(parse: GraphDraft, patch: Patch): boolean {
  // We always generate array paths (default); string-delimited paths are unused.
  if (!Array.isArray(patch.path)) return false;
  const { found, value } = readPath(parse, patch.path);
  if (patch.op === 'remove') return !found;
  if (!found) return false;
  return valueEqual(value, patch.value);
}

/**
 * Reconcile pending user-edit patches with a fresh, healthy parse:
 *   1. drop patches the parse already satisfies (round-tripped through source),
 *   2. replay the rest on top of the parse so in-flight edits survive,
 *   3. return the merged Maps + the still-pending patches.
 *
 * Returns Maps (the canonical edit substrate) so `loadModels` can set them
 * directly without an extra array→Map round-trip. Callers that need arrays
 * should call `nodesFromMap`/`edgesFromMap` on the returned Maps.
 *
 * If replay throws (a patch path no longer exists after a structural reparse),
 * fall back to the parse verbatim and clear the patches — the edit remains
 * persisted in source from its own save, so a momentarily-stale graph is
 * strictly safer than a crash or a corrupt splice.
 */
export function reconcileParse(
  parseNodes: TypeGraphNode[],
  parseEdges: TypeGraphEdge[],
  pending: Patches
): { nodesById: Map<string, TypeGraphNode>; edgesById: Map<string, TypeGraphEdge>; remainingPatches: Patches } {
  const parse = projectGraph(parseNodes, parseEdges); // canonical Maps for this parse

  if (pending.length === 0) {
    return { nodesById: parse.nodes, edgesById: parse.edges, remainingPatches: [] };
  }

  const unsatisfied = pending.filter((p) => !patchAlreadySatisfied(parse, p));
  if (unsatisfied.length === 0) {
    return { nodesById: parse.nodes, edgesById: parse.edges, remainingPatches: [] };
  }

  try {
    const replayed = apply(parse, unsatisfied) as GraphDraft;
    return { nodesById: replayed.nodes, edgesById: replayed.edges, remainingPatches: unsatisfied };
  } catch {
    // Fallback: parse verbatim, patches cleared.
    return { nodesById: parse.nodes, edgesById: parse.edges, remainingPatches: [] };
  }
}
