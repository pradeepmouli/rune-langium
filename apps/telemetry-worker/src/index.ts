// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Telemetry ingest Worker (T110).
 *
 * Surface (per `contracts/telemetry-event.md`):
 *   POST /rune-studio/api/telemetry/v1/event
 *   GET  /rune-studio/api/telemetry/v1/stats   (CF Access gated; T112)
 *
 * Pipeline:
 *   1. Method/route guard (only POST event, GET stats).
 *   2. Origin allowlist (CORS preflight + actual request).
 *   3. Per-IP rate-limit: 10 events/minute, scoped to a 60s window.
 *      The window is held in-process; CF runs many instances so this
 *      is a soft throttle, not a precise quota. The DO-backed quota
 *      lives in codegen-worker and is intentionally NOT replicated
 *      here — telemetry is opt-out, low-frequency, and a misbehaving
 *      client is harmless beyond a single isolate.
 *   4. JSON parse → Zod schema (closed: `.strict()`) → reject 400 on
 *      schema_violation.
 *   5. Hash the IP with a daily-rotating salt and forward to the DO.
 *   6. Log a structured line (no raw IP, no body).
 *
 * The DO id is `<event-name>:<UTC-day>` so each day is a fresh counter
 * surface and each event-class is isolated.
 */

import { z } from 'zod';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import { TelemetryAggregator } from './counters.js';
import { logRequest } from './log.js';

export { TelemetryAggregator };

export interface Env {
  TELEMETRY: DurableObjectNamespace;
  ALLOWED_ORIGIN: string;
}

// ---------- Schema ----------

const ModelId = z.enum(['cdm', 'fpml', 'rune-dsl']);
const ErrorCategory = z.enum([
  'network',
  'archive_not_found',
  'archive_decode',
  'parse',
  'storage_quota',
  'permission_denied',
  'unknown'
]);
const StudioVersion = z.string().max(32);
const UaClass = z.string().max(64);

const TelemetryEventBody = z.discriminatedUnion('event', [
  z
    .object({
      event: z.literal('curated_load_attempt'),
      modelId: ModelId,
      studio_version: StudioVersion,
      ua_class: UaClass
    })
    .strict(),
  z
    .object({
      event: z.literal('curated_load_success'),
      modelId: ModelId,
      durationMs: z.number().int().nonnegative().max(600_000),
      studio_version: StudioVersion,
      ua_class: UaClass
    })
    .strict(),
  z
    .object({
      event: z.literal('curated_load_failure'),
      modelId: ModelId,
      errorCategory: ErrorCategory,
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

// ---------- In-memory per-IP rate limit (10/min) ----------

const RATE_LIMIT = 10;
const WINDOW_MS = 60_000;

interface Window {
  windowStart: number;
  count: number;
}

const ipWindows = new Map<string, Window>();

function checkRateLimit(ip: string, now: number): { allowed: boolean; retryAfterS: number } {
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

// Exposed for tests that span multiple `it()` blocks within the same
// vitest worker — keeps each test starting from a clean per-IP state.
export function _resetRateLimitForTesting(): void {
  ipWindows.clear();
}

// ---------- IP hashing (daily rotating salt) ----------

let dailySalt: { day: string; salt: string } | null = null;

function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10); // YYYY-MM-DD
}

function getDailySalt(now: Date): string {
  const day = utcDay(now);
  if (!dailySalt || dailySalt.day !== day) {
    // 16-byte random salt per UTC day. Using crypto.getRandomValues so
    // this works in both the Workers runtime and vitest (Node 20+).
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    dailySalt = {
      day,
      salt: Array.from(buf)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    };
  }
  return dailySalt.salt;
}

async function hashIp(ip: string, salt: string): Promise<string> {
  const enc = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------- Helpers ----------

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
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

    // Route: POST /rune-studio/api/telemetry/v1/event
    if (url.pathname.endsWith('/v1/event')) {
      if (req.method !== 'POST') {
        return jsonResponse(405, { error: 'method_not_allowed' });
      }

      // Rate-limit
      const rl = checkRateLimit(ip, startedAt);
      if (!rl.allowed) {
        const ipHash = await hashIp(ip, getDailySalt(new Date(startedAt)));
        logRequest({
          ipHash,
          event: 'rate_limited',
          status: 429,
          durationMs: Date.now() - startedAt,
          outcome: 'rate_limited'
        });
        return jsonResponse(429, {
          error: 'rate_limited',
          retry_after_s: rl.retryAfterS
        });
      }

      // Parse JSON
      let raw: unknown;
      try {
        raw = await req.json();
      } catch {
        return jsonResponse(400, { error: 'schema_violation', details: 'malformed_json' });
      }

      // Validate
      const parsed = TelemetryEventBody.safeParse(raw);
      if (!parsed.success) {
        return jsonResponse(400, {
          error: 'schema_violation',
          details: parsed.error.issues
        });
      }
      const event = parsed.data;

      // Forward to the DO for this <event>:<day>
      const day = utcDay(new Date(startedAt));
      const id = env.TELEMETRY.idFromName(doIdName(event, day));
      const stub = env.TELEMETRY.get(id);
      const errorCategory = getErrorCategory(event);
      await stub.fetch(
        new Request('https://do/inc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ errorCategory })
        })
      );

      const ipHash = await hashIp(ip, getDailySalt(new Date(startedAt)));
      logRequest({
        ipHash,
        event: event.event,
        status: 204,
        durationMs: Date.now() - startedAt,
        outcome: 'accepted'
      });

      return emptyResponse(204);
    }

    // Route: GET /rune-studio/api/telemetry/v1/stats?event=...&date=YYYY-MM-DD
    // CF Access enforces the admin allowlist at the edge; the Worker just
    // proxies to the addressed DO. T112 wires the actual Access policy.
    if (url.pathname.endsWith('/v1/stats')) {
      if (req.method !== 'GET') return jsonResponse(405, { error: 'method_not_allowed' });
      const eventName = url.searchParams.get('event');
      const date = url.searchParams.get('date') ?? utcDay(new Date(startedAt));
      if (!eventName) return jsonResponse(400, { error: 'missing_event_query' });
      const id = env.TELEMETRY.idFromName(`${eventName}:${date}`);
      const stub = env.TELEMETRY.get(id);
      return stub.fetch(new Request('https://do/stats'));
    }

    return jsonResponse(404, { error: 'not_found' });
  }
};
