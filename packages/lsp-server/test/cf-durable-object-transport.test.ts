// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi } from 'vitest';
import type { Message } from '@lspeasy/core';
import { DurableObjectWebSocketTransport } from '../src/cf-durable-object-transport.js';

/**
 * Minimal CF WebSocket stand-in. The real CF WebSocket has more surface
 * but `DurableObjectWebSocketTransport` only depends on `send` and
 * `readyState`.
 */
function makeSocket(readyState = 1) {
  const sends: string[] = [];
  let state = readyState;
  return {
    sends,
    socket: {
      get readyState() {
        return state;
      },
      send(data: string) {
        sends.push(data);
      },
      close() {
        state = 3; // CLOSED
      }
    },
    setState(s: number) {
      state = s;
    }
  };
}

describe('DurableObjectWebSocketTransport', () => {
  it('dispatches received messages to onMessage handlers', () => {
    const { socket } = makeSocket();
    const t = new DurableObjectWebSocketTransport(socket);
    const handler = vi.fn();
    t.onMessage(handler);

    t.receive('{"jsonrpc":"2.0","method":"initialize","id":1,"params":{}}');

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0]).toEqual({
      jsonrpc: '2.0',
      method: 'initialize',
      id: 1,
      params: {}
    });
  });

  it('routes JSON parse failures to onError handlers', () => {
    const { socket } = makeSocket();
    const t = new DurableObjectWebSocketTransport(socket);
    const onMessage = vi.fn();
    const onError = vi.fn();
    t.onMessage(onMessage);
    t.onError(onError);

    t.receive('{not json');

    expect(onMessage).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('send() writes JSON to the underlying socket', async () => {
    const harness = makeSocket();
    const t = new DurableObjectWebSocketTransport(harness.socket);

    await t.send({ jsonrpc: '2.0', id: 1, result: 'ok' } as Message);

    expect(harness.sends).toHaveLength(1);
    expect(JSON.parse(harness.sends[0])).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: 'ok'
    });
  });

  it('send() rejects when socket is not open', async () => {
    const harness = makeSocket(0 /* CONNECTING */);
    const t = new DurableObjectWebSocketTransport(harness.socket);

    await expect(t.send({ jsonrpc: '2.0' } as Message)).rejects.toThrow(/not open/);
  });

  it('signalClose() fires onClose handlers exactly once', () => {
    const { socket } = makeSocket();
    const t = new DurableObjectWebSocketTransport(socket);
    const onClose = vi.fn();
    t.onClose(onClose);

    t.signalClose();
    t.signalClose(); // idempotent

    expect(onClose).toHaveBeenCalledOnce();
    expect(t.isConnected()).toBe(false);
  });

  it('drops messages received after close', () => {
    const { socket } = makeSocket();
    const t = new DurableObjectWebSocketTransport(socket);
    const onMessage = vi.fn();
    t.onMessage(onMessage);

    t.signalClose();
    t.receive('{"jsonrpc":"2.0","method":"initialize","id":1}');

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('Disposable returned by onMessage unsubscribes', () => {
    const { socket } = makeSocket();
    const t = new DurableObjectWebSocketTransport(socket);
    const handler = vi.fn();
    const sub = t.onMessage(handler);

    sub.dispose();
    t.receive('{"jsonrpc":"2.0","method":"x"}');

    expect(handler).not.toHaveBeenCalled();
  });

  it('isConnected reflects socket readyState and close state', async () => {
    const harness = makeSocket();
    const t = new DurableObjectWebSocketTransport(harness.socket);
    expect(t.isConnected()).toBe(true);

    harness.setState(2); // CLOSING
    expect(t.isConnected()).toBe(false);

    harness.setState(1); // back to OPEN
    expect(t.isConnected()).toBe(true);

    await t.close();
    expect(t.isConnected()).toBe(false);
  });

  it('close() invokes underlying socket close and notifies onClose', async () => {
    const harness = makeSocket();
    const t = new DurableObjectWebSocketTransport(harness.socket);
    const onClose = vi.fn();
    t.onClose(onClose);

    await t.close();

    expect(onClose).toHaveBeenCalledOnce();
    expect(harness.socket.readyState).toBe(3); // CLOSED after socket.close()
  });
});
