// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Turnstile server-side verification unit tests (T015 → drives T014).
 *
 * Per contracts/turnstile-flow.md:
 *  - POST token + secret + remoteip to challenges.cloudflare.com/turnstile/v0/siteverify
 *  - Success requires response.success AND response.hostname matches expected
 *  - Token must NEVER appear in log output
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyTurnstile } from '../src/turnstile.js';

const SITE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

describe('verifyTurnstile', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function mockSiteVerify(body: unknown, status = 200) {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
      })
    );
  }

  it('returns valid=true when Turnstile reports success and hostname matches', async () => {
    mockSiteVerify({
      success: true,
      hostname: 'www.daikonic.dev',
      action: 'export-code',
      challenge_ts: '2026-04-24T12:00:00Z'
    });

    const result = await verifyTurnstile({
      token: 'test-token-AAAAAAAAAAAAAAAAAAAA',
      secret: 'dummy-secret',
      expectedHostname: 'www.daikonic.dev',
      remoteIp: '203.0.113.5'
    });

    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('sends secret + token + remoteip to the Turnstile endpoint as form-urlencoded', async () => {
    mockSiteVerify({ success: true, hostname: 'www.daikonic.dev' });

    await verifyTurnstile({
      token: 'abc123',
      secret: 'SECRET',
      expectedHostname: 'www.daikonic.dev',
      remoteIp: '1.2.3.4'
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(SITE_VERIFY_URL);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/x-www-form-urlencoded'
    });
    const bodyStr = init!.body as string;
    expect(bodyStr).toContain('secret=SECRET');
    expect(bodyStr).toContain('response=abc123');
    expect(bodyStr).toContain('remoteip=1.2.3.4');
  });

  it('returns valid=false when Turnstile reports failure', async () => {
    mockSiteVerify({ success: false, 'error-codes': ['timeout-or-duplicate'] });

    const result = await verifyTurnstile({
      token: 'stale-token',
      secret: 'dummy-secret',
      expectedHostname: 'www.daikonic.dev',
      remoteIp: '1.2.3.4'
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('timeout-or-duplicate');
  });

  it('returns valid=false on hostname mismatch even if Turnstile says success', async () => {
    mockSiteVerify({
      success: true,
      hostname: 'evil.example.com',
      action: 'export-code'
    });

    const result = await verifyTurnstile({
      token: 'replayed-token',
      secret: 'dummy-secret',
      expectedHostname: 'www.daikonic.dev',
      remoteIp: '1.2.3.4'
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('hostname_mismatch');
  });

  it('returns valid=false on non-2xx HTTP response', async () => {
    mockSiteVerify({ error: 'internal' }, 500);

    const result = await verifyTurnstile({
      token: 't',
      secret: 's',
      expectedHostname: 'www.daikonic.dev',
      remoteIp: '1.2.3.4'
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('siteverify_http_500');
  });

  it('never includes the token in log output on any code path', async () => {
    const stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => void 0);
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => void 0);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => void 0);

    const SECRET_TOKEN = 'DO_NOT_LOG_THIS_TOKEN_12345';
    mockSiteVerify({ success: false, 'error-codes': ['invalid-input-response'] });

    await verifyTurnstile({
      token: SECRET_TOKEN,
      secret: 'dummy',
      expectedHostname: 'www.daikonic.dev',
      remoteIp: '1.2.3.4'
    });

    const allLogs = [
      ...stdoutSpy.mock.calls.flat(),
      ...stderrSpy.mock.calls.flat(),
      ...warnSpy.mock.calls.flat()
    ]
      .map(String)
      .join('\n');

    expect(allLogs).not.toContain(SECRET_TOKEN);

    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('returns valid=false if fetch itself throws', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network down'));

    const result = await verifyTurnstile({
      token: 't',
      secret: 's',
      expectedHostname: 'www.daikonic.dev',
      remoteIp: '1.2.3.4'
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('siteverify_fetch_failed');
  });
});
