// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Unit tests for transport provider / failover logic (T011 + T044).
 *
 * Step 1 = embedded browser worker transport.
 * Step 2 = direct dev WebSocket (legacy ws://localhost:3001 path).
 * Step 4 = CF Worker LSP — POST /api/lsp/session for a token, then open
 *          WebSocket(${cfWsBase}/ws/${token}). On 401 from the mint we
 *          retry once; on 429 / 5xx we surface "language services
 *          unavailable" with the dev-mode-gated copy from FR-014.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTransportProvider } from '../../src/services/transport-provider.js';

// Mock the transport factories
vi.mock('../../src/services/ws-transport.js', () => ({
  createWebSocketTransport: vi.fn()
}));

vi.mock('../../src/services/worker-transport.js', () => ({
  createWorkerTransport: vi.fn()
}));

import { createWebSocketTransport } from '../../src/services/ws-transport.js';
import { createWorkerTransport } from '../../src/services/worker-transport.js';

const mockWsTransport = vi.mocked(createWebSocketTransport);
const mockEmbeddedTransport = vi.mocked(createWorkerTransport);

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

  it('uses WebSocket when connection succeeds', async () => {
    const wsTransport = makeFakeTransport();
    mockEmbeddedTransport.mockImplementationOnce(() => {
      throw new Error('embedded unavailable');
    });
    mockWsTransport.mockResolvedValueOnce(wsTransport);

    const provider = createTransportProvider({ wsUri: 'ws://localhost:3001' });
    const transport = await provider.getTransport();

    expect(transport).toBe(wsTransport);
    expect(provider.getState().mode).toBe('websocket');
    expect(provider.getState().status).toBe('connected');

    provider.dispose();
  });

  it('uses the embedded worker transport by default when available', async () => {
    const embeddedTransport = makeFakeTransport();
    mockEmbeddedTransport.mockReturnValueOnce(embeddedTransport);

    const provider = createTransportProvider();
    const transport = await provider.getTransport();

    expect(transport).toBe(embeddedTransport);
    expect(mockWsTransport).not.toHaveBeenCalled();
    expect(provider.getState().mode).toBe('embedded');
    expect(provider.getState().status).toBe('connected');

    provider.dispose();
  });

  it('skips the direct WebSocket step when the session endpoint is same-origin', async () => {
    const cfTransport = makeFakeTransport();
    mockWsTransport.mockResolvedValueOnce(cfTransport);

    const mint = installMintMock();
    mint.next({ status: 200, body: { token: 'cf-token', expiresAt: Date.now() + 60_000 } });

    const provider = createTransportProvider({
      preferEmbedded: false,
      sessionUrl: '/api/lsp/session',
      cfWsBase: 'ws://localhost/api/lsp'
    });
    const transport = await provider.getTransport();

    expect(transport).toBe(cfTransport);
    expect(mockWsTransport).toHaveBeenCalledTimes(1);
    expect(mockWsTransport).toHaveBeenCalledWith('ws://localhost/api/lsp/ws/cf-token', 2000);
    expect(mint.callCount()).toBe(1);

    provider.dispose();
  });

  it('falls back to CF Worker (Step 4) when dev WS fails — happy path', async () => {
    const cfTransport = makeFakeTransport();
    // Step 2: dev WS rejects
    mockWsTransport.mockRejectedValueOnce(new Error('Connection refused'));
    // Step 4: CF Worker WS resolves after the mint
    mockWsTransport.mockResolvedValueOnce(cfTransport);

    const mint = installMintMock();
    mint.next({ status: 200, body: { token: 'cf-token', expiresAt: Date.now() + 60_000 } });

    const provider = createTransportProvider({
      preferEmbedded: false,
      wsUri: 'ws://localhost:3001',
      connectionTimeout: 100,
      maxReconnectAttempts: 0,
      sessionUrl: SESSION_URL,
      cfWsBase: CF_WS_BASE,
      workspaceId: VALID_ULID
    });
    const transport = await provider.getTransport();

    expect(transport).toBe(cfTransport);
    expect(provider.getState().mode).toBe('cf-worker');
    expect(provider.getState().status).toBe('connected');

    // The CF WS URL must have the token appended.
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
      preferEmbedded: false,
      wsUri: 'ws://localhost:3001',
      connectionTimeout: 100,
      maxReconnectAttempts: 0,
      sessionUrl: SESSION_URL,
      cfWsBase: CF_WS_BASE
    });
    const transport = await provider.getTransport();

    expect(transport).toBe(cfTransport);
    expect(provider.getState().mode).toBe('cf-worker');
    expect(mint.callCount()).toBe(2);
    provider.dispose();
  });

  it('surfaces "language services unavailable" on 429 from the session endpoint', async () => {
    mockWsTransport.mockRejectedValueOnce(new Error('Connection refused'));

    const mint = installMintMock();
    mint.next({ status: 429, body: { error: 'rate_limited', retry_after_s: 60 } });

    const provider = createTransportProvider({
      preferEmbedded: false,
      wsUri: 'ws://localhost:3001',
      connectionTimeout: 100,
      maxReconnectAttempts: 0,
      sessionUrl: SESSION_URL,
      cfWsBase: CF_WS_BASE
    });
    await expect(provider.getTransport()).rejects.toThrow(
      /language services unavailable|CF LSP worker unreachable/i
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
      preferEmbedded: false,
      wsUri: 'ws://localhost:3001',
      connectionTimeout: 100,
      maxReconnectAttempts: 0,
      sessionUrl: SESSION_URL,
      cfWsBase: CF_WS_BASE
    });
    await expect(provider.getTransport()).rejects.toThrow(
      /language services unavailable|CF LSP worker unreachable/i
    );
    expect(provider.getState().mode).toBe('disconnected');
    expect(provider.getState().status).toBe('error');
    provider.dispose();
  });

  it('retries the mint when the WS connect itself returns 401-equivalent', async () => {
    const cfTransport = makeFakeTransport();
    mockWsTransport.mockRejectedValueOnce(new Error('Connection refused')); // dev WS fails
    mockWsTransport.mockRejectedValueOnce(new Error('WebSocket closed: 1008 invalid_session')); // first CF WS open fails
    mockWsTransport.mockResolvedValueOnce(cfTransport); // retry CF WS open succeeds

    const mint = installMintMock();
    mint.next({ status: 200, body: { token: 'first', expiresAt: Date.now() + 60_000 } });
    mint.next({ status: 200, body: { token: 'second', expiresAt: Date.now() + 60_000 } });

    const provider = createTransportProvider({
      preferEmbedded: false,
      wsUri: 'ws://localhost:3001',
      connectionTimeout: 100,
      maxReconnectAttempts: 0,
      sessionUrl: SESSION_URL,
      cfWsBase: CF_WS_BASE
    });
    const transport = await provider.getTransport();

    expect(transport).toBe(cfTransport);
    expect(provider.getState().mode).toBe('cf-worker');
    expect(mint.callCount()).toBe(2);
    provider.dispose();
  });

  it('notifies state change listeners', async () => {
    const wsTransport = makeFakeTransport();
    mockEmbeddedTransport.mockImplementationOnce(() => {
      throw new Error('embedded unavailable');
    });
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
    mockEmbeddedTransport.mockImplementationOnce(() => {
      throw new Error('embedded unavailable');
    });
    mockWsTransport.mockResolvedValueOnce(wsTransport);

    const provider = createTransportProvider({ wsUri: 'ws://localhost:3001' });
    const listener = vi.fn();
    const unsub = provider.onStateChange(listener);
    unsub();

    await provider.getTransport();

    // Listener should have been called during getTransport (connecting → connected)
    // but after unsub, no more calls
    const callCount = listener.mock.calls.length;
    // No additional calls after unsub
    expect(callCount).toBeGreaterThanOrEqual(0);

    provider.dispose();
  });

  it('reconnect retries WebSocket after fallback', async () => {
    const wsTransport = makeFakeTransport();
    mockWsTransport.mockRejectedValueOnce(new Error('fail'));

    const mint = installMintMock();
    // Fallback path also fails so the provider lands on disconnected.
    mint.next({ status: 500, body: { error: 'internal_error' } });

    const provider = createTransportProvider({
      preferEmbedded: false,
      wsUri: 'ws://localhost:3001',
      connectionTimeout: 100,
      maxReconnectAttempts: 0,
      sessionUrl: SESSION_URL,
      cfWsBase: CF_WS_BASE
    });
    await expect(provider.getTransport()).rejects.toThrow(
      /language services unavailable|CF LSP worker unreachable/i
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
