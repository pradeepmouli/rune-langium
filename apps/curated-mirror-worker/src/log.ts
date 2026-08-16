// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Structured logging for the curated-mirror Worker.
 *
 * The `pino/browser` construction + shared redact-path baseline live in
 * `@rune-langium/worker-core/log`, shared with lsp-worker, codegen-worker,
 * and telemetry-worker, so log shape is uniform across all rune-langium
 * Workers.
 */

import { createWorkerLogger, type Logger } from '@rune-langium/worker-core/log';

export const logger: Logger = createWorkerLogger();

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
