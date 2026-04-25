// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T051 — GitHub Device-Flow mediator contract tests.
 * Stateless worker; only the request → upstream-fetch → response shape
 * is asserted. Origin allowlist enforcement is also exercised.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../src/index.js';

const env = {
  GITHUB_CLIENT_ID: 'Iv1.test_client_id',
  ALLOWED_ORIGIN: 'https://www.daikonic.dev'
};

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

function req(path: string, init?: RequestInit): Request {
  return new Request(`https://www.daikonic.dev${path}`, {
    ...init,
    method: init?.method ?? 'POST',
    headers: { Origin: 'https://www.daikonic.dev', ...init?.headers }
  });
}

describe('POST /rune-studio/api/github-auth/device-init (T051)', () => {
  it('forwards to GitHub /login/device/code with our client_id', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          device_code: 'devcode',
          user_code: 'ABCD-1234',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 5
        }),
        { status: 200 }
      )
    );
    const res = await worker.fetch(req('/rune-studio/api/github-auth/device-init'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user_code: string; verification_uri: string };
    expect(body.user_code).toBe('ABCD-1234');
    expect(body.verification_uri).toBe('https://github.com/login/device');

    const upstream = String(fetchSpy.mock.calls[0]![0]);
    expect(upstream).toBe('https://github.com/login/device/code');
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe('POST');
    const sentBody = String(init.body);
    expect(sentBody).toContain('client_id=Iv1.test_client_id');
  });

  it('maps GitHub 5xx to a clean 503', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('boom', { status: 502 }));
    const res = await worker.fetch(req('/rune-studio/api/github-auth/device-init'), env);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('github_unavailable');
  });

  it('rejects requests from a foreign origin with 403', async () => {
    const r = new Request('https://www.daikonic.dev/rune-studio/api/github-auth/device-init', {
      method: 'POST',
      headers: { Origin: 'https://evil.example' }
    });
    const res = await worker.fetch(r, env);
    expect(res.status).toBe(403);
  });
});

describe('POST /rune-studio/api/github-auth/device-poll (T051)', () => {
  function pollReq(deviceCode: string) {
    return req('/rune-studio/api/github-auth/device-poll', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code: deviceCode })
    });
  }

  it('returns 200 with the access token on success', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: 'gho_test', token_type: 'bearer', scope: 'repo' }),
        { status: 200 }
      )
    );
    const res = await worker.fetch(pollReq('devcode'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { access_token: string };
    expect(body.access_token).toBe('gho_test');
  });

  it('returns 202 when GitHub says authorization_pending', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'authorization_pending' }), { status: 200 })
    );
    const res = await worker.fetch(pollReq('devcode'), env);
    expect(res.status).toBe(202);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('authorization_pending');
  });

  it('returns 410 when the device code expired', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'expired_token' }), { status: 200 })
    );
    const res = await worker.fetch(pollReq('devcode'), env);
    expect(res.status).toBe(410);
  });

  it('returns 400 when the body is missing device_code', async () => {
    const r = new Request('https://www.daikonic.dev/rune-studio/api/github-auth/device-poll', {
      method: 'POST',
      headers: {
        Origin: 'https://www.daikonic.dev',
        'Content-Type': 'application/json'
      },
      body: '{}'
    });
    const res = await worker.fetch(r, env);
    expect(res.status).toBe(400);
  });
});
