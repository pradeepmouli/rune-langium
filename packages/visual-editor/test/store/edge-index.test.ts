// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';
import { selectEdgeIndex } from '../../src/store/edge-index.js';
import { SIMPLE_INHERITANCE_SOURCE } from '../helpers/fixture-loader.js';

describe('selectEdgeIndex', () => {
  it('indexes every edge under both its source and its target', async () => {
    const store = createEditorStore();
    store.getState().loadModels((await parse(SIMPLE_INHERITANCE_SOURCE)).value);
    const { edgesById } = store.getState();
    expect(edgesById.size).toBeGreaterThan(0); // fixture sanity

    const index = selectEdgeIndex(edgesById);
    for (const edge of edgesById.values()) {
      expect(index.bySource(edge.source)).toContain(edge);
      expect(index.byTarget(edge.target)).toContain(edge);
    }
    // Sum over buckets equals the edge count exactly (no duplicates, no drops).
    const seen = new Set<string>();
    for (const edge of edgesById.values()) {
      for (const e of index.byTarget(edge.target)) seen.add(e.id);
    }
    expect(seen.size).toBe(edgesById.size);
  });

  it('unknown node id returns an empty (not undefined) list', async () => {
    const store = createEditorStore();
    store.getState().loadModels((await parse(SIMPLE_INHERITANCE_SOURCE)).value);
    const index = selectEdgeIndex(store.getState().edgesById);
    expect(index.bySource('nope')).toEqual([]);
    expect(index.byTarget('nope')).toEqual([]);
  });

  it('is memoized on Map identity: same Map → same instance, new Map → new instance', async () => {
    const store = createEditorStore();
    store.getState().loadModels((await parse(SIMPLE_INHERITANCE_SOURCE)).value);
    const map1 = store.getState().edgesById;
    const a = selectEdgeIndex(map1);
    const b = selectEdgeIndex(map1);
    expect(b).toBe(a);
    const map2 = new Map(map1); // simulates the post-mutation Map swap
    const c = selectEdgeIndex(map2);
    expect(c).not.toBe(a);
  });
});
