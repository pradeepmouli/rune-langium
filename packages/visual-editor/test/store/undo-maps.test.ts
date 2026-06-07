// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for zundo Map-tracking with undo/redo (Phase 3B, Task 6).
 *
 * Verifies:
 *   - After undo, invariant I1 holds: [...nodesById.values()] deep-equals nodes
 *   - After undo, arrays are restored to the pre-edit state (Maps are SoT)
 *   - After undo+redo, the edit is back AND I1 holds
 *   - Exactly ONE history entry is pushed per edit (Hazard A: no double-entry)
 *   - pendingEditPatches is NOT rewound by undo (excluded from history)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';
import { SIMPLE_INHERITANCE_SOURCE } from '../helpers/fixture-loader.js';
import type { AnyGraphNode } from '../../src/types.js';

describe('undo/redo with Map substrate (Task 6)', () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(async () => {
    store = createEditorStore();
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    store.getState().loadModels(result.value);
  });

  // ---------------------------------------------------------------------------
  // Helper: get a Data node with attributes (Trade node from fixture)
  // ---------------------------------------------------------------------------
  function getTradeNode() {
    const nodes = store.getState().nodes;
    const tradeNode = nodes.find((n) => (n.data as AnyGraphNode).name === 'Trade');
    expect(tradeNode).toBeDefined();
    return tradeNode!;
  }

  // ---------------------------------------------------------------------------
  // Hazard A: exactly ONE history entry per edit
  // ---------------------------------------------------------------------------
  it('pushes exactly one pastState entry per mutateGraph edit (no double-entry from interceptor)', () => {
    const historyBefore = store.temporal.getState().pastStates.length;

    store.getState().updateCardinality(getTradeNode().id, 'tradeDate', '0..1');

    const historyAfter = store.temporal.getState().pastStates.length;
    expect(historyAfter - historyBefore).toBe(1);
  });

  it('pushes exactly one pastState entry per array-writing edit (createType)', () => {
    const historyBefore = store.temporal.getState().pastStates.length;

    store.getState().createType('data', 'NewType', 'test.ns');

    const historyAfter = store.temporal.getState().pastStates.length;
    expect(historyAfter - historyBefore).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Hazard B: I1 holds after undo
  // ---------------------------------------------------------------------------
  it('I1 holds after undo: [...nodesById.values()] deep-equals nodes', () => {
    const nodeId = getTradeNode().id;

    // Capture pre-edit state
    const preEditNodes = store.getState().nodes;
    const preEditEdges = store.getState().edges;

    store.getState().updateCardinality(nodeId, 'tradeDate', '0..1');

    // Undo via temporal store
    store.temporal.getState().undo();

    const s = store.getState();
    // I1: Map values must equal the nodes/edges arrays
    expect([...s.nodesById.values()]).toEqual(s.nodes);
    expect([...s.edgesById.values()]).toEqual(s.edges);

    // Arrays restored to pre-edit values (Maps are SoT after undo)
    expect(s.nodes).toEqual(preEditNodes);
    expect(s.edges).toEqual(preEditEdges);
  });

  it('I1 holds after undo+redo: edit is back AND I1 holds', () => {
    const nodeId = getTradeNode().id;

    store.getState().updateCardinality(nodeId, 'tradeDate', '0..1');

    // Snapshot the post-edit state
    const postEditNodes = store.getState().nodes;
    const postEditEdges = store.getState().edges;
    const postEditNodesById = store.getState().nodesById;

    // Undo then redo
    store.temporal.getState().undo();
    store.temporal.getState().redo();

    const s = store.getState();

    // I1 must hold after redo
    expect([...s.nodesById.values()]).toEqual(s.nodes);
    expect([...s.edgesById.values()]).toEqual(s.edges);

    // The edit is back: nodes/edges match post-edit snapshot
    expect(s.nodes).toEqual(postEditNodes);
    expect(s.edges).toEqual(postEditEdges);
    // The Map is also restored (same entries)
    expect([...s.nodesById.entries()]).toEqual([...postEditNodesById.entries()]);
  });

  // ---------------------------------------------------------------------------
  // pendingEditPatches is NOT rewound by undo
  // ---------------------------------------------------------------------------
  it('pendingEditPatches is NOT rewound by undo (excluded from history)', () => {
    const nodeId = getTradeNode().id;

    store.getState().updateCardinality(nodeId, 'tradeDate', '0..1');
    const patchesAfterEdit = store.getState().pendingEditPatches;
    expect(patchesAfterEdit.length).toBeGreaterThan(0);

    // Undo should restore Maps/arrays but NOT touch pendingEditPatches
    store.temporal.getState().undo();

    const patchesAfterUndo = store.getState().pendingEditPatches;
    expect(patchesAfterUndo).toEqual(patchesAfterEdit);
  });

  // ---------------------------------------------------------------------------
  // I1 after representative array-writing action (createType → undo)
  // ---------------------------------------------------------------------------
  it('I1 holds after undo of a createType (array-writing action)', () => {
    const preEditNodes = store.getState().nodes;

    store.getState().createType('data', 'NewType', 'test.ns');
    expect(store.getState().nodes.length).toBe(preEditNodes.length + 1);

    store.temporal.getState().undo();

    const s = store.getState();
    expect([...s.nodesById.values()]).toEqual(s.nodes);
    expect(s.nodes).toEqual(preEditNodes);
  });
});
