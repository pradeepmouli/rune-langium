// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Container pino logger tests.
 *
 * Per spec FR-008 / SC-008:
 *  - The logger MUST NOT emit request/response body content.
 *  - Only dimensions (method, url, status, language, duration_ms, bytes_out)
 *    appear in log lines.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createLogger } from '../src/logger.js';

describe('createLogger() — pino configuration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits a single JSON line per info call when destination is captured', () => {
    const lines: string[] = [];
    const logger = createLogger({ level: 'info', dest: { write: (msg) => lines.push(msg) } });
    logger.info({ language: 'typescript', duration_ms: 42, status: 200 }, 'codegen.request');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed.msg).toBe('codegen.request');
    expect(parsed.language).toBe('typescript');
    expect(parsed.duration_ms).toBe(42);
    expect(parsed.status).toBe(200);
  });

  it('redacts request/response body fields — never logs .files[].content', () => {
    const lines: string[] = [];
    const logger = createLogger({ level: 'info', dest: { write: (msg) => lines.push(msg) } });
    const sensitive = 'MY_SECRET_NEVER_LOG_ME_42';
    logger.info(
      {
        request: {
          language: 'typescript',
          files: [{ path: 'secret.rosetta', content: sensitive }]
        },
        response: {
          files: [{ path: 'Out.ts', content: sensitive + '_derived' }]
        }
      },
      'codegen.done'
    );
    const joined = lines.join('\n');
    expect(joined).not.toContain(sensitive);
    // Parent objects themselves are stripped — not just the content.
    const parsed = JSON.parse(lines[0]!) as { request?: unknown; response?: unknown };
    expect(parsed.request).toBe('[Redacted]');
    expect(parsed.response).toBe('[Redacted]');
  });

  it('redacts Authorization + cookie headers if ever passed (defence in depth)', () => {
    const lines: string[] = [];
    const logger = createLogger({ level: 'info', dest: { write: (msg) => lines.push(msg) } });
    logger.info(
      {
        headers: { authorization: 'Bearer secret-token-9999', cookie: 'hcsession=abc123' }
      },
      'inbound'
    );
    const joined = lines.join('\n');
    expect(joined).not.toContain('secret-token-9999');
    expect(joined).not.toContain('hcsession=abc123');
  });

  it('respects level filtering (debug messages suppressed at info)', () => {
    const lines: string[] = [];
    const logger = createLogger({ level: 'info', dest: { write: (msg) => lines.push(msg) } });
    logger.debug({ noisy: true }, 'should.not.appear');
    logger.info({ kept: true }, 'should.appear');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('should.appear');
  });

  it('child loggers inherit bindings (e.g. requestId)', () => {
    const lines: string[] = [];
    const logger = createLogger({ level: 'info', dest: { write: (msg) => lines.push(msg) } });
    const child = logger.child({ requestId: 'req-abc-123' });
    child.info({ status: 200 }, 'done');
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed.requestId).toBe('req-abc-123');
    expect(parsed.status).toBe(200);
  });
});
