/**
 * Unit tests for namespace visibility state in the editor store.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';
import { COMBINED_MODEL_SOURCE } from '../helpers/fixture-loader.js';

describe('EditorStore — Namespace Visibility', () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(() => {
    store = createEditorStore();
  });

  describe('initial state', () => {
    it('starts with empty expanded namespaces', () => {
      const state = store.getState();
      expect(state.visibility.expandedNamespaces.size).toBe(0);
    });

    it('starts with empty hidden node IDs', () => {
      const state = store.getState();
      expect(state.visibility.hiddenNodeIds.size).toBe(0);
    });

    it('starts with explorer open', () => {
      const state = store.getState();
      expect(state.visibility.explorerOpen).toBe(true);
    });
  });

  describe('loadModels', () => {
    it('sets initial visibility based on model size (small model = expanded)', async () => {
      const result = await parse(COMBINED_MODEL_SOURCE);
      store.getState().loadModels(result.value);

      const state = store.getState();
      // COMBINED_MODEL_SOURCE has < 100 types => all expanded
      expect(state.visibility.expandedNamespaces.size).toBeGreaterThan(0);
      expect(state.visibility.expandedNamespaces.has('test.combined')).toBe(true);
    });
  });

  describe('toggleNamespace', () => {
    it('adds namespace to expanded set when not present', async () => {
      const result = await parse(COMBINED_MODEL_SOURCE);
      store.getState().loadModels(result.value);
      store.getState().collapseAllNamespaces(); // start collapsed

      store.getState().toggleNamespace('test.combined');
      expect(store.getState().visibility.expandedNamespaces.has('test.combined')).toBe(true);
    });

    it('removes namespace from expanded set when already present', async () => {
      const result = await parse(COMBINED_MODEL_SOURCE);
      store.getState().loadModels(result.value);

      // Should be expanded initially (small model)
      expect(store.getState().visibility.expandedNamespaces.has('test.combined')).toBe(true);

      store.getState().toggleNamespace('test.combined');
      expect(store.getState().visibility.expandedNamespaces.has('test.combined')).toBe(false);
    });
  });

  describe('toggleNodeVisibility', () => {
    it('adds node ID to hidden set', () => {
      store.getState().toggleNodeVisibility('test::Trade');
      expect(store.getState().visibility.hiddenNodeIds.has('test::Trade')).toBe(true);
    });

    it('removes node ID from hidden set when toggled again', () => {
      store.getState().toggleNodeVisibility('test::Trade');
      store.getState().toggleNodeVisibility('test::Trade');
      expect(store.getState().visibility.hiddenNodeIds.has('test::Trade')).toBe(false);
    });
  });

  describe('expandAllNamespaces', () => {
    it('expands all namespaces and clears hidden nodes', async () => {
      const result = await parse(COMBINED_MODEL_SOURCE);
      store.getState().loadModels(result.value);
      store.getState().collapseAllNamespaces();
      store.getState().toggleNodeVisibility('test.combined::Trade');

      store.getState().expandAllNamespaces();
      const state = store.getState();
      expect(state.visibility.expandedNamespaces.has('test.combined')).toBe(true);
      expect(state.visibility.hiddenNodeIds.size).toBe(0);
    });
  });

  describe('collapseAllNamespaces', () => {
    it('collapses all namespaces and clears hidden nodes', async () => {
      const result = await parse(COMBINED_MODEL_SOURCE);
      store.getState().loadModels(result.value);
      store.getState().toggleNodeVisibility('test.combined::Trade');

      store.getState().collapseAllNamespaces();
      const state = store.getState();
      expect(state.visibility.expandedNamespaces.size).toBe(0);
      expect(state.visibility.hiddenNodeIds.size).toBe(0);
    });
  });

  describe('toggleExplorer', () => {
    it('toggles explorer open state', () => {
      expect(store.getState().visibility.explorerOpen).toBe(true);
      store.getState().toggleExplorer();
      expect(store.getState().visibility.explorerOpen).toBe(false);
      store.getState().toggleExplorer();
      expect(store.getState().visibility.explorerOpen).toBe(true);
    });
  });

  describe('getVisibleNodes / getVisibleEdges', () => {
    it('returns only nodes in expanded namespaces', async () => {
      const result = await parse(COMBINED_MODEL_SOURCE);
      store.getState().loadModels(result.value);

      const allNodes = store.getState().nodes;
      const visibleBefore = store.getState().getVisibleNodes();
      expect(visibleBefore.length).toBe(allNodes.length); // small model = all expanded

      store.getState().collapseAllNamespaces();
      const visibleAfter = store.getState().getVisibleNodes();
      expect(visibleAfter.length).toBe(0);
    });

    it('excludes individually hidden nodes', async () => {
      const result = await parse(COMBINED_MODEL_SOURCE);
      store.getState().loadModels(result.value);

      const allNodes = store.getState().nodes;
      const firstNodeId = allNodes[0]!.id;
      store.getState().toggleNodeVisibility(firstNodeId);

      const visible = store.getState().getVisibleNodes();
      expect(visible.length).toBe(allNodes.length - 1);
      expect(visible.find((n) => n.id === firstNodeId)).toBeUndefined();
    });

    it('only returns edges where both endpoints are visible', async () => {
      const result = await parse(COMBINED_MODEL_SOURCE);
      store.getState().loadModels(result.value);

      const allEdges = store.getState().edges;

      // Collapse all — no edges should be visible
      store.getState().collapseAllNamespaces();
      const visibleEdges = store.getState().getVisibleEdges();
      expect(visibleEdges.length).toBe(0);

      // Re-expand — all edges return
      store.getState().expandAllNamespaces();
      const restored = store.getState().getVisibleEdges();
      expect(restored.length).toBe(allEdges.length);
    });
  });

  describe('setInitialVisibility', () => {
    it('collapses for large models (>100 types)', async () => {
      const result = await parse(COMBINED_MODEL_SOURCE);
      store.getState().loadModels(result.value);

      store.getState().setInitialVisibility(500);
      expect(store.getState().visibility.expandedNamespaces.size).toBe(0);
    });

    it('expands for small models (<=100 types)', async () => {
      const result = await parse(COMBINED_MODEL_SOURCE);
      store.getState().loadModels(result.value);

      store.getState().setInitialVisibility(50);
      expect(store.getState().visibility.expandedNamespaces.size).toBeGreaterThan(0);
    });
  });
});
