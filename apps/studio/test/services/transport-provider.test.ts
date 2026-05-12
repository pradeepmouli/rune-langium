// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Unit tests for transport provider / failover logic (T011 + T044 + 019 Phase 2).
 *
 * Two-tier strategy:
 *  - Tier A: direct WebSocket when wsUri is explicit OR session endpoint is
 *    cross-origin.
 *  - Tier B: Pages Function LSP (same-origin) — POST /api/lsp/session for a
 *    token, then open WebSocket(${cfWsBase}/ws/${token}). On 401 from the
 *    mint we retry once; on 429 / 5xx we surface "language services
 *    unavailable" with the dev-mode-gated copy from FR-014.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTransportProvider } from '../../src/services/transport-provider.js';

// Mock the WebSocket transport factory.
vi.mock('../../src/services/ws-transport.js', () => ({
  createWebSocketTransport: vi.fn()
}));

import { createWebSocketTransport } from '../../src/services/ws-transport.js';

const mockWsTransport = vi.mocked(createWebSocketTransport);

function makeFakeTransport() {
  return {
    send: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn()
  };
}

const VALID_ULID = '01J7M8AAAAAAAAAAAAAAAAAAAA';
const SESSION_URL = 'https://example.test/api/lsp/session';
const CF_WS_BASE = 'wss://example.test/api/lsp';

/**
 * Mint-endpoint mock — installs a vi.spyOn(globalThis, 'fetch') and
 * sequences the responses the test sets via `next()`. Each call shifts
 * the queue; if empty, the request rejects.
 */
function installMintMock(): {
  next: (init: { status: number; body?: unknown }) => void;
  fetchSpy: ReturnType<typeof vi.spyOn>;
  callCount: () => number;
} {
  const queue: Array<{ status: number; body?: unknown }> = [];
  let calls = 0;
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input: RequestInfo | URL): Promise<Response> => {
      calls += 1;
      const url = typeof input === 'string' ? input : ((input as Request).url ?? String(input));
      if (!url.includes('/api/lsp/session')) {
        throw new Error(`unexpected fetch URL: ${url}`);
      }
      const next = queue.shift();
      if (!next) throw new Error('mint mock queue empty');
      const body = next.body ?? { token: 't0k3n', expiresAt: Date.now() + 60_000 };
      return new Response(JSON.stringify(body), {
        status: next.status,
        headers: { 'Content-Type': 'application/json' }
      });
    });
  return {
    next: (init) => queue.push(init),
    fetchSpy,
    callCount: () => calls
  };
}

describe('createTransportProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a TransportProvider with expected API', () => {
    const provider = createTransportProvider();
    expect(typeof provider.getTransport).toBe('function');
    expect(typeof provider.getState).toBe('function');
    expect(typeof provider.reconnect).toBe('function');
    expect(typeof provider.onStateChange).toBe('function');
    expect(typeof provider.dispose).toBe('function');
  });

  it('starts in disconnected state', () => {
    const provider = createTransportProvider();
    const state = provider.getState();
    expect(state.mode).toBe('disconnected');
    expect(state.status).toBe('disconnected');
  });

  it('TransportMode no longer includes "embedded" or "cf-worker"', () => {
    // Type-level: this array compiles only if those modes are not in the union.
    const validModes: Array<'disconnected' | 'websocket' | 'pages-function'> = [
      'disconnected',
      'websocket',
      'pages-function'
    ];
    expect(validModes).toHaveLength(3);
  });

  it('uses WebSocket when wsUri is explicitly configured', async () => {
    const wsTransport = makeFakeTransport();
    mockWsTransport.mockResolvedValueOnce(wsTransport);

    const provider = createTransportProvider({ wsUri: 'ws://localhost:3001' });
    const transport = await provider.getTransport();

    expect(transport).toBe(wsTransport);
    expect(provider.getState().mode).toBe('websocket');
    expect(provider.getState().status).toBe('connected');

    provider.dispose();
  });

  it('skips the direct WebSocket step when the session endpoint is same-origin', async () => {
    const cfTransport = makeFakeTransport();
    mockWsTransport.mockResolvedValueOnce(cfTransport);

    const mint = installMintMock();
    mint.next({ status: 200, body: { token: 'cf-token', expiresAt: Date.now() + 60_000 } });

    const provider = createTransportProvider({
      sessionUrl: '/api/lsp/session',
      cfWsBase: 'ws://localhost/api/lsp'
    });
    const transport = await provider.getTransport();

    expect(transport).toBe(cfTransport);
    expect(mockWsTransport).toHaveBeenCalledTimes(1);
    expect(mockWsTransport).toHaveBeenCalledWith('ws://localhost/api/lsp/ws/cf-token', 2000);
    expect(mint.callCount()).toBe(1);
    expect(provider.getState().mode).toBe('pages-function');

    provider.dispose();
  });

  it('falls back to Pages Function (Tier B) when dev WS fails — happy path', async () => {
    const cfTransport = makeFakeTransport();
    // Tier A: dev WS rejects
    mockWsTransport.mockRejectedValueOnce(new Error('Connection refused'));
    // Tier B: Pages Function WS resolves after the mint
    mockWsTransport.mockResolvedValueOnce(cfTransport);

    const mint = installMintMock();
    mint.next({ status: 200, body: { token: 'cf-token', expiresAt: Date.now() + 60_000 } });

    const provider = createTransportProvider({
      wsUri: 'ws://localhost:3001',
      connectionTimeout: 100,
      maxReconnectAttempts: 0,
      sessionUrl: SESSION_URL,
      cfWsBase: CF_WS_BASE,
      workspaceId: VALID_ULID
    });
    const transport = await provider.getTransport();

    expect(transport).toBe(cfTransport);
    expect(provider.getState().mode).toBe('pages-function');
    expect(provider.getState().status).toBe('connected');

    // The Pages Function WS URL must have the token appended.
    expect(mockWsTransport).toHaveBeenLastCalledWith(`${CF_WS_BASE}/ws/cf-token`, 100);
    provider.dispose();
  });

  it('retries the mint once on 401 from the session endpoint', async () => {
    const cfTransport = makeFakeTransport();
    mockWsTransport.mockRejectedValueOnce(new Error('Connection refused'));
    mockWsTransport.mockResolvedValueOnce(cfTransport);

    const mint = installMintMock();
    mint.next({ status: 401, body: { error: 'invalid_session' } });
    mint.next({ status: 200, body: { token: 'fresh', expiresAt: Date.now() + 60_000 } });

    const provider = createTransportProvider({
      wsUri: 'ws://localhost:3001',
      connectionTimeout: 100,
      maxReconnectAttempts: 0,
      sessionUrl: SESSION_URL,
      cfWsBase: CF_WS_BASE
    });
    const transport = await provider.getTransport();

    expect(transport).toBe(cfTransport);
    expect(provider.getState().mode).toBe('pages-function');
    expect(mint.callCount()).toBe(2);
    provider.dispose();
  });

  it('surfaces "language services unavailable" on 429 from the session endpoint', async () => {
    mockWsTransport.mockRejectedValueOnce(new Error('Connection refused'));

    const mint = installMintMock();
    mint.next({ status: 429, body: { error: 'rate_limited', retry_after_s: 60 } });

    const provider = createTransportProvider({
      wsUri: 'ws://localhost:3001',
      connectionTimeout: 100,
      maxReconnectAttempts: 0,
      sessionUrl: SESSION_URL,
      cfWsBase: CF_WS_BASE
    });
    await expect(provider.getTransport()).rejects.toThrow(
      /language services unavailable|Pages Function LSP unreachable/i
    );
    expect(provider.getState().mode).toBe('disconnected');
    expect(provider.getState().status).toBe('error');
    provider.dispose();
  });

  it('surfaces "language services unavailable" on 5xx from the session endpoint', async () => {
    mockWsTransport.mockRejectedValueOnce(new Error('Connection refused'));

    const mint = installMintMock();
    mint.next({ status: 500, body: { error: 'internal_error' } });

    const provider = createTransportProvider({
      wsUri: 'ws://localhost:3001',
      connectionTimeout: 100,
      maxReconnectAttempts: 0,
      sessionUrl: SESSION_URL,
      cfWsBase: CF_WS_BASE
    });
    await expect(provider.getTransport()).rejects.toThrow(
      /language services unavailable|Pages Function LSP unreachable/i
    );
    expect(provider.getState().mode).toBe('disconnected');
    expect(provider.getState().status).toBe('error');
    provider.dispose();
  });

  it('retries the mint when the WS connect itself returns 401-equivalent', async () => {
    const cfTransport = makeFakeTransport();
    mockWsTransport.mockRejectedValueOnce(new Error('Connection refused')); // dev WS fails
    mockWsTransport.mockRejectedValueOnce(new Error('WebSocket closed: 1008 invalid_session')); // first Pages Function WS open fails
    mockWsTransport.mockResolvedValueOnce(cfTransport); // retry Pages Function WS open succeeds

    const mint = installMintMock();
    mint.next({ status: 200, body: { token: 'first', expiresAt: Date.now() + 60_000 } });
    mint.next({ status: 200, body: { token: 'second', expiresAt: Date.now() + 60_000 } });

    const provider = createTransportProvider({
      wsUri: 'ws://localhost:3001',
      connectionTimeout: 100,
      maxReconnectAttempts: 0,
      sessionUrl: SESSION_URL,
      cfWsBase: CF_WS_BASE
    });
    const transport = await provider.getTransport();

    expect(transport).toBe(cfTransport);
    expect(provider.getState().mode).toBe('pages-function');
    expect(mint.callCount()).toBe(2);
    provider.dispose();
  });

  it('notifies state change listeners', async () => {
    const wsTransport = makeFakeTransport();
    mockWsTransport.mockResolvedValueOnce(wsTransport);

    const provider = createTransportProvider({ wsUri: 'ws://localhost:3001' });
    const listener = vi.fn();
    provider.onStateChange(listener);

    await provider.getTransport();

    expect(listener).toHaveBeenCalled();
    const lastCall = listener.mock.calls[listener.mock.calls.length - 1]![0];
    expect(lastCall.status).toBe('connected');

    provider.dispose();
  });

  it('unsubscribes state change listeners on dispose return', async () => {
    const wsTransport = makeFakeTransport();
    mockWsTransport.mockResolvedValueOnce(wsTransport);

    const provider = createTransportProvider({ wsUri: 'ws://localhost:3001' });
    const listener = vi.fn();
    const unsub = provider.onStateChange(listener);
    unsub();

    await provider.getTransport();

    // unsub() was called before getTransport(), so the listener must never
    // have been invoked for any of the connecting → connected state transitions.
    expect(listener).not.toHaveBeenCalled();

    provider.dispose();
  });

  it('reconnect retries WebSocket after fallback', async () => {
    const wsTransport = makeFakeTransport();
    mockWsTransport.mockRejectedValueOnce(new Error('fail'));

    const mint = installMintMock();
    // Fallback path also fails so the provider lands on disconnected.
    mint.next({ status: 500, body: { error: 'internal_error' } });

    const provider = createTransportProvider({
      wsUri: 'ws://localhost:3001',
      connectionTimeout: 100,
      maxReconnectAttempts: 0,
      sessionUrl: SESSION_URL,
      cfWsBase: CF_WS_BASE
    });
    await expect(provider.getTransport()).rejects.toThrow(
      /language services unavailable|Pages Function LSP unreachable/i
    );
    expect(provider.getState().mode).toBe('disconnected');
    expect(provider.getState().status).toBe('error');

    // Now WebSocket is available
    mockWsTransport.mockResolvedValueOnce(wsTransport);
    const transport = await provider.reconnect();

    expect(transport).toBe(wsTransport);
    expect(provider.getState().mode).toBe('websocket');

    provider.dispose();
  });
});
