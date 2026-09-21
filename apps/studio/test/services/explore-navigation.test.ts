// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useExploreNavigationStore, viewTypeInExplore } from '../../src/services/explore-navigation.js';
import { usePerspectiveStore } from '../../src/store/perspective-store.js';

describe('Explore navigation bridge', () => {
  beforeEach(() => {
    useExploreNavigationStore.setState({ navigateToType: undefined });
    usePerspectiveStore.setState({ activePerspective: 'prototype' });
  });

  it('activates Explore and delegates to its registered navigation callback', () => {
    const navigateToType = vi.fn();
    useExploreNavigationStore.getState().setNavigateToType(navigateToType);

    expect(viewTypeInExplore('test.Party')).toBe(true);
    expect(usePerspectiveStore.getState().activePerspective).toBe('explore');
    expect(navigateToType).toHaveBeenCalledWith('test.Party');
  });

  it('does not switch perspective before Explore has registered navigation', () => {
    expect(viewTypeInExplore('test.Party')).toBe(false);
    expect(usePerspectiveStore.getState().activePerspective).toBe('prototype');
  });
});
