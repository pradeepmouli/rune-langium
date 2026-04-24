// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Structured request logging for the Worker (T034).
 *
 * Emits a single JSON line per generation request. Consumable by
 * `wrangler tail` and CF Logpush without any parsing.
 *
 * Per spec SC-008 and data-model.md `WorkerLogEntry`:
 *  - `ip_hash` is a SHA-256 hex digest of (ip + daily_salt); raw IPs
 *    are NEVER stored or logged.
 *  - Request and response bodies are NEVER included. Only dimensions
 *    (language, bytes_out, duration_ms, status, cold_start).
 */

export interface WorkerLogEntry {
  ipHash: string;
  language: string;
  bytesOut: number;
  durationMs: number;
  status: number;
  coldStart: boolean;
}

/** Keys that would indicate a caller passed raw PII instead of the hash. */
const FORBIDDEN_KEYS = ['ip', 'remoteIp', 'cfConnectingIp', 'body', 'files', 'content'];

export function logRequest(entry: WorkerLogEntry): void {
  // Defensive: if a caller passed an unexpected field (e.g. typed as never
  // and cast-through), refuse to log rather than risk leaking PII.
  for (const forbidden of FORBIDDEN_KEYS) {
    if ((entry as unknown as Record<string, unknown>)[forbidden] !== undefined) {
      // Emit a stderr note but NOT the payload — the whole point is not to
      // leak the sensitive field. The note itself is free of user data.
      // eslint-disable-next-line no-console
      console.error('[log] refused to emit entry with forbidden field');
      return;
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      ts: Date.now(),
      ip_hash: entry.ipHash,
      language: entry.language,
      bytes_out: entry.bytesOut,
      duration_ms: entry.durationMs,
      status: entry.status,
      cold_start: entry.coldStart
    })
  );
}
