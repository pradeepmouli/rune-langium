// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { create } from 'zustand';
import type { ExportSelection } from '@rune-langium/codegen/export';
import { usePerspectiveStore } from '../store/perspective-store.js';

export interface ExportIntent {
  workspaceId: string;
  selection: ExportSelection;
}

interface ExportNavigationState {
  pending: ExportIntent | undefined;
  openExport(workspaceId: string, selection: ExportSelection): void;
  consume(workspaceId: string): ExportIntent | undefined;
}

/** Carries an explicit export root across the Explore → Export perspective switch. */
export const useExportNavigationStore = create<ExportNavigationState>((set, get) => ({
  pending: undefined,
  openExport(workspaceId, selection) {
    set({ pending: { workspaceId, selection: structuredClone(selection) } });
    usePerspectiveStore.getState().setActivePerspective('export');
  },
  consume(workspaceId) {
    const pending = get().pending;
    if (!pending || pending.workspaceId !== workspaceId) return undefined;
    set({ pending: undefined });
    return pending;
  }
}));
