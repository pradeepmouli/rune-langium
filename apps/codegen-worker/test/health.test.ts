// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Health endpoint tests (T024).
 *
 * Contract (contracts/http-health.md):
 *  - GET /api/generate/health returns {status, cold_start_likely, languages}
 *  - On container reachable: status=ok, cold_start_likely reflects timing
 *  - On slow container (>3s): fall back to KV-cached languages with
 *    cold_start_likely=true; status still ok if cache present
 *  - Worker MUST cache successful responses in LANG_CACHE with 1-hour TTL
 *  - On container fully unreachable: 503 unavailable
 */

import { describe, it, expect, vi } from 'vitest';
import { handleRequest } from '../src/index.js';
import type { WorkerEnv } from '../src/types.js';

interface KvStore {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
}

function makeKv(initial?: Record<string, unknown>): KvStore {
  const store = new Map<string, unknown>(initial ? Object.entries(initial) : []);
  return {
    get: vi.fn(async (key: string, type?: string) => {
      const v = store.get(key);
      if (v === undefined) return null;
      return type === 'json' ? v : JSON.stringify(v);
    }),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, JSON.parse(value));
    })
  };
}

function makeEnv(
  overrides: Partial<WorkerEnv> & {
    container?: (req: Request) => Promise<Response>;
    langCache?: KvStore;
  } = {}
): WorkerEnv {
  const cache = overrides.langCache ?? makeKv();
  return {
    CODEGEN: { fetch: overrides.container ?? (async () => new Response('{}')) },
    RATE_LIMITER: {
      idFromName: () => ({ toString: () => 'id' }),
      get: () => ({
        fetch: async () =>
          new Response(
            JSON.stringify({
              allowed: true,
              remaining_hour: 59,
              remaining_day: 0,
              retry_after_s: 0,
              scope_tripped: null
            })
          )
      })
    } as never,
    LANG_CACHE: cache as never,
    TURNSTILE_SECRET: 'x',
    TURNSTILE_SITE_KEY: 'x',
    SESSION_SIGNING_KEY: 'x'
  } as WorkerEnv;
}

function healthReq() {
  return new Request('https://www.daikonic.dev/rune-studio/api/generate/health', {
    method: 'GET',
    headers: { 'cf-connecting-ip': '203.0.113.5' }
  });
}

describe('GET /api/generate/health (T024)', () => {
  it('returns ok + languages from the container on a warm hit, caches them in KV', async () => {
    const kv = makeKv();
    const res = await handleRequest(
      healthReq(),
      makeEnv({
        container: async () =>
          new Response(
            JSON.stringify({ status: 'ok', cold_start_likely: false, languages: ['java', 'ts'] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          ),
        langCache: kv
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      cold_start_likely: boolean;
      languages: string[];
    };
    expect(body.status).toBe('ok');
    expect(body.languages).toEqual(['java', 'ts']);
    // Cache write was attempted with a 1-hour TTL.
    expect(kv.put).toHaveBeenCalled();
    const putCall = kv.put.mock.calls[0]!;
    expect(putCall[0]).toBe('languages');
    const opts = putCall[2] as { expirationTtl?: number } | undefined;
    expect(opts?.expirationTtl).toBe(3600);
  });

  it('returns cold_start_likely=true when the container takes > threshold to respond', async () => {
    vi.useFakeTimers();
    const res = await handleRequest(
      healthReq(),
      makeEnv({
        container: (_req) =>
          new Promise((resolve) => {
            // Advance fake time past the cold-start threshold; then resolve.
            setTimeout(
              () =>
                resolve(
                  new Response(JSON.stringify({ status: 'ok', languages: ['java'] }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                  })
                ),
              3500
            );
            vi.advanceTimersByTime(3600);
          })
      })
    );
    vi.useRealTimers();
    const body = (await res.json()) as { cold_start_likely: boolean };
    expect(body.cold_start_likely).toBe(true);
  });

  it('falls back to cached languages when the container fails, still returns 200', async () => {
    const kv = makeKv({ languages: ['java', 'typescript', 'zod'] });
    const res = await handleRequest(
      healthReq(),
      makeEnv({
        container: async () => {
          throw new Error('container unreachable');
        },
        langCache: kv
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      cold_start_likely: boolean;
      languages: string[];
    };
    expect(body.status).toBe('ok');
    expect(body.cold_start_likely).toBe(true);
    expect(body.languages).toEqual(['java', 'typescript', 'zod']);
  });

  it('returns 503 when the container is unreachable AND the cache is empty', async () => {
    const res = await handleRequest(
      healthReq(),
      makeEnv({
        container: async () => {
          throw new Error('container unreachable');
        }
      })
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('unavailable');
  });

  it('returns 503 when the container returns a non-200 AND no cache', async () => {
    const res = await handleRequest(
      healthReq(),
      makeEnv({
        container: async () => new Response('{}', { status: 500 })
      })
    );
    expect(res.status).toBe(503);
  });
});
