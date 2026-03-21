// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for drag-and-drop expression restructuring (US5).
 *
 * Uses the native HTML drag-and-drop model via expression store actions.
 *
 * @module
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createExpressionStore,
  type ExpressionBuilderState
} from '../../src/store/expression-store.js';
import type { ExpressionNode } from '../../src/schemas/expression-node-schema.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function node($type: string, id: string, extra: Record<string, unknown> = {}): ExpressionNode {
  return { $type, id, ...extra } as unknown as ExpressionNode;
}

function placeholder(id: string): ExpressionNode {
  return node('Placeholder', id);
}

function findById(tree: ExpressionNode, id: string): ExpressionNode | null {
  if (tree.id === id) return tree;
  const n = tree as Record<string, unknown>;
  for (const key of ['left', 'right', 'argument', 'if', 'ifthen', 'elsethen', 'receiver']) {
    const child = n[key];
    if (child && typeof child === 'object' && '$type' in (child as object)) {
      const found = findById(child as ExpressionNode, id);
      if (found) return found;
    }
  }
  const elements = n['elements'];
  if (Array.isArray(elements)) {
    for (const el of elements) {
      if (el && typeof el === 'object' && '$type' in (el as object)) {
        const found = findById(el as ExpressionNode, id);
        if (found) return found;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('drag-and-drop restructuring', () => {
  let store: ReturnType<typeof createExpressionStore>;

  const scope = { inputs: [], output: null, aliases: [] };

  describe('move node to placeholder', () => {
    beforeEach(() => {
      // Build: (a + _) where a is a number literal and _ is a placeholder
      const tree = node('ArithmeticOperation', 'root', {
        operator: '+',
        left: node('RosettaNumberLiteral', 'num-a', { value: '42' }),
        right: placeholder('target-ph')
      });
      store = createExpressionStore(tree, scope);
    });

    it('replaceNode moves a new node to a placeholder position', () => {
      const newNode = node('RosettaNumberLiteral', 'num-b', { value: '7' });
      store.getState().replaceNode('target-ph', newNode);

      const tree = store.getState().tree;
      const right = (tree as Record<string, unknown>)['right'] as ExpressionNode;
      expect(right.id).toBe('num-b');
      expect((right as Record<string, unknown>)['value']).toBe('7');
    });
  });

  describe('reparenting via remove + replace', () => {
    beforeEach(() => {
      // Build: (a + (b * _))
      const tree = node('ArithmeticOperation', 'root', {
        operator: '+',
        left: node('RosettaNumberLiteral', 'num-a', { value: '1' }),
        right: node('ArithmeticOperation', 'mul', {
          operator: '*',
          left: node('RosettaNumberLiteral', 'num-b', { value: '2' }),
          right: placeholder('inner-ph')
        })
      });
      store = createExpressionStore(tree, scope);
    });

    it('drag node from one slot to another (remove source, replace target)', () => {
      // Simulate drag: take num-b from mul.left and put it in inner-ph
      const state = store.getState();

      // 1. Get the node being dragged
      const draggedNode = findById(state.tree, 'num-b')!;
      expect(draggedNode).not.toBeNull();

      // 2. Remove source (replaces with placeholder)
      state.removeNode('num-b');

      // 3. Replace target placeholder with dragged node
      store.getState().replaceNode('inner-ph', draggedNode);

      const finalTree = store.getState().tree;
      const mul = (finalTree as Record<string, unknown>)['right'] as Record<string, unknown>;

      // Source should now be a placeholder
      const mulLeft = mul['left'] as Record<string, unknown>;
      expect(mulLeft['$type']).toBe('Placeholder');

      // Target should be the dragged node
      const mulRight = mul['right'] as Record<string, unknown>;
      expect(mulRight['$type']).toBe('RosettaNumberLiteral');
      expect(mulRight['value']).toBe('2');
    });

    it('tree remains structurally valid after reparenting', () => {
      const state = store.getState();
      const draggedNode = findById(state.tree, 'num-b')!;

      state.removeNode('num-b');
      store.getState().replaceNode('inner-ph', draggedNode);

      const finalTree = store.getState().tree;
      // Root should still be ArithmeticOperation
      expect(finalTree.$type).toBe('ArithmeticOperation');
      // All nodes should have IDs
      const root = finalTree as Record<string, unknown>;
      expect(root['id']).toBeTruthy();
      const right = root['right'] as Record<string, unknown>;
      expect(right['$type']).toBe('ArithmeticOperation');
    });
  });

  describe('swap via copy + paste', () => {
    beforeEach(() => {
      // Build: (a + b) where both are number literals
      const tree = node('ArithmeticOperation', 'root', {
        operator: '+',
        left: node('RosettaNumberLiteral', 'num-a', { value: '10' }),
        right: node('RosettaNumberLiteral', 'num-b', { value: '20' })
      });
      store = createExpressionStore(tree, scope);
    });

    it('copy and paste creates a deep clone with new IDs', () => {
      const state = store.getState();

      // Copy num-a
      state.copyNode('num-a');
      expect(store.getState().clipboard).not.toBeNull();

      // Remove num-b to make it a placeholder first
      state.removeNode('num-b');
      const afterRemove = store.getState().tree;
      const rightAfterRemove = (afterRemove as Record<string, unknown>)['right'] as Record<
        string,
        unknown
      >;
      const placeholderId = rightAfterRemove['id'] as string;

      // Paste at the placeholder
      store.getState().pasteNode(placeholderId);

      const finalTree = store.getState().tree;
      const right = (finalTree as Record<string, unknown>)['right'] as Record<string, unknown>;
      // Should be a number literal with value 10 (cloned from num-a)
      expect(right['$type']).toBe('RosettaNumberLiteral');
      expect(right['value']).toBe('10');
      // Should have a new ID (not num-a)
      expect(right['id']).not.toBe('num-a');
    });
  });
});
