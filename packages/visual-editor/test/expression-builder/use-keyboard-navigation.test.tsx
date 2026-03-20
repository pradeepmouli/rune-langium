// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for the useKeyboardNavigation hook.
 *
 * Validates keyboard shortcuts: undo/redo, arrow navigation, copy/paste,
 * delete, enter (palette), and escape (deselect/close palette).
 *
 * @module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createExpressionStore } from '../../src/store/expression-store.js';
import { useKeyboardNavigation } from '../../src/hooks/useKeyboardNavigation.js';
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

function fireKey(
  container: HTMLElement,
  key: string,
  modifiers: { ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean } = {}
) {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: modifiers.ctrlKey ?? false,
    shiftKey: modifiers.shiftKey ?? false,
    metaKey: modifiers.metaKey ?? false,
    bubbles: true,
    cancelable: true
  });
  container.dispatchEvent(event);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useKeyboardNavigation', () => {
  let store: ReturnType<typeof createExpressionStore>;
  let container: HTMLDivElement;
  const scope = { inputs: [], output: null, aliases: [] };

  beforeEach(() => {
    // Build: (a + b)
    const tree = node('ArithmeticOperation', 'root', {
      operator: '+',
      left: node('RosettaNumberLiteral', 'num-a', { value: '1' }),
      right: node('RosettaNumberLiteral', 'num-b', { value: '2' })
    });
    store = createExpressionStore(tree, scope);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  function renderNav() {
    const containerRef = { current: container };
    return renderHook(() => useKeyboardNavigation({ store, containerRef }));
  }

  describe('arrow key navigation', () => {
    it('selects first node on ArrowDown when nothing is selected', () => {
      renderNav();
      fireKey(container, 'ArrowDown');
      expect(store.getState().selectedNodeId).toBe('root');
    });

    it('moves to next node on ArrowDown', () => {
      store.getState().selectNode('root');
      renderNav();
      fireKey(container, 'ArrowDown');
      expect(store.getState().selectedNodeId).toBe('num-a');
    });

    it('moves to next node on ArrowRight', () => {
      store.getState().selectNode('root');
      renderNav();
      fireKey(container, 'ArrowRight');
      expect(store.getState().selectedNodeId).toBe('num-a');
    });

    it('moves to previous node on ArrowUp', () => {
      store.getState().selectNode('num-a');
      renderNav();
      fireKey(container, 'ArrowUp');
      expect(store.getState().selectedNodeId).toBe('root');
    });

    it('moves to previous node on ArrowLeft', () => {
      store.getState().selectNode('num-a');
      renderNav();
      fireKey(container, 'ArrowLeft');
      expect(store.getState().selectedNodeId).toBe('root');
    });

    it('selects last node on ArrowUp when nothing is selected', () => {
      renderNav();
      fireKey(container, 'ArrowUp');
      expect(store.getState().selectedNodeId).toBe('num-b');
    });

    it('does not wrap around at end', () => {
      store.getState().selectNode('num-b');
      renderNav();
      fireKey(container, 'ArrowDown');
      // Should stay at num-b (last node)
      expect(store.getState().selectedNodeId).toBe('num-b');
    });

    it('does not wrap around at start', () => {
      store.getState().selectNode('root');
      renderNav();
      fireKey(container, 'ArrowUp');
      // Should stay at root (first node)
      expect(store.getState().selectedNodeId).toBe('root');
    });
  });

  describe('enter key', () => {
    it('opens palette on selected node', () => {
      store.getState().selectNode('num-a');
      renderNav();
      fireKey(container, 'Enter');
      expect(store.getState().paletteOpen).toBe(true);
      expect(store.getState().paletteAnchorId).toBe('num-a');
    });

    it('does nothing when no node is selected', () => {
      renderNav();
      fireKey(container, 'Enter');
      expect(store.getState().paletteOpen).toBe(false);
    });
  });

  describe('escape key', () => {
    it('closes palette when open', () => {
      store.getState().openPalette('num-a');
      renderNav();
      fireKey(container, 'Escape');
      expect(store.getState().paletteOpen).toBe(false);
    });

    it('deselects node when palette is closed', () => {
      store.getState().selectNode('num-a');
      renderNav();
      fireKey(container, 'Escape');
      expect(store.getState().selectedNodeId).toBeNull();
    });
  });

  describe('delete/backspace', () => {
    it('removes selected node (replaces with placeholder)', () => {
      store.getState().selectNode('num-a');
      renderNav();
      fireKey(container, 'Delete');

      const tree = store.getState().tree;
      const left = (tree as Record<string, unknown>)['left'] as Record<string, unknown>;
      expect(left['$type']).toBe('Placeholder');
    });

    it('backspace also removes selected node', () => {
      store.getState().selectNode('num-b');
      renderNav();
      fireKey(container, 'Backspace');

      const tree = store.getState().tree;
      const right = (tree as Record<string, unknown>)['right'] as Record<string, unknown>;
      expect(right['$type']).toBe('Placeholder');
    });
  });

  describe('copy/paste (Ctrl+C / Ctrl+V)', () => {
    it('copies and pastes a node', () => {
      store.getState().selectNode('num-a');
      renderNav();

      // Copy
      fireKey(container, 'c', { ctrlKey: true });
      expect(store.getState().clipboard).not.toBeNull();

      // Remove num-b to create a paste target
      store.getState().removeNode('num-b');
      const tree = store.getState().tree;
      const right = (tree as Record<string, unknown>)['right'] as Record<string, unknown>;
      const placeholderId = right['id'] as string;

      // Select the placeholder and paste
      store.getState().selectNode(placeholderId);
      fireKey(container, 'v', { ctrlKey: true });

      const finalTree = store.getState().tree;
      const finalRight = (finalTree as Record<string, unknown>)['right'] as Record<string, unknown>;
      expect(finalRight['$type']).toBe('RosettaNumberLiteral');
      expect(finalRight['value']).toBe('1');
      // Should have a new ID (deep clone)
      expect(finalRight['id']).not.toBe('num-a');
    });
  });
});
