// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Unit tests for the id-keyed Mutative reconcile foundation (edit-reconcile.ts).
 *
 * The headline property: a captured user edit replays onto a fresh parse BY
 * NODE ID, so it survives a reparse that REORDERS the node array — the exact
 * case where naive index-addressed patches would corrupt the wrong node.
 */

import { describe, it, expect } from 'vitest';
import type { Patch } from 'mutative';
import {
  commitGraphEdit,
  reconcileParse,
  projectGraph,
  patchAlreadySatisfied
} from '../../src/store/edit-reconcile.js';
import type { TypeGraphNode, TypeGraphEdge } from '../../src/types.js';

function dataNode(id: string, name: string, attrs: Array<{ name: string; type: string }>): TypeGraphNode {
  return {
    id,
    type: 'data',
    position: { x: 0, y: 0 },
    data: { $type: 'Data', name, namespace: 'ns', attributes: attrs }
  } as unknown as TypeGraphNode;
}

const NO_EDGES: TypeGraphEdge[] = [];

describe('edit-reconcile', () => {
  it('captures id-ROOTED patches (path starts with the node id, not an array index)', () => {
    const nodes = [dataNode('ns.Alpha', 'Alpha', [{ name: 'x', type: 'string' }])];
    const { patches } = commitGraphEdit(nodes, NO_EDGES, (draft) => {
      const n = draft.nodes.get('ns.Alpha')!;
      (n.data as { attributes: Array<{ name: string }> }).attributes[0].name = 'renamed';
    });
    expect(patches.length).toBeGreaterThan(0);
    // path[0] = 'nodes' (the GraphDraft key), path[1] = the NODE ID (stable),
    // NOT a numeric array index.
    const p = patches[0] as Patch;
    expect(p.path[0]).toBe('nodes');
    expect(p.path[1]).toBe('ns.Alpha');
  });

  it('replays an in-flight edit onto a REORDERED reparse by id (no wrong-node corruption)', () => {
    // Live graph: Alpha(attr x), Beta(attr y), in that order.
    const live = [
      dataNode('ns.Alpha', 'Alpha', [{ name: 'x', type: 'string' }]),
      dataNode('ns.Beta', 'Beta', [{ name: 'y', type: 'string' }])
    ];
    // User renames Alpha.x -> z (in flight; source not yet round-tripped).
    const { patches } = commitGraphEdit(live, NO_EDGES, (draft) => {
      (draft.nodes.get('ns.Alpha')!.data as { attributes: Array<{ name: string }> }).attributes[0].name = 'z';
    });

    // A reparse lands with the nodes in REVERSED order and the OLD content
    // (Alpha still has x) — index 0 is now Beta. Naive index replay would
    // corrupt Beta; id-keyed replay must target Alpha.
    const reparse = [
      dataNode('ns.Beta', 'Beta', [{ name: 'y', type: 'string' }]),
      dataNode('ns.Alpha', 'Alpha', [{ name: 'x', type: 'string' }])
    ];

    const { nodes, remainingPatches } = reconcileParse(reparse, NO_EDGES, patches);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const alphaAttrs = (byId.get('ns.Alpha')!.data as { attributes: Array<{ name: string }> }).attributes;
    const betaAttrs = (byId.get('ns.Beta')!.data as { attributes: Array<{ name: string }> }).attributes;

    expect(alphaAttrs[0].name).toBe('z'); // edit applied to the RIGHT node
    expect(betaAttrs[0].name).toBe('y'); // Beta untouched (would be 'z' under index replay)
    expect(remainingPatches.length).toBeGreaterThan(0); // still pending (source hasn't caught up)
  });

  it('drops a patch the parse already satisfies (edit round-tripped through source)', () => {
    const live = [dataNode('ns.Alpha', 'Alpha', [{ name: 'x', type: 'string' }])];
    const { patches } = commitGraphEdit(live, NO_EDGES, (draft) => {
      (draft.nodes.get('ns.Alpha')!.data as { attributes: Array<{ name: string }> }).attributes[0].name = 'z';
    });

    // The reparse now REFLECTS the edit (source caught up: attr is already 'z').
    const caughtUp = [dataNode('ns.Alpha', 'Alpha', [{ name: 'z', type: 'string' }])];
    const parse = projectGraph(caughtUp, NO_EDGES);
    expect(patchAlreadySatisfied(parse, patches[0] as Patch)).toBe(true);

    const { nodes, remainingPatches } = reconcileParse(caughtUp, NO_EDGES, patches);
    expect((nodes[0].data as { attributes: Array<{ name: string }> }).attributes[0].name).toBe('z');
    expect(remainingPatches.length).toBe(0); // cleared — no longer pending
  });

  it('is a no-op when there are no pending patches', () => {
    const parse = [dataNode('ns.Alpha', 'Alpha', [{ name: 'x', type: 'string' }])];
    const { nodes, remainingPatches } = reconcileParse(parse, NO_EDGES, []);
    expect(nodes).toBe(parse); // returns the parse array verbatim
    expect(remainingPatches.length).toBe(0);
  });

  it('survives a removal edit replayed onto a reparse (deletes the right attribute by id)', () => {
    const live = [
      dataNode('ns.Alpha', 'Alpha', [
        { name: 'keep', type: 'string' },
        { name: 'drop', type: 'string' }
      ])
    ];
    const { patches } = commitGraphEdit(live, NO_EDGES, (draft) => {
      const d = draft.nodes.get('ns.Alpha')!.data as { attributes: Array<{ name: string }> };
      d.attributes = d.attributes.filter((a) => a.name !== 'drop');
    });
    // Stale reparse still has both attributes.
    const reparse = [
      dataNode('ns.Alpha', 'Alpha', [
        { name: 'keep', type: 'string' },
        { name: 'drop', type: 'string' }
      ])
    ];
    const { nodes } = reconcileParse(reparse, NO_EDGES, patches);
    const attrs = (nodes[0].data as { attributes: Array<{ name: string }> }).attributes;
    expect(attrs.map((a) => a.name)).toEqual(['keep']); // deletion preserved
  });
});
