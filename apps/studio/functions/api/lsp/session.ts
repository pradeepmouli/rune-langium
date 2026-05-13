// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * POST /api/lsp/session — mint a signed session token.
 *
 * Extracted from apps/lsp-worker/src/index.ts (handleSessionMint).
 * Runs as a Cloudflare Pages Function on the studio deployment so the
 * same Cloudflare Pages origin can serve the session-mint API without
 * a separate Worker deployment.
 *
 * Auth + token layer lives in ../../lib/lsp-auth.ts (Task 1.1 of plan 019).
 * Logging lives in ../../lib/lsp-log.ts (Task 1.2 of plan 019).
 */

import { z } from 'zod';
import {
  signSessionToken,
  isOriginAllowed,
  checkSessionRateLimit,
  newNonceHex,
  type SessionTokenPayload
} from '../../lib/lsp-auth.js';
import { logRequest } from '../../lib/lsp-log.js';

export interface Env {
  LSP_SESSION: DurableObjectNamespace;
  ALLOWED_ORIGIN: string;
  /** HMAC-SHA256 secret for session token signing. Set via `wrangler secret put`. */
  SESSION_SIGNING_KEY?: string;
  /** Unused by this route but present in the full env shape. */
  SESSION_RATE_LIMIT_KV?: KVNamespace;
}

// ────────────────────────────────────────────────────────────────────────────
// Schemas
// ────────────────────────────────────────────────────────────────────────────

const SessionRequestBody = z
  .object({
    // Crockford ULID — 26 chars, no I, L, O, U.
    workspaceId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  })
  .strict();

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// ────────────────────────────────────────────────────────────────────────────
// Pages Function handler
// ────────────────────────────────────────────────────────────────────────────

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const startedAt = Date.now();
  const origin = request.headers.get('Origin');
  const ip = request.headers.get('cf-connecting-ip') ?? '0.0.0.0';

  if (!isOriginAllowed(origin, env.ALLOWED_ORIGIN)) {
    const res = jsonResponse(403, { error: 'origin_not_allowed' });
    logRequest({
      route: '/api/lsp/session',
      status: 403,
      durationMs: Date.now() - startedAt,
      errorCategory: 'origin_not_allowed'
    });
    return res;
  }

  const rl = checkSessionRateLimit(ip);
  if (!rl.allowed) {
    const res = jsonResponse(429, { error: 'rate_limited', retry_after_s: rl.retryAfterS });
    logRequest({
      route: '/api/lsp/session',
      status: 429,
      durationMs: Date.now() - startedAt,
      errorCategory: 'rate_limited'
    });
    return res;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    const res = jsonResponse(400, { error: 'schema_violation', details: 'malformed_json' });
    logRequest({
      route: '/api/lsp/session',
      status: 400,
      durationMs: Date.now() - startedAt,
      errorCategory: 'schema_violation'
    });
    return res;
  }

  const parsed = SessionRequestBody.safeParse(raw);
  if (!parsed.success) {
    const res = jsonResponse(400, { error: 'schema_violation', details: parsed.error.issues });
    logRequest({
      route: '/api/lsp/session',
      status: 400,
      durationMs: Date.now() - startedAt,
      errorCategory: 'schema_violation'
    });
    return res;
  }

  if (!env.SESSION_SIGNING_KEY) {
    const res = jsonResponse(500, { error: 'signing_key_not_configured' });
    logRequest({
      route: '/api/lsp/session',
      status: 500,
      durationMs: Date.now() - startedAt,
      errorCategory: 'signing_key_not_configured'
    });
    return res;
  }

  const issuedAt = Date.now();
  const exp = issuedAt + TOKEN_TTL_MS;
  const payload: SessionTokenPayload = {
    v: 1,
    workspaceId: parsed.data.workspaceId,
    issuedAt,
    exp,
    origin: origin!,
    nonce: newNonceHex()
  };

  const token = await signSessionToken(env.SESSION_SIGNING_KEY, payload);
  const res = jsonResponse(200, { token, expiresAt: exp });
  logRequest({ route: '/api/lsp/session', status: 200, durationMs: Date.now() - startedAt });
  return res;
};
