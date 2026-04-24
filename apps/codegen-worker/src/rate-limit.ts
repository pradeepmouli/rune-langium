// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * RateLimiter Durable Object (T012).
 *
 * Per contracts/rate-limit.md:
 *  - One DO instance per IP (keyed on cf-connecting-ip by the Worker).
 *  - POST /check        → generate bucket, cap 10/hr and 100/day.
 *  - POST /check-health → health bucket, cap 60/hr (separate storage keys).
 *  - Atomic counter writes; denied requests do NOT increment.
 *  - retry_after_s = seconds until the tripped window boundary.
 *
 * The DO class is single-threaded per instance (CF guarantee), so read-modify-
 * write against its own storage is race-free without explicit locking.
 */

import type { DurableObjectState } from '@cloudflare/workers-types';

export const GENERATE_HOUR_CAP = 10;
export const GENERATE_DAY_CAP = 100;
export const HEALTH_HOUR_CAP = 60;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

type ScopeTripped = 'hour' | 'day' | null;

interface CheckResponse {
  allowed: boolean;
  remaining_hour: number;
  remaining_day: number;
  retry_after_s: number;
  scope_tripped: ScopeTripped;
}

interface BucketConfig {
  /** Storage-key prefix ("g" for generate, "h" for health). */
  prefix: string;
  hourCap: number;
  /** Day cap is optional — the health bucket only enforces an hour cap. */
  dayCap?: number;
}

const GENERATE_BUCKET: BucketConfig = {
  prefix: 'g',
  hourCap: GENERATE_HOUR_CAP,
  dayCap: GENERATE_DAY_CAP
};
const HEALTH_BUCKET: BucketConfig = { prefix: 'h', hourCap: HEALTH_HOUR_CAP };

export class RateLimiter {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.method !== 'POST') {
      return json(405, { error: 'method_not_allowed' });
    }

    if (url.pathname === '/check') {
      return json(200, await this.check(GENERATE_BUCKET, Date.now()));
    }
    if (url.pathname === '/check-health') {
      return json(200, await this.check(HEALTH_BUCKET, Date.now()));
    }
    return json(404, { error: 'not_found' });
  }

  /**
   * Exposed for direct unit testing without constructing a Request.
   * Production callers should always go through fetch().
   */
  async check(bucket: BucketConfig, nowMs = Date.now()): Promise<CheckResponse> {
    const hourBucket = Math.floor(nowMs / HOUR_MS);
    const dayBucket = Math.floor(nowMs / DAY_MS);
    const hourKey = `${bucket.prefix}:h:${hourBucket}`;
    const dayKey = `${bucket.prefix}:d:${dayBucket}`;

    const storage = this.state.storage;
    const [hourCount, dayCount] = await Promise.all([
      storage.get<number>(hourKey).then((v) => v ?? 0),
      bucket.dayCap !== undefined
        ? storage.get<number>(dayKey).then((v) => v ?? 0)
        : Promise.resolve(0)
    ]);

    const hourExceeded = hourCount >= bucket.hourCap;
    const dayExceeded = bucket.dayCap !== undefined && dayCount >= bucket.dayCap;

    if (hourExceeded || dayExceeded) {
      // Prefer the smaller retry — whichever window resets sooner.
      const hourRetry = hourExceeded ? secsUntilBoundary(nowMs, HOUR_MS) : Number.POSITIVE_INFINITY;
      const dayRetry = dayExceeded ? secsUntilBoundary(nowMs, DAY_MS) : Number.POSITIVE_INFINITY;
      const retry_after_s = Math.min(hourRetry, dayRetry);
      const scope_tripped: ScopeTripped = hourRetry <= dayRetry ? 'hour' : 'day';

      return {
        allowed: false,
        remaining_hour: Math.max(0, bucket.hourCap - hourCount),
        remaining_day: bucket.dayCap !== undefined ? Math.max(0, bucket.dayCap - dayCount) : 0,
        retry_after_s,
        scope_tripped
      };
    }

    // Allowed — increment both counters atomically.
    const updates: Record<string, number> = { [hourKey]: hourCount + 1 };
    if (bucket.dayCap !== undefined) updates[dayKey] = dayCount + 1;
    await storage.put(updates);

    return {
      allowed: true,
      remaining_hour: bucket.hourCap - (hourCount + 1),
      remaining_day: bucket.dayCap !== undefined ? bucket.dayCap - (dayCount + 1) : 0,
      retry_after_s: 0,
      scope_tripped: null
    };
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function secsUntilBoundary(nowMs: number, windowMs: number): number {
  const nextBoundaryMs = Math.ceil((nowMs + 1) / windowMs) * windowMs;
  return Math.max(1, Math.floor((nextBoundaryMs - nowMs) / 1000));
}
