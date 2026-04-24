// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Structured request logging for the Worker (T034).
 *
 * Uses `pino/browser` — the browser-compatible pino build that tree-shakes
 * out Node-only transports. Works inside the CF Workers runtime (no fs,
 * no streams) and costs ~8 KB in the bundle.
 *
 * Emits a single JSON line per generation request to `console.log`, which
 * CF Workers forwards to `wrangler tail` + CF Logpush + the Dashboard
 * realtime log stream without any extra transport.
 *
 * Per spec SC-008 and data-model.md `WorkerLogEntry`:
 *  - `ip_hash` is a SHA-256 hex digest of (ip + daily_salt); raw IPs
 *    NEVER appear in logs.
 *  - Request and response bodies NEVER appear in logs. pino's `redact`
 *    config enforces this at the framework level — even if a caller
 *    accidentally passes `{request, body, files}` shapes, pino replaces
 *    the entire subtree with "[Redacted]" BEFORE anything is written.
 */

// Explicit pino/browser import: forces the tree-shaken ~8 KB browser build
// in BOTH the Workers runtime AND vitest (Node). Types come via the local
// shim in ./pino-browser.d.ts (re-exports pino's main types).
import pino from 'pino/browser';
import type { Logger, LoggerOptions } from 'pino';

export interface WorkerLogEntry {
  ipHash: string;
  language: string;
  bytesOut: number;
  durationMs: number;
  status: number;
  coldStart: boolean;
}

/** Paths whose value is replaced with "[Redacted]" in every emitted log line. */
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

/**
 * Default logger — used by `logRequest()`. Exported for advanced callers
 * (child loggers, custom levels, etc.). Testable by replacing the write
 * sink via a custom transport in the future.
 */
export const logger: Logger = pino({
  level: 'info',
  browser: {
    asObject: true,
    // Force single-line JSON output via console.log so callers of
    // `wrangler tail` see newline-delimited JSON exactly like the
    // container's pino output.
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
