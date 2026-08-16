// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Shared structured-logging factory for rune-langium's plain Cloudflare
 * Workers (lsp-worker, codegen-worker, telemetry-worker,
 * curated-mirror-worker — NOT the Node-based codegen-container sidecar,
 * which uses real `pino` with file transports, a different runtime).
 *
 * Each Worker previously hand-rolled its own near-identical `pino/browser`
 * construction in its own `log.ts` — same redact-path baseline, same
 * `browser.write` hook, copy-pasted into four files that had already
 * drifted: `apps/telemetry-worker/src/log.ts` was fixed to pass the raw
 * object to `console.log` (required for Cloudflare Workers Logs to index
 * individual fields — see the `write` doc comment below), but the fix was
 * never propagated to the other three, which still stringified first.
 * `createWorkerLogger` collapses all four constructions into one, so this
 * class of drift can't happen again.
 *
 * Each Worker keeps its own typed log-entry interfaces and `logRequest`/
 * `logSpan`/`logPublish`/`logRead`-style helpers in its own `log.ts` — only
 * the underlying `pino` construction moves here.
 */

import pino from 'pino/browser';
import type { Logger, LoggerOptions } from 'pino';
import redact from '@pinojs/redact';

export type { Logger } from 'pino';

/**
 * Baseline redact paths shared by every rune-langium Cloudflare Worker's
 * structured logger — request/response bodies, raw client IPs, and
 * auth-bearing headers must never appear in a log line. A Worker with
 * additional sensitive fields (e.g. lsp-worker's LSP message bodies, which
 * may carry source code) passes its own paths as `extraRedactPaths`.
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
 * Builds a `pino/browser` logger for a Cloudflare Worker, with this
 * fleet's shared conventions baked in:
 *
 *  - `pino/browser` — the browser-compatible pino build that tree-shakes
 *    out Node-only transports (no `fs`, no streams — required inside the
 *    Workers runtime).
 *  - `write` passes the RAW (redacted) object to `console.log`, never a
 *    stringified copy. Cloudflare Workers Logs only extracts queryable
 *    per-field indexes from a raw object passed to `console.log`;
 *    `console.log(JSON.stringify(obj))` is stored as an opaque
 *    `{message: "<string>"}` line instead, unindexed beyond full-text
 *    search. See
 *    https://developers.cloudflare.com/workers/observability/logs/workers-logs/#logging-structured-json-objects
 *  - Real redaction, via `@pinojs/redact` (the same engine pino's own
 *    Node build wires up internally) applied by hand in `write`.
 *    `pino/browser.js` has ZERO references to `redact` anywhere in its
 *    source — passing a `redact` option to `pino({...})` in browser mode
 *    is a silent no-op. Every one of this fleet's Workers previously did
 *    exactly that, meaning their documented "pino's redact config enforces
 *    this at the framework level" claim was never actually true at
 *    runtime. Confirmed by a failing test before this fix existed: a
 *    `request` field logged straight through unredacted.
 *  - `REDACT_PATHS_BASELINE` plus any Worker-specific `extraRedactPaths`.
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
  } as LoggerOptions);
}
