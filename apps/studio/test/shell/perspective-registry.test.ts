// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { PERSPECTIVES } from '../../src/shell/perspectives/perspective-registry.js';

describe('PERSPECTIVES registry', () => {
  it('has the five perspectives in rail order', () => {
    expect(PERSPECTIVES.map((p) => p.id)).toEqual(['explore', 'workspaces', 'git', 'export', 'settings']);
  });
  it('only Explore declares a centerSlot (file tabs)', () => {
    expect(PERSPECTIVES.filter((p) => p.centerSlot).map((p) => p.id)).toEqual([]);
  });
  it('explore/git/export require a workspace; workspaces/settings do not', () => {
    const req = PERSPECTIVES.filter((p) => p.requiresWorkspace)
      .map((p) => p.id)
      .sort();
    expect(req).toEqual(['explore', 'export', 'git']);
  });
  it('settings is in the bottom group', () => {
    expect(PERSPECTIVES.find((p) => p.id === 'settings')!.group).toBe('bottom');
  });
});
