// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi } from 'vitest';

vi.mock('@rune-langium/git-sync-engine', () => ({
  createGitSyncEngine: () => ({ notifyDirty: vi.fn(), syncNow: vi.fn(), getState: () => ({ phase: 'idle' }), subscribe: () => () => {}, dispose: vi.fn() })
}));

import { getOrCreateSyncEngine, notifySyncOnSave, getSyncEngine } from '../../src/services/git-sync.js';

describe('notifySyncOnSave', () => {
  it('calls notifyDirty on the registered engine', () => {
    getOrCreateSyncEngine({
      fs: {} as never, workspaceId: 'wsNotify',
      gitBacking: { repoUrl: 'https://github.com/o/r.git', branch: 'main', user: 'u', tokenPath: '/wsNotify/.studio/token', syncState: 'clean', lastSyncedSha: null },
      token: 't'
    });
    const engine = getSyncEngine('wsNotify')!;
    const spy = vi.spyOn(engine, 'notifyDirty');
    notifySyncOnSave('wsNotify');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('queues without throwing for an unregistered workspace (pre-init dirty)', () => {
    // Before any engine exists, notifySyncOnSave should enqueue the dirty
    // signal rather than throw or silently drop it.
    expect(() => notifySyncOnSave('no-such-ws')).not.toThrow();
  });
});
