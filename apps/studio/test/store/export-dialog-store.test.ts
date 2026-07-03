// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * export-dialog-store tests. Minimal bar+body shared UI state: Explore's
 * header buttons (Export code / Generate) open the dialog; the body renders
 * <ExportDialog> against the same open flag (shared-perspective-chrome plan,
 * Task 3 hazard #2).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useExportDialogStore } from '../../src/shell/export-dialog-store.js';

describe('export dialog store', () => {
  beforeEach(() => {
    useExportDialogStore.setState({ open: false });
  });

  it('starts closed', () => {
    expect(useExportDialogStore.getState().open).toBe(false);
  });

  it('setOpen(true) opens it — mirrors the old setShowExportDialog(true) call sites', () => {
    useExportDialogStore.getState().setOpen(true);
    expect(useExportDialogStore.getState().open).toBe(true);
  });

  it('setOpen(false) closes it — mirrors ExportDialog onClose', () => {
    useExportDialogStore.getState().setOpen(true);
    useExportDialogStore.getState().setOpen(false);
    expect(useExportDialogStore.getState().open).toBe(false);
  });
});
