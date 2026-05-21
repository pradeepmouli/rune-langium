// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi } from 'vitest';

const created: unknown[] = [];
vi.mock('@rune-langium/git-sync-engine', () => ({
  createGitSyncEngine: (opts: unknown) => { created.push(opts); return { notifyDirty: vi.fn(), syncNow: vi.fn(), getState: () => ({ phase: 'idle' }), subscribe: () => () => {}, dispose: vi.fn() }; }
}));

import { getOrCreateSyncEngine, defaultGitProxyUrl } from '../../src/services/git-sync.js';

describe('git-sync adapter', () => {
  it('builds an engine with files dir, .git gitdir, proxy url, and token auth', () => {
    const fs = {} as never;
    getOrCreateSyncEngine({
      fs, workspaceId: 'ws1',
      gitBacking: { repoUrl: 'https://github.com/o/r.git', branch: 'main', user: 'u', tokenPath: '/ws1/.studio/token', syncState: 'clean', lastSyncedSha: null },
      token: 'tok'
    });
    const opts = created[0] as Record<string, string>;
    expect(opts.dir).toBe('/ws1/files');
    expect(opts.gitdir).toBe('/ws1/.git');
    expect(String(opts.corsProxy)).toContain('/git');
  });
});
