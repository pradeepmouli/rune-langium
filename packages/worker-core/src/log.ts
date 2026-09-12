// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Shared logging for Cloudflare Workers. Each Worker owns its typed log-entry
 * interfaces and request/span helpers. The Node container uses a separate logger.
 */

import pino from 'pino/browser';
import type { Logger } from 'pino';
import redact from '@pinojs/redact';

export type { Logger } from 'pino';

/**
 * Exclude request/response bodies, client IPs, and credentials from logs.
 * Workers pass additional sensitive fields through `extraRedactPaths`.
 */
export const REDACT_PATHS_BASELINE: readonly string[] = [
  'request',
  'response',
  'body',
  'files',
  'content',
  'raw_ip',
  'ip',
  'remote_ip',
  'cf-connecting-ip',
  'cookie',
  'headers.authorization',
  'headers.cookie',
  'headers["set-cookie"]'
];

/**
 * Create a Worker logger with shared and Worker-specific redaction paths.
 * Redaction is applied explicitly because `pino/browser` ignores `redact`.
 * Pass raw objects to `console.log` so Cloudflare indexes individual fields.
 */
export function createWorkerLogger(extraRedactPaths: readonly string[] = []): Logger {
  const paths = [...REDACT_PATHS_BASELINE, ...extraRedactPaths];
  const redactObject = redact({ paths, censor: '[Redacted]', serialize: false });

  return pino({
    level: 'info',
    browser: {
      asObject: true,
      write: (obj: unknown) => {
        // eslint-disable-next-line no-console
        console.log(paths.length > 0 ? redactObject(obj) : obj);
      }
    }
  });
}
