/**
 * Unit tests for Worker → CM Transport adapter (T006).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWorkerTransport } from '../../src/services/worker-transport.js';

// Mock SharedWorker / MessagePort
class MockMessagePort {
  onmessage: ((e: MessageEvent) => void) | null = null;
  started = false;
  sent: unknown[] = [];
  private messageListeners: ((e: MessageEvent) => void)[] = [];
  private errorListeners: ((e: Event) => void)[] = [];

  start() {
    this.started = true;
  }

  postMessage(data: unknown) {
    this.sent.push(data);
  }

  addEventListener(type: string, listener: (e: MessageEvent) => void) {
    if (type === 'message') {
      this.messageListeners.push(listener);
    } else if (type === 'messageerror' || type === 'error') {
      this.errorListeners.push(listener as unknown as (e: Event) => void);
    }
  }

  removeEventListener(type: string, listener: (e: MessageEvent) => void) {
    if (type === 'message') {
      const idx = this.messageListeners.indexOf(listener);
      if (idx >= 0) this.messageListeners.splice(idx, 1);
    } else if (type === 'messageerror' || type === 'error') {
      const idx = this.errorListeners.indexOf(listener as unknown as (e: Event) => void);
      if (idx >= 0) this.errorListeners.splice(idx, 1);
    }
  }

  simulateMessage(data: unknown) {
    const event = new MessageEvent('message', { data });
    // Call both direct handler and event listeners
    this.onmessage?.(event);
    for (const listener of this.messageListeners) {
      listener(event);
    }
  }
}

class MockSharedWorker {
  static instances: MockSharedWorker[] = [];
  port: MockMessagePort;

  constructor(public url: URL | string) {
    this.port = new MockMessagePort();
    MockSharedWorker.instances.push(this);
  }
}

describe('createWorkerTransport', () => {
  beforeEach(() => {
    MockSharedWorker.instances = [];
    vi.stubGlobal('SharedWorker', MockSharedWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a CMTransport backed by SharedWorker', () => {
    const transport = createWorkerTransport();

    expect(transport).toBeDefined();
    expect(typeof transport.send).toBe('function');
    expect(typeof transport.subscribe).toBe('function');
    expect(typeof transport.unsubscribe).toBe('function');
  });

  it('starts the SharedWorker port', () => {
    createWorkerTransport();

    const worker = MockSharedWorker.instances[0]!;
    expect(worker.port.started).toBe(true);
  });

  it('sends messages via postMessage', () => {
    const transport = createWorkerTransport();
    const worker = MockSharedWorker.instances[0]!;

    transport.send('{"jsonrpc":"2.0","id":1}');

    // Should send envelope with clientId and message object
    expect(worker.port.sent).toHaveLength(1);
    const envelope = worker.port.sent[0] as { clientId: string; message: unknown };
    expect(envelope).toHaveProperty('clientId');
    expect(envelope).toHaveProperty('message');
    expect(envelope.message).toEqual({ jsonrpc: '2.0', id: 1 });
  });

  it('delivers incoming messages to subscribers', async () => {
    const transport = createWorkerTransport();
    const worker = MockSharedWorker.instances[0]!;
    const handler = vi.fn();

    transport.subscribe(handler);
    
    // Wait a tick for subscription to be set up
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // Simulate receiving a valid JSON-RPC response message
    worker.port.simulateMessage({
      jsonrpc: '2.0',
      id: 1,
      result: null
    });

    // Handler should receive the stringified message
    expect(handler).toHaveBeenCalledWith('{"jsonrpc":"2.0","id":1,"result":null}');
  });

  it('unsubscribes handlers', () => {
    const transport = createWorkerTransport();
    const worker = MockSharedWorker.instances[0]!;
    const handler = vi.fn();

    transport.subscribe(handler);
    transport.unsubscribe(handler);
    
    worker.port.simulateMessage({
      jsonrpc: '2.0',
      id: 1,
      result: null
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('falls back to dedicated Worker when SharedWorker unavailable', () => {
    // Remove SharedWorker from global
    vi.stubGlobal('SharedWorker', undefined);

    class MockWorker {
      static instances: MockWorker[] = [];
      onmessage: ((e: MessageEvent) => void) | null = null;
      sent: unknown[] = [];
      private messageListeners: ((e: MessageEvent) => void)[] = [];
      private errorListeners: ((e: Event) => void)[] = [];

      constructor(public url: URL | string) {
        MockWorker.instances.push(this);
      }

      postMessage(data: unknown) {
        this.sent.push(data);
      }

      addEventListener(type: string, listener: (e: MessageEvent) => void) {
        if (type === 'message') {
          this.messageListeners.push(listener);
        } else if (type === 'error') {
          this.errorListeners.push(listener as unknown as (e: Event) => void);
        }
      }

      removeEventListener(type: string, listener: (e: MessageEvent) => void) {
        if (type === 'message') {
          const idx = this.messageListeners.indexOf(listener);
          if (idx >= 0) this.messageListeners.splice(idx, 1);
        } else if (type === 'error') {
          const idx = this.errorListeners.indexOf(listener as unknown as (e: Event) => void);
          if (idx >= 0) this.errorListeners.splice(idx, 1);
        }
      }
    }
    vi.stubGlobal('Worker', MockWorker);

    const transport = createWorkerTransport();

    expect(transport).toBeDefined();
    expect(MockWorker.instances).toHaveLength(1);
  });
});
