/**
 * Unit tests for WebSocket → CM Transport adapter (T005).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWebSocketTransport } from '../../src/services/ws-transport.js';

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onclose: (() => void) | null = null;
  readyState = 0; // CONNECTING
  sent: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  send(msg: string) {
    this.sent.push(msg);
  }

  close() {
    this.readyState = 3; // CLOSED
    this.onclose?.();
  }

  // Test helpers
  simulateOpen() {
    this.readyState = 1; // OPEN
    this.onopen?.();
  }

  simulateMessage(data: string) {
    this.onmessage?.({ data });
  }

  simulateError() {
    this.onerror?.(new Event('error'));
  }
}

describe('createWebSocketTransport', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves with a CMTransport on successful connection', async () => {
    const promise = createWebSocketTransport('ws://localhost:3001');

    // Simulate connection open
    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();

    const transport = await promise;
    expect(transport).toBeDefined();
    expect(typeof transport.send).toBe('function');
    expect(typeof transport.subscribe).toBe('function');
    expect(typeof transport.unsubscribe).toBe('function');
  });

  it('rejects when connection fails', async () => {
    const promise = createWebSocketTransport('ws://localhost:9999');

    const ws = MockWebSocket.instances[0]!;
    ws.simulateError();

    await expect(promise).rejects.toThrow();
  });

  it('sends messages through the WebSocket', async () => {
    const promise = createWebSocketTransport('ws://localhost:3001');
    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();

    const transport = await promise;
    transport.send('{"jsonrpc":"2.0","id":1}');

    expect(ws.sent).toEqual(['{"jsonrpc":"2.0","id":1}']);
  });

  it('delivers received messages to subscribers', async () => {
    const promise = createWebSocketTransport('ws://localhost:3001');
    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();

    const transport = await promise;
    const handler = vi.fn();
    transport.subscribe(handler);

    ws.simulateMessage('{"jsonrpc":"2.0","result":null}');

    expect(handler).toHaveBeenCalledWith('{"jsonrpc":"2.0","result":null}');
  });

  it('stops delivering to unsubscribed handlers', async () => {
    const promise = createWebSocketTransport('ws://localhost:3001');
    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();

    const transport = await promise;
    const handler = vi.fn();
    transport.subscribe(handler);
    transport.unsubscribe(handler);

    ws.simulateMessage('{"jsonrpc":"2.0"}');

    expect(handler).not.toHaveBeenCalled();
  });

  it('supports multiple subscribers', async () => {
    const promise = createWebSocketTransport('ws://localhost:3001');
    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();

    const transport = await promise;
    const h1 = vi.fn();
    const h2 = vi.fn();
    transport.subscribe(h1);
    transport.subscribe(h2);

    ws.simulateMessage('test');

    expect(h1).toHaveBeenCalledWith('test');
    expect(h2).toHaveBeenCalledWith('test');
  });

  it('does not reject after successful connection (settled flag prevents timeout rejection)', async () => {
    vi.useFakeTimers();
    const promise = createWebSocketTransport('ws://localhost:3001', 1000);
    const ws = MockWebSocket.instances[0]!;

    // Connection opens successfully
    ws.simulateOpen();
    const transport = await promise;

    // Advance time past timeout
    vi.advanceTimersByTime(1500);

    // Promise should already be resolved, transport remains valid
    expect(transport).toBeDefined();
    expect(typeof transport.send).toBe('function');

    vi.useRealTimers();
  });

  it('does not reject after successful connection (settled flag prevents error rejection)', async () => {
    const promise = createWebSocketTransport('ws://localhost:3001');
    const ws = MockWebSocket.instances[0]!;

    // Connection opens successfully
    ws.simulateOpen();
    const transport = await promise;

    // Simulate error after successful connection
    ws.simulateError();

    // Should not throw - promise is already settled
    expect(transport).toBeDefined();
  });

  it('only rejects once when both timeout and error occur', async () => {
    vi.useFakeTimers();
    const promise = createWebSocketTransport('ws://localhost:3001', 100);
    const ws = MockWebSocket.instances[0]!;

    // Trigger error first
    ws.simulateError();

    // Then trigger timeout
    vi.advanceTimersByTime(150);

    // Should only reject once (from error)
    await expect(promise).rejects.toThrow(/failed/);

    vi.useRealTimers();
  });

  it('rejects with timeout when connection does not open in time', async () => {
    vi.useFakeTimers();
    const promise = createWebSocketTransport('ws://localhost:3001', 100);

    // Don't simulate open, just let it timeout
    vi.advanceTimersByTime(150);

    await expect(promise).rejects.toThrow(/timed out/);

    vi.useRealTimers();
  });
});
