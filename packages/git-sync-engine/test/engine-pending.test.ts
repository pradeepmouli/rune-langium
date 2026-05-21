// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi } from 'vitest';
import { createGitSyncEngine } from '../src/engine.js';
import type { GitOps } from '../src/git-ops.js';

/**
 * GitOps fake whose `push` is a deferred promise the test resolves manually,
 * so we can hold a sync in flight and observe whether a dirty event that
 * arrives mid-sync triggers a follow-up run.
 */
function deferredPushOps(): { ops: GitOps; resolvePush: () => void } {
  let resolvePush!: () => void;
  const ops = {
    stageAll: vi.fn().mockResolvedValue(['a.rosetta']),
    commit: vi.fn().mockResolvedValue('localsha'),
    fetch: vi.fn().mockResolvedValue(undefined),
    computeAheadBehind: vi.fn().mockResolvedValue({ ahead: 1, behind: 0 }),
    fastForward: vi.fn().mockResolvedValue(undefined),
    merge: vi.fn(),
    push: vi.fn().mockImplementationOnce(
      () => new Promise<void>((res) => { resolvePush = res; })
    ).mockResolvedValue(undefined),
    resetTo: vi.fn(),
    restoreLocal: vi.fn(),
    currentSha: vi.fn().mockResolvedValue('localsha'),
    remoteSha: vi.fn().mockResolvedValue('remotesha')
  } as unknown as GitOps;
  return { ops, resolvePush: () => resolvePush() };
}

const baseOpts = {
  fs: {} as never, http: {}, dir: '/w/files', gitdir: '/w/.git',
  remoteUrl: 'https://x', ref: 'main',
  onAuth: () => ({ username: 'x', password: 't' }),
  author: { name: 'A', email: 'a@x' },
  debounceMs: 0,
  // Synchronous timer so the debounced follow-up fires immediately.
  setTimeoutFn: (cb: () => void) => { cb(); return 0; },
  clearTimeoutFn: () => {}
};

describe('GitSyncEngine pending sync', () => {
  it('runs a second sync for edits that arrive while a sync is in flight', async () => {
    const { ops, resolvePush } = deferredPushOps();
    const engine = createGitSyncEngine({ ...baseOpts, __opsForTest: ops } as never);

    // Start a sync but do NOT await — it blocks inside the deferred push.
    const first = engine.syncNow();
    // Let the engine work through the await chain up to the (pending) push.
    await vi.waitFor(() => expect((ops.push as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1));

    // An edit arrives mid-flight; with synchronous timers this calls syncNow()
    // again, which should set pendingSync rather than start a parallel run.
    engine.notifyDirty();
    expect((ops.stageAll as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);

    // Release the in-flight push and let the first run settle.
    resolvePush();
    await first;

    // The queued follow-up sync should run a full second cycle.
    await vi.waitFor(() => {
      expect((ops.stageAll as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);
      expect((ops.push as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);
    });
    expect(engine.getState().phase).toBe('idle');
  });
});
