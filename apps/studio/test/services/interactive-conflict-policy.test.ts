// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { createInteractiveConflictPolicy } from '../../src/services/interactive-conflict-policy.js';

describe('interactive conflict policy', () => {
  it('resolves onConflict with the user choice (keepMine)', async () => {
    const policy = createInteractiveConflictPolicy();
    const p = policy.onConflict({
      conflictPaths: ['a'],
      localSha: 'l',
      remoteSha: 'r',
      fs: {} as never,
      dir: '/w/files',
      gitdir: '/w/.git'
    });
    policy.resolve('keepMine');
    await expect(p).resolves.toEqual({ action: 'keepMine' });
  });

  it('maps takeRemote', async () => {
    const policy = createInteractiveConflictPolicy();
    const p = policy.onConflict({
      conflictPaths: [],
      localSha: '',
      remoteSha: '',
      fs: {} as never,
      dir: '',
      gitdir: ''
    });
    policy.resolve('takeRemote');
    await expect(p).resolves.toEqual({ action: 'takeRemote' });
  });
});
