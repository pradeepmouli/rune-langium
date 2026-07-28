// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * TelemetryAggregator Durable Object.
 *
 * One DO instance per `<event-name>:<UTC-day>` for counter aggregation,
 * plus one DO instance per `salt:<UTC-day>` for the daily-rotating IP-hash
 * salt that the Worker uses across isolates. Both shapes share this class
 * because they share a lifecycle (rotate per UTC day).
 *
 * Counter routes:
 *   POST /inc        — increment count:<errorCategory|null>; uses
 *                       blockConcurrencyWhile to serialise read-then-write
 *                       against this instance.
 *   POST /inc-spans   — bucket op_spans durations into duration:<op>:<bucket>
 *                       and count error/warn signatures into signature:<sig>.
 *   GET  /stats       — return all stored counter keys for this DO instance
 *                       (additive: `count:` keys keep their existing flat
 *                       shape; `duration:` and `signature:` keys are
 *                       reshaped into `durationBuckets`/`signatureCounts`).
 *
 * Salt route:
 *   GET  /salt   — mint-once-and-cache a 16-byte hex salt under the
 *                  storage key `salt`. Subsequent reads return the
 *                  same value for the lifetime of this DO instance,
 *                  which is bounded by the UTC day naming.
 */

import type { DurableObjectState } from '@cloudflare/workers-types';

export interface IncomingEvent {
  errorCategory: string | null;
}

export interface IncomingSpan {
  op: string;
  level: 'info' | 'warn' | 'error';
  durationMs?: number;
  signature?: string;
}

// Fixed-width buckets in ms — raw-sample p50/p95 isn't practical in a DO's
// KV-style storage, so this stores a count per bucket and the read side
// derives percentiles from the bucket distribution. Buckets span from
// sub-second ops up past the largest spec §4 timing budget (60000ms).
const DURATION_BUCKETS_MS = [100, 250, 500, 1_000, 2_500, 5_000, 10_000, 30_000, 60_000, Infinity];

function bucketFor(durationMs: number): string {
  const upper = DURATION_BUCKETS_MS.find((b) => durationMs <= b) ?? Infinity;
  return upper === Infinity ? '60000+' : String(upper);
}

export class TelemetryAggregator {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'POST' && url.pathname === '/inc') {
      // Defensive: malformed JSON, an empty body, or a non-object body must
      // surface as a structured 400 — bubbling the json() throw produces a
      // generic 500 that makes the real client error invisible.
      let raw: unknown;
      try {
        raw = await req.json();
      } catch {
        return jsonError(400, 'invalid_json');
      }
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return jsonError(400, 'invalid_body');
      }
      const errorCategory = (raw as { errorCategory?: unknown }).errorCategory;
      if (errorCategory !== null && typeof errorCategory !== 'undefined' && typeof errorCategory !== 'string') {
        return jsonError(400, 'invalid_errorCategory');
      }
      await this.increment(errorCategory ?? null);
      return new Response(null, { status: 204 });
    }
    if (req.method === 'POST' && url.pathname === '/inc-spans') {
      let raw: unknown;
      try {
        raw = await req.json();
      } catch {
        return jsonError(400, 'invalid_json');
      }
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return jsonError(400, 'invalid_body');
      }
      const spansRaw = (raw as { spans?: unknown }).spans;
      if (!Array.isArray(spansRaw)) {
        return jsonError(400, 'invalid_spans');
      }
      const spans: IncomingSpan[] = [];
      for (const s of spansRaw) {
        if (!s || typeof s !== 'object') return jsonError(400, 'invalid_span');
        const { op, level, durationMs, signature } = s as Record<string, unknown>;
        // `op` becomes the middle segment of the `duration:<op>:<bucket>`
        // storage key (see incrementSpans/stats below) — a ':' in `op`
        // would desync the 3-part split on read and corrupt/mis-parse the
        // bucket. The public Worker schema already caps `op` at 64 chars,
        // but this DO endpoint is called directly and defends its own
        // boundary independent of that, so reject here too.
        if (typeof op !== 'string' || op.includes(':') || (level !== 'info' && level !== 'warn' && level !== 'error')) {
          return jsonError(400, 'invalid_span');
        }
        spans.push({
          op,
          level,
          durationMs: typeof durationMs === 'number' ? durationMs : undefined,
          signature: typeof signature === 'string' ? signature : undefined
        });
      }
      await this.incrementSpans(spans);
      return new Response(null, { status: 204 });
    }
    if (req.method === 'GET' && url.pathname === '/stats') {
      return new Response(JSON.stringify(await this.stats()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (req.method === 'GET' && url.pathname === '/salt') {
      return new Response(JSON.stringify({ salt: await this.salt() }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async increment(errorCategory: string | null): Promise<void> {
    return this.state.blockConcurrencyWhile(async () => {
      const key = `count:${errorCategory ?? 'null'}`;
      const current = (await this.state.storage.get<number>(key)) ?? 0;
      await this.state.storage.put({
        [key]: current + 1,
        last_event_ts: Date.now()
      });
    });
  }

  /**
   * Buckets op_spans durations into duration:<op>:<bucket> and counts
   * error/warn signatures into signature:<sig>. Info-level spans never
   * carry a signature into aggregation — only error/warn shapes are
   * grouped, matching the shipper's own sampling intent (info is noise,
   * error/warn are what a real-user digest needs to triage).
   */
  async incrementSpans(spans: IncomingSpan[]): Promise<void> {
    return this.state.blockConcurrencyWhile(async () => {
      const updates: Record<string, number> = {};
      for (const span of spans) {
        if (span.durationMs !== undefined) {
          const key = `duration:${span.op}:${bucketFor(span.durationMs)}`;
          const current = (await this.state.storage.get<number>(key)) ?? 0;
          updates[key] = (updates[key] ?? current) + 1;
        }
        if ((span.level === 'error' || span.level === 'warn') && span.signature) {
          const key = `signature:${span.signature}`;
          const current = (await this.state.storage.get<number>(key)) ?? 0;
          updates[key] = (updates[key] ?? current) + 1;
        }
      }
      if (Object.keys(updates).length > 0) {
        await this.state.storage.put({ ...updates, last_event_ts: Date.now() });
      }
    });
  }

  async stats(): Promise<Record<string, unknown>> {
    const countItems = await this.state.storage.list<number>({ prefix: 'count:' });
    const out: Record<string, unknown> = {};
    for (const [key, value] of countItems.entries()) {
      out[key.slice('count:'.length)] = value;
    }

    const durationItems = await this.state.storage.list<number>({ prefix: 'duration:' });
    if (durationItems.size > 0) {
      const durationBuckets: Record<string, Record<string, number>> = {};
      for (const [key, value] of durationItems.entries()) {
        // 'duration:<op>:<bucket>' — op names are opLog identifiers
        // (camelCase, no ':'), so a 3-part split is always exact.
        const [, op, bucket] = key.split(':');
        if (op === undefined || bucket === undefined) continue;
        (durationBuckets[op] ??= {})[bucket] = value;
      }
      out.durationBuckets = durationBuckets;
    }

    const signatureItems = await this.state.storage.list<number>({ prefix: 'signature:' });
    if (signatureItems.size > 0) {
      const signatureCounts: Record<string, number> = {};
      for (const [key, value] of signatureItems.entries()) {
        signatureCounts[key.slice('signature:'.length)] = value;
      }
      out.signatureCounts = signatureCounts;
    }

    return out;
  }

  /**
   * Return this DO's stored salt, minting one on first read. Two reads
   * on the same instance always return the same value; that's the
   * cross-isolate dedup the Worker depends on.
   */
  async salt(): Promise<string> {
    return this.state.blockConcurrencyWhile(async () => {
      const existing = await this.state.storage.get<string>('salt');
      if (existing) return existing;
      const buf = new Uint8Array(16);
      crypto.getRandomValues(buf);
      const fresh = Array.from(buf)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      await this.state.storage.put('salt', fresh);
      return fresh;
    });
  }
}

function jsonError(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
