// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Export dialog open-state — shared between Explore's header (Export code /
 * Generate buttons, moving into `ExploreActions` in Task 3) and the body's
 * `<ExportDialog>` (shared-perspective-chrome plan, Task 3 hazard #2). Neither
 * side owns the other, so this is lifted to the narrowest possible store
 * rather than staying local `useState` in `ExplorePerspective`.
 */

import { create } from 'zustand';

interface ExportDialogState {
  open: boolean;
}

interface ExportDialogActions {
  setOpen(open: boolean): void;
}

type ExportDialogStore = ExportDialogState & ExportDialogActions;

export const useExportDialogStore = create<ExportDialogStore>((set) => ({
  open: false,
  setOpen(open) {
    set({ open });
  }
}));
