/**
 * useKeyboardNavigation — keyboard shortcuts for the expression builder.
 *
 * Handles Ctrl+Z (undo), Ctrl+Shift+Z (redo), Delete/Backspace (remove node).
 *
 * @module
 */

import { useEffect } from 'react';
import type { StoreApi } from 'zustand';
import type { ExpressionBuilderState } from '../store/expression-store.js';

export interface UseKeyboardNavigationOptions {
  store: StoreApi<ExpressionBuilderState>;
  containerRef: React.RefObject<HTMLElement | null>;
}

export function useKeyboardNavigation({ store, containerRef }: UseKeyboardNavigationOptions) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const state = store.getState();

      // Undo: Ctrl+Z (or Cmd+Z on Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        // Access temporal store for undo
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
  }, [store, containerRef]);
}
