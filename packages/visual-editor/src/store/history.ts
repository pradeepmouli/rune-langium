/**
 * Undo/redo middleware setup using zundo.
 *
 * Wraps the editor store to provide temporal navigation (undo/redo)
 * over graph state changes.
 */

import { temporal } from 'zundo';
import type { EditorState } from './editor-store.js';

/**
 * Fields tracked by undo/redo.
 * UI state (selection, viewport) is NOT tracked.
 */
export type TrackedState = Pick<EditorState, 'nodes' | 'edges'>;

/**
 * Create the temporal middleware options.
 */
export const temporalOptions = {
  /** Only track graph state, not UI state */
  partialize: (state: EditorState): TrackedState => ({
    nodes: state.nodes,
    edges: state.edges
  }),
  /** Limit history size */
  limit: 50
};

export { temporal };
