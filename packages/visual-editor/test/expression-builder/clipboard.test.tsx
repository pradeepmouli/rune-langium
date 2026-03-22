// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for copy/paste expression sub-trees (US6).
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('clipboard: copy and paste', () => {
  const scope = { inputs: [], output: null, aliases: [] };

  describe('copyNode', () => {
    it('stores a deep clone of the sub-tree', () => {
      const subtree = node('ArithmeticOperation', 'sub', {
        operator: '+',
        left: node('RosettaNumberLiteral', 'num-a', { value: '1' }),
        right: node('RosettaNumberLiteral', 'num-b', { value: '2' })
      });
      const tree = node('ArithmeticOperation', 'root', {
        operator: '*',
        left: subtree,
        right: placeholder('ph')
      });
      const store = createExpressionStore(tree, scope);

      store.getState().copyNode('sub');

      const clipboard = store.getState().clipboard;
      expect(clipboard).not.toBeNull();
      expect(clipboard!.$type).toBe('ArithmeticOperation');
      expect(clipboard!.id).toBe('sub');
    });

    it('clipboard is a deep clone (not a reference)', () => {
      const tree = node('RosettaNumberLiteral', 'num', { value: '42' });
      const store = createExpressionStore(tree, scope);

      store.getState().copyNode('num');

      const clipboard = store.getState().clipboard!;
      // Modifying clipboard should not affect tree
      expect(clipboard).not.toBe(store.getState().tree);
    });

    it('does nothing when node ID is not found', () => {
      const tree = placeholder('root');
      const store = createExpressionStore(tree, scope);

      store.getState().copyNode('nonexistent');
      expect(store.getState().clipboard).toBeNull();
    });
  });

  describe('pasteNode', () => {
    it('inserts clipboard copy with new IDs at target', () => {
      const tree = node('ArithmeticOperation', 'root', {
        operator: '+',
        left: node('RosettaNumberLiteral', 'num-a', { value: '5' }),
        right: placeholder('target-ph')
      });
      const store = createExpressionStore(tree, scope);

      // Copy left node
      store.getState().copyNode('num-a');
      // Paste at right placeholder
      store.getState().pasteNode('target-ph');

      const result = store.getState().tree;
      const right = (result as Record<string, unknown>)['right'] as Record<string, unknown>;
      expect(right['$type']).toBe('RosettaNumberLiteral');
      expect(right['value']).toBe('5');
      // New ID should be different
      expect(right['id']).not.toBe('num-a');
    });

    it('paste does nothing when clipboard is empty', () => {
      const tree = node('ArithmeticOperation', 'root', {
        operator: '+',
        left: placeholder('left-ph'),
        right: placeholder('right-ph')
      });
      const store = createExpressionStore(tree, scope);

      store.getState().pasteNode('left-ph');
      // Tree should be unchanged
      const left = (store.getState().tree as Record<string, unknown>)['left'] as Record<
        string,
        unknown
      >;
      expect(left['$type']).toBe('Placeholder');
    });

    it('multiple pastes create independent copies', () => {
      const tree = node('ArithmeticOperation', 'root', {
        operator: '+',
        left: node('RosettaNumberLiteral', 'num-a', { value: '3' }),
        right: placeholder('ph-1')
      });
      const store = createExpressionStore(tree, scope);

      store.getState().copyNode('num-a');
      store.getState().pasteNode('ph-1');

      const result1 = store.getState().tree;
      const right1 = (result1 as Record<string, unknown>)['right'] as Record<string, unknown>;
      const firstPasteId = right1['id'] as string;

      // Now remove the right side and paste again
      store.getState().removeNode(firstPasteId);
      const afterRemove = store.getState().tree;
      const rightPh = (afterRemove as Record<string, unknown>)['right'] as Record<string, unknown>;
      const newPhId = rightPh['id'] as string;

      store.getState().pasteNode(newPhId);

      const result2 = store.getState().tree;
      const right2 = (result2 as Record<string, unknown>)['right'] as Record<string, unknown>;
      // Both pastes should have different IDs
      expect(right2['id']).not.toBe(firstPasteId);
      expect(right2['id']).not.toBe('num-a');
    });

    it('paste copies deep sub-trees with all new IDs', () => {
      const subtree = node('ArithmeticOperation', 'sub', {
        operator: '+',
        left: node('RosettaNumberLiteral', 'inner-a', { value: '1' }),
        right: node('RosettaNumberLiteral', 'inner-b', { value: '2' })
      });
      const tree = node('ArithmeticOperation', 'root', {
        operator: '*',
        left: subtree,
        right: placeholder('target')
      });
      const store = createExpressionStore(tree, scope);

      store.getState().copyNode('sub');
      store.getState().pasteNode('target');

      const result = store.getState().tree;
      const right = (result as Record<string, unknown>)['right'] as Record<string, unknown>;
      expect(right['$type']).toBe('ArithmeticOperation');
      expect(right['id']).not.toBe('sub');

      const rightLeft = right['left'] as Record<string, unknown>;
      expect(rightLeft['$type']).toBe('RosettaNumberLiteral');
      expect(rightLeft['id']).not.toBe('inner-a');

      const rightRight = right['right'] as Record<string, unknown>;
      expect(rightRight['$type']).toBe('RosettaNumberLiteral');
      expect(rightRight['id']).not.toBe('inner-b');
    });
  });

  describe('undo/redo with clipboard', () => {
    it('undo after paste reverts to previous tree', () => {
      const tree = node('ArithmeticOperation', 'root', {
        operator: '+',
        left: node('RosettaNumberLiteral', 'num', { value: '1' }),
        right: placeholder('ph')
      });
      const store = createExpressionStore(tree, scope);

      store.getState().copyNode('num');
      store.getState().pasteNode('ph');

      // Verify paste worked
      const afterPaste = store.getState().tree;
      const right = (afterPaste as Record<string, unknown>)['right'] as Record<string, unknown>;
      expect(right['$type']).toBe('RosettaNumberLiteral');

      // Undo
      const temporalStore = (store as any).temporal;
      temporalStore.getState().undo();

      // Should be back to placeholder
      const afterUndo = store.getState().tree;
      const rightAfterUndo = (afterUndo as Record<string, unknown>)['right'] as Record<
        string,
        unknown
      >;
      expect(rightAfterUndo['$type']).toBe('Placeholder');
    });
  });
});
