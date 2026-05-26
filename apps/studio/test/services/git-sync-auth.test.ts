// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { loadWorkspaceToken, loadGlobalGitHubToken } = vi.hoisted(() => ({
  loadWorkspaceToken: vi.fn(),
  loadGlobalGitHubToken: vi.fn(),
}));

vi.mock('../../src/services/github-auth.js', () => ({ loadWorkspaceToken }));
vi.mock('../../src/services/github-store.js', () => ({ loadGlobalGitHubToken }));

import { resolveGitToken } from '../../src/services/git-sync.js';

beforeEach(() => { vi.clearAllMocks(); });

describe('git-sync token resolution', () => {
  it('uses the per-workspace token when present', async () => {
    loadWorkspaceToken.mockResolvedValue('ws-tok'); loadGlobalGitHubToken.mockResolvedValue('global-tok');
    expect(await resolveGitToken({} as any, 'w1')).toBe('ws-tok');
    expect(loadGlobalGitHubToken).not.toHaveBeenCalled();
  });
  it('falls back to the global token when no per-workspace token', async () => {
    loadWorkspaceToken.mockResolvedValue(null); loadGlobalGitHubToken.mockResolvedValue('global-tok');
    expect(await resolveGitToken({} as any, 'w1')).toBe('global-tok');
  });
  it('returns empty string when neither exists', async () => {
    loadWorkspaceToken.mockResolvedValue(null); loadGlobalGitHubToken.mockResolvedValue(null);
    expect(await resolveGitToken({} as any, 'w1')).toBe('');
  });
  // Fix D: empty/whitespace per-workspace token must fall back to global
  it('falls back to global when per-workspace token is empty string (Fix D)', async () => {
    loadWorkspaceToken.mockResolvedValue(''); loadGlobalGitHubToken.mockResolvedValue('global-tok');
    expect(await resolveGitToken({} as any, 'w1')).toBe('global-tok');
  });
  it('falls back to global when per-workspace token is whitespace-only (Fix D)', async () => {
    loadWorkspaceToken.mockResolvedValue('   '); loadGlobalGitHubToken.mockResolvedValue('global-tok');
    expect(await resolveGitToken({} as any, 'w1')).toBe('global-tok');
  });
});
