// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * End-to-end integration test for the Worker's POST /api/generate path (T019).
 *
 * Drives T018 — the full Turnstile → session cookie → DO rate-limit →
 * Container dispatch orchestration.
 *
 * Uses in-process stubs for Turnstile (intercepted fetch), the DO
 * (stub with scriptable allowed/denied responses), and the container
 * binding (stub that returns a canned CodeGenerationResult).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleRequest } from '../src/index.js';
import type { WorkerEnv } from '../src/types.js';

const TURNSTILE_DUMMY_SITE_KEY = '1x00000000000000000000AA';
const TURNSTILE_DUMMY_SECRET = '1x0000000000000000000000000000000AA';
const SIGNING_KEY = 'test-signing-key-0123456789abcdef0123456789abcdef';

interface StubRateLimiterBehaviour {
  allowed: boolean;
  remaining_hour: number;
  remaining_day: number;
  retry_after_s: number;
  scope_tripped: 'hour' | 'day' | null;
}

function makeEnv(
  overrides: Partial<WorkerEnv> & {
    rateLimiter?: StubRateLimiterBehaviour;
    container?: (req: Request) => Promise<Response>;
  } = {}
): WorkerEnv {
  const rateLimiterBehaviour: StubRateLimiterBehaviour = overrides.rateLimiter ?? {
    allowed: true,
    remaining_hour: 9,
    remaining_day: 99,
    retry_after_s: 0,
    scope_tripped: null
  };

  const containerFetch =
    overrides.container ??
    (async () =>
      new Response(
        JSON.stringify({
          language: 'typescript',
          files: [{ path: 'Foo.ts', content: '// ok' }],
          errors: []
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ));

  return {
    CODEGEN: { fetch: containerFetch },
    RATE_LIMITER: {
      idFromName: () => ({ toString: () => 'mock-id' }),
      get: () => ({
        fetch: async () =>
          new Response(JSON.stringify(rateLimiterBehaviour), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
      })
    } as never,
    LANG_CACHE: {
      get: async () => null,
      put: async () => void 0
    } as never,
    TURNSTILE_SECRET: TURNSTILE_DUMMY_SECRET,
    TURNSTILE_SITE_KEY: TURNSTILE_DUMMY_SITE_KEY,
    SESSION_SIGNING_KEY: SIGNING_KEY,
    ...overrides
  } as WorkerEnv;
}

function makeGenRequest(
  headers: HeadersInit = {},
  body = { language: 'typescript', files: [] as unknown[] }
): Request {
  return new Request('https://www.daikonic.dev/rune-studio/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': '203.0.113.5',
      ...headers
    },
    body: JSON.stringify(body)
  });
}

describe('POST /api/generate — orchestration', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function mockTurnstileOk() {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, hostname: 'www.daikonic.dev', action: 'export-code' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
  }

  function mockTurnstileFail() {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );
  }

  it('returns 401 turnstile_required when neither session cookie nor Turnstile token provided', async () => {
    const res = await handleRequest(makeGenRequest(), makeEnv());
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('turnstile_required');
  });

  it('accepts a fresh Turnstile token, issues Set-Cookie, generates, returns 200', async () => {
    mockTurnstileOk();
    const req = makeGenRequest({ 'X-Turnstile-Token': 'fresh-token-abc' });
    const res = await handleRequest(req, makeEnv());

    expect(res.status).toBe(200);
    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toContain('hcsession=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Path=/rune-studio/api');

    const body = (await res.json()) as { language: string };
    expect(body.language).toBe('typescript');
  });

  it('returns 401 when Turnstile rejects the token', async () => {
    mockTurnstileFail();
    const req = makeGenRequest({ 'X-Turnstile-Token': 'stale-token' });
    const res = await handleRequest(req, makeEnv());
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('turnstile_required');
  });

  it('returns 429 with Retry-After when the DO rejects', async () => {
    mockTurnstileOk();
    const req = makeGenRequest({ 'X-Turnstile-Token': 'fresh-token' });
    const res = await handleRequest(
      req,
      makeEnv({
        rateLimiter: {
          allowed: false,
          remaining_hour: 0,
          remaining_day: 37,
          retry_after_s: 2400,
          scope_tripped: 'hour'
        }
      })
    );
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('2400');
    const body = (await res.json()) as {
      error: string;
      scope: string;
      retry_after_s: number;
    };
    expect(body.error).toBe('rate_limited');
    expect(body.scope).toBe('hour');
    expect(body.retry_after_s).toBe(2400);
  });

  it('returns 502 upstream_failure when the container throws', async () => {
    mockTurnstileOk();
    const res = await handleRequest(
      makeGenRequest({ 'X-Turnstile-Token': 'fresh-token' }),
      makeEnv({
        container: async () => {
          throw new Error('container unreachable');
        }
      })
    );
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('upstream_failure');
  });

  it('propagates 422 from the container (parse errors) unchanged', async () => {
    mockTurnstileOk();
    const res = await handleRequest(
      makeGenRequest({ 'X-Turnstile-Token': 'fresh-token' }),
      makeEnv({
        container: async () =>
          new Response(
            JSON.stringify({
              language: 'typescript',
              files: [],
              errors: [{ sourceFile: 'x.rosetta', construct: 't', message: 'syntax' }]
            }),
            { status: 422, headers: { 'Content-Type': 'application/json' } }
          )
      })
    );
    expect(res.status).toBe(422);
  });

  it('skips Turnstile when a valid session cookie is present', async () => {
    // Build a cookie by minting a real JWT with our helpers.
    const { signSessionJwt, computeIpHash, buildSessionCookie, todayAsSalt } =
      await import('../src/session.js');
    const ipHash = await computeIpHash('203.0.113.5', todayAsSalt());
    const jwt = await signSessionJwt({
      key: SIGNING_KEY,
      ipHash,
      action: 'export-code'
    });
    const cookie = buildSessionCookie(jwt).split(';')[0]!; // just hcsession=<jwt>

    const req = makeGenRequest({ Cookie: cookie });
    const res = await handleRequest(req, makeEnv());

    expect(res.status).toBe(200);
    // No new Set-Cookie on a re-use (cookie still valid).
    expect(res.headers.get('Set-Cookie')).toBeFalsy();
    // Turnstile siteverify MUST NOT have been called.
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('challenges.cloudflare.com'),
      expect.anything()
    );
  });

  it('re-challenges when the session cookie is expired', async () => {
    const { signSessionJwt, computeIpHash, buildSessionCookie, todayAsSalt } =
      await import('../src/session.js');
    const ipHash = await computeIpHash('203.0.113.5', todayAsSalt());
    // Issue a JWT that expires before the request arrives.
    const jwt = await signSessionJwt({
      key: SIGNING_KEY,
      ipHash,
      action: 'export-code',
      nowMs: Date.now() - 4_000_000 // >1h ago
    });
    const cookie = buildSessionCookie(jwt).split(';')[0]!;

    const req = makeGenRequest({ Cookie: cookie });
    const res = await handleRequest(req, makeEnv());

    expect(res.status).toBe(401);
  });

  it('returns 400 on malformed JSON body (after passing Turnstile)', async () => {
    mockTurnstileOk();
    const req = new Request('https://www.daikonic.dev/rune-studio/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cf-connecting-ip': '203.0.113.5',
        'X-Turnstile-Token': 'fresh-token'
      },
      body: '{garbage'
    });
    const res = await handleRequest(req, makeEnv());
    expect(res.status).toBe(400);
  });
});
