// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi } from 'vitest';
import { pushForceWithLease } from '../src/force-with-lease.js';
import type { GitOps } from '../src/git-ops.js';

function fakeOps(over: Partial<GitOps>): GitOps {
  return { fetch: vi.fn(), remoteSha: vi.fn(), push: vi.fn(), ...over } as unknown as GitOps;
}

describe('pushForceWithLease', () => {
  it('force-pushes when the remote still matches the expected sha', async () => {
    const push = vi.fn().mockResolvedValue(undefined);
    const ops = fakeOps({
      fetch: vi.fn().mockResolvedValue(undefined),
      remoteSha: vi.fn().mockResolvedValue('abc'),
      push
    });
    const r = await pushForceWithLease(ops, 'main', 'https://x', 'abc');
    expect(r).toEqual({ ok: true });
    expect(push).toHaveBeenCalledWith('main', 'https://x', { force: true });
  });

  it('refuses (lease failed) when the remote moved', async () => {
    const push = vi.fn();
    const ops = fakeOps({
      fetch: vi.fn().mockResolvedValue(undefined),
      remoteSha: vi.fn().mockResolvedValue('def'),
      push
    });
    const r = await pushForceWithLease(ops, 'main', 'https://x', 'abc');
    expect(r).toEqual({ ok: false, reason: 'lease_failed' });
    expect(push).not.toHaveBeenCalled();
  });
});
