// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Rate-limit Durable Object unit tests (T013 → drives T012).
 *
 * Per contracts/rate-limit.md:
 *  - POST /check       → hour bucket cap 10, day bucket cap 100
 *  - POST /check-health → independent bucket; cap 60 per hour
 *  - Counters increment atomically on allowed=true
 *  - retry_after_s = seconds until the tripped bucket boundary
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../src/rate-limit.js';
import type { DurableObjectState, DurableObjectStorage } from '@cloudflare/workers-types';

/**
 * Minimal in-memory DurableObjectStorage mock. Covers the surface
 * RateLimiter actually uses: get/put/transaction for counter ops.
 */
function createMockStorage(): DurableObjectStorage {
  const store = new Map<string, unknown>();
  const storage: Partial<DurableObjectStorage> = {
    async get<T = unknown>(key: string | string[]): Promise<T | Map<string, T>> {
      if (Array.isArray(key)) {
        const m = new Map<string, T>();
        for (const k of key) {
          if (store.has(k)) m.set(k, store.get(k) as T);
        }
        return m;
      }
      return store.get(key) as T;
    },
    async put<T>(keyOrEntries: string | Record<string, T>, value?: T): Promise<void> {
      if (typeof keyOrEntries === 'string') {
        store.set(keyOrEntries, value);
      } else {
        for (const [k, v] of Object.entries(keyOrEntries)) store.set(k, v);
      }
    },
    async delete(key: string | string[]): Promise<boolean | number> {
      if (Array.isArray(key)) {
        let n = 0;
        for (const k of key) if (store.delete(k)) n++;
        return n;
      }
      return store.delete(key);
    },
    async list<T = unknown>(): Promise<Map<string, T>> {
      return new Map(store as Map<string, T>);
    }
  };
  return storage as DurableObjectStorage;
}

function createMockState(): DurableObjectState {
  const storage = createMockStorage();
  return {
    storage,
    id: { toString: () => 'mock-id', name: 'mock-id', equals: () => false } as never,
    waitUntil: () => void 0,
    blockConcurrencyWhile: async <T>(fn: () => Promise<T>) => await fn()
  } as unknown as DurableObjectState;
}

async function check(
  limiter: RateLimiter,
  path: '/check' | '/check-health' = '/check'
): Promise<{
  allowed: boolean;
  remaining_hour: number;
  remaining_day: number;
  retry_after_s: number;
  scope_tripped: 'hour' | 'day' | null;
}> {
  const res = await limiter.fetch(new Request(`http://do${path}`, { method: 'POST' }));
  return (await res.json()) as never;
}

describe('RateLimiter (generation bucket)', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(createMockState());
  });

  it('allows the first request with full remaining budget', async () => {
    const res = await check(limiter);
    expect(res.allowed).toBe(true);
    expect(res.remaining_hour).toBe(9); // 10 cap, 1 consumed
    expect(res.remaining_day).toBe(99);
    expect(res.scope_tripped).toBe(null);
    expect(res.retry_after_s).toBe(0);
  });

  it('rejects the 11th request in an hour with scope=hour', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await check(limiter);
      expect(r.allowed).toBe(true);
    }
    const denied = await check(limiter);
    expect(denied.allowed).toBe(false);
    expect(denied.scope_tripped).toBe('hour');
    expect(denied.remaining_hour).toBe(0);
    expect(denied.retry_after_s).toBeGreaterThan(0);
    expect(denied.retry_after_s).toBeLessThanOrEqual(3600);
  });

  it('does NOT increment counters on a denied request', async () => {
    for (let i = 0; i < 10; i++) await check(limiter);
    const denied1 = await check(limiter);
    const denied2 = await check(limiter);
    expect(denied1.allowed).toBe(false);
    expect(denied2.allowed).toBe(false);
    // remaining_day stays at 90 (10 allowed, 0 denied) not 88.
    expect(denied2.remaining_day).toBe(90);
  });

  it('returns 405 for non-POST methods', async () => {
    const res = await limiter.fetch(new Request('http://do/check', { method: 'GET' }));
    expect(res.status).toBe(405);
  });

  it('returns 404 for unknown paths', async () => {
    const res = await limiter.fetch(new Request('http://do/nope', { method: 'POST' }));
    expect(res.status).toBe(404);
  });
});

describe('RateLimiter (health bucket, independent)', () => {
  it('has its own budget, independent from /check', async () => {
    const limiter = new RateLimiter(createMockState());
    // Burn the generation budget.
    for (let i = 0; i < 10; i++) await check(limiter, '/check');
    const genDenied = await check(limiter, '/check');
    expect(genDenied.allowed).toBe(false);

    // /check-health should still work — different bucket.
    const health = await check(limiter, '/check-health');
    expect(health.allowed).toBe(true);
  });

  it('allows up to 60 health checks per hour', async () => {
    const limiter = new RateLimiter(createMockState());
    for (let i = 0; i < 60; i++) {
      const r = await check(limiter, '/check-health');
      expect(r.allowed).toBe(true);
    }
    const denied = await check(limiter, '/check-health');
    expect(denied.allowed).toBe(false);
    expect(denied.scope_tripped).toBe('hour');
  });
});
