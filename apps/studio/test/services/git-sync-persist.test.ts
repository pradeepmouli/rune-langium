// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { phaseToSyncState } from '../../src/services/git-sync.js';

describe('phaseToSyncState', () => {
  it('maps blocked+conflicts → conflict', () => {
    expect(phaseToSyncState({ phase: 'blocked', ahead: 1, behind: 1, lastSyncedSha: null, conflictPaths: ['a'] })).toBe(
      'conflict'
    );
  });
  it('maps blocked without conflictPaths → diverged', () => {
    expect(phaseToSyncState({ phase: 'blocked', ahead: 1, behind: 1, lastSyncedSha: null })).toBe('diverged');
  });
  it('maps idle clean → clean', () => {
    expect(phaseToSyncState({ phase: 'idle', ahead: 0, behind: 0, lastSyncedSha: 's' })).toBe('clean');
  });
  it('maps idle ahead → ahead', () => {
    expect(phaseToSyncState({ phase: 'idle', ahead: 2, behind: 0, lastSyncedSha: 's' })).toBe('ahead');
  });
  it('maps idle behind → behind', () => {
    expect(phaseToSyncState({ phase: 'idle', ahead: 0, behind: 3, lastSyncedSha: 's' })).toBe('behind');
  });
  it('maps mid-sync (pushing) → ahead', () => {
    expect(phaseToSyncState({ phase: 'pushing', ahead: 1, behind: 0, lastSyncedSha: null })).toBe('ahead');
  });
});
