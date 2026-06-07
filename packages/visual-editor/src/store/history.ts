// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Undo/redo middleware setup using zundo.
 *
 * Wraps the editor store to provide temporal navigation (undo/redo)
 * over graph state changes.
 */

import { temporal } from 'zundo';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import type { TemporalState } from 'zundo';
import type { EditorState } from './editor-store.js';
import { useEditorStore } from './editor-store.js';

/**
 * Fields tracked by undo/redo (Phase 3B, Task 6).
 * Maps are the canonical SoT; arrays are derived caches (invariant I1).
 * UI state (selection, viewport) is NOT tracked.
 */
export type TrackedState = Pick<EditorState, 'nodesById' | 'edgesById'>;

export { temporal };

// ---------------------------------------------------------------------------
// Temporal store hooks
// ---------------------------------------------------------------------------

/**
 * Access the temporal (undo/redo) store attached to the editor store.
 *
 * @param selector - Selector function to pick values from the temporal state.
 * @returns The selected value from the temporal store.
 */
export function useTemporalStore<T>(selector: (state: TemporalState<TrackedState>) => T): T {
  return useStoreWithEqualityFn(useEditorStore.temporal, selector);
}

/** Whether there are past states to undo to. */
export function useCanUndo(): boolean {
  return useTemporalStore((state) => state.pastStates.length > 0);
}

/** Whether there are future states to redo to. */
export function useCanRedo(): boolean {
  return useTemporalStore((state) => state.futureStates.length > 0);
}

/** Returns the undo function from the temporal store. */
export function useUndo(): () => void {
  return useTemporalStore((state) => state.undo);
}

/** Returns the redo function from the temporal store. */
export function useRedo(): () => void {
  return useTemporalStore((state) => state.redo);
}
