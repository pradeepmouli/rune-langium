// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { create } from 'zustand';
import { usePerspectiveStore } from '../store/perspective-store.js';
import { withInstrumentation } from './instrumentation/core.js';

export type NavigateToExploreType = (typeFqn: string) => void;

interface ExploreNavigationState {
  navigateToType: NavigateToExploreType | undefined;
  setNavigateToType(navigateToType: NavigateToExploreType | undefined): void;
}

/**
 * A bridge to Explore's owned navigation callback.
 *
 * Explore registers its hydration-aware implementation while mounted. Other
 * perspectives can activate Explore and ask it to navigate, but cannot
 * mutate the visual-editor selection directly.
 */
export const useExploreNavigationStore = create<ExploreNavigationState>((set) => ({
  navigateToType: undefined,
  setNavigateToType(navigateToType) {
    set({ navigateToType });
  }
}));

export const viewTypeInExplore = withInstrumentation(
  function viewTypeInExplore(typeFqn: string): boolean {
    const navigateToType = useExploreNavigationStore.getState().navigateToType;
    if (!navigateToType) return false;
    usePerspectiveStore.getState().setActivePerspective('explore');
    navigateToType(typeFqn);
    return true;
  },
  { op: 'viewTypeInExplore' }
);
