// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createWorkerLogger, REDACT_PATHS_BASELINE } from '../src/log.js';

describe('createWorkerLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes the RAW object to console.log, not a stringified copy', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => void 0);
    const logger = createWorkerLogger();
    logger.info({ foo: 'bar' }, 'worker.event');
    expect(spy).toHaveBeenCalledTimes(1);
    const [payload] = spy.mock.calls[0]!;
    // If this ever regresses to console.log(JSON.stringify(obj)), payload
    // becomes a string and this assertion fails — that regression is
    // exactly what silently defeated Cloudflare Workers Logs field
    // indexing for three of the four Workers this package now serves.
    expect(typeof payload).toBe('object');
    expect(payload).toMatchObject({ foo: 'bar', msg: 'worker.event', level: 30 });
  });

  it('redacts every baseline path', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => void 0);
    const logger = createWorkerLogger();
    logger.info(
      {
        request: 'r',
        response: 'r',
        body: 'b',
        files: 'f',
        content: 'c',
        raw_ip: '203.0.113.5',
        ip: '203.0.113.5',
        remote_ip: '203.0.113.5',
        'cf-connecting-ip': '203.0.113.5',
        cookie: 'secret',
        headers: { authorization: 'Bearer x', cookie: 'y', 'set-cookie': 'z' }
      },
      'worker.event'
    );
    const [payload] = spy.mock.calls[0]! as [Record<string, unknown>];
    expect(payload.request).toBe('[Redacted]');
    expect(payload.raw_ip).toBe('[Redacted]');
    expect((payload.headers as Record<string, unknown>).authorization).toBe('[Redacted]');
    expect(JSON.stringify(payload)).not.toContain('203.0.113.5');
  });

  it('also redacts Worker-specific extraRedactPaths', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => void 0);
    const logger = createWorkerLogger(['params.text']);
    logger.info({ params: { text: 'source code here' } }, 'worker.event');
    const [payload] = spy.mock.calls[0]! as [Record<string, unknown>];
    expect((payload.params as Record<string, unknown>).text).toBe('[Redacted]');
  });

  it('exposes the shared baseline for callers that need to extend it', () => {
    expect(REDACT_PATHS_BASELINE).toContain('raw_ip');
    expect(REDACT_PATHS_BASELINE).toContain('headers.authorization');
  });
});
