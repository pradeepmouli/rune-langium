// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Codegen Worker entry (T018 — full orchestration).
 *
 * POST /api/generate pipeline:
 *   1. Parse body
 *   2. If session cookie present & valid → skip Turnstile
 *      Else require X-Turnstile-Token → verify → on success issue cookie
 *   3. Rate-limit check via RATE_LIMITER DO (keyed on cf-connecting-ip)
 *   4. Dispatch to CODEGEN container binding
 *   5. Return response; Set-Cookie only on first-gen (token consumed)
 *
 * GET /api/generate/health is a stub that just forwards to the container —
 * T024 adds cold_start_likely heuristics + KV-cached fallback.
 */

import type { WorkerEnv } from './types.js';
import { RateLimiter } from './rate-limit.js';
import { verifyTurnstile } from './turnstile.js';
import { logRequest } from './log.js';
import {
  buildSessionCookie,
  computeIpHash,
  signSessionJwt,
  todayAsSalt,
  verifySessionJwt
} from './session.js';

export { RateLimiter };

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;
const EXPECTED_HOSTNAME = 'www.daikonic.dev';
const SESSION_ACTION = 'export-code';
const MAX_BODY_BYTES = 4 * 1024 * 1024;

function json(status: number, body: unknown, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders }
  });
}

function normalizePath(pathname: string): string {
  return pathname.replace(/^\/rune-studio/, '');
}

export async function handleRequest(req: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(req.url);
  const path = normalizePath(url.pathname);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  if (path === '/api/generate/health') {
    if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' });
    return handleHealth(env);
  }

  if (path === '/api/generate') {
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    return handleGenerate(req, env);
  }

  return json(404, { error: 'not_found' });
}

const COLD_START_THRESHOLD_MS = 3000;
const LANG_CACHE_TTL_SECONDS = 3600;
const LANG_CACHE_KEY = 'languages';

async function handleHealth(env: WorkerEnv): Promise<Response> {
  const start = Date.now();
  try {
    const upstream = await env.CODEGEN.fetch(
      new Request('http://codegen/api/generate/health', { method: 'GET' })
    );
    const elapsedMs = Date.now() - start;
    if (!upstream.ok) throw new Error(`upstream_http_${upstream.status}`);

    const payload = (await upstream.json()) as {
      status?: string;
      languages?: string[];
      cold_start_likely?: boolean;
    };
    const languages = payload.languages ?? [];

    // Cache the language list for fallback on future cold starts.
    // Fire-and-forget: cache write failure MUST NOT fail the health probe.
    if (languages.length > 0) {
      env.LANG_CACHE.put(LANG_CACHE_KEY, JSON.stringify(languages), {
        expirationTtl: LANG_CACHE_TTL_SECONDS
      }).catch(() => void 0);
    }

    return json(200, {
      status: 'ok',
      cold_start_likely: payload.cold_start_likely ?? elapsedMs >= COLD_START_THRESHOLD_MS,
      languages
    });
  } catch (_err) {
    // Container failed. Try to serve cached languages so the Studio picker
    // isn't empty; if cache is also empty, surface 503.
    const cached = await readCachedLanguages(env);
    if (cached && cached.length > 0) {
      return json(200, {
        status: 'ok',
        cold_start_likely: true,
        languages: cached
      });
    }
    return json(503, {
      status: 'unavailable',
      message: 'The code generation service is temporarily unavailable.'
    });
  }
}

async function readCachedLanguages(env: WorkerEnv): Promise<string[] | null> {
  try {
    const raw = await env.LANG_CACHE.get(LANG_CACHE_KEY, 'json');
    if (Array.isArray(raw)) return raw as string[];
    if (typeof raw === 'string') return JSON.parse(raw) as string[];
    return null;
  } catch {
    return null;
  }
}

async function handleGenerate(req: Request, env: WorkerEnv): Promise<Response> {
  const requestStartMs = Date.now();
  // Accept cf-connecting-ip (real CF), fall back to an RFC-5737 TEST-NET-3 address
  // when the header isn't present (test/dev). Never 0.0.0.0 — that's special.
  const remoteIp = req.headers.get('cf-connecting-ip') ?? '203.0.113.1';
  const dailySalt = todayAsSalt();
  const ipHash = await computeIpHash(remoteIp, dailySalt);

  // --- Step 1: auth (session cookie OR Turnstile token) ---
  let sessionValid = false;
  let issuedCookie: string | undefined;

  const cookieHeader = req.headers.get('Cookie');
  const existingJwt = extractSessionJwt(cookieHeader);
  if (existingJwt) {
    const verified = await verifySessionJwt({
      jwt: existingJwt,
      key: env.SESSION_SIGNING_KEY,
      expectedIpHash: ipHash,
      expectedAction: SESSION_ACTION
    });
    sessionValid = verified.valid;
  }

  if (!sessionValid) {
    const token = req.headers.get('X-Turnstile-Token');
    if (!token) {
      return json(401, {
        error: 'turnstile_required',
        message: 'Please complete the verification challenge.'
      });
    }
    const result = await verifyTurnstile({
      token,
      secret: env.TURNSTILE_SECRET,
      expectedHostname: EXPECTED_HOSTNAME,
      remoteIp
    });
    if (!result.valid) {
      return json(401, {
        error: 'turnstile_required',
        message: 'Please complete the verification challenge.'
      });
    }
    // Mint a fresh session cookie.
    const jwt = await signSessionJwt({
      key: env.SESSION_SIGNING_KEY,
      ipHash,
      action: SESSION_ACTION
    });
    issuedCookie = buildSessionCookie(jwt);
  }

  // --- Step 2: rate limit (DO keyed on IP) ---
  const doStub = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(remoteIp));
  let rlResult: {
    allowed: boolean;
    remaining_hour: number;
    remaining_day: number;
    retry_after_s: number;
    scope_tripped: 'hour' | 'day' | null;
  };
  try {
    const rlRes = await doStub.fetch(new Request('http://do/check', { method: 'POST' }));
    rlResult = (await rlRes.json()) as typeof rlResult;
  } catch (_err) {
    // If the DO itself is broken, fail closed (treat as denied) — better to
    // over-reject than to let abuse through.
    return json(503, { error: 'rate_limiter_unavailable' });
  }

  if (!rlResult.allowed) {
    return json(
      429,
      {
        error: 'rate_limited',
        scope: rlResult.scope_tripped,
        limit: rlResult.scope_tripped === 'hour' ? 10 : 100,
        remaining_hour: rlResult.remaining_hour,
        remaining_day: rlResult.remaining_day,
        retry_after_s: rlResult.retry_after_s,
        message:
          rlResult.scope_tripped === 'hour'
            ? `You've hit the free-tier limit (10/hour). Try again in ${Math.ceil(rlResult.retry_after_s / 60)} minutes, or run Studio locally for unlimited generation.`
            : `You've hit the daily limit (100/day). Try again tomorrow or run Studio locally.`
      },
      { 'Retry-After': String(rlResult.retry_after_s) }
    );
  }

  // --- Step 3: body parse ---
  let rawBody: string;
  try {
    rawBody = await readBounded(req);
  } catch (err) {
    const status = err instanceof RangeError ? 413 : 400;
    const code = err instanceof RangeError ? 'payload_too_large' : 'bad_json';
    return json(status, { error: code });
  }
  // Sanity-check JSON parses (container will re-parse, but we want a fast 400).
  try {
    JSON.parse(rawBody);
  } catch {
    return json(400, { error: 'bad_json' });
  }

  // --- Step 4: container dispatch, with one retry on transient failure ---
  const upstream = await dispatchWithRetry(env, rawBody);
  if (!upstream) {
    return json(
      502,
      {
        error: 'upstream_failure',
        message: 'The codegen service is temporarily unavailable.',
        retryable: true
      },
      issuedCookie ? { 'Set-Cookie': issuedCookie } : undefined
    );
  }

  const upstreamBody = await upstream.text();
  const extraHeaders: Record<string, string> = {};
  if (issuedCookie) extraHeaders['Set-Cookie'] = issuedCookie;

  // Emit a single structured log line per request. Never includes
  // the request or response body — only dimensions.
  try {
    const requestLanguage = extractLanguage(rawBody);
    logRequest({
      ipHash,
      language: requestLanguage,
      bytesOut: upstreamBody.length,
      durationMs: Date.now() - requestStartMs,
      status: upstream.status,
      coldStart: false
    });
  } catch {
    // Logging must never break the response path.
  }

  return new Response(upstreamBody, {
    status: upstream.status,
    headers: { ...JSON_HEADERS, ...extraHeaders }
  });
}

/** Safely extract request.language for logging without echoing the body. */
function extractLanguage(rawBody: string): string {
  try {
    const parsed = JSON.parse(rawBody) as { language?: unknown };
    return typeof parsed.language === 'string' ? parsed.language : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Attempt the container fetch up to twice. Retries on thrown errors and on
 * 5xx responses. 2xx and 4xx (including 422 parse errors) pass through
 * unchanged on the first call — those are not transient. Returns null when
 * both attempts fail so the caller can surface 502 upstream_failure.
 */
async function dispatchWithRetry(env: WorkerEnv, rawBody: string): Promise<Response | null> {
  const BASE_DELAY_MS = 200;
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const upstream = await env.CODEGEN.fetch(
        new Request('http://codegen/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: rawBody
        })
      );
      if (upstream.status >= 500) {
        lastError = new Error(`container_${upstream.status}`);
        if (attempt === 0) {
          await sleep(BASE_DELAY_MS);
          continue;
        }
        return null;
      }
      return upstream;
    } catch (err) {
      lastError = err;
      if (attempt === 0) {
        await sleep(BASE_DELAY_MS);
        continue;
      }
      return null;
    }
  }
  void lastError;
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readBounded(req: Request): Promise<string> {
  // A Request.text() doesn't enforce length; we wrap with a byte cap via
  // the arrayBuffer then decode.
  const buf = await req.arrayBuffer();
  if (buf.byteLength > MAX_BODY_BYTES) {
    throw new RangeError('body_too_large');
  }
  return new TextDecoder().decode(buf);
}

function extractSessionJwt(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith('hcsession=')) {
      return trimmed.slice('hcsession='.length);
    }
  }
  return null;
}

export default {
  fetch: handleRequest
};
