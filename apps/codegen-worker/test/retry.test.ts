// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Container retry-on-failure tests (T026).
 *
 * Per contracts/http-generate.md and data-model.md: the Worker retries the
 * container dispatch once on transient failure (thrown error OR 5xx) before
 * returning 502 upstream_failure. Success (2xx or 4xx-but-not-5xx) is NOT
 * retried.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleRequest } from '../src/index.js';
import type { WorkerEnv } from '../src/types.js';

const SIGNING_KEY = 'test-signing-key-0123456789abcdef0123456789abcdef';

function makeEnv(container: ReturnType<typeof vi.fn>): WorkerEnv {
  return {
    CODEGEN: { fetch: container },
    RATE_LIMITER: {
      idFromName: () => ({ toString: () => 'id' }),
      get: () => ({
        fetch: async () =>
          new Response(
            JSON.stringify({
              allowed: true,
              remaining_hour: 9,
              remaining_day: 99,
              retry_after_s: 0,
              scope_tripped: null
            })
          )
      })
    } as never,
    LANG_CACHE: { get: async () => null, put: async () => void 0 } as never,
    TURNSTILE_SECRET: 'x',
    TURNSTILE_SITE_KEY: 'x',
    SESSION_SIGNING_KEY: SIGNING_KEY
  } as WorkerEnv;
}

async function generateWithSession(env: WorkerEnv): Promise<Response> {
  // Build a valid session cookie so auth passes without needing Turnstile.
  const { signSessionJwt, computeIpHash, buildSessionCookie, todayAsSalt } =
    await import('../src/session.js');
  const ipHash = await computeIpHash('203.0.113.5', todayAsSalt());
  const jwt = await signSessionJwt({
    key: SIGNING_KEY,
    ipHash,
    action: 'export-code'
  });
  const cookie = buildSessionCookie(jwt).split(';')[0]!;

  const req = new Request('https://www.daikonic.dev/rune-studio/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': '203.0.113.5',
      Cookie: cookie
    },
    body: JSON.stringify({ language: 'typescript', files: [] })
  });
  return handleRequest(req, env);
}

describe('container retry (T026)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('retries once when the first container fetch throws, succeeds on retry', async () => {
    const container = vi
      .fn()
      .mockRejectedValueOnce(new Error('container unreachable'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            language: 'typescript',
            files: [{ path: 'F.ts', content: '// ok' }],
            errors: []
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const res = await generateWithSession(makeEnv(container));
    expect(container).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it('retries once on 5xx, succeeds on retry', async () => {
    const container = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 502 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ language: 'typescript', files: [], errors: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

    const res = await generateWithSession(makeEnv(container));
    expect(container).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it('gives up after a second consecutive failure and returns 502', async () => {
    const container = vi.fn().mockRejectedValue(new Error('persistent failure'));

    const res = await generateWithSession(makeEnv(container));
    expect(container).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('upstream_failure');
  });

  it('does NOT retry on 2xx success (first call only)', async () => {
    const container = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ language: 'typescript', files: [], errors: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

    const res = await generateWithSession(makeEnv(container));
    expect(container).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });

  it('does NOT retry on 4xx passthrough (e.g. 422 parse errors)', async () => {
    const container = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          language: 'typescript',
          files: [],
          errors: [{ sourceFile: 'x', construct: 't', message: 'syntax' }]
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const res = await generateWithSession(makeEnv(container));
    expect(container).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(422);
  });
});
