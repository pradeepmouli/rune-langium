// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Structured request logging for the telemetry Worker.
 *
 * The `pino/browser` construction + shared redact-path baseline live in
 * `@rune-langium/worker-core/log`, shared with lsp-worker, codegen-worker,
 * and curated-mirror-worker. The privacy contract for telemetry is
 * stricter than for codegen — we never persist a raw IP, never log file
 * paths, and never log request bodies; the shared baseline covers all of
 * these already, so this Worker adds no extra redact paths of its own.
 */

import { createWorkerLogger, type Logger } from '@rune-langium/worker-core/log';

export interface TelemetryLogEntry {
  ipHash: string;
  event: string;
  status: number;
  durationMs: number;
  outcome: 'accepted' | 'rejected' | 'rate_limited';
  /**
   * Studio-side error category (e.g. `workspace_open_failure`'s cause) or,
   * for a `rejected` outcome, the rejection reason (`origin_not_allowed`,
   * `schema_violation`). Grouped/filtered on directly in Workers
   * Observability — this replaces the per-(event,day) DO counter buckets.
   */
  errorCategory?: string | null;
  studioVersion?: string;
  uaClass?: string;
}

/**
 * One line per `op_spans` batch entry. Logged individually (rather than as
 * a nested array on the request line) so Workers Observability can group by
 * `op`/`level` and compute duration percentiles directly — nested array
 * fields aren't indexed the same way top-level fields are.
 */
export interface TelemetrySpanLogEntry {
  ipHash: string;
  op: string;
  level: 'info' | 'warn' | 'error';
  durationMs?: number;
  signature?: string;
}

export const logger: Logger = createWorkerLogger();

export function logRequest(entry: TelemetryLogEntry): void {
  logger.info(
    {
      ts: Date.now(),
      ip_hash: entry.ipHash,
      event: entry.event,
      status: entry.status,
      duration_ms: entry.durationMs,
      outcome: entry.outcome,
      ...(entry.errorCategory !== undefined ? { error_category: entry.errorCategory } : {}),
      ...(entry.studioVersion ? { studio_version: entry.studioVersion } : {}),
      ...(entry.uaClass ? { ua_class: entry.uaClass } : {})
    },
    'telemetry.request'
  );
}

export function logSpan(entry: TelemetrySpanLogEntry): void {
  logger.info(
    {
      ts: Date.now(),
      ip_hash: entry.ipHash,
      op: entry.op,
      level: entry.level,
      ...(entry.durationMs !== undefined ? { duration_ms: entry.durationMs } : {}),
      ...(entry.signature ? { signature: entry.signature } : {})
    },
    'telemetry.span'
  );
}
