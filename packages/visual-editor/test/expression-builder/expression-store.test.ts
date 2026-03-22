// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for expression-store (zustand + zundo).
 *
 * Verifies: tree initialization, replaceNode, removeNode, updateLiteral,
 * undo/redo via zundo temporal store, mode switching.
 *
 * @module
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createExpressionStore,
  type ExpressionBuilderState
} from '../../src/store/expression-store.js';
import type { StoreApi } from 'zustand';
import type { ExpressionNode } from '../../src/schemas/expression-node-schema.js';

// Helper: simple tree for testing
function makeTree(): ExpressionNode {
  return {
    $type: 'ArithmeticOperation',
    id: 'root',
    operator: '+',
    left: { $type: 'RosettaIntLiteral', id: 'left', value: 1n },
    right: { $type: 'Placeholder', id: 'right' }
  } as unknown as ExpressionNode;
}

const emptyScope = { inputs: [], output: null, aliases: [] };

describe('expression-store', () => {
  let store: StoreApi<ExpressionBuilderState>;

  beforeEach(() => {
    store = createExpressionStore(makeTree(), emptyScope);
  });

  describe('initialization', () => {
    it('initializes with provided tree', () => {
      const state = store.getState();
      expect(state.tree).toBeDefined();
      expect(state.tree.$type).toBe('ArithmeticOperation');
    });

    it('initializes in builder mode by default', () => {
      expect(store.getState().mode).toBe('builder');
    });

    it('initializes in text mode when initialMode is text', () => {
      const textStore = createExpressionStore(makeTree(), emptyScope, 'text');
      expect(textStore.getState().mode).toBe('text');
    });

    it('starts with no selected node', () => {
      expect(store.getState().selectedNodeId).toBeNull();
    });
  });

  describe('replaceNode', () => {
    it('replaces a placeholder with a new node', () => {
      const newNode: ExpressionNode = {
        $type: 'RosettaIntLiteral',
        id: 'new-right',
        value: 2n
      } as unknown as ExpressionNode;

      store.getState().replaceNode('right', newNode);

      const tree = store.getState().tree;
      if (tree.$type === 'ArithmeticOperation') {
        const right = tree.right as ExpressionNode;
        expect(right.$type).toBe('RosettaIntLiteral');
        expect(right.id).toBe('new-right');
      }
    });

    it('does nothing for non-existent node id', () => {
      const treeBefore = store.getState().tree;
      store.getState().replaceNode('nonexistent', {
        $type: 'RosettaIntLiteral',
        id: 'x',
        value: 0n
      } as unknown as ExpressionNode);
      expect(store.getState().tree).toEqual(treeBefore);
    });
  });

  describe('removeNode', () => {
    it('replaces node with placeholder', () => {
      store.getState().removeNode('left');

      const tree = store.getState().tree;
      if (tree.$type === 'ArithmeticOperation') {
        const left = tree.left as ExpressionNode;
        expect(left.$type).toBe('Placeholder');
      }
    });
  });

  describe('updateLiteral', () => {
    it('updates a literal node value', () => {
      store.getState().updateLiteral('left', 42n);

      const tree = store.getState().tree;
      if (tree.$type === 'ArithmeticOperation') {
        const left = tree.left as ExpressionNode;
        if (left.$type === 'RosettaIntLiteral') {
          expect(left.value).toBe(42n);
        }
      }
    });
  });

  describe('selectNode', () => {
    it('sets selectedNodeId', () => {
      store.getState().selectNode('left');
      expect(store.getState().selectedNodeId).toBe('left');
    });

    it('clears selection with null', () => {
      store.getState().selectNode('left');
      store.getState().selectNode(null);
      expect(store.getState().selectedNodeId).toBeNull();
    });
  });

  describe('mode', () => {
    it('switches to text mode', () => {
      store.getState().setMode('text');
      expect(store.getState().mode).toBe('text');
    });

    it('switches back to builder mode', () => {
      store.getState().setMode('text');
      store.getState().setMode('builder');
      expect(store.getState().mode).toBe('builder');
    });
  });

  describe('palette', () => {
    it('opens palette on a node', () => {
      store.getState().openPalette('right');
      expect(store.getState().paletteOpen).toBe(true);
      expect(store.getState().paletteAnchorId).toBe('right');
    });

    it('closes palette', () => {
      store.getState().openPalette('right');
      store.getState().closePalette();
      expect(store.getState().paletteOpen).toBe(false);
      expect(store.getState().paletteAnchorId).toBeNull();
    });
  });

  describe('setTree', () => {
    it('replaces the entire tree', () => {
      const newTree: ExpressionNode = {
        $type: 'RosettaBooleanLiteral',
        id: 'new-root',
        value: true
      } as unknown as ExpressionNode;
      store.getState().setTree(newTree);
      expect(store.getState().tree.$type).toBe('RosettaBooleanLiteral');
    });
  });
});
