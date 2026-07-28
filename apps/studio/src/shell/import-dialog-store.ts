// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Import dialog open-state — mirrors export-dialog-store.ts. Shared between
 * Explore's header (the Import button, `ExploreActions`) and the body's
 * `<ImportDialog>` (ExplorePerspective).
 */

import { create } from 'zustand';

interface ImportDialogState {
  open: boolean;
}

interface ImportDialogActions {
  setOpen(open: boolean): void;
}

type ImportDialogStore = ImportDialogState & ImportDialogActions;

export const useImportDialogStore = create<ImportDialogStore>((set) => ({
  open: false,
  setOpen(open) {
    set({ open });
  }
}));
