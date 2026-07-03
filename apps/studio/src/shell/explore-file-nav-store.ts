// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Explore's file-navigation surface — narrow zustand store (shared-perspective-
 * chrome plan, Task 3 prep). Formerly local `useState` in `ExplorePerspective`;
 * lifted here so a sibling `ExploreCenterSlot` component (the FileTabStrip,
 * mounted from `AppHeader`'s centerSlot) can read/write the same active file
 * and git-sync status without prop-threading from `ExplorePerspective`'s body.
 *
 * Scope is intentionally narrow — this is EXPLORE's navigation state, not
 * global chrome state. It does NOT hold `combinedFileDiagnostics`: that value
 * is a pure derivation over `useWorkspace()` (files/parseErrors) and
 * `useDiagnosticsStore()` (fileDiagnostics), so any consumer recomputes it via
 * the shared helpers in `explore-diagnostics.ts` rather than a second stored
 * copy (single source, no duplication).
 */

import { create } from 'zustand';
import type { SyncStatus } from '@rune-langium/git-sync-engine';

interface ExploreFileNavState {
  activeEditorFile: string | undefined;
  syncStatus: SyncStatus | null;
}

interface ExploreFileNavActions {
  setActiveEditorFile(file: string | undefined | ((prev: string | undefined) => string | undefined)): void;
  /** Opens `filePath` in the source editor. Kept as a named action (not just
   *  `setActiveEditorFile`) because it is the primitive every navigation call
   *  site (structure view, LSP-driven opens, diagnostics jump-to-file, the
   *  tab strip) already calls by this name — renaming it would touch every
   *  one of those call sites for no behavioral reason. */
  openFileInSource(filePath: string): void;
  setSyncStatus(status: SyncStatus | null): void;
}

type ExploreFileNavStore = ExploreFileNavState & ExploreFileNavActions;

export const useExploreFileNavStore = create<ExploreFileNavStore>((set) => ({
  activeEditorFile: undefined,
  syncStatus: null,

  setActiveEditorFile(file) {
    set((state) => ({
      activeEditorFile: typeof file === 'function' ? file(state.activeEditorFile) : file
    }));
  },

  openFileInSource(filePath) {
    set({ activeEditorFile: filePath });
  },

  setSyncStatus(status) {
    set({ syncStatus: status });
  }
}));
