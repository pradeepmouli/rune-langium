// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * apps/lsp-worker WS upgrade contract tests (T037).
 *
 * Per `specs/014-studio-prod-ready/contracts/lsp-worker.md` "WS upgrade flow"
 * + "Failures":
 *
 *  - 101 Switching Protocols on a valid token + valid origin
 *  - 401 invalid_session on bad signature
 *  - 401 invalid_session on expired token
 *  - 403 origin_not_allowed on wrong Origin
 *  - 409 nonce_replay on a previously-seen nonce within 24h
 *  - 426 upgrade_required on a non-WebSocket request to /ws/<token>
 *
 * The DO is exercised through a fake `DurableObjectNamespace` mirroring
 * `apps/telemetry-worker/test/ingest.test.ts`. The Worker code under test
 * runs in plain vitest (no miniflare); the WS upgrade itself only needs
 * `WebSocketPair` which we polyfill with a minimal stub since no real
 * pair is required to assert status codes.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import worker, { RuneLspSession } from '../src/index.js';
import type { Env } from '../src/index.js';
import { signSessionToken, _resetNonceRingForTesting } from '../src/auth.js';

// ────────────────────────────────────────────────────────────────────────────
// WebSocketPair polyfill
// ────────────────────────────────────────────────────────────────────────────
//
// CF's runtime exposes a global `WebSocketPair`. Under vitest+node we must
// provide just enough to satisfy the Worker entry's upgrade path: a
// constructor returning `[client, server]` shapes and a `server.accept()`
// no-op. The DO holds the server side; the Worker hands the client back in
// the 101 Response. No real wire-level WS is needed for status-code assertions.

interface FakeWS {
  readonly readyState: number;
  accept(): void;
  send(_msg: string): void;
  close(_code?: number, _reason?: string): void;
  addEventListener(_evt: string, _h: (e: any) => void): void;
  removeEventListener(_evt: string, _h: (e: any) => void): void;
  dispatchEvent(_e: Event): boolean;
}

function makeFakeWS(): FakeWS {
  return {
    readyState: 1,
    accept() {
      /* noop */
    },
    send() {
      /* noop */
    },
    close() {
      /* noop */
    },
    addEventListener() {
      /* noop */
    },
    removeEventListener() {
      /* noop */
    },
    dispatchEvent() {
      return true;
    }
  };
}

beforeAll(() => {
  if (typeof (globalThis as any).WebSocketPair === 'undefined') {
    (globalThis as any).WebSocketPair = function (this: any) {
      const client = makeFakeWS();
      const server = makeFakeWS();
      return { 0: client, 1: server } as unknown as Record<0 | 1, FakeWS>;
    };
  }
});

/**
 * Build a Response-shaped object reporting `status === 101`. Real
 * `new Response(null, { status: 101 })` throws under undici because the
 * status range is clamped to 200..599 in spec-compliant fetch
 * implementations; the workerd runtime is the exception (it accepts 101
 * for WebSocket upgrades). We fake just enough of the Response surface
 * for our Worker entry to forward the DO's reply unmodified.
 */
function makeFakeUpgradeResponse(): Response {
  const headers = new Headers();
  return {
    status: 101,
    statusText: 'Switching Protocols',
    ok: false,
    headers,
    body: null,
    bodyUsed: false,
    redirected: false,
    type: 'default' as Response['type'],
    url: '',
    clone() {
      return makeFakeUpgradeResponse();
    },
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    json: () => Promise.resolve({}),
    text: () => Promise.resolve('')
  } as unknown as Response;
}

// ────────────────────────────────────────────────────────────────────────────
// DO fakes
// ────────────────────────────────────────────────────────────────────────────

interface DOInstance {
  fetch(req: Request): Promise<Response>;
}

interface FakeDOId {
  name: string;
  toString(): string;
}

interface DONamespaceFake {
  namespace: { idFromName: (name: string) => FakeDOId; get: (id: FakeDOId) => DOInstance };
}

function makeDONamespace(): DONamespaceFake {
  return {
    namespace: {
      idFromName(name: string): FakeDOId {
        return { name, toString: () => name };
      },
      get(_id: FakeDOId): DOInstance {
        // For upgrade tests we don't actually need the DO to process the
        // upgrade — the Worker validates the token before forwarding.
        // The DO stub returns a 101-shaped fake Response. We can't use
        // `new Response(null, { status: 101 })` because undici (used by
        // node's fetch) rejects status codes outside the 200..599 range,
        // even though workerd accepts 101 for the WS-upgrade response. We
        // therefore fabricate a thenable Response-shaped object whose
        // `.status` getter returns 101.
        return {
          async fetch(req: Request): Promise<Response> {
            if (req.headers.get('Upgrade') === 'websocket') {
              return makeFakeUpgradeResponse();
            }
            return new Response(null, { status: 200 });
          }
        };
      }
    }
  };
}

const SIGNING_KEY = 'test-signing-key-do-not-use-in-prod-test-only';

function makeEnv(overrides: Partial<Env> = {}): Env {
  const doNs = makeDONamespace();
  return {
    LSP_SESSION: doNs.namespace as unknown as Env['LSP_SESSION'],
    ALLOWED_ORIGIN: 'https://www.daikonic.dev',
    SESSION_SIGNING_KEY: SIGNING_KEY,
    ...overrides
  } as Env;
}

function makeWsUpgradeReq(
  token: string,
  origin: string | null = 'https://www.daikonic.dev'
): Request {
  const headers: Record<string, string> = {
    Upgrade: 'websocket',
    Connection: 'Upgrade',
    'Sec-WebSocket-Version': '13',
    'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ=='
  };
  if (origin) headers['Origin'] = origin;
  return new Request(`https://www.daikonic.dev/rune-studio/api/lsp/ws/${token}`, {
    method: 'GET',
    headers
  });
}

function makeNonWsReq(token: string): Request {
  return new Request(`https://www.daikonic.dev/rune-studio/api/lsp/ws/${token}`, {
    method: 'GET',
    headers: { Origin: 'https://www.daikonic.dev' }
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe('apps/lsp-worker WS upgrade contract (T037)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T12:00:00Z'));
    _resetNonceRingForTesting();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('exports the RuneLspSession DO class for the wrangler binding', () => {
    expect(typeof RuneLspSession).toBe('function');
  });

  it('101 Switching Protocols on valid token + valid origin', async () => {
    const env = makeEnv();
    const token = await signSessionToken(SIGNING_KEY, {
      v: 1,
      workspaceId: '01J7M8AAAAAAAAAAAAAAAAAAAA',
      issuedAt: Date.now(),
      exp: Date.now() + 24 * 60 * 60 * 1000,
      origin: 'https://www.daikonic.dev',
      nonce: 'a1b2c3d4e5f60718a9b0c1d2e3f40516'
    });
    const res = await worker.fetch(makeWsUpgradeReq(token), env);
    expect(res.status).toBe(101);
  });

  it('401 invalid_session on bad signature', async () => {
    const env = makeEnv();
    // Sign with a different key, then present to the Worker which uses SIGNING_KEY.
    const badToken = await signSessionToken('completely-different-key', {
      v: 1,
      workspaceId: '01J7M8AAAAAAAAAAAAAAAAAAAA',
      issuedAt: Date.now(),
      exp: Date.now() + 24 * 60 * 60 * 1000,
      origin: 'https://www.daikonic.dev',
      nonce: 'b1b2c3d4e5f60718a9b0c1d2e3f40516'
    });
    const res = await worker.fetch(makeWsUpgradeReq(badToken), env);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_session');
  });

  it('401 invalid_session on expired token', async () => {
    const env = makeEnv();
    const expiredToken = await signSessionToken(SIGNING_KEY, {
      v: 1,
      workspaceId: '01J7M8AAAAAAAAAAAAAAAAAAAA',
      issuedAt: Date.now() - 48 * 60 * 60 * 1000,
      exp: Date.now() - 1, // expired 1ms ago
      origin: 'https://www.daikonic.dev',
      nonce: 'c1b2c3d4e5f60718a9b0c1d2e3f40516'
    });
    const res = await worker.fetch(makeWsUpgradeReq(expiredToken), env);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_session');
  });

  it('403 origin_not_allowed on wrong Origin header (matches token origin but not env)', async () => {
    const env = makeEnv();
    const token = await signSessionToken(SIGNING_KEY, {
      v: 1,
      workspaceId: '01J7M8AAAAAAAAAAAAAAAAAAAA',
      issuedAt: Date.now(),
      exp: Date.now() + 24 * 60 * 60 * 1000,
      origin: 'https://evil.example.com',
      nonce: 'd1b2c3d4e5f60718a9b0c1d2e3f40516'
    });
    const res = await worker.fetch(makeWsUpgradeReq(token, 'https://evil.example.com'), env);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('origin_not_allowed');
  });

  it('409 nonce_replay on a previously-seen nonce within 24h', async () => {
    const env = makeEnv();
    const sameNonce = 'e1b2c3d4e5f60718a9b0c1d2e3f40516';
    const token1 = await signSessionToken(SIGNING_KEY, {
      v: 1,
      workspaceId: '01J7M8AAAAAAAAAAAAAAAAAAAA',
      issuedAt: Date.now(),
      exp: Date.now() + 24 * 60 * 60 * 1000,
      origin: 'https://www.daikonic.dev',
      nonce: sameNonce
    });

    const first = await worker.fetch(makeWsUpgradeReq(token1), env);
    expect(first.status).toBe(101);

    // Re-mint with the SAME nonce (simulates a replay attack).
    const replay = await signSessionToken(SIGNING_KEY, {
      v: 1,
      workspaceId: '01J7M8AAAAAAAAAAAAAAAAAAAA',
      issuedAt: Date.now(),
      exp: Date.now() + 24 * 60 * 60 * 1000,
      origin: 'https://www.daikonic.dev',
      nonce: sameNonce
    });
    const second = await worker.fetch(makeWsUpgradeReq(replay), env);
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error: string };
    expect(body.error).toBe('nonce_replay');
  });

  it('426 upgrade_required on a non-WebSocket request to /ws/<token>', async () => {
    const env = makeEnv();
    const token = await signSessionToken(SIGNING_KEY, {
      v: 1,
      workspaceId: '01J7M8AAAAAAAAAAAAAAAAAAAA',
      issuedAt: Date.now(),
      exp: Date.now() + 24 * 60 * 60 * 1000,
      origin: 'https://www.daikonic.dev',
      nonce: 'f1b2c3d4e5f60718a9b0c1d2e3f40516'
    });
    const res = await worker.fetch(makeNonWsReq(token), env);
    expect(res.status).toBe(426);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('upgrade_required');
  });
});
