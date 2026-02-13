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
});
