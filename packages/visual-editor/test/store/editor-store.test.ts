/**
 * Unit tests for the editor store — selection, search, and filter behavior.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';
import { COMBINED_MODEL_SOURCE, SIMPLE_INHERITANCE_SOURCE } from '../helpers/fixture-loader.js';
import type { EditorStore } from '../../src/store/editor-store.js';

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
});
