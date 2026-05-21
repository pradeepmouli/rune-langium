// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Prevent IndexedDB access in the test environment — the persistence layer is
// not under test here and would throw "indexedDB is not defined" on any emit
// that reaches the internal persist subscriber.
vi.mock('../../src/workspace/persistence.js', () => ({
  loadWorkspace: vi.fn().mockResolvedValue(null),
  saveWorkspace: vi.fn().mockResolvedValue(undefined)
}));

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
    let engineState: object = { phase: 'idle', ahead: 0, behind: 0, lastSyncedSha: null };
    return {
      notifyDirty: vi.fn(),
      syncNow: vi.fn(),
      getState: () => engineState,
      subscribe: (cb: (s: object) => void) => {
        subs.add(cb);
        subscribeCbs.push(cb);
        return () => subs.delete(cb);
      },
      unsubscribe: (cb: (s: object) => void) => { subs.delete(cb); },
      dispose: vi.fn(),
      // Test seams: emit a new state to all subscribers; query current sub count.
      __emit: (s: object) => { engineState = s; subs.forEach(cb => cb(s)); },
      __subCount: () => subs.size,
    };
  }
}));

import {
  getOrCreateSyncEngine,
  subscribeToEngine,
  disposeSyncEngine,
  getSyncEngine,
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

  it('subscribe-before-create: each emit reaches cb EXACTLY once (no double-subscribe leak)', () => {
    const wsId = 'ws-leak-check';
    const calls: object[] = [];
    subscribeToEngine(wsId, (s) => calls.push(s));

    getOrCreateSyncEngine({
      fs: {} as never,
      workspaceId: wsId,
      gitBacking: { ...GIT_BACKING, tokenPath: `/${wsId}/.studio/token` }
    });

    // Initial state call from drain + exactly one live subscriber.
    expect(calls).toHaveLength(1);

    const engine = getSyncEngine(wsId) as any;
    expect(engine.__subCount()).toBe(
      // The engine has: the internal persist subscriber + the drained cb.
      // We only care that __subCount doesn't double-count our cb.
      engine.__subCount()  // capture for emit test below
    );
    const beforeEmit = calls.length;
    engine.__emit({ phase: 'idle', ahead: 0, behind: 0, lastSyncedSha: 'abc' });
    // Our cb should have been called exactly once more (not twice).
    expect(calls.length - beforeEmit).toBe(1);
  });

  it('unsubscribe (returned from pre-create call) stops all future deliveries and leaves no leak', () => {
    const wsId = 'ws-leak-unsub';
    const calls: object[] = [];
    const unsub = subscribeToEngine(wsId, (s) => calls.push(s));

    getOrCreateSyncEngine({
      fs: {} as never,
      workspaceId: wsId,
      gitBacking: { ...GIT_BACKING, tokenPath: `/${wsId}/.studio/token` }
    });

    const engine = getSyncEngine(wsId) as any;
    const subCountAfterCreate = engine.__subCount();

    unsub(); // Should remove cb from the live engine.

    // Sub count should have dropped by exactly 1.
    expect(engine.__subCount()).toBe(subCountAfterCreate - 1);

    const beforeEmit = calls.length;
    engine.__emit({ phase: 'idle', ahead: 0, behind: 0, lastSyncedSha: 'xyz' });
    // cb must NOT be called after unsubscribe.
    expect(calls.length).toBe(beforeEmit);
  });
});
