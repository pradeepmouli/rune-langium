// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Telemetry ingest contract tests (T109 → drives T110).
 *
 * Per `specs/012-studio-workspace-ux/contracts/telemetry-event.md`:
 *  - 204 on a valid event body
 *  - 400 on schema violation (wrong type, missing required field)
 *  - 400 on extra/unknown fields (closed schema; FR-T02)
 *  - 429 after 10 events / minute / IP
 *  - The cf-connecting-ip is hashed with a daily-rotating salt before
 *    use; the raw IP MUST NOT appear in any log line emitted by the
 *    request path.
 *
 * The DO is exercised through a fake `DurableObjectNamespace` so the
 * Worker code under test runs in plain vitest (no miniflare). Counters
 * are stored in an in-memory Map shaped like `DurableObjectStorage`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker, { TelemetryAggregator, _resetRateLimitForTesting } from '../src/index.js';
import type { Env } from '../src/index.js';

// ---------- DO fakes ----------

interface FakeStorage {
  store: Map<string, unknown>;
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(entries: Record<string, unknown>): Promise<void>;
  put(key: string, value: unknown): Promise<void>;
  list<T = unknown>(opts?: { prefix?: string }): Promise<Map<string, T>>;
}

function makeStorage(): FakeStorage {
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

interface DOInstance {
  fetch(req: Request): Promise<Response>;
}

interface FakeDOId {
  name: string;
  toString(): string;
}

function makeDONamespace(): {
  namespace: { idFromName: (name: string) => FakeDOId; get: (id: FakeDOId) => DOInstance };
  instances: Map<string, { instance: TelemetryAggregator; storage: FakeStorage }>;
} {
  const instances = new Map<string, { instance: TelemetryAggregator; storage: FakeStorage }>();
  const namespace = {
    idFromName(name: string): FakeDOId {
      return { name, toString: () => name };
    },
    get(id: FakeDOId): DOInstance {
      let entry = instances.get(id.name);
      if (!entry) {
        const storage = makeStorage();
        const state = {
          storage,
          async blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> {
            return fn();
          }
        } as unknown as ConstructorParameters<typeof TelemetryAggregator>[0];
        const instance = new TelemetryAggregator(state);
        entry = { instance, storage };
        instances.set(id.name, entry);
      }
      return {
        fetch: (req: Request) => entry!.instance.fetch(req)
      };
    }
  };
  return { namespace, instances };
}

function makeEnv(overrides: Partial<Env> = {}): {
  env: Env;
  do: ReturnType<typeof makeDONamespace>;
} {
  const doNs = makeDONamespace();
  const env = {
    TELEMETRY: doNs.namespace as unknown as Env['TELEMETRY'],
    ALLOWED_ORIGIN: 'https://www.daikonic.dev',
    ...overrides
  } as Env;
  return { env, do: doNs };
}

function makeReq(body: unknown, ip = '203.0.113.5'): Request {
  return new Request('https://www.daikonic.dev/rune-studio/api/telemetry/v1/event', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': ip,
      Origin: 'https://www.daikonic.dev'
    },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

// ---------- Tests ----------

describe('telemetry ingest contract (T109)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T12:00:00Z'));
    _resetRateLimitForTesting();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('204 on a valid curated_load_success event', async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(
      makeReq({
        event: 'curated_load_success',
        modelId: 'cdm',
        durationMs: 1234,
        studio_version: '0.1.0',
        ua_class: 'chromium-desktop'
      }),
      env
    );
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });

  it('204 on a valid curated_load_failure event', async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(
      makeReq({
        event: 'curated_load_failure',
        modelId: 'fpml',
        errorCategory: 'network',
        studio_version: '0.1.0',
        ua_class: 'chromium-desktop'
      }),
      env
    );
    expect(res.status).toBe(204);
  });

  it('400 schema_violation on missing required field', async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(
      makeReq({
        event: 'curated_load_success',
        modelId: 'cdm'
        // missing durationMs / studio_version / ua_class
      }),
      env
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('schema_violation');
  });

  it('400 schema_violation on extra/unknown field (closed schema)', async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(
      makeReq({
        event: 'curated_load_success',
        modelId: 'cdm',
        durationMs: 1234,
        studio_version: '0.1.0',
        ua_class: 'chromium-desktop',
        leaked_path: '/Users/me/secret.rosetta'
      }),
      env
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('schema_violation');
  });

  it('400 on wrong type for an enum field', async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(
      makeReq({
        event: 'curated_load_success',
        modelId: 'not-a-model',
        durationMs: 1234,
        studio_version: '0.1.0',
        ua_class: 'chromium-desktop'
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it('400 on malformed JSON body', async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(makeReq('{not-json'), env);
    expect(res.status).toBe(400);
  });

  it('429 after 10 events / minute / IP', async () => {
    const { env } = makeEnv();
    const validBody = {
      event: 'curated_load_success' as const,
      modelId: 'cdm' as const,
      durationMs: 100,
      studio_version: '0.1.0',
      ua_class: 'chromium-desktop'
    };

    for (let i = 0; i < 10; i++) {
      const res = await worker.fetch(makeReq(validBody, '198.51.100.7'), env);
      expect(res.status).toBe(204);
    }

    const tripped = await worker.fetch(makeReq(validBody, '198.51.100.7'), env);
    expect(tripped.status).toBe(429);
    const body = (await tripped.json()) as { error: string; retry_after_s: number };
    expect(body.error).toBe('rate_limited');
    expect(body.retry_after_s).toBeGreaterThan(0);
    expect(body.retry_after_s).toBeLessThanOrEqual(60);
  });

  it('rate-limit is per-IP (different IP not affected)', async () => {
    const { env } = makeEnv();
    const validBody = {
      event: 'curated_load_success' as const,
      modelId: 'cdm' as const,
      durationMs: 100,
      studio_version: '0.1.0',
      ua_class: 'chromium-desktop'
    };

    for (let i = 0; i < 10; i++) {
      await worker.fetch(makeReq(validBody, '198.51.100.7'), env);
    }
    // A different IP should still be allowed.
    const res = await worker.fetch(makeReq(validBody, '198.51.100.99'), env);
    expect(res.status).toBe(204);
  });

  it('rejects non-POST methods with 405', async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(
      new Request('https://www.daikonic.dev/rune-studio/api/telemetry/v1/event', {
        method: 'GET'
      }),
      env
    );
    expect(res.status).toBe(405);
  });

  it('does not log raw IP — only a hash', async () => {
    const { env } = makeEnv();
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: unknown) => {
      logs.push(typeof msg === 'string' ? msg : JSON.stringify(msg));
    };
    try {
      await worker.fetch(
        makeReq(
          {
            event: 'curated_load_success',
            modelId: 'cdm',
            durationMs: 1,
            studio_version: '0.1.0',
            ua_class: 'chromium-desktop'
          },
          '203.0.113.42'
        ),
        env
      );
    } finally {
      console.log = origLog;
    }
    const all = logs.join('\n');
    expect(all).not.toContain('203.0.113.42');
  });

  it('aggregates counters in the DO keyed on <event>:<UTC-day>', async () => {
    const { env, do: doNs } = makeEnv();
    const validBody = {
      event: 'curated_load_success' as const,
      modelId: 'cdm' as const,
      durationMs: 100,
      studio_version: '0.1.0',
      ua_class: 'chromium-desktop'
    };
    await worker.fetch(makeReq(validBody, '203.0.113.1'), env);
    await worker.fetch(makeReq(validBody, '203.0.113.2'), env);

    // The DO id is `curated_load_success:2026-04-25` (UTC day).
    const entry = doNs.instances.get('curated_load_success:2026-04-25');
    expect(entry, 'DO instance for curated_load_success should exist').toBeDefined();
    // The counter under the null errorCategory (success has no category)
    const total = await entry!.storage.get<number>('count:null');
    expect(total).toBe(2);
  });

  it('groups failures by errorCategory inside the DO', async () => {
    const { env, do: doNs } = makeEnv();
    await worker.fetch(
      makeReq({
        event: 'curated_load_failure',
        modelId: 'cdm',
        errorCategory: 'network',
        studio_version: '0.1.0',
        ua_class: 'chromium-desktop'
      }),
      env
    );
    await worker.fetch(
      makeReq({
        event: 'curated_load_failure',
        modelId: 'cdm',
        errorCategory: 'parse',
        studio_version: '0.1.0',
        ua_class: 'chromium-desktop'
      }),
      env
    );
    const entry = doNs.instances.get('curated_load_failure:2026-04-25');
    expect(entry).toBeDefined();
    expect(await entry!.storage.get<number>('count:network')).toBe(1);
    expect(await entry!.storage.get<number>('count:parse')).toBe(1);
  });
});
