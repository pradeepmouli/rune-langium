// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T052 — GitHub /user identity proxy endpoint contract tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src/index.js';

const env = {
  GITHUB_CLIENT_ID: 'Iv1.test_client_id',
  ALLOWED_ORIGIN: 'https://www.daikonic.dev'
};

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => fetchSpy.mockRestore());

function req(token: string): Request {
  return new Request('https://www.daikonic.dev/rune-studio/api/github-auth/user', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: 'https://www.daikonic.dev'
    }
  });
}

describe('POST /rune-studio/api/github-auth/user (T052)', () => {
  it('returns {login, avatarUrl} on GitHub 200', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ login: 'octocat', avatar_url: 'https://x/a.png' }),
        { status: 200 }
      )
    );
    const res = await worker.fetch(req('ghs_tok'), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ login: 'octocat', avatarUrl: 'https://x/a.png' });
  });

  it('maps GitHub 401 to a structured error (502 github_misconfigured)', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 })
    );
    const res = await worker.fetch(req('bad'), env);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('github_misconfigured');
  });

  it('returns 400 when the Authorization header is missing', async () => {
    const r = new Request('https://www.daikonic.dev/rune-studio/api/github-auth/user', {
      method: 'POST',
      headers: { Origin: 'https://www.daikonic.dev' }
    });
    const res = await worker.fetch(r, env);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('missing_token');
  });

  it('maps GitHub 5xx to 503 github_unavailable', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('boom', { status: 503 }));
    const res = await worker.fetch(req('ghs_tok'), env);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('github_unavailable');
  });

  it('rejects requests from a foreign origin with 403', async () => {
    const r = new Request('https://www.daikonic.dev/rune-studio/api/github-auth/user', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ghs_tok',
        Origin: 'https://evil.example'
      }
    });
    const res = await worker.fetch(r, env);
    expect(res.status).toBe(403);
  });

  it('calls GitHub /user with the correct Authorization header', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ login: 'octocat', avatar_url: 'https://x/a.png' }),
        { status: 200 }
      )
    );
    await worker.fetch(req('ghs_mytoken'), env);
    const upstreamUrl = String(fetchSpy.mock.calls[0]![0]);
    expect(upstreamUrl).toBe('https://api.github.com/user');
    const upstreamInit = fetchSpy.mock.calls[0]![1] as RequestInit;
    const upstreamHeaders = upstreamInit.headers as Record<string, string>;
    expect(upstreamHeaders['Authorization']).toBe('Bearer ghs_mytoken');
  });

  it('returns 405 on GET', async () => {
    const r = new Request('https://www.daikonic.dev/rune-studio/api/github-auth/user', {
      method: 'GET',
      headers: { Origin: 'https://www.daikonic.dev' }
    });
    const res = await worker.fetch(r, env);
    expect(res.status).toBe(405);
  });
});
