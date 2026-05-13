// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * GET /api/lsp/ws/[token] — WebSocket upgrade → Durable Object forward.
 *
 * Adapted from apps/lsp-worker/src/index.ts (handleWsUpgrade).
 * Runs as a Cloudflare Pages Function on the studio deployment.
 *
 * Check order (mirrors the original):
 *   1. Origin allowlist  → 403
 *   2. Upgrade header    → 426
 *   3. SESSION_SIGNING_KEY present → 500
 *   4. verifySessionToken → 401 (invalid_signature / expired / malformed)
 *   5. Token origin pin   → 401 (origin_mismatch)
 *   6. Nonce replay       → 409 (nonce_replay)
 *   7. Forward to DO       → 101
 *
 * Re-exports RuneLspSession so wrangler's
 * `[[durable_objects.bindings]] class_name = "RuneLspSession"` can resolve
 * it from this module (Task 1.7 adds the binding to wrangler.toml).
 */

import { verifySessionToken, isOriginAllowed, checkAndRecordNonce } from '../../../lib/lsp-auth.js';
import { logRequest } from '../../../lib/lsp-log.js';
import { RuneLspSession } from '../../../lib/lsp-session-do.js';

// Re-export so wrangler's `[[durable_objects.bindings]]` binding can resolve
// `class_name = "RuneLspSession"`. (Task 1.7 will add the binding to wrangler.toml.)
export { RuneLspSession };

export interface Env {
  LSP_SESSION: DurableObjectNamespace;
  ALLOWED_ORIGIN: string;
  /** HMAC-SHA256 secret for session token signing. Set via `wrangler secret put`. */
  SESSION_SIGNING_KEY?: string;
  /** Optional KV namespace; present in the shared env shape but unused on this route. */
  SESSION_RATE_LIMIT_KV?: KVNamespace;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Pages Function handler
// ────────────────────────────────────────────────────────────────────────────

export const onRequestGet: PagesFunction<Env, 'token'> = async ({ request, env, params }) => {
  const startedAt = Date.now();
  const origin = request.headers.get('Origin');
  const upgrade = request.headers.get('Upgrade');

  // 1. Origin allowlist — mirrors lsp-worker handleWsUpgrade check order
  if (!isOriginAllowed(origin, env.ALLOWED_ORIGIN)) {
    const res = jsonResponse(403, { error: 'origin_not_allowed' });
    logRequest({
      route: '/api/lsp/ws',
      status: 403,
      durationMs: Date.now() - startedAt,
      errorCategory: 'origin_not_allowed'
    });
    return res;
  }

  // 2. Upgrade header check
  if (upgrade !== 'websocket') {
    const res = jsonResponse(426, { error: 'upgrade_required' });
    logRequest({
      route: '/api/lsp/ws',
      status: 426,
      durationMs: Date.now() - startedAt,
      errorCategory: 'upgrade_required'
    });
    return res;
  }

  // 3. Signing key configured
  if (!env.SESSION_SIGNING_KEY) {
    const res = jsonResponse(500, { error: 'signing_key_not_configured' });
    logRequest({
      route: '/api/lsp/ws',
      status: 500,
      durationMs: Date.now() - startedAt,
      errorCategory: 'signing_key_not_configured'
    });
    return res;
  }

  const token = String(params.token ?? '');

  // 4. Verify session token (HMAC + expiry)
  const verified = await verifySessionToken(env.SESSION_SIGNING_KEY, token);
  if (!verified.ok) {
    const res = jsonResponse(401, { error: 'invalid_session', reason: verified.reason });
    logRequest({
      route: '/api/lsp/ws',
      status: 401,
      durationMs: Date.now() - startedAt,
      errorCategory: 'invalid_session'
    });
    return res;
  }

  // 5. Token origin pin — token origin MUST match the request Origin header.
  //    Blocks stolen tokens from being replayed by a rogue (but allowlisted) origin.
  if (verified.token.origin !== origin) {
    const res = jsonResponse(401, { error: 'invalid_session', reason: 'origin_mismatch' });
    logRequest({
      route: '/api/lsp/ws',
      status: 401,
      durationMs: Date.now() - startedAt,
      errorCategory: 'invalid_session'
    });
    return res;
  }

  // 6. Nonce replay protection (per-isolate ring buffer)
  if (!checkAndRecordNonce(verified.token.nonce)) {
    const res = jsonResponse(409, { error: 'nonce_replay' });
    logRequest({
      route: '/api/lsp/ws',
      status: 409,
      durationMs: Date.now() - startedAt,
      errorCategory: 'nonce_replay'
    });
    return res;
  }

  // 7. Forward upgrade request to the per-workspace Durable Object.
  //    DO identity = workspaceId (one DO per workspace; multi-tab shares same DO).
  const id = env.LSP_SESSION.idFromName(verified.token.workspaceId);
  const stub = env.LSP_SESSION.get(id);

  const doResponse = await stub.fetch(request);
  logRequest({
    route: '/api/lsp/ws',
    status: doResponse.status,
    durationMs: Date.now() - startedAt
  });

  return doResponse;
};
