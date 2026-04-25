// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * TelemetryAggregator Durable Object (T110).
 *
 * One DO instance per `<event-name>:<UTC-day>`. The Worker computes the
 * ID name and routes the validated event payload to it. The DO holds:
 *  - `count:<errorCategory>` — integer counter, `null` for non-error events
 *  - `last_event_ts` — last write time (debug only)
 *
 * `GET /v1/stats?date=YYYY-MM-DD` returns the day's counters as a flat
 * object. Access is gated by CF Access at the Worker boundary; the DO
 * itself trusts whatever reaches it.
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
      const body = (await req.json()) as IncomingEvent;
      await this.increment(body.errorCategory ?? null);
      return new Response(null, { status: 204 });
    }
    if (req.method === 'GET' && url.pathname === '/stats') {
      return new Response(JSON.stringify(await this.stats()), {
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
}
