// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for the Phase 3B Map-substrate invariant (I1):
 *   state.nodes === [...state.nodesById.values()]
 *   state.edges === [...state.edgesById.values()]
 *
 * Covers both the initial empty state and a state populated via loadModels.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';
import { SIMPLE_INHERITANCE_SOURCE } from '../helpers/fixture-loader.js';

describe('Map-substrate invariant I1', () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(() => {
    store = createEditorStore();
  });

  it('initialState has empty nodesById/edgesById Maps', () => {
    const s = store.getState();
    expect(s.nodesById).toBeInstanceOf(Map);
    expect(s.edgesById).toBeInstanceOf(Map);
    expect(s.nodesById.size).toBe(0);
    expect(s.edgesById.size).toBe(0);
  });

  it('I1 holds on initial empty state', () => {
    const s = store.getState();
    expect([...s.nodesById.values()]).toEqual(s.nodes);
    expect([...s.edgesById.values()]).toEqual(s.edges);
  });

  it('I1 holds after loadModels (nodes array == Map values, keys match ids)', async () => {
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    store.getState().loadModels(result.value);

    const s = store.getState();
    expect(s.nodes.length).toBeGreaterThan(0);

    // Map values match the nodes array exactly (insertion order preserved)
    expect([...s.nodesById.values()]).toEqual(s.nodes);

    // Map keys match node ids in the same order
    expect([...s.nodesById.keys()]).toEqual(s.nodes.map((n) => n.id));

    // Edges invariant
    expect([...s.edgesById.values()]).toEqual(s.edges);
    expect([...s.edgesById.keys()]).toEqual(s.edges.map((e) => e.id));
  });

  it('I1 holds after createType (array-writing action)', () => {
    store.getState().createType('data', 'MyType', 'test.ns');

    const s = store.getState();
    expect([...s.nodesById.values()]).toEqual(s.nodes);
    expect([...s.nodesById.keys()]).toEqual(s.nodes.map((n) => n.id));
    expect([...s.edgesById.values()]).toEqual(s.edges);
  });

  it('I1 holds after deleteType', async () => {
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    store.getState().loadModels(result.value);

    const nodeId = store.getState().nodes[0]!.id;
    store.getState().deleteType(nodeId);

    const s = store.getState();
    expect([...s.nodesById.values()]).toEqual(s.nodes);
    expect([...s.nodesById.keys()]).toEqual(s.nodes.map((n) => n.id));
    expect([...s.edgesById.values()]).toEqual(s.edges);
  });
});
