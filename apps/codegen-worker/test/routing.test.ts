// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Worker routing coverage.
 *
 * These tests verify the router dispatches to the correct handler for each
 * declared route + method combination and preserves the expected top-level
 * HTTP behavior. The Worker now contains the real Turnstile, rate-limit, and
 * container orchestration logic; deeper behavior is covered by more focused
 * tests (proxy, rate-limit, session, retry), while this file stays centered
 * on routing semantics.
 */

import { describe, it, expect } from 'vitest';
import { handleRequest } from '../src/index.js';
import type { WorkerEnv } from '../src/types.js';

function fakeEnv(): WorkerEnv {
  return {
    CODEGEN: { fetch: async () => new Response('stub') } as never,
    RATE_LIMITER: {} as never,
    LANG_CACHE: {} as never,
    TURNSTILE_SECRET: 'dummy',
    TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
    SESSION_SIGNING_KEY: 'dummy-signing-key-0123456789abcdef'
  };
}

describe('Worker routing', () => {
  it('routes GET /api/generate/health to the health handler', async () => {
    const req = new Request('https://www.daikonic.dev/rune-studio/api/generate/health');
    const res = await handleRequest(req, fakeEnv());
    // Health handler returns JSON, status may be 200 or 503 depending on stub.
    expect(res.headers.get('content-type')).toContain('application/json');
    expect([200, 503]).toContain(res.status);
  });

  it('routes POST /api/generate to the generate handler', async () => {
    const req = new Request('https://www.daikonic.dev/rune-studio/api/generate', {
      method: 'POST',
      body: JSON.stringify({ language: 'typescript', files: [] }),
      headers: { 'Content-Type': 'application/json' }
    });
    const res = await handleRequest(req, fakeEnv());
    // Stubbed handler will return SOMETHING (401 for missing Turnstile, or stub JSON).
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('returns 405 for wrong method on known path', async () => {
    const req = new Request('https://www.daikonic.dev/rune-studio/api/generate', {
      method: 'DELETE'
    });
    const res = await handleRequest(req, fakeEnv());
    expect(res.status).toBe(405);
  });

  it('returns 404 for unknown paths', async () => {
    const req = new Request('https://www.daikonic.dev/rune-studio/api/unknown');
    const res = await handleRequest(req, fakeEnv());
    expect(res.status).toBe(404);
  });

  it('returns 204 No Content for OPTIONS (CORS preflight)', async () => {
    const req = new Request('https://www.daikonic.dev/rune-studio/api/generate', {
      method: 'OPTIONS'
    });
    const res = await handleRequest(req, fakeEnv());
    expect(res.status).toBe(204);
  });
});
