// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Session cookie JWT sign/verify unit tests (T017 → drives T016).
 *
 * Per contracts/turnstile-flow.md:
 *   Cookie: hcsession=<jwt>; Path=/rune-studio/api; HttpOnly; Secure;
 *           SameSite=Strict; Max-Age=3600
 *   JWT claims: {iat, exp, action, iph}
 *   iph = sha256(ip + daily_salt) — rotates daily, invalidates on IP change
 */

import { describe, it, expect } from 'vitest';
import {
  buildSessionCookie,
  computeIpHash,
  signSessionJwt,
  verifySessionJwt
} from '../src/session.js';

const SIGNING_KEY = 'test-signing-key-0123456789abcdef0123456789abcdef';
const IP = '203.0.113.5';
const DAILY_SALT = '2026-04-24';

describe('signSessionJwt + verifySessionJwt', () => {
  it('signs and verifies a fresh JWT round-trip', async () => {
    const ipHash = await computeIpHash(IP, DAILY_SALT);
    const jwt = await signSessionJwt({
      key: SIGNING_KEY,
      ipHash,
      action: 'export-code',
      nowMs: 1_735_080_000_000
    });

    const result = await verifySessionJwt({
      jwt,
      key: SIGNING_KEY,
      expectedIpHash: ipHash,
      expectedAction: 'export-code',
      nowMs: 1_735_080_000_000 + 60_000 // 1 minute later
    });

    expect(result.valid).toBe(true);
  });

  it('rejects an expired JWT', async () => {
    const ipHash = await computeIpHash(IP, DAILY_SALT);
    const jwt = await signSessionJwt({
      key: SIGNING_KEY,
      ipHash,
      action: 'export-code',
      nowMs: 1_735_080_000_000
    });

    const result = await verifySessionJwt({
      jwt,
      key: SIGNING_KEY,
      expectedIpHash: ipHash,
      expectedAction: 'export-code',
      nowMs: 1_735_080_000_000 + 4_000_000 // > 1h after issuance
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('expired');
  });

  it('rejects a JWT signed with a different key', async () => {
    const ipHash = await computeIpHash(IP, DAILY_SALT);
    const jwt = await signSessionJwt({
      key: SIGNING_KEY,
      ipHash,
      action: 'export-code',
      nowMs: 1_735_080_000_000
    });

    const result = await verifySessionJwt({
      jwt,
      key: 'DIFFERENT-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      expectedIpHash: ipHash,
      expectedAction: 'export-code',
      nowMs: 1_735_080_000_000 + 60_000
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('signature');
  });

  it('rejects a JWT when the request IP has rotated (ip_hash mismatch)', async () => {
    const originalIpHash = await computeIpHash('203.0.113.5', DAILY_SALT);
    const rotatedIpHash = await computeIpHash('198.51.100.42', DAILY_SALT);
    const jwt = await signSessionJwt({
      key: SIGNING_KEY,
      ipHash: originalIpHash,
      action: 'export-code',
      nowMs: 1_735_080_000_000
    });

    const result = await verifySessionJwt({
      jwt,
      key: SIGNING_KEY,
      expectedIpHash: rotatedIpHash,
      expectedAction: 'export-code',
      nowMs: 1_735_080_000_000 + 60_000
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('ip_mismatch');
  });

  it('rejects a JWT with wrong action claim', async () => {
    const ipHash = await computeIpHash(IP, DAILY_SALT);
    const jwt = await signSessionJwt({
      key: SIGNING_KEY,
      ipHash,
      action: 'export-code',
      nowMs: 1_735_080_000_000
    });

    const result = await verifySessionJwt({
      jwt,
      key: SIGNING_KEY,
      expectedIpHash: ipHash,
      expectedAction: 'admin', // different
      nowMs: 1_735_080_000_000 + 60_000
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('action');
  });

  it('rejects a malformed JWT (not three base64url segments)', async () => {
    const result = await verifySessionJwt({
      jwt: 'garbage',
      key: SIGNING_KEY,
      expectedIpHash: 'whatever',
      expectedAction: 'export-code',
      nowMs: Date.now()
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('malformed');
  });
});

describe('computeIpHash', () => {
  it('produces a deterministic SHA-256 hex digest for (ip, salt)', async () => {
    const a = await computeIpHash('1.2.3.4', '2026-04-24');
    const b = await computeIpHash('1.2.3.4', '2026-04-24');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rotates when the salt changes (simulates daily rotation)', async () => {
    const today = await computeIpHash('1.2.3.4', '2026-04-24');
    const tomorrow = await computeIpHash('1.2.3.4', '2026-04-25');
    expect(today).not.toBe(tomorrow);
  });

  it('differs per IP', async () => {
    const a = await computeIpHash('1.2.3.4', '2026-04-24');
    const b = await computeIpHash('5.6.7.8', '2026-04-24');
    expect(a).not.toBe(b);
  });
});

describe('buildSessionCookie', () => {
  it('builds a Set-Cookie string with all required attributes', () => {
    const cookie = buildSessionCookie('abc.def.ghi');
    expect(cookie).toContain('hcsession=abc.def.ghi');
    expect(cookie).toContain('Path=/rune-studio/api');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Max-Age=3600');
  });
});
