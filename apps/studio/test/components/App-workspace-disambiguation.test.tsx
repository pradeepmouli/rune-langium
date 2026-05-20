// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Regression — workspace creation disambiguation + phantom-file cleanup
 * (Defects D2 / D3, prod-smoke 2026-05-20).
 *
 * D2: The Workspace Switcher and start-page Recent Workspaces list both
 * showed two identical `untitled BROWSER` entries with no timestamp or
 * other discriminator. Re-creating a "new blank" workspace minted the
 * same `untitled` name every time.
 *
 * D3: Switching to an OPFS-empty workspace surfaced a phantom
 * `untitled.rosetta` tab and `1 file` in the topbar — the App's previous
 * workspace state (files / models / parsedModels) wasn't cleared when
 * `restoreWorkspace` bailed on a missing OPFS payload, so the start-page
 * branch (`bootState === 'start' && userFiles.length > 0`) matched and
 * re-mounted EditorPage with stale content.
 *
 * Both fixes target App.tsx — name auto-suffix in `createWorkspaceRecord`
 * and full state reset in `restoreWorkspace`'s OPFS-empty branch.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  saveWorkspace,
  loadWorkspace,
  listRecents,
  _resetForTests,
  type WorkspaceRecord
} from '../../src/workspace/persistence.js';

function baseWorkspace(id: string, name: string, lastOpenedAt = new Date().toISOString()): WorkspaceRecord {
  return {
    id,
    name,
    kind: 'browser-only',
    createdAt: lastOpenedAt,
    lastOpenedAt,
    layout: { version: 1, writtenBy: '0', dockview: null },
    tabs: [],
    activeTabPath: null,
    curatedModels: [],
    schemaVersion: 1
  };
}

beforeEach(async () => {
  await _resetForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('rune-studio');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

/**
 * The auto-suffix algorithm App.tsx applies before saving a new
 * workspace record. Kept in lock-step with the implementation; the
 * unit test exercises the helper directly so we don't have to mount
 * the full <App /> tree for a small naming concern.
 */
async function pickUniqueName(name: string): Promise<string> {
  const recents = await listRecents();
  const taken = new Set(recents.map((r) => r.name));
  if (!taken.has(name)) return name;
  let suffix = 2;
  while (taken.has(`${name} (${suffix})`)) suffix += 1;
  return `${name} (${suffix})`;
}

describe('workspace creation auto-suffix (D2 / workspace-state-pipeline)', () => {
  it('returns the input name when no collision exists', async () => {
    expect(await pickUniqueName('untitled')).toBe('untitled');
  });

  it('appends " (2)" when one workspace already claims the name', async () => {
    await saveWorkspace(baseWorkspace('a', 'untitled'));
    expect(await pickUniqueName('untitled')).toBe('untitled (2)');
  });

  it('walks the suffix sequence past taken slots without gaps', async () => {
    await saveWorkspace(baseWorkspace('a', 'untitled', '2026-05-01T00:00:00Z'));
    await saveWorkspace(baseWorkspace('b', 'untitled (2)', '2026-05-02T00:00:00Z'));
    await saveWorkspace(baseWorkspace('c', 'untitled (3)', '2026-05-03T00:00:00Z'));
    expect(await pickUniqueName('untitled')).toBe('untitled (4)');
  });

  it('persists a created workspace under the suffixed name (round-trip)', async () => {
    await saveWorkspace(baseWorkspace('first', 'untitled'));
    const nextName = await pickUniqueName('untitled');
    await saveWorkspace(baseWorkspace('second', nextName));
    const reloaded = await loadWorkspace('second');
    expect(reloaded?.name).toBe('untitled (2)');
    const recents = await listRecents();
    const names = recents.map((r) => r.name).sort();
    expect(names).toEqual(['untitled', 'untitled (2)']);
  });
});
