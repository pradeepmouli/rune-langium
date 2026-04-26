// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * apps/lsp-worker session-token mint contract tests (T038).
 *
 * Per `specs/014-studio-prod-ready/contracts/lsp-worker.md`
 * "POST /api/lsp/session":
 *
 *  - 200 with `{ token, expiresAt }` for a valid same-origin POST + valid `workspaceId` (ULID)
 *  - 400 schema_violation on bad body
 *  - 403 origin_not_allowed for cross-origin
 *  - 429 rate_limited after >30 mints/min/IP
 *
 * `workspaceId` MUST be a 26-char Crockford ULID per the closed schema in
 * the contract: `/^[0-9A-HJKMNP-TV-Z]{26}$/`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../src/index.js';
import type { Env } from '../src/index.js';
import { _resetSessionRateLimitForTesting, verifySessionToken } from '../src/auth.js';

const SIGNING_KEY = 'test-signing-key-do-not-use-in-prod-test-only';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    LSP_SESSION: {
      idFromName: (name: string) => ({ name, toString: () => name }),
      get: () => ({ fetch: async () => new Response(null, { status: 200 }) })
    } as unknown as Env['LSP_SESSION'],
    ALLOWED_ORIGIN: 'https://www.daikonic.dev',
    SESSION_SIGNING_KEY: SIGNING_KEY,
    ...overrides
  } as Env;
}

function makeSessionReq(
  body: unknown,
  origin: string | null = 'https://www.daikonic.dev',
  ip = '203.0.113.7'
): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'cf-connecting-ip': ip
  };
  if (origin) headers['Origin'] = origin;
  return new Request('https://www.daikonic.dev/rune-studio/api/lsp/session', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

const VALID_ULID = '01J7M8AAAAAAAAAAAAAAAAAAAA';

describe('apps/lsp-worker session-token mint contract (T038)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T12:00:00Z'));
    _resetSessionRateLimitForTesting();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('200 + verifiable token on a valid same-origin POST with valid workspaceId', async () => {
    const env = makeEnv();
    const res = await worker.fetch(makeSessionReq({ workspaceId: VALID_ULID }), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; expiresAt: number };
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(0);
    expect(typeof body.expiresAt).toBe('number');
    expect(body.expiresAt).toBeGreaterThan(Date.now());

    // Round-trip the token through the verifier to assert the worker
    // signs with the configured key and the contract's claim shape.
    const verified = await verifySessionToken(SIGNING_KEY, body.token);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.token.workspaceId).toBe(VALID_ULID);
      expect(verified.token.origin).toBe('https://www.daikonic.dev');
    }
  });

  it('400 schema_violation on bad body — missing workspaceId', async () => {
    const env = makeEnv();
    const res = await worker.fetch(makeSessionReq({}), env);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('schema_violation');
  });

  it('400 schema_violation on bad body — non-ULID workspaceId', async () => {
    const env = makeEnv();
    const res = await worker.fetch(makeSessionReq({ workspaceId: 'not-a-ulid' }), env);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('schema_violation');
  });

  it('400 schema_violation on bad body — strict-schema rejects extra fields', async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      makeSessionReq({ workspaceId: VALID_ULID, extra: 'ignored' }),
      env
    );
    expect(res.status).toBe(400);
  });

  it('403 origin_not_allowed for cross-origin', async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      makeSessionReq({ workspaceId: VALID_ULID }, 'https://evil.example.com'),
      env
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('origin_not_allowed');
  });

  it('429 rate_limited after >30 mints/min/IP from the same address', async () => {
    const env = makeEnv();
    let lastStatus = 0;
    for (let i = 0; i < 31; i++) {
      const res = await worker.fetch(
        makeSessionReq({ workspaceId: VALID_ULID }, 'https://www.daikonic.dev', '198.51.100.9'),
        env
      );
      lastStatus = res.status;
      if (res.status === 429) {
        const body = (await res.json()) as { error: string; retry_after_s: number };
        expect(body.error).toBe('rate_limited');
        expect(body.retry_after_s).toBeGreaterThan(0);
        return;
      }
    }
    // If we never hit 429 in 31 calls, fail with the actual final status.
    throw new Error(`expected 429 within 31 calls, last status ${lastStatus}`);
  });

  it('GET /api/lsp/health returns ok + langium_loaded + uptime_seconds (no auth)', async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      new Request('https://www.daikonic.dev/rune-studio/api/lsp/health', {
        method: 'GET'
      }),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      version: string;
      langium_loaded: boolean;
      uptime_seconds: number;
    };
    expect(body.ok).toBe(true);
    expect(typeof body.version).toBe('string');
    expect(typeof body.langium_loaded).toBe('boolean');
    expect(typeof body.uptime_seconds).toBe('number');
    expect(body.uptime_seconds).toBeGreaterThanOrEqual(0);
  });
});
