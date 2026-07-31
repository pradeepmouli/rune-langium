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
 *  - CORS preflight + same-origin allowlist enforced via env.ALLOWED_ORIGIN.
 *  - Every accepted/rejected/rate-limited request emits ONE structured
 *    console.log line (as a raw object, not a JSON string — that's what
 *    makes Cloudflare Workers Logs index its fields); op_spans additionally
 *    emits one line per span. There is no Durable Object in this pipeline
 *    any more — aggregation happens externally by querying Workers
 *    Observability (see apps/studio/scripts/telemetry-digest.mjs).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker, { _resetRateLimitForTesting, _resetSaltCacheForTesting } from '../src/index.js';
import type { Env } from '../src/index.js';

// ---------- Test helpers ----------

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    ALLOWED_ORIGIN: 'https://www.daikonic.dev',
    IP_SALT_SECRET: 'test-salt-secret-do-not-use-in-prod',
    ...overrides
  };
}

function makeReq(body: unknown, ip = '203.0.113.5', origin: string | null = 'https://www.daikonic.dev'): Request {
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

/** Captures every console.log call made during `fn`, restoring it after. */
async function captureLogs(fn: () => Promise<void>): Promise<unknown[]> {
  const logs: unknown[] = [];
  const origLog = console.log;
  console.log = (msg: unknown) => {
    logs.push(msg);
  };
  try {
    await fn();
  } finally {
    console.log = origLog;
  }
  return logs;
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
    const env = makeEnv();
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
    const env = makeEnv();
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
    const env = makeEnv();
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
    const env = makeEnv();
    const res = await worker.fetch(makeReq({ event: 'curated_load_success', modelId: 'cdm' }), env);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('schema_violation');
  });

  it('400 schema_violation on extra/unknown field (closed schema)', async () => {
    const env = makeEnv();
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
    const env = makeEnv();
    const res = await worker.fetch(makeReq('{not-json'), env);
    expect(res.status).toBe(400);
  });

  it('429 after 10 events / minute / IP', async () => {
    const env = makeEnv();
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
    const env = makeEnv();
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
    const env = makeEnv();
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
    const env = makeEnv();
    const res = await worker.fetch(
      new Request('https://www.daikonic.dev/rune-studio/api/telemetry/v1/event', { method: 'GET' }),
      env
    );
    expect(res.status).toBe(405);
  });

  it('an unrecognised path 404s', async () => {
    const env = makeEnv();
    const res = await worker.fetch(new Request('https://www.daikonic.dev/rune-studio/api/telemetry/v1/nope'), env);
    expect(res.status).toBe(404);
  });

  it('does not log raw IP — only a hash', async () => {
    const env = makeEnv();
    const logs = await captureLogs(async () => {
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
    });
    expect(JSON.stringify(logs)).not.toContain('203.0.113.42');
  });

  it('logs a raw object to console.log, not a JSON string — required for Workers Logs field indexing', async () => {
    const env = makeEnv();
    const logs = await captureLogs(async () => {
      await worker.fetch(
        makeReq({
          event: 'curated_load_success',
          modelId: 'cdm',
          durationMs: 1,
          studio_version: '0.1.0',
          ua_class: 'chromium-desktop'
        }),
        env
      );
    });
    expect(logs).toHaveLength(1);
    expect(typeof logs[0]).toBe('object');
    expect(logs[0]).toMatchObject({ event: 'curated_load_success', outcome: 'accepted', status: 204 });
  });

  it('logs a rejected line with errorCategory=origin_not_allowed for a disallowed Origin', async () => {
    const env = makeEnv();
    const logs = await captureLogs(async () => {
      await worker.fetch(
        makeReq(
          {
            event: 'curated_load_success',
            modelId: 'cdm',
            durationMs: 1,
            studio_version: '0.1.0',
            ua_class: 'chromium-desktop'
          },
          '203.0.113.5',
          'https://evil.example'
        ),
        env
      );
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ outcome: 'rejected', error_category: 'origin_not_allowed' });
  });

  it('logs a rejected line with errorCategory=schema_violation on an invalid body', async () => {
    const env = makeEnv();
    const logs = await captureLogs(async () => {
      await worker.fetch(makeReq({ event: 'curated_load_success', modelId: 'cdm' }), env);
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ outcome: 'rejected', error_category: 'schema_violation' });
  });

  describe('workspace_* events', () => {
    const cases = [
      'workspace_open_success',
      'workspace_open_failure',
      'workspace_restore_success',
      'workspace_restore_failure'
    ] as const;
    for (const event of cases) {
      it(`${event} returns 204 and logs it`, async () => {
        const env = makeEnv();
        const logs = await captureLogs(async () => {
          const res = await worker.fetch(makeReq({ event, studio_version: '0.1.0', ua_class: 'smoke' }), env);
          expect(res.status).toBe(204);
        });
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({ event, outcome: 'accepted' });
      });
    }
  });

  describe('lsp_session_* events', () => {
    it('lsp_session_opened returns 204 and logs it', async () => {
      const env = makeEnv();
      const res = await worker.fetch(
        makeReq({ event: 'lsp_session_opened', studio_version: '0.1.0', ua_class: 'smoke' }),
        env
      );
      expect(res.status).toBe(204);
    });

    it('lsp_session_failed logs its errorCategory', async () => {
      const env = makeEnv();
      const logs = await captureLogs(async () => {
        await worker.fetch(
          makeReq({
            event: 'lsp_session_failed',
            errorCategory: 'origin_blocked',
            studio_version: '0.1.0',
            ua_class: 'smoke'
          }),
          env
        );
      });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ event: 'lsp_session_failed', error_category: 'origin_blocked' });
    });

    it('lsp_session_failed rejects an unknown errorCategory (closed schema)', async () => {
      const env = makeEnv();
      const res = await worker.fetch(
        makeReq({
          event: 'lsp_session_failed',
          errorCategory: 'not_a_real_category',
          studio_version: '0.1.0',
          ua_class: 'smoke'
        }),
        env
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('schema_violation');
    });

    it('lsp_session_opened rejects an extra field (closed schema)', async () => {
      const env = makeEnv();
      const res = await worker.fetch(
        makeReq({
          event: 'lsp_session_opened',
          studio_version: '0.1.0',
          ua_class: 'smoke',
          leaked_path: '/Users/me/secret.rosetta'
        }),
        env
      );
      expect(res.status).toBe(400);
    });
  });

  describe('CORS', () => {
    it('OPTIONS preflight from an allowed origin returns 204 with allow headers', async () => {
      const env = makeEnv();
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
      const env = makeEnv();
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
      const env = makeEnv();
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
      const env = makeEnv();
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
      const logs = await captureLogs(async () => {
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
      });
      const entry = logs[0] as { ip_hash?: string } | undefined;
      expect(entry?.ip_hash, 'log line should include an ip_hash').toMatch(/^[0-9a-f]{64}$/);
      return entry!.ip_hash!;
    }

    it('same IP same UTC day yields the same hash', async () => {
      const env = makeEnv();
      const a = await emitAndReadIpHash(env);
      const b = await emitAndReadIpHash(env);
      expect(a).toBe(b);
    });

    it('same IP across two UTC days yields different hashes', async () => {
      const env = makeEnv();
      vi.setSystemTime(new Date('2026-04-25T12:00:00Z'));
      const a = await emitAndReadIpHash(env);
      _resetSaltCacheForTesting();
      vi.setSystemTime(new Date('2026-04-26T12:00:00Z'));
      const b = await emitAndReadIpHash(env);
      expect(a).not.toBe(b);
    });

    it('two different isolates (fresh salt cache) agree on the same-day salt — deterministic, not random', async () => {
      const env = makeEnv();
      const a = await emitAndReadIpHash(env);
      _resetSaltCacheForTesting(); // simulates a second isolate never having cached the day's salt
      const b = await emitAndReadIpHash(env);
      expect(a).toBe(b);
    });
  });

  describe('op_spans event', () => {
    it('204 on a valid batch of 1-50 spans', async () => {
      const env = makeEnv();
      const res = await worker.fetch(
        makeReq({
          event: 'op_spans',
          spans: [{ op: 'clientError', level: 'error', signature: 'boom @ app.js:1' }],
          studio_version: '0.1.0',
          ua_class: 'chromium-desktop'
        }),
        env
      );
      expect(res.status).toBe(204);
    });

    it('400 on an empty spans array (schema .min(1))', async () => {
      const env = makeEnv();
      const res = await worker.fetch(
        makeReq({ event: 'op_spans', spans: [], studio_version: '0.1.0', ua_class: 'chromium-desktop' }),
        env
      );
      expect(res.status).toBe(400);
    });

    it('400 on a 51-span batch (schema .max(50))', async () => {
      const env = makeEnv();
      const spans = Array.from({ length: 51 }, (_, i) => ({
        op: 'clientError',
        level: 'error' as const,
        subject: `${i}`
      }));
      const res = await worker.fetch(
        makeReq({ event: 'op_spans', spans, studio_version: '0.1.0', ua_class: 'chromium-desktop' }),
        env
      );
      expect(res.status).toBe(400);
    });

    it('logs one telemetry.span line per span, plus one telemetry.request summary line', async () => {
      const env = makeEnv();
      const logs = await captureLogs(async () => {
        const res = await worker.fetch(
          makeReq({
            event: 'op_spans',
            spans: [
              { op: 'cdmLoad', level: 'info', durationMs: 12_000 },
              { op: 'clientError', level: 'error', signature: 'boom @ app.js:1' }
            ],
            studio_version: '0.1.0',
            ua_class: 'chromium-desktop'
          }),
          env
        );
        expect(res.status).toBe(204);
      });
      expect(logs).toHaveLength(3);
      const spanLogs = logs.filter((l) => (l as { op?: string }).op !== undefined);
      expect(spanLogs).toHaveLength(2);
      expect(spanLogs[0]).toMatchObject({ op: 'cdmLoad', level: 'info', duration_ms: 12_000 });
      expect(spanLogs[1]).toMatchObject({ op: 'clientError', level: 'error', signature: 'boom @ app.js:1' });
      const requestLog = logs.find((l) => (l as { event?: string }).event === 'op_spans');
      expect(requestLog).toMatchObject({ outcome: 'accepted' });
    });
  });
});
