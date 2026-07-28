// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * import-dialog-store tests. Mirrors export-dialog-store.test.ts — minimal
 * bar+body shared UI state: Explore's header Import button opens the
 * dialog; the body renders <ImportDialog> against the same open flag.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useImportDialogStore } from '../../src/shell/import-dialog-store.js';

describe('import dialog store', () => {
  beforeEach(() => {
    useImportDialogStore.setState({ open: false });
  });

  it('starts closed', () => {
    expect(useImportDialogStore.getState().open).toBe(false);
  });

  it('setOpen(true) opens it', () => {
    useImportDialogStore.getState().setOpen(true);
    expect(useImportDialogStore.getState().open).toBe(true);
  });

  it('setOpen(false) closes it', () => {
    useImportDialogStore.getState().setOpen(true);
    useImportDialogStore.getState().setOpen(false);
    expect(useImportDialogStore.getState().open).toBe(false);
  });
});
