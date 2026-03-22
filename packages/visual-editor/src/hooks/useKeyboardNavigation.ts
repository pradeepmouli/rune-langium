// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * useKeyboardNavigation — keyboard shortcuts for the expression builder.
 *
 * Handles:
 * - Ctrl+Z / Ctrl+Shift+Z: undo/redo
 * - Ctrl+C / Ctrl+V: copy/paste
 * - Delete/Backspace: remove selected node
 * - Arrow keys: depth-first traversal of blocks
 * - Enter: open palette on placeholders
 * - Escape: deselect / close palette
 *
 * @module
 */

import { useEffect, useCallback } from 'react';
import type { StoreApi } from 'zustand';
import type { ExpressionBuilderState } from '../store/expression-store.js';
import type { ExpressionNode } from '../schemas/expression-node-schema.js';

export interface UseKeyboardNavigationOptions {
  store: StoreApi<ExpressionBuilderState>;
  containerRef: React.RefObject<HTMLElement | null>;
}

// ---------------------------------------------------------------------------
// Linearized depth-first traversal
// ---------------------------------------------------------------------------

const CHILD_FIELDS = ['left', 'right', 'argument', 'if', 'ifthen', 'elsethen', 'receiver'] as const;

function collectNodeIds(node: ExpressionNode): string[] {
  const result: string[] = [];
  const n = node as Record<string, unknown>;
  const id = n['id'] as string;
  if (id) result.push(id);

  for (const key of CHILD_FIELDS) {
    const child = n[key];
    if (child && typeof child === 'object' && '$type' in (child as object)) {
      result.push(...collectNodeIds(child as ExpressionNode));
    }
  }

  // Lambda function.body
  const func = n['function'] as Record<string, unknown> | undefined;
  if (func) {
    const body = func['body'];
    if (body && typeof body === 'object' && '$type' in (body as object)) {
      result.push(...collectNodeIds(body as ExpressionNode));
    }
  }

  // Switch cases
  const cases = n['cases'];
  if (Array.isArray(cases)) {
    for (const c of cases as Record<string, unknown>[]) {
      const expr = c['expression'];
      if (expr && typeof expr === 'object' && '$type' in (expr as object)) {
        result.push(...collectNodeIds(expr as ExpressionNode));
      }
    }
  }

  // Constructor values
  const values = n['values'];
  if (Array.isArray(values)) {
    for (const v of values as Record<string, unknown>[]) {
      const val = v['value'];
      if (val && typeof val === 'object' && '$type' in (val as object)) {
        result.push(...collectNodeIds(val as ExpressionNode));
      }
    }
  }

  // Array children
  for (const key of ['elements', 'rawArgs'] as const) {
    const arr = n[key];
    if (Array.isArray(arr)) {
      for (const e of arr) {
        if (e && typeof e === 'object' && '$type' in (e as object)) {
          result.push(...collectNodeIds(e as ExpressionNode));
        }
      }
    }
  }

  return result;
}

export function useKeyboardNavigation({ store, containerRef }: UseKeyboardNavigationOptions) {
  const getNodeIds = useCallback(() => {
    return collectNodeIds(store.getState().tree);
  }, [store]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const state = store.getState();

      // Undo: Ctrl+Z (or Cmd+Z on Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const temporalStore = (store as any).temporal;
        if (temporalStore) {
          temporalStore.getState().undo();
        }
        return;
      }

      // Redo: Ctrl+Shift+Z (or Cmd+Shift+Z on Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        const temporalStore = (store as any).temporal;
        if (temporalStore) {
          temporalStore.getState().redo();
        }
        return;
      }

      // Copy: Ctrl+C (or Cmd+C on Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && state.selectedNodeId) {
        e.preventDefault();
        state.copyNode(state.selectedNodeId);
        return;
      }

      // Paste: Ctrl+V (or Cmd+V on Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && state.selectedNodeId) {
        e.preventDefault();
        state.pasteNode(state.selectedNodeId);
        return;
      }

      // Arrow Down / Arrow Right: move to next node in depth-first order
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        const ids = getNodeIds();
        if (ids.length === 0) return;
        if (!state.selectedNodeId) {
          state.selectNode(ids[0]!);
        } else {
          const idx = ids.indexOf(state.selectedNodeId);
          if (idx < ids.length - 1) {
            state.selectNode(ids[idx + 1]!);
          }
        }
        return;
      }

      // Arrow Up / Arrow Left: move to previous node
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const ids = getNodeIds();
        if (ids.length === 0) return;
        if (!state.selectedNodeId) {
          state.selectNode(ids[ids.length - 1]!);
        } else {
          const idx = ids.indexOf(state.selectedNodeId);
          if (idx > 0) {
            state.selectNode(ids[idx - 1]!);
          }
        }
        return;
      }

      // Enter: open palette on placeholder
      if (e.key === 'Enter' && state.selectedNodeId) {
        e.preventDefault();
        state.openPalette(state.selectedNodeId);
        return;
      }

      // Delete/Backspace: remove selected node
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedNodeId) {
        e.preventDefault();
        state.removeNode(state.selectedNodeId);
        return;
      }

      // Escape: deselect / close palette
      if (e.key === 'Escape') {
        if (state.paletteOpen) {
          state.closePalette();
        } else if (state.selectedNodeId) {
          state.selectNode(null);
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [store, containerRef, getNodeIds]);
}
