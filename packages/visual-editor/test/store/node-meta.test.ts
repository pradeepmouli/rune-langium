// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Phase 3 step 2 — `node.meta` (GraphNodeMeta sibling) presence + survival.
 *
 * The metadata split introduces `node.meta` alongside `node.data` (which still
 * carries the flat metadata copies during the dual-presence window). These
 * tests pin the contract that every producer populates `meta` and that it
 * SURVIVES the store's projections (loadModels → reconcileParse → Map↔array
 * derivation, mutateGraph recipes, updateGraphView re-derives).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';
import { SIMPLE_INHERITANCE_SOURCE } from '../helpers/fixture-loader.js';

describe('node.meta — population and survival through store projections', () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(async () => {
    store = createEditorStore();
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    store.getState().loadModels(result.value);
  });

  it('populates meta on every node after loadModels (nodesById AND nodes)', () => {
    const { nodes, nodesById } = store.getState();
    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) {
      expect(node.meta).toBeDefined();
      expect(typeof node.meta.namespace).toBe('string');
      expect(Array.isArray(node.meta.errors)).toBe(true);
      expect(typeof node.meta.hasExternalRefs).toBe('boolean');
      // Map and array hold the SAME node object (I1 invariant) → same meta.
      expect(nodesById.get(node.id)?.meta).toBe(node.meta);
    }
  });

  it('keeps meta in sync with the flat data copies (dual-presence window)', () => {
    for (const node of store.getState().nodes) {
      const d = node.data as unknown as Record<string, unknown>;
      expect(node.meta.namespace).toBe(d.namespace);
      expect(node.meta.errors).toEqual(d.errors);
      expect(node.meta.hasExternalRefs).toBe(d.hasExternalRefs);
      expect(node.meta.isReadOnly).toBe(d.isReadOnly);
    }
  });

  it('meta survives a mutateGraph edit (renameType re-key + cascade)', () => {
    const original = store.getState().nodes.find((n) => n.data.name === 'Trade');
    expect(original).toBeDefined();
    const ns = original!.meta.namespace;

    store.getState().renameType(original!.id, 'Execution');

    const renamed = store.getState().nodes.find((n) => n.data.name === 'Execution');
    expect(renamed).toBeDefined();
    expect(renamed!.meta).toBeDefined();
    expect(renamed!.meta.namespace).toBe(ns);
    // Every other node keeps its meta too (cascade rebuilds via spreads).
    for (const node of store.getState().nodes) {
      expect(node.meta).toBeDefined();
    }
  });

  it('meta survives a reparse (loadModels reconcile path) after an in-flight edit', async () => {
    const target = store.getState().nodes.find((n) => n.data.name === 'Trade');
    store.getState().updateDefinition(target!.id, 'in-flight definition edit');
    expect(store.getState().pendingEditPatches.length).toBeGreaterThan(0);

    // Reparse the same source — reconcileParse replays the pending patch.
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    store.getState().loadModels(result.value);

    for (const node of store.getState().nodes) {
      expect(node.meta).toBeDefined();
      expect(node.meta.namespace).toBe((node.data as unknown as Record<string, unknown>).namespace);
    }
  });

  it('createType populates meta on the new node', () => {
    const id = store.getState().createType('data', 'FreshType', 'test.ns');
    const node = store.getState().nodesById.get(id);
    expect(node?.meta).toBeDefined();
    expect(node?.meta.namespace).toBe('test.ns');
    expect(node?.meta.errors).toEqual([]);
    expect(node?.meta.hasExternalRefs).toBe(false);
  });

  it('deferred placeholders carry meta with deferred: true', async () => {
    // loadDeferredExports only stashes entries; placeholders materialize on
    // the next loadModels (the single source of node mutation).
    store.getState().loadDeferredExports([
      {
        filePath: 'curated/deferred-ns.rosetta',
        namespace: 'deferred.ns',
        exports: [{ type: 'Data', name: 'DeferredThing' }]
      }
    ]);
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    store.getState().loadModels(result.value);

    const node = store.getState().nodes.find((n) => n.data.name === 'DeferredThing');
    expect(node?.meta).toBeDefined();
    expect(node?.meta.deferred).toBe(true);
    expect(node?.meta.isReadOnly).toBe(true);
    expect(node?.meta.namespace).toBe('deferred.ns');
  });

  it('updateComments dual-writes meta.comments and data.comments', () => {
    const target = store.getState().nodes.find((n) => n.data.name === 'Trade');
    store.getState().updateComments(target!.id, 'a comment');

    const updated = store.getState().nodesById.get(target!.id);
    expect(updated?.meta.comments).toBe('a comment');
    expect((updated?.data as unknown as Record<string, unknown>).comments).toBe('a comment');
  });

  it('meta survives view-only updates (relayout → updateGraphView)', () => {
    store.getState().relayout({ direction: 'TB', nodeSeparation: 50, rankSeparation: 100, engine: 'dagre' });
    for (const node of store.getState().nodes) {
      expect(node.meta).toBeDefined();
    }
    for (const node of store.getState().nodesById.values()) {
      expect(node.meta).toBeDefined();
    }
  });
});
