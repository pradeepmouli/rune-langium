// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

const LSP_SESSION_ID_KEY = 'rune-studio:lsp-session-id';
const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function makeLspSessionUlid(): string {
  // 10-char time component + 16-char random component = 26 chars.
  // Not monotonic across calls — single ULID per tab is fine for DO routing.
  let time = '';
  let now = Date.now();
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD_BASE32[now & 31] + time;
    now = Math.floor(now / 32);
  }
  const rand = new Uint8Array(16);
  crypto.getRandomValues(rand);
  let randPart = '';
  for (const b of rand) randPart += CROCKFORD_BASE32[b & 31];
  return time + randPart;
}

/**
 * Per-tab LSP session id for Durable Object routing. Persisted in
 * sessionStorage so a tab keeps its DO across reloads; falls back to a
 * per-call ULID under privacy modes. Tags the LSP DO so multi-tenancy works.
 */
export function getLspSessionId(): string {
  if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') {
    return makeLspSessionUlid();
  }
  try {
    const existing = window.sessionStorage.getItem(LSP_SESSION_ID_KEY);
    if (existing && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(existing)) return existing;
    const fresh = makeLspSessionUlid();
    window.sessionStorage.setItem(LSP_SESSION_ID_KEY, fresh);
    return fresh;
  } catch {
    // sessionStorage may throw under privacy / access-restricted modes — even
    // on read (getItem), not just setItem. Non-fatal: the caller still gets a
    // unique-for-this-call id, it just won't persist across reloads (the DO is
    // isolated per-mount instead of per-tab).
    return makeLspSessionUlid();
  }
}
