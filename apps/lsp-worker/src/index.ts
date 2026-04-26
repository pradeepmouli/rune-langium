// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * LSP Worker entry (T039).
 *
 * Routes (per `specs/014-studio-prod-ready/contracts/lsp-worker.md`):
 *
 *   POST /rune-studio/api/lsp/session   — mint HMAC-signed session token
 *   GET  /rune-studio/api/lsp/health    — reachability + langium-load probe
 *   WS   /rune-studio/api/lsp/ws/<tok>  — upgrade + forward to RuneLspSession DO
 *
 * The auth + token layer (HMAC, origin allowlist, nonce ring, mint
 * rate-limit) lives in `./auth.ts` (T040). The DO holding langium services
 * + per-document state lives in `./session.ts` (T041).
 *
 * The DO class is re-exported from this module so wrangler's
 * `[[durable_objects.bindings]] class_name = "RuneLspSession"` can resolve it.
 */

import { z } from 'zod';
import {
  signSessionToken,
  verifySessionToken,
  isOriginAllowed,
  checkAndRecordNonce,
  checkSessionRateLimit,
  newNonceHex,
  type SessionTokenPayload
} from './auth.js';
import { logRequest } from './log.js';
import { RuneLspSession } from './session.js';

export { RuneLspSession };

export interface Env {
  LSP_SESSION: DurableObjectNamespace;
  ALLOWED_ORIGIN: string;
  /** HMAC-SHA256 secret for session token signing. Set via `wrangler secret put`. */
  SESSION_SIGNING_KEY?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Eager-load probe (mirrors the spike's pattern at scratch/lsp-spike/src/index.ts)
// ────────────────────────────────────────────────────────────────────────────
//
// Touch the langium import at module-eval time so /health knows whether
// langium loaded at all, BEFORE any request arrives. If the import graph
// fails to resolve, the worker fails to instantiate and CF surfaces the
// error — but if it imports successfully and the symbol is present, we
// flip `LANGIUM_LOADED = true` so the health probe can confirm.

let LANGIUM_LOADED = false;
let LANGIUM_LOAD_ERROR: string | null = null;
try {
  // We don't *call* createRuneLspServer() here — that allocates the langium
  // service container which we do per-DO-message. We only assert the symbol
  // resolved.
  // Dynamic-style require would defeat tree-shake, but a static import does
  // the right thing and the catch handles any runtime-time TypeError.
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const { createRuneLspServer } = await import('@rune-langium/lsp-server');
  if (typeof createRuneLspServer !== 'function') {
    throw new TypeError('createRuneLspServer is not a function');
  }
  LANGIUM_LOADED = true;
} catch (err) {
  LANGIUM_LOAD_ERROR = err instanceof Error ? err.message : String(err);
}

const STARTUP_MS = Date.now();
const WORKER_VERSION = '0.1.0';

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
// Route handlers
// ────────────────────────────────────────────────────────────────────────────

async function handleHealth(): Promise<Response> {
  return jsonResponse(200, {
    ok: true,
    version: WORKER_VERSION,
    langium_loaded: LANGIUM_LOADED,
    ...(LANGIUM_LOAD_ERROR ? { load_error: LANGIUM_LOAD_ERROR } : {}),
    uptime_seconds: Math.max(0, Math.floor((Date.now() - STARTUP_MS) / 1000))
  });
}

async function handleSessionMint(req: Request, env: Env): Promise<Response> {
  const origin = req.headers.get('Origin');
  const ip = req.headers.get('cf-connecting-ip') ?? '0.0.0.0';

  if (!isOriginAllowed(origin, env.ALLOWED_ORIGIN)) {
    return jsonResponse(403, { error: 'origin_not_allowed' });
  }

  const rl = checkSessionRateLimit(ip);
  if (!rl.allowed) {
    return jsonResponse(429, { error: 'rate_limited', retry_after_s: rl.retryAfterS });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse(400, { error: 'schema_violation', details: 'malformed_json' });
  }
  const parsed = SessionRequestBody.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse(400, { error: 'schema_violation', details: parsed.error.issues });
  }

  if (!env.SESSION_SIGNING_KEY) {
    return jsonResponse(500, { error: 'signing_key_not_configured' });
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
  return jsonResponse(200, { token, expiresAt: exp });
}

async function handleWsUpgrade(req: Request, env: Env, token: string): Promise<Response> {
  const origin = req.headers.get('Origin');
  const upgrade = req.headers.get('Upgrade');

  if (!isOriginAllowed(origin, env.ALLOWED_ORIGIN)) {
    return jsonResponse(403, { error: 'origin_not_allowed' });
  }
  if (upgrade !== 'websocket') {
    return jsonResponse(426, { error: 'upgrade_required' });
  }
  if (!env.SESSION_SIGNING_KEY) {
    return jsonResponse(500, { error: 'signing_key_not_configured' });
  }

  const verified = await verifySessionToken(env.SESSION_SIGNING_KEY, token);
  if (!verified.ok) {
    return jsonResponse(401, { error: 'invalid_session', reason: verified.reason });
  }

  // Token's origin claim MUST match the request's Origin header — token
  // origin pinning blocks a stolen token from being replayed by a rogue
  // origin even if that origin is on the allowlist.
  if (verified.token.origin !== origin) {
    return jsonResponse(401, { error: 'invalid_session', reason: 'origin_mismatch' });
  }

  // Replay protection — the per-isolate nonce ring rejects any nonce
  // it has seen within the 24h horizon.
  if (!checkAndRecordNonce(verified.token.nonce)) {
    return jsonResponse(409, { error: 'nonce_replay' });
  }

  // Forward to the per-workspace DO. Identity = `<sessionToken>:<workspaceId>`
  // per data-model §1; using just workspaceId for now keeps multi-tab on
  // the same DO (simpler), and the existing studio multi-tab broadcast
  // arbitrates within. Token is presented downstream as-is.
  const id = env.LSP_SESSION.idFromName(verified.token.workspaceId);
  const stub = env.LSP_SESSION.get(id);
  return stub.fetch(req);
}

// ────────────────────────────────────────────────────────────────────────────
// Entry
// ────────────────────────────────────────────────────────────────────────────

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const startedAt = Date.now();
    const url = new URL(req.url);
    let route = url.pathname;
    let res: Response;

    try {
      if (url.pathname.endsWith('/api/lsp/health') && req.method === 'GET') {
        route = '/api/lsp/health';
        res = await handleHealth();
      } else if (url.pathname.endsWith('/api/lsp/session') && req.method === 'POST') {
        route = '/api/lsp/session';
        res = await handleSessionMint(req, env);
      } else {
        const wsMatch = url.pathname.match(/\/api\/lsp\/ws\/([^/?#]+)/);
        if (wsMatch && req.method === 'GET') {
          route = '/api/lsp/ws';
          const tok = wsMatch[1] ?? '';
          res = await handleWsUpgrade(req, env, tok);
        } else {
          res = jsonResponse(404, { error: 'not_found' });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res = jsonResponse(500, { error: 'internal_error', detail: msg });
    }

    // Best-effort log; never throws back into the response path.
    try {
      const errorCategory = res.status >= 400 ? await peekErrorCategory(res.clone()) : undefined;
      logRequest({
        route,
        status: res.status,
        durationMs: Date.now() - startedAt,
        ...(errorCategory ? { errorCategory } : {})
      });
    } catch {
      /* ignore */
    }
    return res;
  }
};

/**
 * Best-effort extraction of the documented error code from a JSON body
 * (e.g. `invalid_session`, `nonce_replay`). Returns undefined for non-JSON
 * or non-error responses.
 */
async function peekErrorCategory(res: Response): Promise<string | undefined> {
  if (!res.headers.get('Content-Type')?.includes('application/json')) return undefined;
  try {
    const body = (await res.json()) as { error?: unknown };
    return typeof body.error === 'string' ? body.error : undefined;
  } catch {
    return undefined;
  }
}
