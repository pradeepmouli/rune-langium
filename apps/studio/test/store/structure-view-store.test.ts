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

  it('toggling expanded → collapsed deletes the key instead of writing false', () => {
    useStructureViewStore.getState().toggleExpansion(KEY);
    useStructureViewStore.getState().toggleExpansion(KEY);

    // Dead `false` entries would grow the persisted record unbounded over
    // a session; absence is semantically equivalent and stays empty.
    expect(useStructureViewStore.getState().expansionMap.size).toBe(0);
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

  it('drops a stale hydration result when the workspace switched mid-load', async () => {
    const { saveWorkspace, saveStructureViewState } = await import('../../src/workspace/persistence.js');
    const baseWs = {
      kind: 'browser-only' as const,
      createdAt: '2026-05-14T00:00:00Z',
      lastOpenedAt: '2026-05-14T00:00:00Z',
      layout: { version: 1, writtenBy: 'test', dockview: null },
      tabs: [],
      activeTabPath: null,
      curatedModels: [],
      schemaVersion: 2
    };
    await saveWorkspace({ ...baseWs, id: 'ws-a', name: 'ws-a' });
    await saveWorkspace({ ...baseWs, id: 'ws-b', name: 'ws-b' });
    await saveStructureViewState('ws-a', { 'a-only::Trade::economics': true });
    await saveStructureViewState('ws-b', { 'b-only::Trade::economics': true });

    // Fire both setWorkspaceId calls concurrently. The first synchronously
    // sets workspaceId='ws-a'; the second synchronously sets it to 'ws-b'
    // and starts its own load. Whichever IDB read resolves last must not
    // clobber the active workspace's map.
    const pa = useStructureViewStore.getState().setWorkspaceId('ws-a');
    const pb = useStructureViewStore.getState().setWorkspaceId('ws-b');
    await Promise.all([pa, pb]);

    expect(useStructureViewStore.getState().workspaceId).toBe('ws-b');
    expect(useStructureViewStore.getState().expansionMap.get('a-only::Trade::economics')).toBeUndefined();
    expect(useStructureViewStore.getState().expansionMap.get('b-only::Trade::economics')).toBe(true);
  });

  it('serializes persistence writes so the final saved state matches the final in-memory state', async () => {
    const { saveWorkspace, loadStructureViewState } = await import('../../src/workspace/persistence.js');
    await saveWorkspace({
      id: 'ws-c',
      name: 'ws-c',
      kind: 'browser-only',
      createdAt: '2026-05-14T00:00:00Z',
      lastOpenedAt: '2026-05-14T00:00:00Z',
      layout: { version: 1, writtenBy: 'test', dockview: null },
      tabs: [],
      activeTabPath: null,
      curatedModels: [],
      schemaVersion: 2
    });

    await useStructureViewStore.getState().setWorkspaceId('ws-c');

    const K1: StructureExpansionKey = { namespaceUri: 'ns', typeId: 'T', attrName: 'a' };
    const K2: StructureExpansionKey = { namespaceUri: 'ns', typeId: 'T', attrName: 'b' };
    // Rapid toggle sequence: expand a, expand b, collapse a.
    // Final in-memory state: only b is expanded.
    useStructureViewStore.getState().toggleExpansion(K1);
    useStructureViewStore.getState().toggleExpansion(K2);
    useStructureViewStore.getState().toggleExpansion(K1);

    // Drain the persistence chain. Each toggle enqueues a save behind the
    // previous one, so awaiting the chain is the public signal that all
    // pending writes have landed.
    await new Promise((r) => setTimeout(r, 50));

    const saved = await loadStructureViewState('ws-c');
    expect(saved).toEqual({ 'ns::T::b': true });
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
