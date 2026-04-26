// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Structured request logging for the telemetry Worker.
 *
 * Mirrors `apps/codegen-worker/src/log.ts` so both Workers share the
 * same redact rules. The privacy contract for telemetry is stricter
 * than for codegen — we never persist a raw IP, never log file paths,
 * and never log request bodies. Pino's `redact` config enforces this
 * at the framework level.
 */

import pino from 'pino/browser';
import type { Logger, LoggerOptions } from 'pino';

export interface TelemetryLogEntry {
  ipHash: string;
  event: string;
  status: number;
  durationMs: number;
  outcome: 'accepted' | 'rejected' | 'rate_limited' | 'do_failure';
  /** Free-form cause, only populated for `do_failure`. Never includes raw IP. */
  err?: string;
}

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

export function logRequest(entry: TelemetryLogEntry): void {
  logger.info(
    {
      ts: Date.now(),
      ip_hash: entry.ipHash,
      event: entry.event,
      status: entry.status,
      duration_ms: entry.durationMs,
      outcome: entry.outcome,
      ...(entry.err ? { err: entry.err } : {})
    },
    'telemetry.request'
  );
}
