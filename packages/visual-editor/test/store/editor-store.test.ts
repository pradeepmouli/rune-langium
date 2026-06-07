// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Unit tests for the editor store — selection, search, and filter behavior.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';
import { COMBINED_MODEL_SOURCE, EMPTY_MODEL_SOURCE, SIMPLE_INHERITANCE_SOURCE } from '../helpers/fixture-loader.js';

describe('EditorStore', () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(() => {
    store = createEditorStore();
  });

  describe('loadModels', () => {
    it('populates nodes and edges from parsed AST', async () => {
      const result = await parse(COMBINED_MODEL_SOURCE);
      store.getState().loadModels(result.value);

      const state = store.getState();
      expect(state.nodes.length).toBeGreaterThan(0);
      expect(state.edges.length).toBeGreaterThan(0);
    });

    it('preserves selection on reload if the selected node still exists in the merged graph', async () => {
      // Reload contract change: the previous implementation unconditionally
      // reset selectedNodeId to null on every loadModels call, which clobbered
      // user selection any time EditorPage's useEffect re-fired (debounced
      // re-parse, async hydration completing, deferredExports churn). The
      // visible symptom was that explorer clicks would set Inspector /
      // Structure briefly, then a follow-up re-parse would wipe them while
      // the Form preview pane (which reads from a separate previewStore that
      // doesn't auto-clear) kept showing stale content. Selection now persists
      // when the previously-selected id is still present in the new graph.
      const result = await parse(COMBINED_MODEL_SOURCE);
      store.getState().loadModels(result.value);
      const nodes = store.getState().nodes;
      const selectedId = nodes[0]!.id;
      store.getState().selectNode(selectedId);

      // Reload with the same models — the previously-selected id is still
      // present, so selection MUST persist.
      store.getState().loadModels(result.value);
      expect(store.getState().selectedNodeId).toBe(selectedId);
    });

    it('clears selection on reload if the selected id is gone from the merged graph', async () => {
      // Complementary contract: when the selected node has been renamed or
      // deleted between reloads, selection is correctly cleared. This is
      // what protects Inspector / Structure from rendering against a stale
      // id that no longer matches any storeNodes entry. selectNode is
      // permissive (doesn't validate id existence on its own), so we set a
      // known-bad id and verify the next loadModels drops it.
      const result = await parse(COMBINED_MODEL_SOURCE);
      store.getState().loadModels(result.value);
      const namespace = store.getState().nodes[0]!.data.namespace;
      store.getState().selectNode(`${namespace}.__definitely_not_a_real_type__`);

      store.getState().loadModels(result.value);
      expect(store.getState().selectedNodeId).toBeNull();
    });
  });

  describe('selectNode', () => {
    it('sets the selected node ID', async () => {
      const result = await parse(COMBINED_MODEL_SOURCE);
      store.getState().loadModels(result.value);
      const nodes = store.getState().nodes;

      store.getState().selectNode(nodes[0]!.id);
      expect(store.getState().selectedNodeId).toBe(nodes[0]!.id);
    });

    it('opens detail panel on selection', async () => {
      const result = await parse(COMBINED_MODEL_SOURCE);
      store.getState().loadModels(result.value);
      const nodes = store.getState().nodes;

      store.getState().selectNode(nodes[0]!.id);
      expect(store.getState().detailPanelOpen).toBe(true);
    });

    it('clears detail panel when deselected', async () => {
      const result = await parse(COMBINED_MODEL_SOURCE);
      store.getState().loadModels(result.value);
      const nodes = store.getState().nodes;

      store.getState().selectNode(nodes[0]!.id);
      store.getState().selectNode(null);
      expect(store.getState().selectedNodeId).toBeNull();
    });

    it('clears focus-mode isolation when deselected', async () => {
      const result = await parse(SIMPLE_INHERITANCE_SOURCE);
      store.getState().loadModels(result.value);
      const state = store.getState();
      const targetNode = state.nodes.find((node) => node.id.includes('Child')) ?? state.nodes[0]!;

      store.getState().selectNode(targetNode.id);
      expect(store.getState().visibility.hiddenNodeIds.size).toBeGreaterThan(0);

      store.getState().selectNode(null);

      expect(store.getState().selectedNodeId).toBeNull();
      expect(store.getState().visibility.hiddenNodeIds.size).toBe(0);
    });

    it('does not notify subscribers when selecting the same node twice', async () => {
      const result = await parse(COMBINED_MODEL_SOURCE);
      store.getState().loadModels(result.value);
      const nodeId = store.getState().nodes[0]!.id;
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      store.getState().selectNode(nodeId);
      listener.mockClear();
      store.getState().selectNode(nodeId);

      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('can skip focus-mode isolation while still updating selection', async () => {
      const result = await parse(COMBINED_MODEL_SOURCE);
      store.getState().loadModels(result.value);
      const nodeId = store.getState().nodes[0]!.id;

      store.getState().selectNode(nodeId, { isolateInFocusMode: false });

      expect(store.getState().selectedNodeId).toBe(nodeId);
      expect(store.getState().detailPanelOpen).toBe(true);
      expect(store.getState().visibility.hiddenNodeIds.size).toBe(0);
    });
  });

  describe('setSearchQuery', () => {
    it('returns matching node IDs', async () => {
      const result = await parse(COMBINED_MODEL_SOURCE);
      store.getState().loadModels(result.value);

      store.getState().setSearchQuery('Trade');
      const results = store.getState().searchResults;
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((id) => id.includes('Trade'))).toBe(true);
    });

    it('returns empty results for non-matching query', async () => {
      const result = await parse(COMBINED_MODEL_SOURCE);
      store.getState().loadModels(result.value);

      store.getState().setSearchQuery('NonExistentType');
      expect(store.getState().searchResults).toHaveLength(0);
    });

    it('clears results on empty query', async () => {
      const result = await parse(COMBINED_MODEL_SOURCE);
      store.getState().loadModels(result.value);

      store.getState().setSearchQuery('Trade');
      expect(store.getState().searchResults.length).toBeGreaterThan(0);

      store.getState().setSearchQuery('');
      expect(store.getState().searchResults).toHaveLength(0);
    });
  });

  describe('relayout', () => {
    it('updates node positions without changing count', async () => {
      const result = await parse(SIMPLE_INHERITANCE_SOURCE);
      store.getState().loadModels(result.value);
      const originalCount = store.getState().nodes.length;

      store.getState().relayout({ direction: 'LR' });
      expect(store.getState().nodes.length).toBe(originalCount);
    });

    it('preserves layout options', async () => {
      const result = await parse(SIMPLE_INHERITANCE_SOURCE);
      store.getState().loadModels(result.value);

      store.getState().relayout({ direction: 'LR', rankSeparation: 200 });
      expect(store.getState().layoutOptions.direction).toBe('LR');
      expect(store.getState().layoutOptions.rankSeparation).toBe(200);
    });
  });

  describe('toggleDetailPanel', () => {
    it('toggles detail panel visibility', () => {
      expect(store.getState().detailPanelOpen).toBe(false);
      store.getState().toggleDetailPanel();
      expect(store.getState().detailPanelOpen).toBe(true);
      store.getState().toggleDetailPanel();
      expect(store.getState().detailPanelOpen).toBe(false);
    });
  });

  describe('loadDeferredExports + loadModels re-merge (fix/019 PR #164)', () => {
    const curatedEntries = [
      {
        filePath: 'cdm/base/math.rosetta',
        namespace: 'cdm.base.math',
        exports: [
          { type: 'Data', name: 'Quantity' },
          { type: 'Data', name: 'NonNegativeQuantity' }
        ]
      },
      {
        filePath: 'cdm/product/asset.rosetta',
        namespace: 'cdm.product.asset',
        exports: [{ type: 'RosettaEnumeration', name: 'AssetClass' }]
      }
    ];

    it('stores deferredExports on state for downstream re-merge', () => {
      store.getState().loadDeferredExports(curatedEntries);
      expect(store.getState().deferredExports).toEqual(curatedEntries);
    });

    it('does NOT mutate nodes on loadDeferredExports (Codex P2 #164)', () => {
      // loadDeferredExports is state-only — it stashes entries for the
      // next loadModels call to merge. Doing otherwise would pollute
      // zundo's undo history with a mixed-state node array (see comment
      // in editor-store.ts:loadDeferredExports).
      const beforeNodes = store.getState().nodes;
      store.getState().loadDeferredExports(curatedEntries);
      expect(store.getState().nodes).toBe(beforeNodes);
    });

    it('loadModels([]) after loadDeferredExports materializes placeholders', () => {
      store.getState().loadDeferredExports(curatedEntries);
      // Curated-only workspace: no user models. loadModels([]) still
      // produces the placeholder nodes from stored deferredExports.
      store.getState().loadModels([]);
      const nodeIds = new Set(store.getState().nodes.map((n) => n.id));
      expect(nodeIds.has('cdm.base.math.Quantity')).toBe(true);
      expect(nodeIds.has('cdm.base.math.NonNegativeQuantity')).toBe(true);
      expect(nodeIds.has('cdm.product.asset.AssetClass')).toBe(true);
    });

    it('preserves placeholders when loadModels runs afterwards', async () => {
      store.getState().loadDeferredExports(curatedEntries);
      const result = await parse(SIMPLE_INHERITANCE_SOURCE);
      store.getState().loadModels(result.value);
      const ids = new Set(store.getState().nodes.map((n) => n.id));
      expect(ids.has('cdm.base.math.Quantity'), 'curated placeholder survives loadModels').toBe(true);
      expect(ids.has('cdm.product.asset.AssetClass'), 'all curated namespaces survive').toBe(true);
    });

    it('does not duplicate ids when loadModels runs', () => {
      const entry = {
        filePath: 'cdm/base/math.rosetta',
        namespace: 'cdm.base.math',
        exports: [{ type: 'Data', name: 'Dup' }]
      };
      store.getState().loadDeferredExports([entry]);
      store.getState().loadModels([]);
      const ids = store.getState().nodes.map((n) => n.id);
      const dupCount = ids.filter((id) => id === 'cdm.base.math.Dup').length;
      expect(dupCount).toBeLessThanOrEqual(1);
    });

    it('is idempotent when entries reference is unchanged (Codex P1 #164)', () => {
      // EditorPage's effect can re-fire with a stable reference. Repeated
      // calls with the SAME array must not mutate state.
      const entries = curatedEntries;
      store.getState().loadDeferredExports(entries);
      const stateAfterFirst = store.getState();
      store.getState().loadDeferredExports(entries);
      expect(store.getState()).toBe(stateAfterFirst);
    });

    it('is idempotent when entries is empty AND store entries is empty', () => {
      // The footgun Codex P1 caught: EditorPage's default `deferredExports
      // = []` creates a fresh `[]` every render. Without this guard, every
      // render would re-emit `set()` → visibility object replacement →
      // subscriber re-renders → render loop.
      expect(store.getState().deferredExports).toEqual([]);
      const stateBefore = store.getState();
      store.getState().loadDeferredExports([]);
      expect(store.getState()).toBe(stateBefore);
      // Different array identity, same content — still no-op.
      store.getState().loadDeferredExports([]);
      expect(store.getState()).toBe(stateBefore);
    });

    it('clears placeholders on loadDeferredExports([]) — workspace switch', () => {
      // Stage 1: load curated entries + materialize via loadModels.
      store.getState().loadDeferredExports(curatedEntries);
      store.getState().loadModels([]);
      expect(store.getState().nodes.length).toBeGreaterThan(0);
      // Stage 2: workspace switch — empty deferred + loadModels([]) should
      // clear curated placeholders.
      store.getState().loadDeferredExports([]);
      expect(store.getState().deferredExports).toEqual([]);
      store.getState().loadModels([]);
      const ids = new Set(store.getState().nodes.map((n) => n.id));
      expect(ids.has('cdm.base.math.Quantity'), 'old placeholder should be gone').toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Zundo undo coverage for the new Structure View Phase 0 actions.
// Both `renameAttribute` and `updateAttributeType` mutate via `set(...)`,
// so zundo's temporal middleware should capture them. The `partialize`
// at history.ts:28 tracks `nodes` + `edges` — exactly the slices these
// actions touch.
// ---------------------------------------------------------------------------

describe('editor-store undo for Structure View Phase 0 actions', () => {
  it('undoes renameAttribute back to the original attribute name', () => {
    const store = createEditorStore();
    const id = store.getState().createType('data', 'Trade', 'cdm.trade');
    store.getState().addAttribute(id, 'tradeDate', 'date', '0..1');

    store.getState().renameAttribute(id, 'tradeDate', 'executionDate');
    expect(
      ((store.getState().nodes.find((n) => n.id === id)!.data as any).attributes as Array<{ name: string }>)[0].name
    ).toBe('executionDate');

    store.temporal.getState().undo();

    expect(
      ((store.getState().nodes.find((n) => n.id === id)!.data as any).attributes as Array<{ name: string }>)[0].name
    ).toBe('tradeDate');
  });

  it('undoes updateAttributeType back to the original type ref', () => {
    const store = createEditorStore();
    const id = store.getState().createType('data', 'Trade', 'cdm.trade');
    store.getState().addAttribute(id, 'economics', 'OldType', '0..*');
    const econId = store.getState().createType('data', 'Economics', 'cdm.trade');

    store.getState().updateAttributeType(id, 'economics', 'Economics', econId);
    expect(
      ((store.getState().nodes.find((n) => n.id === id)!.data as any).attributes as Array<any>)[0].typeCall.type
        .$refText
    ).toBe('Economics');

    store.temporal.getState().undo();

    expect(
      ((store.getState().nodes.find((n) => n.id === id)!.data as any).attributes as Array<any>)[0].typeCall.type
        .$refText
    ).toBe('OldType');
  });

  it('undoes the attribute-ref edge rewrite that accompanies renameAttribute', () => {
    const store = createEditorStore();
    const tradeId = store.getState().createType('data', 'Trade', 'cdm.trade');
    store.getState().createType('data', 'Economics', 'cdm.trade');
    store.getState().addAttribute(tradeId, 'economics', 'Economics', '0..*');

    store.getState().renameAttribute(tradeId, 'economics', 'econ');
    expect(
      store.getState().edges.find((e) => e.source === tradeId && e.data?.kind === 'attribute-ref')?.data?.label
    ).toBe('econ');

    store.temporal.getState().undo();

    expect(
      store.getState().edges.find((e) => e.source === tradeId && e.data?.kind === 'attribute-ref')?.data?.label
    ).toBe('economics');
  });
});

// ---------------------------------------------------------------------------
// On-demand curated namespace hydration actions
// ---------------------------------------------------------------------------

describe('editor-store on-demand curated hydration', () => {
  it('requestNamespaceHydration queues a namespace; markNamespacesHydrated dequeues + records it', () => {
    const store = createEditorStore();
    store.setState({ pendingHydrationNamespaces: [], hydratedNamespaces: [] });
    store.getState().requestNamespaceHydration('cdm.base.math');
    expect(store.getState().pendingHydrationNamespaces).toContain('cdm.base.math');
    // idempotent — a second call for the same namespace is a no-op
    store.getState().requestNamespaceHydration('cdm.base.math');
    expect(store.getState().pendingHydrationNamespaces).toEqual(['cdm.base.math']);
    store.getState().markNamespacesHydrated(['cdm.base.math']);
    expect(store.getState().pendingHydrationNamespaces).not.toContain('cdm.base.math');
    expect(store.getState().hydratedNamespaces).toContain('cdm.base.math');
  });

  it('requestNamespaceHydration is a no-op for already-hydrated namespaces', () => {
    const store = createEditorStore();
    store.setState({ pendingHydrationNamespaces: [], hydratedNamespaces: ['cdm.base.math'] });
    store.getState().requestNamespaceHydration('cdm.base.math');
    expect(store.getState().pendingHydrationNamespaces).toEqual([]);
  });

  it('markNamespacesHydrated deduplicates entries in hydratedNamespaces', () => {
    const store = createEditorStore();
    store.setState({ pendingHydrationNamespaces: ['ns.a', 'ns.b'], hydratedNamespaces: ['ns.a'] });
    store.getState().markNamespacesHydrated(['ns.a', 'ns.b']);
    expect(store.getState().hydratedNamespaces).toEqual(['ns.a', 'ns.b']);
    expect(store.getState().pendingHydrationNamespaces).toEqual([]);
  });

  it('markNamespacesHydrated increments hydrationNonce', () => {
    const store = createEditorStore();
    store.setState({ pendingHydrationNamespaces: ['cdm.base.math'], hydratedNamespaces: [], hydrationNonce: 0 });
    const before = store.getState().hydrationNonce;
    store.getState().markNamespacesHydrated(['cdm.base.math']);
    expect(store.getState().hydrationNonce).toBe(before + 1);
  });

  it('markNamespacesHydrated increments nonce on each successive call', () => {
    const store = createEditorStore();
    store.setState({ pendingHydrationNamespaces: ['ns.a', 'ns.b'], hydratedNamespaces: [], hydrationNonce: 0 });
    store.getState().markNamespacesHydrated(['ns.a']);
    expect(store.getState().hydrationNonce).toBe(1);
    store.getState().markNamespacesHydrated(['ns.b']);
    expect(store.getState().hydrationNonce).toBe(2);
  });

  it('activeHydrationNamespaces returns the union of hydrated + pending (deduped)', () => {
    const store = createEditorStore();
    store.setState({
      hydratedNamespaces: ['ns.a', 'ns.b'],
      pendingHydrationNamespaces: ['ns.b', 'ns.c']
    });
    const active = store.getState().activeHydrationNamespaces();
    expect(active).toContain('ns.a');
    expect(active).toContain('ns.b');
    expect(active).toContain('ns.c');
    // Dedup: ns.b must appear exactly once
    expect(active.filter((n) => n === 'ns.b')).toHaveLength(1);
    expect(active).toHaveLength(3);
  });

  it('activeHydrationNamespaces returns empty array when both lists are empty', () => {
    const store = createEditorStore();
    store.setState({ hydratedNamespaces: [], pendingHydrationNamespaces: [] });
    expect(store.getState().activeHydrationNamespaces()).toEqual([]);
  });

  it('resetHydration resets hydrationNonce to 0', () => {
    const store = createEditorStore();
    store.setState({ pendingHydrationNamespaces: ['ns.a'], hydratedNamespaces: [], hydrationNonce: 5 });
    store.getState().resetHydration();
    expect(store.getState().hydrationNonce).toBe(0);
    expect(store.getState().hydratedNamespaces).toEqual([]);
    expect(store.getState().pendingHydrationNamespaces).toEqual([]);
  });

  it('dequeuePendingHydration removes from pending without marking hydrated; re-requesting after dequeue re-queues', () => {
    const store = createEditorStore();
    store.setState({ pendingHydrationNamespaces: ['cdm.base.math', 'cdm.base.datetime'], hydratedNamespaces: [] });

    // Dequeue only one of the two pending namespaces
    store.getState().dequeuePendingHydration(['cdm.base.math']);

    // cdm.base.math is gone from pending…
    expect(store.getState().pendingHydrationNamespaces).not.toContain('cdm.base.math');
    // …but cdm.base.datetime stays
    expect(store.getState().pendingHydrationNamespaces).toContain('cdm.base.datetime');
    // Neither is in hydratedNamespaces (dequeue ≠ mark-hydrated)
    expect(store.getState().hydratedNamespaces).not.toContain('cdm.base.math');

    // Re-requesting after dequeue re-queues the namespace
    store.getState().requestNamespaceHydration('cdm.base.math');
    expect(store.getState().pendingHydrationNamespaces).toContain('cdm.base.math');
  });

  it('placeholder nodes built from deferred entries have data.deferred === true', async () => {
    // loadDeferredExports stashes entries; buildDeferredPlaceholderNodes runs
    // inside loadModels, so we need a loadModels call to materialise the nodes.
    const store = createEditorStore();
    store.getState().loadDeferredExports([
      {
        namespace: 'cdm.base.math',
        filePath: 'cdm/base/math.rosetta',
        exports: [{ name: 'QuantitySchedule', type: 'Data' }]
      }
    ]);
    // Use an empty model so the only nodes are placeholders
    const result = await parse(EMPTY_MODEL_SOURCE);
    store.getState().loadModels(result.value);
    const node = store.getState().nodes.find((n) => n.id === 'cdm.base.math.QuantitySchedule');
    expect(node).toBeDefined();
    expect((node!.data as { deferred?: boolean }).deferred).toBe(true);
  });

  it('materialized nodes from loadModels do NOT have data.deferred set', async () => {
    const store = createEditorStore();
    const result = await parse(COMBINED_MODEL_SOURCE);
    store.getState().loadModels(result.value);
    const materializedNodes = store.getState().nodes;
    expect(materializedNodes.length).toBeGreaterThan(0);
    for (const node of materializedNodes) {
      expect((node.data as { deferred?: boolean }).deferred).toBeFalsy();
    }
  });

  it('loadModels after loadDeferredExports: placeholder deferred flag absent on materialized nodes, present on remaining placeholders', async () => {
    const store = createEditorStore();
    // Load a deferred entry for a namespace NOT covered by the combined model
    store.getState().loadDeferredExports([
      {
        namespace: 'cdm.other.ns',
        filePath: 'cdm/other/ns.rosetta',
        exports: [{ name: 'SomeType', type: 'Data' }]
      }
    ]);
    // Now load real models — their nodes must not have deferred set
    const result = await parse(COMBINED_MODEL_SOURCE);
    store.getState().loadModels(result.value);

    // The placeholder for the un-hydrated namespace survives the merge
    const placeholder = store.getState().nodes.find((n) => n.id === 'cdm.other.ns.SomeType');
    expect(placeholder).toBeDefined();
    expect((placeholder!.data as { deferred?: boolean }).deferred).toBe(true);

    // Materialized nodes from the real model must not carry the flag
    const materialized = store.getState().nodes.filter((n) => n.id !== 'cdm.other.ns.SomeType');
    expect(materialized.length).toBeGreaterThan(0);
    for (const node of materialized) {
      expect((node.data as { deferred?: boolean }).deferred).toBeFalsy();
    }
  });
});
