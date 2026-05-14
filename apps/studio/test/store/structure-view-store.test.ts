// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { useStructureViewStore } from '../../src/store/structure-view-store.js';
import type { StructureExpansionKey } from '@rune-langium/visual-editor';

const KEY: StructureExpansionKey = { namespaceUri: 'cdm.trade', typeId: 'Trade', attrName: 'economics' };

describe('useStructureViewStore expansionMap', () => {
  beforeEach(() => {
    useStructureViewStore.getState().resetExpansion();
  });

  it('starts with everything collapsed', () => {
    expect(useStructureViewStore.getState().isExpanded(KEY)).toBe(false);
  });

  it('toggleExpansion flips state and isExpanded reflects it', () => {
    useStructureViewStore.getState().toggleExpansion(KEY);
    expect(useStructureViewStore.getState().isExpanded(KEY)).toBe(true);

    useStructureViewStore.getState().toggleExpansion(KEY);
    expect(useStructureViewStore.getState().isExpanded(KEY)).toBe(false);
  });

  it('collapseAll clears expansions in the focused namespace and leaves others alone', () => {
    const other: StructureExpansionKey = { namespaceUri: 'cdm.product', typeId: 'X', attrName: 'y' };
    useStructureViewStore.getState().toggleExpansion(KEY);
    useStructureViewStore.getState().toggleExpansion(other);

    useStructureViewStore.getState().collapseAll('cdm.trade');

    expect(useStructureViewStore.getState().isExpanded(KEY)).toBe(false);
    expect(useStructureViewStore.getState().isExpanded(other)).toBe(true);
  });
});

describe('useStructureViewStore dragSource', () => {
  beforeEach(() => {
    useStructureViewStore.getState().clearDragSource();
  });

  it('starts with no drag source', () => {
    expect(useStructureViewStore.getState().dragSource).toBeUndefined();
  });

  it('setDragSource stores a payload; clearDragSource removes it', () => {
    useStructureViewStore.getState().setDragSource({
      rune: 'type-ref',
      namespaceUri: 'cdm.trade',
      typeId: 'Party',
      kind: 'Data'
    });
    expect(useStructureViewStore.getState().dragSource?.typeId).toBe('Party');

    useStructureViewStore.getState().clearDragSource();
    expect(useStructureViewStore.getState().dragSource).toBeUndefined();
  });
});

describe('useStructureViewStore workspace persistence', () => {
  beforeEach(async () => {
    const { _resetForTests } = await import('../../src/workspace/persistence.js');
    await _resetForTests();
    useStructureViewStore.getState().resetExpansion();
    await useStructureViewStore.getState().setWorkspaceId(undefined);
  });

  it('hydrates from saved structureView state when workspaceId is set', async () => {
    const { saveWorkspace, saveStructureViewState } = await import('../../src/workspace/persistence.js');
    await saveWorkspace({
      id: 'ws-1',
      name: 'ws-1',
      kind: 'browser-only',
      createdAt: '2026-05-14T00:00:00Z',
      lastOpenedAt: '2026-05-14T00:00:00Z',
      layout: { version: 1, writtenBy: 'test', dockview: null },
      tabs: [],
      activeTabPath: null,
      curatedModels: [],
      schemaVersion: 2
    });
    await saveStructureViewState('ws-1', { 'cdm.trade::Trade::economics': true });

    await useStructureViewStore.getState().setWorkspaceId('ws-1');

    expect(useStructureViewStore.getState().isExpanded(KEY)).toBe(true);
  });

  it('persists toggles back to the workspace record', async () => {
    const { saveWorkspace, loadStructureViewState } = await import('../../src/workspace/persistence.js');
    await saveWorkspace({
      id: 'ws-2',
      name: 'ws-2',
      kind: 'browser-only',
      createdAt: '2026-05-14T00:00:00Z',
      lastOpenedAt: '2026-05-14T00:00:00Z',
      layout: { version: 1, writtenBy: 'test', dockview: null },
      tabs: [],
      activeTabPath: null,
      curatedModels: [],
      schemaVersion: 2
    });

    await useStructureViewStore.getState().setWorkspaceId('ws-2');
    useStructureViewStore.getState().toggleExpansion(KEY);

    // The persistence call is fire-and-forget; settle the microtask queue.
    await new Promise((r) => setTimeout(r, 0));

    const saved = await loadStructureViewState('ws-2');
    expect(saved['cdm.trade::Trade::economics']).toBe(true);
  });
});
