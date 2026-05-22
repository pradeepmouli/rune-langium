// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, beforeEach } from 'vitest';
import { usePerspectiveStore } from '../../src/store/perspective-store.js';

describe('usePerspectiveStore', () => {
  beforeEach(() => usePerspectiveStore.setState({ activePerspective: 'workspaces' }));

  it('defaults to workspaces (the launcher / start surface)', () => {
    expect(usePerspectiveStore.getState().activePerspective).toBe('workspaces');
  });
  it('setActivePerspective switches the active id', () => {
    usePerspectiveStore.getState().setActivePerspective('git');
    expect(usePerspectiveStore.getState().activePerspective).toBe('git');
  });
});
