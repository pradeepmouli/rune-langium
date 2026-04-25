// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Structured logging for the curated-mirror Worker (T029).
 * Same redact set as apps/codegen-worker/src/log.ts so log shape is
 * uniform across all rune-langium Workers.
 */

import pino from 'pino/browser';
import type { Logger, LoggerOptions } from 'pino';

const REDACT_PATHS = [
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

export const logger: Logger = pino({
  level: 'info',
  browser: {
    asObject: true,
    write: (obj: unknown) => {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(obj));
    }
  },
  redact: {
    paths: REDACT_PATHS,
    censor: '[Redacted]'
  }
} as LoggerOptions);

export interface PublishLogEntry {
  modelId: string;
  status: 'published' | 'failed' | 'pruned';
  durationMs: number;
  sizeBytes?: number;
  archivesPruned?: number;
  errorCategory?: string;
}

export function logPublish(entry: PublishLogEntry): void {
  logger.info(
    {
      ts: Date.now(),
      model_id: entry.modelId,
      status: entry.status,
      duration_ms: entry.durationMs,
      size_bytes: entry.sizeBytes,
      archives_pruned: entry.archivesPruned,
      error_category: entry.errorCategory
    },
    'curated-mirror.publish'
  );
}

export interface ReadLogEntry {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  cacheHit?: boolean;
}

export function logRead(entry: ReadLogEntry): void {
  logger.info(
    {
      ts: Date.now(),
      method: entry.method,
      path: entry.path,
      status: entry.status,
      duration_ms: entry.durationMs,
      cache_hit: entry.cacheHit
    },
    'curated-mirror.read'
  );
}
