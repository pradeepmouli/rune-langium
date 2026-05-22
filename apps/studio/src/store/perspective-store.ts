// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { create } from 'zustand';
import type { PerspectiveId } from '../shell/perspectives/perspective-types.js';

interface PerspectiveState {
  activePerspective: PerspectiveId;
  setActivePerspective: (id: PerspectiveId) => void;
}

export const usePerspectiveStore = create<PerspectiveState>((set) => ({
  // Default to the launcher; App swaps to 'explore' once a workspace loads.
  activePerspective: 'workspaces',
  setActivePerspective: (id) => set({ activePerspective: id })
}));
