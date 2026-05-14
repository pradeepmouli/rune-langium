// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Unit tests for the editor store — selection, search, and filter behavior.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';
import { COMBINED_MODEL_SOURCE, SIMPLE_INHERITANCE_SOURCE } from '../helpers/fixture-loader.js';

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

    it('resets selection on load', async () => {
      const result = await parse(COMBINED_MODEL_SOURCE);
      store.getState().loadModels(result.value);
      const nodes = store.getState().nodes;
      store.getState().selectNode(nodes[0]!.id);

      // Reload
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

    it('creates placeholder nodes immediately on loadDeferredExports', () => {
      store.getState().loadDeferredExports(curatedEntries);
      const nodeIds = new Set(store.getState().nodes.map((n) => n.id));
      expect(nodeIds.has('cdm.base.math::Quantity')).toBe(true);
      expect(nodeIds.has('cdm.base.math::NonNegativeQuantity')).toBe(true);
      expect(nodeIds.has('cdm.product.asset::AssetClass')).toBe(true);
    });

    it('preserves placeholders when loadModels runs afterwards', async () => {
      store.getState().loadDeferredExports(curatedEntries);
      const result = await parse(SIMPLE_INHERITANCE_SOURCE);
      store.getState().loadModels(result.value);
      const ids = new Set(store.getState().nodes.map((n) => n.id));
      expect(ids.has('cdm.base.math::Quantity'), 'curated placeholder survives loadModels').toBe(true);
      expect(ids.has('cdm.product.asset::AssetClass'), 'all curated namespaces survive').toBe(true);
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
      const dupCount = ids.filter((id) => id === 'cdm.base.math::Dup').length;
      expect(dupCount).toBeLessThanOrEqual(1);
    });

    it('clears placeholders on loadDeferredExports([]) — workspace switch', () => {
      store.getState().loadDeferredExports(curatedEntries);
      expect(store.getState().nodes.length).toBeGreaterThan(0);
      store.getState().loadDeferredExports([]);
      expect(store.getState().deferredExports).toEqual([]);
      // loadModels with no models + no deferredExports leaves no curated
      // placeholders — confirms the stale-state scenario from review.
      store.getState().loadModels([]);
      const ids = new Set(store.getState().nodes.map((n) => n.id));
      expect(ids.has('cdm.base.math::Quantity'), 'old placeholder should be gone').toBe(false);
    });
  });
});
