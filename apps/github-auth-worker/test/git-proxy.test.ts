// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleGitProxy } from '../src/git-proxy.js';
import worker from '../src/index.js';

const env = { GITHUB_CLIENT_ID: 'x', ALLOWED_ORIGIN: 'https://www.daikonic.dev' };

afterEach(() => vi.restoreAllMocks());

describe('handleGitProxy', () => {
  it('forwards to the reconstructed github URL with injected auth', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('refs', {
        status: 200,
        headers: { 'Content-Type': 'application/x-git-upload-pack-advertisement' }
      })
    );
    const req = new Request(
      'https://www.daikonic.dev/rune-studio/api/github-auth/git/github.com/owner/repo.git/info/refs?service=git-upload-pack',
      { method: 'GET', headers: { Origin: env.ALLOWED_ORIGIN, Authorization: 'Basic dXNlcjp0b2tlbg==' } }
    );
    const res = await handleGitProxy(req, env, env.ALLOWED_ORIGIN);
    expect(res.status).toBe(200);
    const calledUrl = (spy.mock.calls[0]![0] as Request).url ?? spy.mock.calls[0]![0];
    expect(String(calledUrl)).toBe('https://github.com/owner/repo.git/info/refs?service=git-upload-pack');
  });

  it('rejects a non-github host', async () => {
    const req = new Request('https://www.daikonic.dev/rune-studio/api/github-auth/git/evil.com/x.git/info/refs', {
      method: 'GET',
      headers: { Origin: env.ALLOWED_ORIGIN }
    });
    const res = await handleGitProxy(req, env, env.ALLOWED_ORIGIN);
    expect(res.status).toBe(400);
  });

  it('rejects a non-git-smart-HTTP path (e.g. /contents/secret)', async () => {
    const req = new Request(
      'https://www.daikonic.dev/rune-studio/api/github-auth/git/github.com/owner/repo.git/contents/secret',
      { method: 'GET', headers: { Origin: env.ALLOWED_ORIGIN } }
    );
    const res = await handleGitProxy(req, env, env.ALLOWED_ORIGIN);
    expect(res.status).toBe(400);
  });

  it('allows /git-upload-pack endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('pack', { status: 200, headers: { 'Content-Type': 'application/x-git-upload-pack-result' } })
    );
    const req = new Request(
      'https://www.daikonic.dev/rune-studio/api/github-auth/git/github.com/owner/repo.git/git-upload-pack',
      { method: 'POST', headers: { Origin: env.ALLOWED_ORIGIN, Authorization: 'Basic dXNlcjp0b2tlbg==' } }
    );
    const res = await handleGitProxy(req, env, env.ALLOWED_ORIGIN);
    expect(res.status).toBe(200);
  });

  it('allows /git-receive-pack endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('pack', { status: 200, headers: { 'Content-Type': 'application/x-git-receive-pack-result' } })
    );
    const req = new Request(
      'https://www.daikonic.dev/rune-studio/api/github-auth/git/github.com/owner/repo.git/git-receive-pack',
      { method: 'POST', headers: { Origin: env.ALLOWED_ORIGIN, Authorization: 'Basic dXNlcjp0b2tlbg==' } }
    );
    const res = await handleGitProxy(req, env, env.ALLOWED_ORIGIN);
    expect(res.status).toBe(200);
  });
});

describe('worker.fetch origin handling for /git/ (P1-A)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('allows same-origin GET with NO Origin header (browser same-origin)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('refs', {
        status: 200,
        headers: { 'Content-Type': 'application/x-git-upload-pack-advertisement' }
      })
    );
    // No Origin header — simulates a same-origin browser GET
    const req = new Request(
      'https://www.daikonic.dev/rune-studio/api/github-auth/git/github.com/owner/repo.git/info/refs?service=git-upload-pack',
      { method: 'GET', headers: { Authorization: 'Basic dXNlcjp0b2tlbg==' } }
    );
    const res = await worker.fetch(req, env);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });

  it('blocks a cross-origin GET on /git/ with a foreign Origin', async () => {
    const req = new Request(
      'https://www.daikonic.dev/rune-studio/api/github-auth/git/github.com/owner/repo.git/info/refs?service=git-upload-pack',
      { method: 'GET', headers: { Origin: 'https://evil.com' } }
    );
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(403);
  });
});
