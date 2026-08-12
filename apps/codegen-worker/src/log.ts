// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Structured request logging for the Worker (T034).
 *
 * The `pino/browser` construction + shared redact-path baseline live in
 * `@rune-langium/worker-core/log`, shared with lsp-worker, telemetry-worker,
 * and curated-mirror-worker.
 *
 * Emits a single JSON line per generation request to `console.log`, which
 * CF Workers forwards to `wrangler tail` + CF Logpush + the Dashboard
 * realtime log stream without any extra transport.
 *
 * Per spec SC-008 and data-model.md `WorkerLogEntry`:
 *  - `ip_hash` is a SHA-256 hex digest of (ip + daily_salt); raw IPs
 *    NEVER appear in logs.
 *  - Request and response bodies NEVER appear in logs — enforced by
 *    `@rune-langium/worker-core/log`'s redact baseline.
 */

import { createWorkerLogger, type Logger } from '@rune-langium/worker-core/log';

export interface WorkerLogEntry {
  ipHash: string;
  language: string;
  bytesOut: number;
  durationMs: number;
  status: number;
  coldStart: boolean;
}

/**
 * Default logger — used by `logRequest()`. Exported for advanced callers
 * (child loggers, custom levels, etc.).
 */
export const logger: Logger = createWorkerLogger();

/**
 * Emit one structured log line for a completed generation request.
 * Shape matches `WorkerLogEntry` from data-model.md; pino appends its own
 * `level` + `time` fields automatically (harmless for the JSON consumers).
 */
export function logRequest(entry: WorkerLogEntry): void {
  logger.info(
    {
      ts: Date.now(),
      ip_hash: entry.ipHash,
      language: entry.language,
      bytes_out: entry.bytesOut,
      duration_ms: entry.durationMs,
      status: entry.status,
      cold_start: entry.coldStart
    },
    'codegen.request'
  );
}
