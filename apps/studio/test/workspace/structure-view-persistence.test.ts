// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  _resetForTests,
  saveWorkspace,
  loadStructureViewState,
  saveStructureViewState
} from '../../src/workspace/persistence.js';
import type { WorkspaceRecord } from '../../src/workspace/persistence.js';

const FRESH_WS: WorkspaceRecord = {
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
};

describe('structure-view persistence', () => {
  beforeEach(async () => {
    await _resetForTests();
  });

  it('returns an empty map for a workspace with no structureView slot', async () => {
    await saveWorkspace(FRESH_WS);
    const state = await loadStructureViewState('ws-1');
    expect(state).toEqual({});
  });

  it('round-trips an expansion map', async () => {
    await saveWorkspace(FRESH_WS);
    await saveStructureViewState('ws-1', { 'cdm.trade::Trade::economics': true });
    const state = await loadStructureViewState('ws-1');
    expect(state).toEqual({ 'cdm.trade::Trade::economics': true });
  });

  it('returns an empty map for an unknown workspace id', async () => {
    const state = await loadStructureViewState('does-not-exist');
    expect(state).toEqual({});
  });

  it('preserves other workspace fields when writing the structureView slot', async () => {
    await saveWorkspace(FRESH_WS);
    await saveStructureViewState('ws-1', { 'cdm.trade::Trade::economics': true });
    const db = await import('../../src/workspace/persistence.js');
    const ws = await db.loadWorkspace('ws-1');
    expect(ws?.kind).toBe('browser-only');
    expect(ws?.tabs).toEqual([]);
    expect(ws?.layout.version).toBe(1);
  });
});
