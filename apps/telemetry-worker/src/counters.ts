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
 *   POST /inc    — increment count:<errorCategory|null>; uses
 *                  blockConcurrencyWhile to serialise read-then-write
 *                  against this instance.
 *   GET  /stats  — return all count:* keys for this DO instance.
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
      if (
        errorCategory !== null &&
        typeof errorCategory !== 'undefined' &&
        typeof errorCategory !== 'string'
      ) {
        return jsonError(400, 'invalid_errorCategory');
      }
      await this.increment(errorCategory ?? null);
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

  async stats(): Promise<Record<string, number>> {
    const items = await this.state.storage.list<number>({ prefix: 'count:' });
    const out: Record<string, number> = {};
    for (const [key, value] of items.entries()) {
      out[key.slice('count:'.length)] = value;
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
