// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T014 — workspace persistence (IndexedDB) tests.
 * Backed by `fake-indexeddb` (already in use across the studio test suite).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  saveWorkspace,
  loadWorkspace,
  listRecents,
  deleteWorkspace,
  saveSetting,
  loadSetting,
  _resetForTests,
  type WorkspaceRecord
} from '../../src/workspace/persistence.js';

function makeWorkspace(id: string, name = id): WorkspaceRecord {
  const now = new Date().toISOString();
  return {
    id,
    name,
    createdAt: now,
    lastOpenedAt: now,
    kind: 'browser-only',
    layout: { version: 1, writtenBy: '0.1.0', dockview: { _empty: true } },
    tabs: [],
    activeTabPath: null,
    curatedModels: [],
    schemaVersion: 1
  };
}

beforeEach(async () => {
  // Close the cached idb connection FIRST so deleteDatabase can run
  // without blocking, then drop the DB to start each test fresh.
  await _resetForTests();
  await new Promise<void>((resolveDelete, reject) => {
    const req = indexedDB.deleteDatabase('rune-studio');
    req.onsuccess = () => resolveDelete();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolveDelete();
  });
});

describe('persistence — workspace CRUD (T014)', () => {
  it('roundtrips a workspace through save → load', async () => {
    const ws = makeWorkspace('01ARZ3', 'My Workspace');
    await saveWorkspace(ws);
    const loaded = await loadWorkspace('01ARZ3');
    expect(loaded?.name).toBe('My Workspace');
    expect(loaded?.kind).toBe('browser-only');
    expect(loaded?.schemaVersion).toBe(1);
  });

  it('returns undefined for an unknown id', async () => {
    expect(await loadWorkspace('does-not-exist')).toBeUndefined();
  });

  it('lists recents sorted by lastOpenedAt desc', async () => {
    await saveWorkspace({
      ...makeWorkspace('older'),
      lastOpenedAt: '2026-04-01T00:00:00Z'
    });
    await saveWorkspace({
      ...makeWorkspace('newer'),
      lastOpenedAt: '2026-04-24T00:00:00Z'
    });
    const recents = await listRecents();
    expect(recents.map((r) => r.id)).toEqual(['newer', 'older']);
  });

  it('deleteWorkspace removes the record from both stores', async () => {
    const ws = makeWorkspace('to-remove');
    await saveWorkspace(ws);
    await deleteWorkspace('to-remove');
    expect(await loadWorkspace('to-remove')).toBeUndefined();
    const recents = await listRecents();
    expect(recents.find((r) => r.id === 'to-remove')).toBeUndefined();
  });
});

describe('persistence — settings store', () => {
  it('saves and loads scalar settings', async () => {
    await saveSetting('theme', 'dark');
    expect(await loadSetting('theme')).toBe('dark');
  });

  it('returns undefined for an unset key', async () => {
    expect(await loadSetting('telemetry-enabled')).toBeUndefined();
  });

  it('overwrites an existing setting on save', async () => {
    await saveSetting('theme', 'light');
    await saveSetting('theme', 'system');
    expect(await loadSetting('theme')).toBe('system');
  });
});
