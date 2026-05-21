// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted, so the factory must not reference top-level variables
// declared later in the file. Use vi.hoisted() to share state across the
// hoisted boundary.
const { created, getState, subscribeCbs } = vi.hoisted(() => {
  const created: unknown[] = [];
  const subscribeCbs: Array<(s: object) => void> = [];
  const state = { current: { phase: 'idle' as string } };
  const getState = () => state.current;
  return { created, getState, subscribeCbs, state };
});

vi.mock('@rune-langium/git-sync-engine', () => ({
  createGitSyncEngine: (opts: unknown) => {
    created.push(opts);
    const subs = new Set<(s: object) => void>();
    return {
      notifyDirty: vi.fn(),
      syncNow: vi.fn(),
      getState,
      subscribe: (cb: (s: object) => void) => {
        subs.add(cb);
        subscribeCbs.push(cb);
        return () => subs.delete(cb);
      },
      dispose: vi.fn()
    };
  }
}));

import {
  getOrCreateSyncEngine,
  subscribeToEngine,
  disposeSyncEngine,
  defaultGitProxyUrl
} from '../../src/services/git-sync.js';

const GIT_BACKING = {
  repoUrl: 'https://github.com/o/r.git',
  branch: 'main',
  user: 'u',
  tokenPath: '/ws1/.studio/token',
  syncState: 'clean' as const,
  lastSyncedSha: null
};

beforeEach(() => {
  subscribeCbs.length = 0;
});

describe('git-sync adapter', () => {
  it('builds an engine with files dir, .git gitdir, and proxy url', () => {
    const fs = {} as never;
    getOrCreateSyncEngine({ fs, workspaceId: 'ws1', gitBacking: GIT_BACKING });
    const opts = created[0] as Record<string, string>;
    expect(opts.dir).toBe('/ws1/files');
    expect(opts.gitdir).toBe('/ws1/.git');
    expect(String(opts.corsProxy)).toContain('/git');
  });

  it('defaultGitProxyUrl includes /git', () => {
    expect(defaultGitProxyUrl()).toContain('/git');
  });
});

describe('subscribeToEngine', () => {
  it('immediately calls cb and subscribes when engine already exists', () => {
    const wsId = 'ws-sub-existing';
    getOrCreateSyncEngine({
      fs: {} as never,
      workspaceId: wsId,
      gitBacking: { ...GIT_BACKING, tokenPath: `/${wsId}/.studio/token` }
    });

    const calls: object[] = [];
    const unsub = subscribeToEngine(wsId, (s) => calls.push(s));
    // Should have been called immediately with current state.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ phase: 'idle' });
    unsub();
  });

  it('subscriber registered BEFORE getOrCreate receives state once engine is created', () => {
    const wsId = 'ws-sub-before';
    const calls: object[] = [];
    subscribeToEngine(wsId, (s) => calls.push(s));
    // No calls yet — engine doesn't exist.
    expect(calls).toHaveLength(0);

    // Create the engine — should drain the pending subscriber.
    getOrCreateSyncEngine({
      fs: {} as never,
      workspaceId: wsId,
      gitBacking: { ...GIT_BACKING, tokenPath: `/${wsId}/.studio/token` }
    });

    // Subscriber should have been called with initial state.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ phase: 'idle' });
  });

  it('unsubscribe before engine creation removes cb from pending (no further calls)', () => {
    const wsId = 'ws-sub-unsub-before';
    const calls: object[] = [];
    const unsub = subscribeToEngine(wsId, (s) => calls.push(s));
    unsub(); // Remove before engine is created.

    getOrCreateSyncEngine({
      fs: {} as never,
      workspaceId: wsId,
      gitBacking: { ...GIT_BACKING, tokenPath: `/${wsId}/.studio/token` }
    });
    // Should NOT have been called — was unsubscribed before drain.
    expect(calls).toHaveLength(0);
  });

  it('disposeSyncEngine clears pending subscribers', () => {
    const wsId = 'ws-sub-dispose';
    const calls: object[] = [];
    subscribeToEngine(wsId, (s) => calls.push(s));
    disposeSyncEngine(wsId); // Clear pending set.
    getOrCreateSyncEngine({
      fs: {} as never,
      workspaceId: wsId,
      gitBacking: { ...GIT_BACKING, tokenPath: `/${wsId}/.studio/token` }
    });
    // Pending was cleared by dispose, so no call.
    expect(calls).toHaveLength(0);
  });
});
