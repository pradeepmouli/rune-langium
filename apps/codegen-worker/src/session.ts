// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Session cookie JWT (T016).
 *
 * Per contracts/turnstile-flow.md:
 *   Cookie: hcsession=<jwt>; Path=/rune-studio/api; HttpOnly; Secure;
 *           SameSite=Strict; Max-Age=3600
 *   JWT claims: { iat, exp, action, iph }
 *   - iat/exp: unix seconds; exp = iat + 3600
 *   - action: must match on verify (fixed "export-code" for this feature)
 *   - iph: sha256 hex of (ip + daily_salt); rotates daily, invalidates on
 *     IP change — forces a re-challenge when the client migrates networks
 *
 * Signed with HS256 via SubtleCrypto. No external deps.
 */

const JWT_TTL_SECONDS = 3600;
const COOKIE_NAME = 'hcsession';
const COOKIE_PATH = '/rune-studio/api';

export interface SignSessionJwtOptions {
  key: string;
  ipHash: string;
  action: string;
  nowMs?: number;
}

export interface VerifySessionJwtOptions {
  jwt: string;
  key: string;
  expectedIpHash: string;
  expectedAction: string;
  nowMs?: number;
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
}

interface JwtClaims {
  iat: number;
  exp: number;
  action: string;
  iph: string;
}

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + padding);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function encodeJson(value: unknown): string {
  return toBase64Url(encoder.encode(JSON.stringify(value)));
}

function decodeJson<T>(segment: string): T | null {
  try {
    const bytes = fromBase64Url(segment);
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function importHmacKey(key: string, usage: ('sign' | 'verify')[]): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usage
  );
}

async function hmacSign(key: string, data: string): Promise<string> {
  const cryptoKey = await importHmacKey(key, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  return toBase64Url(new Uint8Array(sig));
}

async function hmacVerify(key: string, data: string, signature: string): Promise<boolean> {
  try {
    const cryptoKey = await importHmacKey(key, ['verify']);
    const sigBytes = fromBase64Url(signature);
    return await crypto.subtle.verify('HMAC', cryptoKey, sigBytes, encoder.encode(data));
  } catch {
    return false;
  }
}

export async function signSessionJwt(options: SignSessionJwtOptions): Promise<string> {
  const now = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const claims: JwtClaims = {
    iat: now,
    exp: now + JWT_TTL_SECONDS,
    action: options.action,
    iph: options.ipHash
  };
  const headerSegment = encodeJson(header);
  const payloadSegment = encodeJson(claims);
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const signature = await hmacSign(options.key, signingInput);
  return `${signingInput}.${signature}`;
}

export async function verifySessionJwt(options: VerifySessionJwtOptions): Promise<VerifyResult> {
  const parts = options.jwt.split('.');
  if (parts.length !== 3) {
    return { valid: false, reason: 'malformed_jwt' };
  }
  const [headerSegment, payloadSegment, signatureSegment] = parts as [string, string, string];
  const signingInput = `${headerSegment}.${payloadSegment}`;

  const signatureOk = await hmacVerify(options.key, signingInput, signatureSegment);
  if (!signatureOk) {
    return { valid: false, reason: 'signature_invalid' };
  }

  const claims = decodeJson<JwtClaims>(payloadSegment);
  if (!claims) {
    return { valid: false, reason: 'malformed_claims' };
  }

  const nowSec = Math.floor((options.nowMs ?? Date.now()) / 1000);
  if (nowSec >= claims.exp) {
    return { valid: false, reason: 'expired' };
  }
  if (claims.action !== options.expectedAction) {
    return { valid: false, reason: 'action_mismatch' };
  }
  if (claims.iph !== options.expectedIpHash) {
    return { valid: false, reason: 'ip_mismatch' };
  }

  return { valid: true };
}

export async function computeIpHash(ip: string, dailySalt: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${ip}:${dailySalt}`));
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

export function buildSessionCookie(jwt: string): string {
  return [
    `${COOKIE_NAME}=${jwt}`,
    `Path=${COOKIE_PATH}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    `Max-Age=${JWT_TTL_SECONDS}`
  ].join('; ');
}

/** For daily salt rotation — callers pass `new Date()` or a frozen date in tests. */
export function todayAsSalt(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}
