// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Telemetry ingest contract tests.
 *
 * Per `specs/012-studio-workspace-ux/contracts/telemetry-event.md`:
 *  - 204 on a valid event body, 400 on schema violation / extra field.
 *  - 429 after 10 events / minute / IP; the window resets after 60s.
 *  - cf-connecting-ip is hashed with a daily-rotating salt; raw IPs
 *    never log; same IP in same day → same hash; same IP across days
 *    → different hashes (privacy-via-rotation).
 *  - All four `workspace_*` events route to the per-event/per-day DO.
 *  - DO failures surface as 500 to the client (NOT silent 204).
 *  - CORS preflight + same-origin allowlist enforced via env.ALLOWED_ORIGIN.
 *
 * The DO is exercised through a fake `DurableObjectNamespace`; the
 * Worker code under test runs in plain vitest (no miniflare).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker, {
  TelemetryAggregator,
  _resetRateLimitForTesting,
  _resetSaltCacheForTesting
} from '../src/index.js';
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

interface DONamespaceFake {
  namespace: { idFromName: (name: string) => FakeDOId; get: (id: FakeDOId) => DOInstance };
  instances: Map<string, { instance: TelemetryAggregator; storage: FakeStorage }>;
  /**
   * If set, `get(id).fetch(req)` for any id matching this predicate
   * returns the configured response without invoking the real DO.
   */
  failureMode: {
    match: (id: string) => boolean;
    response: () => Response | Promise<Response>;
  } | null;
}

function makeDONamespace(): DONamespaceFake {
  const instances = new Map<string, { instance: TelemetryAggregator; storage: FakeStorage }>();
  const ns: DONamespaceFake = {
    namespace: {
      idFromName(name: string): FakeDOId {
        return { name, toString: () => name };
      },
      get(id: FakeDOId): DOInstance {
        if (ns.failureMode && ns.failureMode.match(id.name)) {
          return { fetch: async () => ns.failureMode!.response() };
        }
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
    },
    instances,
    failureMode: null
  };
  return ns;
}

function makeEnv(overrides: Partial<Env> = {}): { env: Env; do: DONamespaceFake } {
  const doNs = makeDONamespace();
  const env = {
    TELEMETRY: doNs.namespace as unknown as Env['TELEMETRY'],
    ALLOWED_ORIGIN: 'https://www.daikonic.dev',
    ...overrides
  } as Env;
  return { env, do: doNs };
}

function makeReq(
  body: unknown,
  ip = '203.0.113.5',
  origin: string | null = 'https://www.daikonic.dev'
): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'cf-connecting-ip': ip
  };
  if (origin) headers['Origin'] = origin;
  return new Request('https://www.daikonic.dev/rune-studio/api/telemetry/v1/event', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

// ---------- Tests ----------

describe('telemetry ingest contract', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T12:00:00Z'));
    _resetRateLimitForTesting();
    _resetSaltCacheForTesting();
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

  it('204 on curated_load_failure with errorCategory=cancelled (canonical schema)', async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(
      makeReq({
        event: 'curated_load_failure',
        modelId: 'fpml',
        errorCategory: 'cancelled',
        studio_version: '0.1.0',
        ua_class: 'chromium-desktop'
      }),
      env
    );
    expect(res.status).toBe(204);
  });

  it('400 on errorCategory=parse (NOT in the canonical enum)', async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(
      makeReq({
        event: 'curated_load_failure',
        modelId: 'cdm',
        errorCategory: 'parse',
        studio_version: '0.1.0',
        ua_class: 'chromium-desktop'
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it('400 schema_violation on missing required field', async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(makeReq({ event: 'curated_load_success', modelId: 'cdm' }), env);
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

  it('rate-limit window resets after 60s for the same IP', async () => {
    const { env } = makeEnv();
    const validBody = {
      event: 'curated_load_success' as const,
      modelId: 'cdm' as const,
      durationMs: 100,
      studio_version: '0.1.0',
      ua_class: 'chromium-desktop'
    };
    for (let i = 0; i < 10; i++) {
      await worker.fetch(makeReq(validBody, '198.51.100.42'), env);
    }
    expect((await worker.fetch(makeReq(validBody, '198.51.100.42'), env)).status).toBe(429);
    // Advance past the 60s window.
    vi.setSystemTime(new Date('2026-04-25T12:01:01Z'));
    expect((await worker.fetch(makeReq(validBody, '198.51.100.42'), env)).status).toBe(204);
  });

  it('rate-limit is per-IP', async () => {
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
    expect((await worker.fetch(makeReq(validBody, '198.51.100.99'), env)).status).toBe(204);
  });

  it('rejects non-POST methods on /v1/event with 405', async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(
      new Request('https://www.daikonic.dev/rune-studio/api/telemetry/v1/event', { method: 'GET' }),
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
    expect(logs.join('\n')).not.toContain('203.0.113.42');
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
    const entry = doNs.instances.get('curated_load_success:2026-04-25');
    expect(entry).toBeDefined();
    expect(await entry!.storage.get<number>('count:null')).toBe(2);
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
        errorCategory: 'cancelled',
        studio_version: '0.1.0',
        ua_class: 'chromium-desktop'
      }),
      env
    );
    const entry = doNs.instances.get('curated_load_failure:2026-04-25');
    expect(entry).toBeDefined();
    expect(await entry!.storage.get<number>('count:network')).toBe(1);
    expect(await entry!.storage.get<number>('count:cancelled')).toBe(1);
  });

  describe('workspace_* events route to their own per-day DO', () => {
    const cases = [
      'workspace_open_success',
      'workspace_open_failure',
      'workspace_restore_success',
      'workspace_restore_failure'
    ] as const;
    for (const event of cases) {
      it(`${event} reaches DO id ${event}:<UTC-day> with count:null`, async () => {
        const { env, do: doNs } = makeEnv();
        const res = await worker.fetch(
          makeReq({ event, studio_version: '0.1.0', ua_class: 'smoke' }),
          env
        );
        expect(res.status).toBe(204);
        const entry = doNs.instances.get(`${event}:2026-04-25`);
        expect(entry).toBeDefined();
        expect(await entry!.storage.get<number>('count:null')).toBe(1);
      });
    }
  });

  describe('DO failure surfaces as 500 (not silent 204)', () => {
    it('500 when DO returns 5xx', async () => {
      const { env, do: doNs } = makeEnv();
      doNs.failureMode = {
        match: (name) => name.startsWith('curated_load_success:'),
        response: () => new Response('boom', { status: 503 })
      };
      const res = await worker.fetch(
        makeReq({
          event: 'curated_load_success',
          modelId: 'cdm',
          durationMs: 1,
          studio_version: '0.1.0',
          ua_class: 'smoke'
        }),
        env
      );
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('aggregator_failure');
    });

    it('500 when DO throws', async () => {
      const { env, do: doNs } = makeEnv();
      doNs.failureMode = {
        match: (name) => name.startsWith('curated_load_success:'),
        response: () => {
          throw new Error('upstream boom');
        }
      };
      const res = await worker.fetch(
        makeReq({
          event: 'curated_load_success',
          modelId: 'cdm',
          durationMs: 1,
          studio_version: '0.1.0',
          ua_class: 'smoke'
        }),
        env
      );
      expect(res.status).toBe(500);
    });
  });

  describe('CORS', () => {
    it('OPTIONS preflight from an allowed origin returns 204 with allow headers', async () => {
      const { env } = makeEnv();
      const res = await worker.fetch(
        new Request('https://www.daikonic.dev/rune-studio/api/telemetry/v1/event', {
          method: 'OPTIONS',
          headers: { Origin: 'https://www.daikonic.dev' }
        }),
        env
      );
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://www.daikonic.dev');
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    it('OPTIONS preflight from a non-allowed origin returns 204 WITHOUT allow headers', async () => {
      const { env } = makeEnv();
      const res = await worker.fetch(
        new Request('https://www.daikonic.dev/rune-studio/api/telemetry/v1/event', {
          method: 'OPTIONS',
          headers: { Origin: 'https://evil.example' }
        }),
        env
      );
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('POST from a non-allowed origin returns 403', async () => {
      const { env } = makeEnv();
      const res = await worker.fetch(
        makeReq(
          {
            event: 'curated_load_success',
            modelId: 'cdm',
            durationMs: 1,
            studio_version: '0.1.0',
            ua_class: 'smoke'
          },
          '203.0.113.5',
          'https://evil.example'
        ),
        env
      );
      expect(res.status).toBe(403);
    });

    it('POST from an allowed origin echoes Access-Control-Allow-Origin', async () => {
      const { env } = makeEnv();
      const res = await worker.fetch(
        makeReq(
          {
            event: 'curated_load_success',
            modelId: 'cdm',
            durationMs: 1,
            studio_version: '0.1.0',
            ua_class: 'smoke'
          },
          '203.0.113.5',
          'https://www.daikonic.dev'
        ),
        env
      );
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://www.daikonic.dev');
    });
  });

  describe('IP-hash salt rotation', () => {
    async function emitAndReadIpHash(env: Env): Promise<string> {
      let captured = '';
      const origLog = console.log;
      console.log = (msg: unknown) => {
        const line = typeof msg === 'string' ? msg : JSON.stringify(msg);
        if (line.includes('ip_hash')) captured = line;
      };
      try {
        await worker.fetch(
          makeReq(
            {
              event: 'curated_load_success',
              modelId: 'cdm',
              durationMs: 1,
              studio_version: '0.1.0',
              ua_class: 'smoke'
            },
            '203.0.113.99'
          ),
          env
        );
      } finally {
        console.log = origLog;
      }
      const m = captured.match(/"ip_hash":"([0-9a-f]{64})"/);
      expect(m, 'log line should include an ip_hash').toBeTruthy();
      return m![1]!;
    }

    it('same IP same UTC day yields the same hash', async () => {
      const { env } = makeEnv();
      const a = await emitAndReadIpHash(env);
      const b = await emitAndReadIpHash(env);
      expect(a).toBe(b);
    });

    it('same IP across two UTC days yields different hashes', async () => {
      const { env } = makeEnv();
      vi.setSystemTime(new Date('2026-04-25T12:00:00Z'));
      const a = await emitAndReadIpHash(env);
      _resetSaltCacheForTesting();
      vi.setSystemTime(new Date('2026-04-26T12:00:00Z'));
      const b = await emitAndReadIpHash(env);
      expect(a).not.toBe(b);
    });
  });
});
