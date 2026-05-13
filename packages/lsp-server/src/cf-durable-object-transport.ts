// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * `Transport` implementation for `@rune-langium/lsp-server` running inside a
 * Cloudflare Durable Object with the CF Hibernation API.
 *
 * @remarks
 * The canonical {@link @lspeasy/core!WebSocketTransport} subscribes to messages
 * via the WebSocket's `addEventListener` / `on('message', ...)` interface.
 * That works for Node `ws.WebSocket` and browser `WebSocket` instances, but
 * NOT for a Workers Durable Object: under Hibernation, inbound messages are
 * delivered to the DO's `webSocketMessage(ws, data)` hook rather than via
 * the WebSocket event listeners. Attaching listeners to the CF WebSocket
 * also won't survive a hibernation cycle.
 *
 * `DurableObjectWebSocketTransport` flips the model: the DO calls
 * {@link receive} from its `webSocketMessage` hook to push each incoming
 * raw payload through the transport, where it's parsed into a JSON-RPC
 * {@link Message} and dispatched to registered handlers. Outbound `send`
 * calls `ws.send(JSON.stringify(...))` directly.
 *
 * Lifecycle:
 * - Constructor accepts the CF `WebSocket` instance from the DO's `fetch()`
 *   upgrade handler.
 * - The DO is expected to call {@link receive} on every `webSocketMessage`
 *   and {@link signalClose} on `webSocketClose`. Both are idempotent and
 *   safe to call multiple times.
 * - The transport never adds DOM-style event listeners to the WebSocket
 *   because they aren't reliable under Hibernation. The DO's hooks are
 *   the only source of truth.
 *
 * @example
 * ```ts
 * // Inside the DO:
 * private transport = new DurableObjectWebSocketTransport(ws);
 * private lsp = createRuneLspServer();
 *
 * async webSocketMessage(_ws: WebSocket, raw: string | ArrayBuffer) {
 *   this.transport.receive(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
 * }
 * async webSocketClose() {
 *   this.transport.signalClose();
 * }
 *
 * // Once per DO lifetime, after first message:
 * await this.lsp.listen(this.transport);
 * ```
 */

import type { Message } from '@lspeasy/core';
import type { Transport } from '@lspeasy/core';
import type { Disposable } from '@lspeasy/core';

/**
 * Minimal CF WebSocket surface this transport uses. CF Workers' WebSocket
 * implements a subset of the browser API; we only depend on `send` (to
 * push outbound payloads) and `readyState` (for `isConnected`).
 */
interface CfWebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close?(code?: number, reason?: string): void;
}

const OPEN_STATE = 1;

export class DurableObjectWebSocketTransport implements Transport {
  private readonly socket: CfWebSocketLike;
  private readonly messageHandlers = new Set<(message: Message) => void>();
  private readonly errorHandlers = new Set<(error: Error) => void>();
  private readonly closeHandlers = new Set<() => void>();
  private closed = false;

  constructor(socket: CfWebSocketLike) {
    this.socket = socket;
  }

  // ── Inbound (driven by DO hooks) ───────────────────────────────────────

  /**
   * Push a raw payload received via the DO's `webSocketMessage` hook
   * through the transport. The payload is JSON-parsed and dispatched to
   * registered `onMessage` handlers; parse failures are routed to
   * `onError` handlers.
   *
   * Idempotent and safe to call after {@link signalClose}; messages
   * arriving after close are dropped silently to match
   * {@link @lspeasy/core!WebSocketTransport} behaviour.
   */
  receive(raw: string): void {
    if (this.closed) return;
    let parsed: Message;
    try {
      parsed = JSON.parse(raw) as Message;
    } catch (err) {
      this.notifyError(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    for (const handler of this.messageHandlers) {
      try {
        handler(parsed);
      } catch (err) {
        this.notifyError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  /**
   * Signal a connection close received via the DO's `webSocketClose` hook.
   * Notifies registered `onClose` handlers exactly once; subsequent calls
   * are no-ops.
   */
  signalClose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const handler of this.closeHandlers) {
      try {
        handler();
      } catch (err) {
        this.notifyError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  // ── Transport interface ────────────────────────────────────────────────

  async send(message: Message): Promise<void> {
    if (this.closed) {
      throw new Error('transport is closed');
    }
    if (this.socket.readyState !== OPEN_STATE) {
      throw new Error(`socket not open (readyState=${this.socket.readyState})`);
    }
    this.socket.send(JSON.stringify(message));
  }

  onMessage(handler: (message: Message) => void): Disposable {
    this.messageHandlers.add(handler);
    return { dispose: () => this.messageHandlers.delete(handler) };
  }

  onError(handler: (error: Error) => void): Disposable {
    this.errorHandlers.add(handler);
    return { dispose: () => this.errorHandlers.delete(handler) };
  }

  onClose(handler: () => void): Disposable {
    this.closeHandlers.add(handler);
    return { dispose: () => this.closeHandlers.delete(handler) };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      this.socket.close?.(1000, 'normal');
    } catch {
      // Ignore — DO socket may already be in a non-closable state.
    }
    for (const handler of this.closeHandlers) {
      try {
        handler();
      } catch {
        // Already closing — swallow to keep close() resolving.
      }
    }
  }

  isConnected(): boolean {
    return !this.closed && this.socket.readyState === OPEN_STATE;
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private notifyError(error: Error): void {
    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch {
        // Don't recurse into notifyError from within an error handler.
      }
    }
  }
}
