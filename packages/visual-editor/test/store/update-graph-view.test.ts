// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for the Phase 3B invariant I2:
 *   Position/layout updates (drag, Dagre relayout, layout-engine switch) must
 *   write Maps + re-derived arrays but NEVER capture patches
 *   (pendingEditPatches) and NEVER bump parseEpoch.
 *
 * VIEW state is not SOURCE state. The `updateGraphView` chokepoint locks this
 * boundary so that when Task 3C removes the set-interceptor the view path
 * still maintains Maps correctly.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';
import { SIMPLE_INHERITANCE_SOURCE } from '../helpers/fixture-loader.js';

describe('updateGraphView — I2: position/layout updates produce no patches, no epoch bump', () => {
  let store: ReturnType<typeof createEditorStore>;
  let nodeId: string;

  beforeEach(async () => {
    store = createEditorStore();
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    store.getState().loadModels(result.value);
    // Pick the first node for position tests
    nodeId = store.getState().nodes[0]!.id;
  });

  // -------------------------------------------------------------------------
  // applyReactFlowNodeChanges — position drag (final, dragging=false)
  // -------------------------------------------------------------------------

  it('position change: appends NO patch to pendingEditPatches (I2)', () => {
    const before = store.getState();

    store
      .getState()
      .applyReactFlowNodeChanges([{ type: 'position', id: nodeId, position: { x: 999, y: 999 }, dragging: false }]);

    const after = store.getState();
    // I2: same reference — no patch was appended
    expect(after.pendingEditPatches).toBe(before.pendingEditPatches);
  });

  it('position change: does NOT bump parseEpoch (I2)', () => {
    const before = store.getState();

    store
      .getState()
      .applyReactFlowNodeChanges([{ type: 'position', id: nodeId, position: { x: 999, y: 999 }, dragging: false }]);

    expect(store.getState().parseEpoch).toBe(before.parseEpoch);
  });

  it('position change: I1 still holds (nodesById values === nodes array)', () => {
    store
      .getState()
      .applyReactFlowNodeChanges([{ type: 'position', id: nodeId, position: { x: 999, y: 999 }, dragging: false }]);

    const after = store.getState();
    expect([...after.nodesById.values()]).toEqual(after.nodes);
  });

  it('position change: position actually moves', () => {
    store
      .getState()
      .applyReactFlowNodeChanges([{ type: 'position', id: nodeId, position: { x: 999, y: 999 }, dragging: false }]);

    const after = store.getState();
    expect(after.nodesById.get(nodeId)?.position).toEqual({ x: 999, y: 999 });
  });

  it('intermediate drag (dragging=true) is filtered — no state change at all', () => {
    const before = store.getState();

    store
      .getState()
      .applyReactFlowNodeChanges([{ type: 'position', id: nodeId, position: { x: 500, y: 500 }, dragging: true }]);

    const after = store.getState();
    // Nothing changed — the action returns early
    expect(after.nodes).toBe(before.nodes);
    expect(after.pendingEditPatches).toBe(before.pendingEditPatches);
    expect(after.parseEpoch).toBe(before.parseEpoch);
  });

  // -------------------------------------------------------------------------
  // relayout — Dagre layout
  // -------------------------------------------------------------------------

  it('relayout: appends NO patch to pendingEditPatches (I2)', () => {
    const before = store.getState();

    store.getState().relayout();

    const after = store.getState();
    expect(after.pendingEditPatches).toBe(before.pendingEditPatches);
  });

  it('relayout: does NOT bump parseEpoch (I2)', () => {
    const before = store.getState();

    store.getState().relayout();

    expect(store.getState().parseEpoch).toBe(before.parseEpoch);
  });

  it('relayout: I1 still holds after layout', () => {
    store.getState().relayout();

    const after = store.getState();
    expect([...after.nodesById.values()]).toEqual(after.nodes);
    expect([...after.edgesById.values()]).toEqual(after.edges);
  });

  // -------------------------------------------------------------------------
  // setLayoutEngine
  // -------------------------------------------------------------------------

  it('setLayoutEngine: appends NO patch (I2)', () => {
    const before = store.getState();

    store.getState().setLayoutEngine('dagre');

    expect(store.getState().pendingEditPatches).toBe(before.pendingEditPatches);
  });

  it('setLayoutEngine: does NOT bump parseEpoch (I2)', () => {
    const before = store.getState();

    store.getState().setLayoutEngine('dagre');

    expect(store.getState().parseEpoch).toBe(before.parseEpoch);
  });

  it('setLayoutEngine: I1 still holds', () => {
    store.getState().setLayoutEngine('dagre');

    const after = store.getState();
    expect([...after.nodesById.values()]).toEqual(after.nodes);
  });
});
