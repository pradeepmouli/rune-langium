// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { createGitOps } from '../src/git-ops.js';

describe('createGitOps', () => {
  it('exposes the operations the engine needs', () => {
    const ops = createGitOps({ fs: {} as never, http: {}, dir: '/w/files', gitdir: '/w/.git' });
    for (const m of ['stageAll', 'commit', 'fetch', 'computeAheadBehind', 'fastForward', 'merge', 'push', 'resetTo', 'currentSha', 'remoteSha']) {
      expect(typeof (ops as unknown as Record<string, unknown>)[m]).toBe('function');
    }
  });
});
