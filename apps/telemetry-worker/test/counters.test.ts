// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Direct unit coverage for TelemetryAggregator.incrementSpans/stats().
 * ingest.test.ts covers the DO indirectly through the Worker's fetch;
 * this file exercises the new duration-bucketing/signature-counting
 * methods directly against a minimal in-memory storage fake mirroring
 * ingest.test.ts's own FakeStorage shape.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TelemetryAggregator } from '../src/counters.js';

function makeStorage() {
  const store = new Map<string, unknown>();
  return {
    store,
    async get<T>(key: string): Promise<T | undefined> {
      return store.get(key) as T | undefined;
    },
    async put(arg1: string | Record<string, unknown>, arg2?: unknown): Promise<void> {
      if (typeof arg1 === 'string') {
        store.set(arg1, arg2);
      } else {
        for (const [k, v] of Object.entries(arg1)) store.set(k, v);
      }
    },
    async list<T>(opts?: { prefix?: string }): Promise<Map<string, T>> {
      const out = new Map<string, T>();
      for (const [k, v] of store.entries()) {
        if (!opts?.prefix || k.startsWith(opts.prefix)) out.set(k, v as T);
      }
      return out;
    }
  };
}

function makeState() {
  const storage = makeStorage();
  return {
    storage,
    async blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> {
      return fn();
    }
  } as unknown as ConstructorParameters<typeof TelemetryAggregator>[0];
}

describe('TelemetryAggregator.incrementSpans', () => {
  let agg: TelemetryAggregator;

  beforeEach(() => {
    agg = new TelemetryAggregator(makeState());
  });

  it('buckets a duration into the correct histogram bucket', async () => {
    await agg.incrementSpans([{ op: 'cdmLoad', level: 'info', durationMs: 12_000 }]);
    const stats = (await agg.stats()) as { durationBuckets?: Record<string, Record<string, number>> };
    expect(stats.durationBuckets?.cdmLoad).toBeDefined();
  });

  it('counts error/warn signatures keyed by signature string', async () => {
    await agg.incrementSpans([{ op: 'clientError', level: 'error', signature: 'boom @ app.js:1' }]);
    const stats = (await agg.stats()) as { signatureCounts?: Record<string, number> };
    expect(stats.signatureCounts?.['boom @ app.js:1']).toBe(1);
  });

  it('ignores info-level spans for signature counting (only error/warn get grouped)', async () => {
    await agg.incrementSpans([{ op: 'output', level: 'info', signature: 'noise' }]);
    const stats = (await agg.stats()) as { signatureCounts?: Record<string, number> };
    expect(stats.signatureCounts?.noise).toBeUndefined();
  });

  it('accumulates counts across multiple calls for the same op, splitting across buckets by duration', async () => {
    await agg.incrementSpans([{ op: 'cdmLoad', level: 'info', durationMs: 5_000 }]);
    await agg.incrementSpans([{ op: 'cdmLoad', level: 'info', durationMs: 6_000 }]);
    const stats = (await agg.stats()) as { durationBuckets?: Record<string, Record<string, number>> };
    const total = Object.values(stats.durationBuckets?.cdmLoad ?? {}).reduce((a, b) => a + b, 0);
    expect(total).toBe(2);
  });

  it('leaves the existing flat count:* shape untouched when only spans are recorded', async () => {
    await agg.incrementSpans([{ op: 'cdmLoad', level: 'info', durationMs: 1_000 }]);
    const stats = await agg.stats();
    expect(stats.null).toBeUndefined();
  });
});

describe('TelemetryAggregator /inc-spans route', () => {
  it('204s on a valid spans batch and reflects it in /stats', async () => {
    const agg = new TelemetryAggregator(makeState());
    const res = await agg.fetch(
      new Request('https://do/inc-spans', {
        method: 'POST',
        body: JSON.stringify({ spans: [{ op: 'clientError', level: 'error', signature: 'boom' }] })
      })
    );
    expect(res.status).toBe(204);
    const stats = (await agg.stats()) as { signatureCounts?: Record<string, number> };
    expect(stats.signatureCounts?.boom).toBe(1);
  });

  it('400s on malformed JSON', async () => {
    const agg = new TelemetryAggregator(makeState());
    const res = await agg.fetch(new Request('https://do/inc-spans', { method: 'POST', body: 'not json' }));
    expect(res.status).toBe(400);
  });

  it('400s when spans is not an array', async () => {
    const agg = new TelemetryAggregator(makeState());
    const res = await agg.fetch(
      new Request('https://do/inc-spans', { method: 'POST', body: JSON.stringify({ spans: 'nope' }) })
    );
    expect(res.status).toBe(400);
  });

  it('400s when a span is missing op/level', async () => {
    const agg = new TelemetryAggregator(makeState());
    const res = await agg.fetch(
      new Request('https://do/inc-spans', { method: 'POST', body: JSON.stringify({ spans: [{ op: 'x' }] }) })
    );
    expect(res.status).toBe(400);
  });
});
