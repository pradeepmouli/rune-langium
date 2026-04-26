// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Structured request logging for the LSP Worker (T042).
 *
 * Mirrors `apps/codegen-worker/src/log.ts` and `apps/telemetry-worker/src/log.ts`
 * so all three Workers share the same redact rules; extends the redact set
 * with LSP-specific paths (`params.contentChanges`, `params.text`,
 * `result.contents`) so source code never appears in logs — see
 * `specs/014-studio-prod-ready/contracts/lsp-worker.md` "Privacy invariants".
 *
 * Pino's `redact` config enforces these paths at the framework level: even
 * if a caller accidentally passes the full LSP message tree, pino replaces
 * the offending subtree with "[Redacted]" BEFORE anything is written.
 */

import pino from 'pino/browser';
import type { Logger, LoggerOptions } from 'pino';

export interface LspWorkerLogEntry {
  /** Route the request hit, e.g. `/api/lsp/session`, `/api/lsp/health`, `/api/lsp/ws/<token>`. */
  route: string;
  /** HTTP status returned (101 for upgrade success). */
  status: number;
  /** Wall-clock duration measured at the Worker entry. */
  durationMs: number;
  /**
   * Optional category for failed mints / upgrades; one of the documented
   * error codes from `contracts/lsp-worker.md` (e.g. `invalid_session`,
   * `nonce_replay`, `origin_not_allowed`, `schema_violation`,
   * `rate_limited`, `upgrade_required`). Omitted on success.
   */
  errorCategory?: string;
}

/**
 * Paths whose value is replaced with "[Redacted]" in every emitted log
 * line. Carries the codegen-worker / telemetry-worker baseline plus the
 * LSP-source-body paths that are unique to this Worker.
 */
const REDACT_PATHS = [
  // Carried-forward (mirror codegen-worker + telemetry-worker)
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
  'headers["set-cookie"]',
  // LSP-specific — anything that may carry source code
  'params.contentChanges',
  'params.text',
  'params.textDocument.text',
  'result.contents',
  'result.contents.value',
  'message.params.contentChanges',
  'message.params.text',
  'message.params.textDocument.text'
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

/**
 * Emit one structured log line for a completed Worker request.
 * Shape matches the surrounding workers' `*.request` log convention.
 * pino appends `level` + `time` automatically.
 */
export function logRequest(entry: LspWorkerLogEntry): void {
  logger.info(
    {
      ts: Date.now(),
      route: entry.route,
      status: entry.status,
      duration_ms: entry.durationMs,
      ...(entry.errorCategory ? { error_category: entry.errorCategory } : {})
    },
    'lsp-worker.request'
  );
}
