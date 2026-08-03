// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { withInstrumentation, Capture } from '../../src/services/instrumentation/core.js';

/**
 * Auth + token layer for the LSP Worker (T040).
 *
 * Responsibilities:
 *  - HMAC-SHA256 signing/verification of session tokens (data-model §2)
 *  - Origin allowlist check (mirrors apps/telemetry-worker)
 *  - Per-isolate nonce ring buffer for replay protection (24h-bounded)
 *  - Per-IP rate limit for the session-mint endpoint (30 mints/min/IP)
 *
 * The session token wire format is:
 *   `${base64url(JSON(SessionTokenPayload))}.${base64url(HMAC-SHA256)}`
 *
 * Both halves are base64url-encoded so the token can ride in the WS path
 * `/api/lsp/ws/<token>` without URL-escaping. The HMAC covers the JSON
 * payload bytes (NOT the JSON string), so re-serialising the same payload
 * with different key ordering would NOT verify — the signature is over
 * exactly the bytes the client received.
 */

// ────────────────────────────────────────────────────────────────────────────
// Session token shape (data-model §2)
// ────────────────────────────────────────────────────────────────────────────

export interface SessionTokenPayload {
  v: 1;
  /** Opaque ULID — closed schema validated at mint-time. */
  workspaceId: string;
  /** ms epoch */
  issuedAt: number;
  /** ms epoch — default issuedAt + 24h */
  exp: number;
  /** Expected request Origin header. */
  origin: string;
  /** 16 random bytes hex; replay-protected per isolate. */
  nonce: string;
}

export type VerifyResult =
  | { ok: true; token: SessionTokenPayload }
  | { ok: false; reason: 'invalid_signature' | 'expired' | 'malformed' };

// ────────────────────────────────────────────────────────────────────────────
// Base64url helpers
// ────────────────────────────────────────────────────────────────────────────

function bufToBase64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesEqualConstantTime(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

// ────────────────────────────────────────────────────────────────────────────
// HMAC-SHA256
// ────────────────────────────────────────────────────────────────────────────

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify'
  ]);
}

async function hmacSign(secret: string, data: Uint8Array): Promise<Uint8Array> {
  const key = await importKey(secret);
  // CryptoKey.sign expects BufferSource. Pass the typed array directly —
  // `Uint8Array` is a `BufferSource` and avoids the `SharedArrayBuffer`
  // narrowing issue on `.buffer` under `--lib ES2023`.
  const sig = await crypto.subtle.sign('HMAC', key, data as BufferSource);
  return new Uint8Array(sig);
}

// ────────────────────────────────────────────────────────────────────────────
// Sign / verify session tokens
// ────────────────────────────────────────────────────────────────────────────

export const signSessionToken = withInstrumentation(
  async function signSessionToken(secret: string, payload: SessionTokenPayload): Promise<string> {
    const json = JSON.stringify(payload);
    const payloadBytes = new TextEncoder().encode(json);
    const sig = await hmacSign(secret, payloadBytes);
    return `${bufToBase64Url(payloadBytes)}.${bufToBase64Url(sig)}`;
    // `secret` is the HMAC signing key — a literal credential, never captured.
    // `payload`/output token carry session data; conservative default (whole
    // function deals in security-critical material) — capture:0.
  },
  { op: 'signSessionToken' }
);

export const verifySessionToken = withInstrumentation(
  async function verifySessionToken(secret: string, token: string, now = Date.now()): Promise<VerifyResult> {
    const parts = token.split('.');
    if (parts.length !== 2) return { ok: false, reason: 'malformed' };
    const [payloadB64, sigB64] = parts as [string, string];

    let payloadBytes: Uint8Array;
    let providedSig: Uint8Array;
    try {
      payloadBytes = base64UrlToBytes(payloadB64);
      providedSig = base64UrlToBytes(sigB64);
    } catch {
      return { ok: false, reason: 'malformed' };
    }

    const expected = await hmacSign(secret, payloadBytes);
    if (!bytesEqualConstantTime(expected, providedSig)) {
      return { ok: false, reason: 'invalid_signature' };
    }

    let payload: SessionTokenPayload;
    try {
      const json = new TextDecoder().decode(payloadBytes);
      payload = JSON.parse(json) as SessionTokenPayload;
    } catch {
      return { ok: false, reason: 'malformed' };
    }

    if (
      typeof payload !== 'object' ||
      payload === null ||
      payload.v !== 1 ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.issuedAt !== 'number' ||
      typeof payload.exp !== 'number' ||
      typeof payload.origin !== 'string' ||
      typeof payload.nonce !== 'string'
    ) {
      return { ok: false, reason: 'malformed' };
    }

    if (payload.exp <= now) return { ok: false, reason: 'expired' };

    return { ok: true, token: payload };
    // `secret`/`token` are credential-adjacent — never captured. Output's
    // `ok`/`reason` discriminant is a safe enum; the decoded session payload
    // (workspaceId/origin/nonce) on success is dropped.
  },
  {
    op: 'verifySessionToken',
    capture: Capture.Output,
    sanitize: (value, which) =>
      which === 'output' ? { ok: (value as VerifyResult).ok, reason: (value as { reason?: string }).reason } : undefined
  }
);

// ────────────────────────────────────────────────────────────────────────────
// Origin allowlist
// ────────────────────────────────────────────────────────────────────────────

export const isOriginAllowed = withInstrumentation(
  function isOriginAllowed(origin: string | null, allowed: string): boolean {
    if (!origin) return false;
    if (allowed === '*') return true;
    return allowed
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .some((pattern) => matchesOriginPattern(origin, pattern));
    // `origin` (a request Origin header URL) and `allowed` (app config) are
    // both safe — neither is user/model content.
  },
  { op: 'isOriginAllowed', capture: Capture.Input | Capture.Output, sanitize: (value) => value }
);

function matchesOriginPattern(origin: string, pattern: string): boolean {
  if (pattern === origin) return true;
  // Wildcard form: protocol + "*." + suffix. Compare suffix only.
  const wildcardPrefixMatch = pattern.match(/^([a-z]+:\/\/)\*\.(.+)$/);
  if (!wildcardPrefixMatch) return false;
  const [, scheme, suffix] = wildcardPrefixMatch;
  if (!origin.startsWith(scheme!)) return false;
  const host = origin.slice(scheme!.length);
  // Require an actual subdomain — `*.example.com` must NOT match `example.com`.
  return host.endsWith(`.${suffix}`) && host !== suffix;
}

// ────────────────────────────────────────────────────────────────────────────
// Nonce replay protection (per-isolate ring buffer)
// ────────────────────────────────────────────────────────────────────────────
//
// Map<nonce, expiresAtMs> — entries past the 24h horizon are evicted on
// every check. LRU at 50k entries (data-model §2). CF runs many isolates
// so this is a soft per-isolate guard, accepting cross-isolate collisions
// as low-risk for 24h-bounded short-lived tokens.

const NONCE_MAX_ENTRIES = 50_000;
const NONCE_TTL_MS = 24 * 60 * 60 * 1000;

const nonceRing = new Map<string, number>();

export const checkAndRecordNonce = withInstrumentation(
  function checkAndRecordNonce(nonce: string, now = Date.now()): boolean {
    evictExpiredNonces(now);
    const existing = nonceRing.get(nonce);
    if (existing !== undefined && existing > now) {
      return false;
    }
    nonceRing.set(nonce, now + NONCE_TTL_MS);
    enforceLruBound();
    return true;
    // `nonce` is a security replay-protection value — never captured raw.
  },
  {
    op: 'checkAndRecordNonce',
    capture: Capture.Output,
    sanitize: (value, which) => (which === 'output' ? value : undefined)
  }
);

export const hasSeenNonce = withInstrumentation(
  function hasSeenNonce(nonce: string, now = Date.now()): boolean {
    const existing = nonceRing.get(nonce);
    return existing !== undefined && existing > now;
  },
  { op: 'hasSeenNonce', capture: Capture.Output, sanitize: (value, which) => (which === 'output' ? value : undefined) }
);

function evictExpiredNonces(now: number): void {
  // Cheap path: only sweep when the Map is large enough to matter.
  if (nonceRing.size < 1024) {
    return;
  }
  for (const [k, v] of nonceRing) {
    if (v <= now) nonceRing.delete(k);
  }
}

function enforceLruBound(): void {
  if (nonceRing.size <= NONCE_MAX_ENTRIES) return;
  // Map preserves insertion order — drop the oldest until back under limit.
  const toDrop = nonceRing.size - NONCE_MAX_ENTRIES;
  let dropped = 0;
  for (const k of nonceRing.keys()) {
    if (dropped >= toDrop) break;
    nonceRing.delete(k);
    dropped++;
  }
}

export const _resetNonceRingForTesting = withInstrumentation(
  function _resetNonceRingForTesting(): void {
    nonceRing.clear();
  },
  { op: '_resetNonceRingForTesting' }
);

// ────────────────────────────────────────────────────────────────────────────
// Per-IP rate limit for session mint (30/min/IP)
// ────────────────────────────────────────────────────────────────────────────

const SESSION_RATE_LIMIT = 30;
const SESSION_WINDOW_MS = 60_000;

interface RateWindow {
  windowStart: number;
  count: number;
}

const sessionRateWindows = new Map<string, RateWindow>();

export const checkSessionRateLimit = withInstrumentation(
  function checkSessionRateLimit(ip: string, now = Date.now()): { allowed: boolean; retryAfterS: number } {
    evictExpiredRateWindows(now);
    const w = sessionRateWindows.get(ip);
    if (!w || now - w.windowStart >= SESSION_WINDOW_MS) {
      sessionRateWindows.set(ip, { windowStart: now, count: 1 });
      return { allowed: true, retryAfterS: 0 };
    }
    if (w.count >= SESSION_RATE_LIMIT) {
      const retryAfterS = Math.max(1, Math.ceil((w.windowStart + SESSION_WINDOW_MS - now) / 1000));
      return { allowed: false, retryAfterS };
    }
    w.count += 1;
    return { allowed: true, retryAfterS: 0 };
    // `ip` is the client's IP address — PII, never captured. Output
    // `allowed`/`retryAfterS` are safe.
  },
  {
    op: 'checkSessionRateLimit',
    capture: Capture.Output,
    sanitize: (value, which) => (which === 'output' ? value : undefined)
  }
);

function evictExpiredRateWindows(now: number): void {
  if (sessionRateWindows.size < 1024) return;
  for (const [ip, w] of sessionRateWindows) {
    if (now - w.windowStart >= SESSION_WINDOW_MS) sessionRateWindows.delete(ip);
  }
}

export const _resetSessionRateLimitForTesting = withInstrumentation(
  function _resetSessionRateLimitForTesting(): void {
    sessionRateWindows.clear();
  },
  { op: '_resetSessionRateLimitForTesting' }
);

// ────────────────────────────────────────────────────────────────────────────
// Random nonce / signing-key helpers
// ────────────────────────────────────────────────────────────────────────────

export const newNonceHex = withInstrumentation(
  function newNonceHex(): string {
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    return Array.from(buf)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    // Output is freshly generated cryptographic randomness used as a security
    // nonce — conservative default, not captured.
  },
  { op: 'newNonceHex' }
);
