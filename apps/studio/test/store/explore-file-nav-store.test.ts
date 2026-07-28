// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * explore-file-nav-store tests. Narrow store for Explore's file-navigation
 * surface (shared-perspective-chrome plan, Task 3 prep): activeEditorFile +
 * syncStatus, and the openFileInSource primitive, so both ExplorePerspective's
 * body and the new ExploreCenterSlot (FileTabStrip) can read/write the same
 * state instead of a local useState the slot component couldn't reach.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useExploreFileNavStore } from '../../src/shell/explore-file-nav-store.js';

describe('explore file nav store', () => {
  beforeEach(() => {
    useExploreFileNavStore.setState({ activeEditorFile: undefined, syncStatus: null });
  });

  it('starts with no active file and no sync status', () => {
    const state = useExploreFileNavStore.getState();
    expect(state.activeEditorFile).toBeUndefined();
    expect(state.syncStatus).toBeNull();
  });

  it('openFileInSource sets the active file — mirrors the old setActiveEditorFile(filePath) behavior', () => {
    useExploreFileNavStore.getState().openFileInSource('a.rosetta');
    expect(useExploreFileNavStore.getState().activeEditorFile).toBe('a.rosetta');
  });

  it('setActiveEditorFile is exposed directly (FileTabStrip / SourceEditor onFileSelect call it without going through openFileInSource)', () => {
    useExploreFileNavStore.getState().setActiveEditorFile('b.rosetta');
    expect(useExploreFileNavStore.getState().activeEditorFile).toBe('b.rosetta');
  });

  it('setActiveEditorFile accepts undefined (files-emptied reset uses this)', () => {
    useExploreFileNavStore.getState().setActiveEditorFile('a.rosetta');
    useExploreFileNavStore.getState().setActiveEditorFile(undefined);
    expect(useExploreFileNavStore.getState().activeEditorFile).toBeUndefined();
  });

  it('setSyncStatus updates syncStatus', () => {
    useExploreFileNavStore.getState().setSyncStatus({ state: 'synced' } as never);
    expect(useExploreFileNavStore.getState().syncStatus).toEqual({ state: 'synced' });
  });

  it('a file opened through openFileInSource is what a subsequent unrelated read of activeEditorFile sees (single source, no duplication)', () => {
    // Simulates the tab strip calling openFileInSource and the body's
    // SourceEditor separately reading activeEditorFile — both must observe
    // the same store-backed value rather than divergent local state.
    useExploreFileNavStore.getState().openFileInSource('c.rosetta');
    const bodyRead = useExploreFileNavStore.getState().activeEditorFile;
    expect(bodyRead).toBe('c.rosetta');
  });
});
