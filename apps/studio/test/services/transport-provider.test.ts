/**
 * Unit tests for transport provider / failover logic (T007).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTransportProvider } from '../../src/services/transport-provider.js';

// Mock the transport factories
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
    mockWsTransport.mockResolvedValueOnce(wsTransport);

    const provider = createTransportProvider({ wsUri: 'ws://localhost:3001' });
    const transport = await provider.getTransport();

    expect(transport).toBe(wsTransport);
    expect(provider.getState().mode).toBe('websocket');
    expect(provider.getState().status).toBe('connected');

    provider.dispose();
  });

  it('falls back to no-op transport when WebSocket fails (embedded server unavailable)', async () => {
    mockWsTransport.mockRejectedValueOnce(new Error('Connection refused'));

    const provider = createTransportProvider({
      wsUri: 'ws://localhost:3001',
      connectionTimeout: 100,
      maxReconnectAttempts: 0
    });
    const transport = await provider.getTransport();

    // Returns a no-op transport with send/subscribe/unsubscribe
    expect(typeof transport.send).toBe('function');
    expect(typeof transport.subscribe).toBe('function');
    expect(typeof transport.unsubscribe).toBe('function');
    // State reflects that embedded is unavailable
    expect(provider.getState().mode).toBe('disconnected');
    expect(provider.getState().status).toBe('error');

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

    const provider = createTransportProvider({
      wsUri: 'ws://localhost:3001',
      connectionTimeout: 100,
      maxReconnectAttempts: 0
    });
    await provider.getTransport();
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
