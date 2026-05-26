// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { loadWorkspaceToken, loadGlobalGithubToken } = vi.hoisted(() => ({
  loadWorkspaceToken: vi.fn(),
  loadGlobalGithubToken: vi.fn(),
}));

vi.mock('../../src/services/github-auth.js', () => ({ loadWorkspaceToken }));
vi.mock('../../src/services/github-store.js', () => ({ loadGlobalGithubToken }));

import { resolveGitToken } from '../../src/services/git-sync.js';

beforeEach(() => { vi.clearAllMocks(); });

describe('git-sync token resolution', () => {
  it('uses the per-workspace token when present', async () => {
    loadWorkspaceToken.mockResolvedValue('ws-tok'); loadGlobalGithubToken.mockResolvedValue('global-tok');
    expect(await resolveGitToken({} as any, 'w1')).toBe('ws-tok');
    expect(loadGlobalGithubToken).not.toHaveBeenCalled();
  });
  it('falls back to the global token when no per-workspace token', async () => {
    loadWorkspaceToken.mockResolvedValue(null); loadGlobalGithubToken.mockResolvedValue('global-tok');
    expect(await resolveGitToken({} as any, 'w1')).toBe('global-tok');
  });
  it('returns empty string when neither exists', async () => {
    loadWorkspaceToken.mockResolvedValue(null); loadGlobalGithubToken.mockResolvedValue(null);
    expect(await resolveGitToken({} as any, 'w1')).toBe('');
  });
});
