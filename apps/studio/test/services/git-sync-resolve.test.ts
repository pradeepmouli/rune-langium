// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi } from 'vitest';

// Capture the conflictPolicy passed to createGitSyncEngine.
let capturedPolicy: unknown = undefined;
vi.mock('@rune-langium/git-sync-engine', () => ({
  createGitSyncEngine: (opts: Record<string, unknown>) => {
    capturedPolicy = opts.conflictPolicy;
    return {
      notifyDirty: vi.fn(),
      syncNow: vi.fn(),
      getState: () => ({ phase: 'idle' }),
      subscribe: () => () => {},
      dispose: vi.fn()
    };
  }
}));

import { getOrCreateSyncEngine, resolveConflict, disposeSyncEngine } from '../../src/services/git-sync.js';

const GIT_BACKING = {
  repoUrl: 'https://github.com/o/r.git',
  branch: 'main',
  user: 'u',
  tokenPath: '/wsResolve/.studio/token',
  syncState: 'clean' as const,
  lastSyncedSha: null
};

describe('git-sync resolve wiring', () => {
  it('auto-creates a conflictPolicy when none is supplied', () => {
    capturedPolicy = undefined;
    getOrCreateSyncEngine({
      fs: {} as never,
      workspaceId: 'wsResolveA',
      gitBacking: GIT_BACKING,
      token: 'tok'
    });
    expect(capturedPolicy).toBeDefined();
    expect(typeof (capturedPolicy as { onConflict: unknown }).onConflict).toBe('function');
  });

  it('resolveConflict routes to the auto-created policy (keepMine)', async () => {
    const wsId = 'wsResolveB';
    capturedPolicy = undefined;
    getOrCreateSyncEngine({
      fs: {} as never,
      workspaceId: wsId,
      gitBacking: { ...GIT_BACKING, tokenPath: `/${wsId}/.studio/token` },
      token: 'tok'
    });

    // capturedPolicy is the real InteractiveConflictPolicy; call onConflict to
    // get the pending promise, then resolve it via resolveConflict.
    const policy = capturedPolicy as { onConflict: (ctx: object) => Promise<{ action: string }> };
    const pending = policy.onConflict({
      conflictPaths: ['a'],
      localSha: 'l',
      remoteSha: 'r',
      fs: {},
      dir: '/',
      gitdir: '/.git'
    });
    resolveConflict(wsId, 'keepMine');
    await expect(pending).resolves.toEqual({ action: 'keepMine' });
  });

  it('resolveConflict routes takeRemote', async () => {
    const wsId = 'wsResolveC';
    capturedPolicy = undefined;
    getOrCreateSyncEngine({
      fs: {} as never,
      workspaceId: wsId,
      gitBacking: { ...GIT_BACKING, tokenPath: `/${wsId}/.studio/token` },
      token: 'tok'
    });

    const policy = capturedPolicy as { onConflict: (ctx: object) => Promise<{ action: string }> };
    const pending = policy.onConflict({ conflictPaths: [], localSha: '', remoteSha: '', fs: {}, dir: '', gitdir: '' });
    resolveConflict(wsId, 'takeRemote');
    await expect(pending).resolves.toEqual({ action: 'takeRemote' });
  });

  it('resolveConflict is a no-op for an unregistered workspace', () => {
    expect(() => resolveConflict('wsResolveUnknown', 'keepMine')).not.toThrow();
  });

  it('disposeSyncEngine clears the policy so resolveConflict is a no-op after dispose', async () => {
    const wsId = 'wsResolveD';
    capturedPolicy = undefined;
    getOrCreateSyncEngine({
      fs: {} as never,
      workspaceId: wsId,
      gitBacking: { ...GIT_BACKING, tokenPath: `/${wsId}/.studio/token` },
      token: 'tok'
    });

    const policy = capturedPolicy as { onConflict: (ctx: object) => Promise<{ action: string }> };
    // Grab the promise BEFORE dispose.
    const pending = policy.onConflict({ conflictPaths: [], localSha: '', remoteSha: '', fs: {}, dir: '', gitdir: '' });
    disposeSyncEngine(wsId);
    // resolveConflict after dispose should not throw and should not resolve the promise.
    expect(() => resolveConflict(wsId, 'keepMine')).not.toThrow();
    // The promise remains pending (never settles). Verify by racing with a short timeout.
    const race = await Promise.race([
      pending.then(() => 'resolved'),
      new Promise<string>((res) => setTimeout(() => res('timeout'), 20))
    ]);
    expect(race).toBe('timeout');
  });
});
