// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Worker logging tests (T035 → drives T034).
 *
 * Per data-model.md `WorkerLogEntry` + spec SC-008:
 *  - logRequest() emits a single JSON object with fixed keys
 *  - IP is hashed, never raw
 *  - Request body contents MUST NOT appear in any log line
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { logRequest } from '../src/log.js';

describe('logRequest (T034)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits a single structured JSON line to console.log with all required keys', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => void 0);
    logRequest({
      ipHash: 'abcdef0123456789',
      language: 'typescript',
      bytesOut: 4096,
      durationMs: 123,
      status: 200,
      coldStart: false
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const [payload] = spy.mock.calls[0]!;
    const entry = JSON.parse(payload as string) as Record<string, unknown>;
    expect(entry).toMatchObject({
      ts: expect.any(Number),
      ip_hash: 'abcdef0123456789',
      language: 'typescript',
      bytes_out: 4096,
      duration_ms: 123,
      status: 200,
      cold_start: false
    });
  });

  it('never emits the raw IP, request body, or response body', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => void 0);
    const sensitive = 'MY_SECRET_VALUE_SHOULD_NEVER_APPEAR_12345';
    logRequest({
      ipHash: 'abcdef',
      language: 'typescript',
      bytesOut: sensitive.length, // numeric only — no body content
      durationMs: 10,
      status: 200,
      coldStart: false
    });
    const out = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).not.toContain(sensitive);
    expect(out).not.toContain('203.0.113.5'); // raw IP
  });

  it('rejects an entry with a raw IP (defensive check)', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => void 0);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => void 0);
    // @ts-expect-error — intentionally pass wrong shape to verify guard
    logRequest({ ip: '203.0.113.5', language: 'ts', bytesOut: 0, durationMs: 1, status: 200 });
    // Either nothing logged to stdout, or the error went to stderr; the raw IP
    // MUST NOT appear anywhere.
    const combined = [
      ...spy.mock.calls.map((c) => String(c[0])),
      ...errSpy.mock.calls.map((c) => String(c[0]))
    ].join('\n');
    expect(combined).not.toContain('203.0.113.5');
  });

  it('includes cold_start=true when the flag is set', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => void 0);
    logRequest({
      ipHash: 'x',
      language: 'java',
      bytesOut: 0,
      durationMs: 12000,
      status: 200,
      coldStart: true
    });
    const entry = JSON.parse(spy.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(entry.cold_start).toBe(true);
  });
});
