// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { PERSPECTIVES, resolveEffectivePerspective } from '../../src/shell/perspectives/perspective-registry.js';

describe('PERSPECTIVES registry', () => {
  it('has the five perspectives in rail order', () => {
    expect(PERSPECTIVES.map((p) => p.id)).toEqual(['explore', 'workspaces', 'git', 'export', 'settings']);
  });
  it('only Explore declares a centerSlot (file tabs)', () => {
    expect(PERSPECTIVES.filter((p) => p.centerSlot).map((p) => p.id)).toEqual(['explore']);
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

describe('resolveEffectivePerspective', () => {
  // The single derivation PerspectiveHost and AppHeader both consume, so the
  // body and the bar can never disagree about which perspective is actually
  // showing (PR #369 Copilot finding: AppHeader used the raw store value,
  // PerspectiveHost used a host-level fallback — this test suite guards the
  // three fallback cases plus the passthrough case).

  it('falls back to workspaces when explore is active but has no explore content', () => {
    expect(resolveEffectivePerspective('explore', { hasWorkspace: false, hasExploreContent: false })).toBe(
      'workspaces'
    );
  });

  it('falls back to workspaces when a workspace-requiring perspective (git) has no workspace', () => {
    expect(resolveEffectivePerspective('git', { hasWorkspace: false, hasExploreContent: false })).toBe('workspaces');
  });

  it('falls back to workspaces when a workspace-requiring perspective (export) has no workspace', () => {
    expect(resolveEffectivePerspective('export', { hasWorkspace: false, hasExploreContent: true })).toBe('workspaces');
  });

  it('passes through explore when it has explore content', () => {
    expect(resolveEffectivePerspective('explore', { hasWorkspace: true, hasExploreContent: true })).toBe('explore');
  });

  it('passes through a workspace-requiring perspective (git) when a workspace is loaded', () => {
    expect(resolveEffectivePerspective('git', { hasWorkspace: true, hasExploreContent: true })).toBe('git');
  });

  it('passes through perspectives that never require a workspace (settings) regardless of context', () => {
    expect(resolveEffectivePerspective('settings', { hasWorkspace: false, hasExploreContent: false })).toBe('settings');
  });
});
