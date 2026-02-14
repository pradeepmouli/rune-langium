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

  start() {
    this.started = true;
  }

  postMessage(data: unknown) {
    this.sent.push(data);
  }

  simulateMessage(data: string) {
    this.onmessage?.(new MessageEvent('message', { data }));
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

    expect(worker.port.sent).toEqual(['{"jsonrpc":"2.0","id":1}']);
  });

  it('delivers incoming messages to subscribers', () => {
    const transport = createWorkerTransport();
    const worker = MockSharedWorker.instances[0]!;
    const handler = vi.fn();

    transport.subscribe(handler);
    worker.port.simulateMessage('{"jsonrpc":"2.0","result":null}');

    expect(handler).toHaveBeenCalledWith('{"jsonrpc":"2.0","result":null}');
  });

  it('unsubscribes handlers', () => {
    const transport = createWorkerTransport();
    const worker = MockSharedWorker.instances[0]!;
    const handler = vi.fn();

    transport.subscribe(handler);
    transport.unsubscribe(handler);
    worker.port.simulateMessage('data');

    expect(handler).not.toHaveBeenCalled();
  });

  it('falls back to dedicated Worker when SharedWorker unavailable', () => {
    // Remove SharedWorker from global
    vi.stubGlobal('SharedWorker', undefined);

    class MockWorker {
      static instances: MockWorker[] = [];
      onmessage: ((e: MessageEvent) => void) | null = null;
      sent: unknown[] = [];
      constructor(public url: URL | string) {
        MockWorker.instances.push(this);
      }
      postMessage(data: unknown) {
        this.sent.push(data);
      }
    }
    vi.stubGlobal('Worker', MockWorker);

    const transport = createWorkerTransport();

    expect(transport).toBeDefined();
    expect(MockWorker.instances).toHaveLength(1);
  });
});
