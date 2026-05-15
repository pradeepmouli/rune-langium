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

  it('preserves the structureView slot when a later saveWorkspace omits it (stale-snapshot guard)', async () => {
    const db = await import('../../src/workspace/persistence.js');
    // Use a unique id; fake-indexeddb storage outlives `_resetForTests`,
    // so previous tests' ws-1 data would leak in and confuse the
    // pre-toggle snapshot.
    const wsId = 'ws-stale-guard';
    await saveWorkspace({ ...FRESH_WS, id: wsId, name: wsId });

    // Read a snapshot BEFORE any structure-view edit lands. This mirrors
    // what other code paths do: workspace-manager opens the workspace and
    // holds the record before user toggles arrive.
    const stale = await db.loadWorkspace(wsId);

    // Toggle persistence writes structureView to the workspace record.
    await saveStructureViewState(wsId, { 'cdm.trade::Trade::economics': true });

    // Later, the stale-snapshot holder updates unrelated metadata and
    // calls saveWorkspace. Their input doesn't include structureView (it
    // wasn't on the record when they read it), so without the merge the
    // expansion map would be silently deleted.
    await saveWorkspace({ ...stale!, name: 'renamed', lastOpenedAt: '2026-05-14T12:00:00Z' });

    const final = await loadStructureViewState(wsId);
    expect(final).toEqual({ 'cdm.trade::Trade::economics': true });

    const finalWs = await db.loadWorkspace(wsId);
    expect(finalWs?.name).toBe('renamed');
    expect(finalWs?.lastOpenedAt).toBe('2026-05-14T12:00:00Z');
  });

  it('saveWorkspace ignores caller-supplied structureView (only saveStructureViewState may write it)', async () => {
    const db = await import('../../src/workspace/persistence.js');
    const wsId = 'ws-caller-ignored';
    await saveWorkspace({ ...FRESH_WS, id: wsId, name: wsId });
    await saveStructureViewState(wsId, { a: true });

    // Even when the caller passes an explicit structureView, saveWorkspace
    // ignores it in favor of whatever is currently persisted. structureView
    // is owned by saveStructureViewState; saveWorkspace handles metadata.
    const current = await db.loadWorkspace(wsId);
    await saveWorkspace({ ...current!, structureView: { expansionMap: { b: true } } });

    const final = await loadStructureViewState(wsId);
    expect(final).toEqual({ a: true });
  });

  it('saveWorkspace preserves the latest persisted structureView when the caller carries a stale one', async () => {
    const db = await import('../../src/workspace/persistence.js');
    const wsId = 'ws-preserve-newer';
    await saveWorkspace({ ...FRESH_WS, id: wsId, name: wsId });
    await saveStructureViewState(wsId, { a: true });

    // Caller snapshots the workspace; their record now carries structureView = {a:true}.
    const stale = await db.loadWorkspace(wsId);

    // Concurrent: structure-view store toggles, advancing persisted state to {a:true, b:true}.
    await saveStructureViewState(wsId, { a: true, b: true });

    // Caller updates a metadata field and calls saveWorkspace with the
    // stale record. Even though their input contains a non-undefined
    // structureView ({a:true}), the previous fix's "only merge on
    // undefined" guard would have written that stale value back and
    // silently dropped `b`. The new unconditional preserve keeps the
    // newer {a:true, b:true}.
    await saveWorkspace({ ...stale!, name: 'renamed' });

    const final = await loadStructureViewState(wsId);
    expect(final).toEqual({ a: true, b: true });

    const finalWs = await db.loadWorkspace(wsId);
    expect(finalWs?.name).toBe('renamed');
  });

  it('uses an atomic transaction so a concurrent saveWorkspace cannot be reverted', async () => {
    const db = await import('../../src/workspace/persistence.js');
    await saveWorkspace(FRESH_WS);

    // Read a starting snapshot so the simulated concurrent saveWorkspace has
    // a full record to mutate (mirrors how workspace-manager re-saves on
    // open: load → mutate fields → save).
    const initial = await db.loadWorkspace('ws-1');

    // Fire both writes without awaiting in between. With the old two-tx
    // load+save pattern, saveStructureViewState's stale-snapshot put could
    // commit *after* saveWorkspace's put and silently revert `name` /
    // `lastOpenedAt` to their pre-update values. With the single-tx fix,
    // the get inside saveStructureViewState's tx sees whichever commit
    // landed first, so neither write reverts the other's fields.
    const pSv = saveStructureViewState('ws-1', { k: true });
    const pWs = saveWorkspace({
      ...initial!,
      name: 'renamed',
      lastOpenedAt: '2026-05-14T12:00:00Z'
    });
    await Promise.all([pSv, pWs]);

    const final = await db.loadWorkspace('ws-1');
    // The metadata update must survive: this is the field saveStructureViewState
    // used to clobber when it wrote back its stale snapshot.
    expect(final?.name).toBe('renamed');
    expect(final?.lastOpenedAt).toBe('2026-05-14T12:00:00Z');
  });
});
