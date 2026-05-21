// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi } from 'vitest';
import { createGitSyncEngine } from '../src/engine.js';
import type { GitOps } from '../src/git-ops.js';
import type { ConflictPolicy } from '../src/types.js';

function ops(over: Partial<GitOps>): GitOps {
  return {
    stageAll: vi.fn().mockResolvedValue(['a.rosetta']),
    commit: vi.fn().mockResolvedValue('local'),
    fetch: vi.fn().mockResolvedValue(undefined),
    computeAheadBehind: vi.fn().mockResolvedValue({ ahead: 1, behind: 1 }),
    fastForward: vi.fn().mockResolvedValue(undefined),
    merge: vi.fn().mockResolvedValue({ ok: true }),
    push: vi.fn().mockResolvedValue(undefined),
    resetTo: vi.fn().mockResolvedValue(undefined),
    restoreLocal: vi.fn().mockResolvedValue(undefined),
    currentSha: vi.fn().mockResolvedValue('local'),
    remoteSha: vi.fn().mockResolvedValue('remote'),
    ...over
  } as unknown as GitOps;
}

const base = {
  fs: {} as never,
  http: {},
  dir: '/w/files',
  gitdir: '/w/.git',
  remoteUrl: 'https://x',
  ref: 'main',
  onAuth: () => ({ username: 'x', password: 't' }),
  author: { name: 'A', email: 'a@x' },
  debounceMs: 0
};

describe('GitSyncEngine conflict + offline', () => {
  it('blocks when merge conflicts and policy returns block', async () => {
    const o = ops({ merge: vi.fn().mockResolvedValue({ ok: false, conflictPaths: ['a.rosetta'] }) });
    const e = createGitSyncEngine({ ...base, __opsForTest: o } as never);
    await e.syncNow();
    expect(e.getState().phase).toBe('blocked');
    expect(e.getState().conflictPaths).toEqual(['a.rosetta']);
    expect(o.push as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('keepMine with failed lease clears conflictPaths from state', async () => {
    const policy: ConflictPolicy = { onConflict: async () => ({ action: 'keepMine' }) };
    const o = ops({
      merge: vi.fn().mockResolvedValue({ ok: false, conflictPaths: ['a.rosetta'] }),
      restoreLocal: vi.fn().mockResolvedValue(undefined),
      // remoteSha returns different value → lease check fails
      remoteSha: vi.fn().mockResolvedValueOnce('remote').mockResolvedValueOnce('remote-moved'),
      push: vi.fn().mockResolvedValue(undefined)
    });
    const e = createGitSyncEngine({ ...base, conflictPolicy: policy, __opsForTest: o } as never);
    await e.syncNow();
    const s = e.getState();
    expect(s.phase).toBe('blocked');
    expect(s.conflictPaths).toBeUndefined();
    expect(s.lastError?.code).toBe('non_fast_forward');
  });

  it('keepMine restores the working tree then force-pushes with lease, then idle', async () => {
    const push = vi.fn().mockResolvedValue(undefined);
    const restoreLocal = vi.fn().mockResolvedValue(undefined);
    const policy: ConflictPolicy = { onConflict: async () => ({ action: 'keepMine' }) };
    const o = ops({
      merge: vi.fn().mockResolvedValue({ ok: false, conflictPaths: ['a'] }),
      push,
      restoreLocal,
      remoteSha: vi.fn().mockResolvedValue('remote') // unchanged → lease ok
    });
    const e = createGitSyncEngine({ ...base, conflictPolicy: policy, __opsForTest: o } as never);
    await e.syncNow();
    expect(restoreLocal).toHaveBeenCalledWith('main');
    expect(push).toHaveBeenCalledWith('main', 'https://x', { force: true });
    expect(e.getState().phase).toBe('idle');
  });

  it('takeRemote resets and goes idle', async () => {
    const resetTo = vi.fn().mockResolvedValue(undefined);
    const policy: ConflictPolicy = { onConflict: async () => ({ action: 'takeRemote' }) };
    const o = ops({ merge: vi.fn().mockResolvedValue({ ok: false, conflictPaths: ['a'] }), resetTo });
    const e = createGitSyncEngine({ ...base, conflictPolicy: policy, __opsForTest: o } as never);
    await e.syncNow();
    expect(resetTo).toHaveBeenCalledWith('main');
    expect(e.getState().phase).toBe('idle');
  });

  it('goes offline (keeps local commit) when fetch throws', async () => {
    const o = ops({ fetch: vi.fn().mockRejectedValue(new Error('network down')) });
    const e = createGitSyncEngine({ ...base, __opsForTest: o } as never);
    await e.syncNow();
    expect(e.getState().phase).toBe('offline');
    expect(o.commit as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it('does nothing online-wise when isOnline is false', async () => {
    const o = ops({});
    const e = createGitSyncEngine({ ...base, isOnline: () => false, __opsForTest: o } as never);
    await e.syncNow();
    expect(e.getState().phase).toBe('offline');
    expect(o.fetch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('auth-blocked state has conflictPaths === undefined (non-conflict discriminator)', async () => {
    const authErr = Object.assign(new Error('HTTP 401 Unauthorized'), { code: 'HttpError' });
    const o = ops({ push: vi.fn().mockRejectedValue(authErr) });
    const e = createGitSyncEngine({ ...base, __opsForTest: o } as never);
    await e.syncNow();
    const s = e.getState();
    expect(s.phase).toBe('blocked');
    expect(s.lastError?.code).toBe('auth');
    expect(s.conflictPaths).toBeUndefined();
  });

  it('no_push_access-blocked state has conflictPaths === undefined', async () => {
    const accessErr = Object.assign(new Error('HTTP 403 Forbidden'), { code: 'HttpError' });
    const o = ops({ push: vi.fn().mockRejectedValue(accessErr) });
    const e = createGitSyncEngine({ ...base, __opsForTest: o } as never);
    await e.syncNow();
    const s = e.getState();
    expect(s.phase).toBe('blocked');
    expect(s.lastError?.code).toBe('no_push_access');
    expect(s.conflictPaths).toBeUndefined();
  });

  it('empty conflictPaths still routes through handleConflict (policy is awaited)', async () => {
    let policyInvoked = false;
    const policy: ConflictPolicy = {
      onConflict: async () => { policyInvoked = true; return { action: 'block' }; }
    };
    const o = ops({ merge: vi.fn().mockResolvedValue({ ok: false, conflictPaths: [] }) });
    const e = createGitSyncEngine({ ...base, conflictPolicy: policy, __opsForTest: o } as never);
    await e.syncNow();
    expect(policyInvoked).toBe(true);
    const s = e.getState();
    expect(s.phase).toBe('blocked');
    // Empty array (not undefined) — the badge should show resolve buttons.
    expect(s.conflictPaths).toEqual([]);
  });

  it('unsubscribe method removes the subscriber from future emits', async () => {
    const o = ops({});
    const e = createGitSyncEngine({ ...base, __opsForTest: o } as never);
    const received: string[] = [];
    const cb = (s: { phase: string }) => received.push(s.phase);
    e.subscribe(cb);
    await e.syncNow(); // should call cb at least once
    const countAfterSync = received.length;
    e.unsubscribe(cb);
    await e.syncNow(); // cb should NOT be called again
    expect(received.length).toBe(countAfterSync);
  });
});
