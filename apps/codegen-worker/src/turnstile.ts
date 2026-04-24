// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Server-side Turnstile verification (T014).
 *
 * Per contracts/turnstile-flow.md:
 *   POST form-urlencoded {secret, response, remoteip}
 *     to https://challenges.cloudflare.com/turnstile/v0/siteverify
 *   Success requires response.success AND response.hostname matches
 *   the expected origin (guards against token replay from a different
 *   site). Tokens MUST NOT appear in any log line.
 */

const SITE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileVerifyOptions {
  /** Raw token posted by the client from the Turnstile widget. */
  token: string;
  /** Worker-side secret (stored in `env.TURNSTILE_SECRET`; never logged). */
  secret: string;
  /** Expected hostname; verification fails if Turnstile returns a different one. */
  expectedHostname: string;
  /** cf-connecting-ip of the request, forwarded to Turnstile. */
  remoteIp: string;
}

export interface TurnstileVerifyResult {
  valid: boolean;
  /** Populated only when `valid` is false — a stable, loggable reason code. */
  reason?: string;
}

interface SiteVerifyResponse {
  success: boolean;
  hostname?: string;
  action?: string;
  'error-codes'?: string[];
}

/**
 * Verify a Turnstile token. Returns `{valid: true}` only when the token is
 * accepted by Turnstile AND the response hostname matches `expectedHostname`.
 *
 * Never rejects — any error path resolves to `{valid: false, reason: '...'}`
 * with a safe reason code that does not include the token.
 */
export async function verifyTurnstile(
  options: TurnstileVerifyOptions
): Promise<TurnstileVerifyResult> {
  const body = new URLSearchParams();
  body.set('secret', options.secret);
  body.set('response', options.token);
  body.set('remoteip', options.remoteIp);

  let response: Response;
  try {
    response = await fetch(SITE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
  } catch (_err) {
    // Deliberately no err.message in the reason — could echo fetch input.
    return { valid: false, reason: 'siteverify_fetch_failed' };
  }

  if (!response.ok) {
    return { valid: false, reason: `siteverify_http_${response.status}` };
  }

  let payload: SiteVerifyResponse;
  try {
    payload = (await response.json()) as SiteVerifyResponse;
  } catch (_err) {
    return { valid: false, reason: 'siteverify_bad_json' };
  }

  if (!payload.success) {
    const codes = payload['error-codes'] ?? ['unknown'];
    return { valid: false, reason: `turnstile_rejected:${codes.join(',')}` };
  }

  if (payload.hostname !== options.expectedHostname) {
    return { valid: false, reason: 'hostname_mismatch' };
  }

  return { valid: true };
}
