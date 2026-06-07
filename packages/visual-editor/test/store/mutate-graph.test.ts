// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for the mutateGraph chokepoint (Phase 3B, Task 3).
 *
 * Verifies that:
 *   1. Patches captured by edit actions are id-rooted at the `nodes` Map key
 *      (path[0] === 'nodes', path[1] === nodeId) — not index-rooted.
 *   2. Invariant I1 holds after mutateGraph-routed edits:
 *      state.nodes === [...state.nodesById.values()]
 *   3. Exactly one undo-history entry is pushed per edit (the interceptor
 *      re-derive does NOT duplicate the entry).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';
import { SIMPLE_INHERITANCE_SOURCE } from '../helpers/fixture-loader.js';
import type { AnyGraphNode } from '../../src/types.js';

describe('mutateGraph chokepoint — id-rooted patches + I1', () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(async () => {
    store = createEditorStore();
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    store.getState().loadModels(result.value);
  });

  it('updateCardinality captures id-rooted patch (path[0]=nodes, path[1]=nodeId)', () => {
    const nodes = store.getState().nodes;
    // Find a Data node with at least one attribute (Trade has tradeDate/product)
    const tradeNode = nodes.find((n) => (n.data as AnyGraphNode).name === 'Trade');
    expect(tradeNode).toBeDefined();
    const nodeId = tradeNode!.id;

    // Clear any patches from loadModels
    // (loadModels doesn't produce pendingEditPatches — safe baseline is []
    //  since loadModels calls set directly with parseEpoch bump, not commitEdit)
    expect(store.getState().pendingEditPatches).toHaveLength(0);

    store.getState().updateCardinality(nodeId, 'tradeDate', '0..1');

    const patches = store.getState().pendingEditPatches;
    expect(patches.length).toBeGreaterThan(0);

    // Patch shape: id-rooted at the `nodes` Map key, then the nodeId
    expect(patches[0]!.path[0]).toBe('nodes');   // root key is the draft Map name
    expect(patches[0]!.path[1]).toBe(nodeId);    // keyed by id, NOT an array index
    expect(patches[0]!.path).toContain('data');  // reaches into node data
  });

  it('I1 holds after mutateGraph-routed updateCardinality', () => {
    const nodes = store.getState().nodes;
    const tradeNode = nodes.find((n) => (n.data as AnyGraphNode).name === 'Trade');
    const nodeId = tradeNode!.id;

    store.getState().updateCardinality(nodeId, 'tradeDate', '0..1');

    const s = store.getState();
    // I1: nodes array === Map values in insertion order
    expect([...s.nodesById.values()]).toEqual(s.nodes);
    expect([...s.nodesById.keys()]).toEqual(s.nodes.map((n) => n.id));
    expect([...s.edgesById.values()]).toEqual(s.edges);
  });

  it('exactly one undo-history entry is pushed per edit (no double-entry from interceptor)', () => {
    const temporal = store.temporal.getState();
    const historyBefore = temporal.pastStates.length;

    const nodes = store.getState().nodes;
    const tradeNode = nodes.find((n) => (n.data as AnyGraphNode).name === 'Trade');
    const nodeId = tradeNode!.id;

    store.getState().updateCardinality(nodeId, 'tradeDate', '0..1');

    const historyAfter = store.temporal.getState().pastStates.length;
    expect(historyAfter - historyBefore).toBe(1);
  });

  it('addAttribute captures id-rooted patch', () => {
    const nodes = store.getState().nodes;
    const tradeNode = nodes.find((n) => (n.data as AnyGraphNode).name === 'Trade');
    expect(tradeNode).toBeDefined();
    const nodeId = tradeNode!.id;

    store.getState().addAttribute(nodeId, 'newField', 'string', '0..1');

    const patches = store.getState().pendingEditPatches;
    expect(patches.length).toBeGreaterThan(0);
    expect(patches[0]!.path[0]).toBe('nodes');
    expect(patches[0]!.path[1]).toBe(nodeId);
  });
});
