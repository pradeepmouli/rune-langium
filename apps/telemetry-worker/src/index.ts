// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Telemetry ingest Worker.
 *
 * Surface (per `contracts/telemetry-event.md`):
 *   POST    /rune-studio/api/telemetry/v1/event
 *   OPTIONS /rune-studio/api/telemetry/v1/event   (CORS preflight)
 *   GET     /rune-studio/api/telemetry/v1/stats   (CF Access enforces admin)
 *
 * Pipeline:
 *   1. Method/route guard.
 *   2. Origin allowlist + CORS preflight against env.ALLOWED_ORIGIN.
 *   3. Per-IP rate-limit: 10 events/minute, scoped to a 60s window. Held
 *      in-process per isolate. CF runs many isolates so this is a soft
 *      throttle, not a precise quota — that's fine for opt-out telemetry.
 *      The map is bounded: stale windows are evicted on every check.
 *   4. JSON parse → Zod schema (.strict()) → reject 400 on schema violation.
 *   5. Hash the IP with a daily salt fetched from a Durable Object (single
 *      salt across all isolates per UTC day, so analytics dedupe works).
 *   6. Forward to the per-event/per-day counter DO; check the response.
 *   7. Log a structured line (no raw IP, no body).
 */

import { z } from 'zod';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import { CuratedModelIdSchema, ErrorCategorySchema } from '@rune-langium/curated-schema';
import { TelemetryAggregator } from './counters.js';
import { logRequest } from './log.js';

export { TelemetryAggregator };

export interface Env {
  TELEMETRY: DurableObjectNamespace;
  /**
   * Comma-separated allowlist of origins permitted to POST events.
   * Wildcard `*` means any origin (only sensible in local dev).
   */
  ALLOWED_ORIGIN: string;
}

// ---------- Schema ----------

// Use the canonical enums from @rune-langium/curated-schema rather than
// redeclaring — drift here would silently 400 legitimate Studio events
// (e.g. `errorCategory: 'cancelled'`).
const StudioVersion = z.string().max(32);
const UaClass = z.string().max(64);

const TelemetryEventBody = z.discriminatedUnion('event', [
  z
    .object({
      event: z.literal('curated_load_attempt'),
      modelId: CuratedModelIdSchema,
      studio_version: StudioVersion,
      ua_class: UaClass
    })
    .strict(),
  z
    .object({
      event: z.literal('curated_load_success'),
      modelId: CuratedModelIdSchema,
      durationMs: z.number().int().nonnegative().max(600_000),
      studio_version: StudioVersion,
      ua_class: UaClass
    })
    .strict(),
  z
    .object({
      event: z.literal('curated_load_failure'),
      modelId: CuratedModelIdSchema,
      errorCategory: ErrorCategorySchema,
      studio_version: StudioVersion,
      ua_class: UaClass
    })
    .strict(),
  z
    .object({
      event: z.enum([
        'workspace_open_success',
        'workspace_open_failure',
        'workspace_restore_success',
        'workspace_restore_failure'
      ]),
      studio_version: StudioVersion,
      ua_class: UaClass
    })
    .strict()
]);

type TelemetryEvent = z.infer<typeof TelemetryEventBody>;

// ---------- In-memory per-IP rate limit (10/min, with eviction) ----------

const RATE_LIMIT = 10;
const WINDOW_MS = 60_000;
const MAX_TRACKED_IPS = 50_000;

interface RateWindow {
  windowStart: number;
  count: number;
}

// Module-level so it survives within an isolate; CF runs many isolates so
// this is intentionally a soft per-isolate throttle, not a global quota.
const ipWindows = new Map<string, RateWindow>();

function checkRateLimit(ip: string, now: number): { allowed: boolean; retryAfterS: number } {
  evictExpired(now);
  const w = ipWindows.get(ip);
  if (!w || now - w.windowStart >= WINDOW_MS) {
    ipWindows.set(ip, { windowStart: now, count: 1 });
    return { allowed: true, retryAfterS: 0 };
  }
  if (w.count >= RATE_LIMIT) {
    const retryAfterS = Math.max(1, Math.ceil((w.windowStart + WINDOW_MS - now) / 1000));
    return { allowed: false, retryAfterS };
  }
  w.count += 1;
  return { allowed: true, retryAfterS: 0 };
}

function evictExpired(now: number): void {
  if (ipWindows.size < MAX_TRACKED_IPS) {
    // Cheap path: only sweep when we get close to the cap. The Map is
    // bounded by traffic in the current 60s window in practice.
    if (ipWindows.size < 1024) return;
  }
  for (const [ip, w] of ipWindows) {
    if (now - w.windowStart >= WINDOW_MS) ipWindows.delete(ip);
  }
}

export function _resetRateLimitForTesting(): void {
  ipWindows.clear();
}

// ---------- IP hashing (daily-rotating salt held in a DO) ----------
//
// The salt rotates per UTC day and is shared across isolates by storing
// it in the same TelemetryAggregator DO that holds the counters, under
// id-name `salt:<UTC-day>`. Each isolate caches the salt locally for
// the day to avoid round-tripping the DO on every request.

let cachedSalt: { day: string; salt: string } | null = null;

function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

async function getDailySalt(env: Env, now: Date): Promise<string> {
  const day = utcDay(now);
  if (cachedSalt && cachedSalt.day === day) return cachedSalt.salt;

  const id = env.TELEMETRY.idFromName(`salt:${day}`);
  const stub = env.TELEMETRY.get(id);
  const res = await stub.fetch(new Request('https://do/salt'));
  if (!res.ok) {
    // DO unreachable — fall back to a per-isolate salt for this request.
    // The privacy invariant (no raw IP logged) still holds; only cross-
    // isolate dedup is lost for this one request.
    const fallback = randomSaltHex();
    return fallback;
  }
  const body = (await res.json()) as { salt: string };
  cachedSalt = { day, salt: body.salt };
  return body.salt;
}

function randomSaltHex(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashIp(ip: string, salt: string): Promise<string> {
  const enc = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function _resetSaltCacheForTesting(): void {
  cachedSalt = null;
}

// ---------- CORS ----------

function isOriginAllowed(origin: string | null, allowed: string): boolean {
  if (!origin) return false;
  if (allowed === '*') return true;
  return allowed
    .split(',')
    .map((s) => s.trim())
    .includes(origin);
}

function corsHeaders(origin: string | null, allowed: string): Record<string, string> {
  if (!origin || !isOriginAllowed(origin, allowed)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600'
  };
}

// ---------- Helpers ----------

function jsonResponse(
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });
}

function emptyResponse(status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(null, { status, headers: extraHeaders });
}

function getErrorCategory(event: TelemetryEvent): string | null {
  if (event.event === 'curated_load_failure') return event.errorCategory;
  return null;
}

function doIdName(event: TelemetryEvent, day: string): string {
  return `${event.event}:${day}`;
}

// ---------- Worker entry ----------

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const startedAt = Date.now();
    const ip = req.headers.get('cf-connecting-ip') ?? '0.0.0.0';
    const origin = req.headers.get('Origin');

    // CORS preflight
    if (req.method === 'OPTIONS' && url.pathname.endsWith('/v1/event')) {
      const headers = corsHeaders(origin, env.ALLOWED_ORIGIN);
      // Empty headers => origin not allowed; still return 204 so the
      // browser logs a clear CORS rejection rather than a network error.
      return emptyResponse(204, headers);
    }

    // POST /v1/event
    if (url.pathname.endsWith('/v1/event')) {
      if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' });

      const cors = corsHeaders(origin, env.ALLOWED_ORIGIN);
      // For cross-origin requests from a non-allowlisted origin, fail
      // fast — the browser will block the response read regardless, but
      // returning 403 makes the rejection explicit in server logs.
      if (origin && !isOriginAllowed(origin, env.ALLOWED_ORIGIN)) {
        return jsonResponse(403, { error: 'origin_not_allowed' });
      }

      // Rate-limit
      const rl = checkRateLimit(ip, startedAt);
      if (!rl.allowed) {
        const salt = await getDailySalt(env, new Date(startedAt));
        const ipHash = await hashIp(ip, salt);
        logRequest({
          ipHash,
          event: 'rate_limited',
          status: 429,
          durationMs: Date.now() - startedAt,
          outcome: 'rate_limited'
        });
        return jsonResponse(429, { error: 'rate_limited', retry_after_s: rl.retryAfterS }, cors);
      }

      // Parse + validate
      let raw: unknown;
      try {
        raw = await req.json();
      } catch {
        return jsonResponse(400, { error: 'schema_violation', details: 'malformed_json' }, cors);
      }
      const parsed = TelemetryEventBody.safeParse(raw);
      if (!parsed.success) {
        return jsonResponse(400, { error: 'schema_violation', details: parsed.error.issues }, cors);
      }
      const event = parsed.data;

      // Forward to the per-event/per-day counter DO. Failures here MUST
      // NOT silently 204 — SC-009 is computed off these counters; a DO
      // outage masquerading as success would make the metric useless.
      const day = utcDay(new Date(startedAt));
      const counterId = env.TELEMETRY.idFromName(doIdName(event, day));
      const stub = env.TELEMETRY.get(counterId);
      const errorCategory = getErrorCategory(event);
      let stubRes: Response;
      try {
        stubRes = await stub.fetch(
          new Request('https://do/inc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ errorCategory })
          })
        );
      } catch (err) {
        const salt = await getDailySalt(env, new Date(startedAt));
        const ipHash = await hashIp(ip, salt);
        logRequest({
          ipHash,
          event: event.event,
          status: 500,
          durationMs: Date.now() - startedAt,
          outcome: 'do_failure',
          err: errMessage(err)
        });
        return jsonResponse(500, { error: 'aggregator_failure' }, cors);
      }
      if (!stubRes.ok) {
        const salt = await getDailySalt(env, new Date(startedAt));
        const ipHash = await hashIp(ip, salt);
        logRequest({
          ipHash,
          event: event.event,
          status: stubRes.status,
          durationMs: Date.now() - startedAt,
          outcome: 'do_failure'
        });
        return jsonResponse(500, { error: 'aggregator_failure' }, cors);
      }

      const salt = await getDailySalt(env, new Date(startedAt));
      const ipHash = await hashIp(ip, salt);
      logRequest({
        ipHash,
        event: event.event,
        status: 204,
        durationMs: Date.now() - startedAt,
        outcome: 'accepted'
      });
      return emptyResponse(204, cors);
    }

    // GET /v1/stats — CF Access enforces the admin allowlist at the route.
    // The Worker just proxies. Errors here surface to the admin caller as
    // 500 with a structured body so dashboards can branch on them.
    if (url.pathname.endsWith('/v1/stats')) {
      if (req.method !== 'GET') return jsonResponse(405, { error: 'method_not_allowed' });
      const eventName = url.searchParams.get('event');
      const date = url.searchParams.get('date') ?? utcDay(new Date(startedAt));
      if (!eventName) return jsonResponse(400, { error: 'missing_event_query' });
      try {
        const id = env.TELEMETRY.idFromName(`${eventName}:${date}`);
        const stub = env.TELEMETRY.get(id);
        const res = await stub.fetch(new Request('https://do/stats'));
        if (!res.ok) {
          return jsonResponse(500, {
            error: 'aggregator_failure',
            event: eventName,
            date,
            do_status: res.status
          });
        }
        return res;
      } catch (err) {
        return jsonResponse(500, {
          error: 'aggregator_failure',
          event: eventName,
          date,
          reason: errMessage(err)
        });
      }
    }

    return jsonResponse(404, { error: 'not_found' });
  }
};

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
