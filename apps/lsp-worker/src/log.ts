// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Structured request logging for the LSP Worker (T042).
 *
 * The `pino/browser` construction + redact-path baseline live in
 * `@rune-langium/worker-core/log`, shared with codegen-worker,
 * telemetry-worker, and curated-mirror-worker. This module only adds the
 * LSP-specific redact paths (`params.contentChanges`, `params.text`,
 * `result.contents`, ...) so source code never appears in logs — see
 * `specs/014-studio-prod-ready/contracts/lsp-worker.md` "Privacy invariants".
 */

import { createWorkerLogger, type Logger } from '@rune-langium/worker-core/log';

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

/** LSP-specific redact paths, on top of `@rune-langium/worker-core/log`'s shared baseline — anything that may carry source code. */
const LSP_EXTRA_REDACT_PATHS = [
  'params.contentChanges',
  'params.text',
  'params.textDocument.text',
  'result.contents',
  'result.contents.value',
  'message.params.contentChanges',
  'message.params.text',
  'message.params.textDocument.text'
];

export const logger: Logger = createWorkerLogger(LSP_EXTRA_REDACT_PATHS);

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
