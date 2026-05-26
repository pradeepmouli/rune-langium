// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T054 — fetchGitHubUser client contract tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchGitHubUser } from '../../src/services/github-auth.js';

const AUTH_BASE = 'https://www.daikonic.dev/rune-studio/api/github-auth';

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => fetchSpy.mockRestore());

describe('fetchGitHubUser (T054)', () => {
  it('returns ok identity on 200', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ login: 'octocat', avatarUrl: 'https://x/a.png' }), {
        status: 200
      })
    );
    expect(await fetchGitHubUser(AUTH_BASE, 't')).toEqual({
      kind: 'ok',
      login: 'octocat',
      avatarUrl: 'https://x/a.png'
    });
  });

  it('returns error with category misconfigured on 502', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'github_misconfigured' }), { status: 502 })
    );
    const result = await fetchGitHubUser(AUTH_BASE, 't');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.category).toBe('misconfigured');
    }
  });

  it('returns error with category unavailable on 503', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'github_unavailable' }), { status: 503 })
    );
    const result = await fetchGitHubUser(AUTH_BASE, 't');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.category).toBe('unavailable');
    }
  });

  it('returns error kind on 401', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    expect((await fetchGitHubUser(AUTH_BASE, 'bad')).kind).toBe('error');
  });

  it('returns unavailable when fetch throws a network error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network failure'));
    const result = await fetchGitHubUser(AUTH_BASE, 't');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.category).toBe('unavailable');
      expect(result.reason).toContain('network failure');
    }
  });
});
