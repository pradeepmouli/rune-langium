/// <reference lib="webworker" />

/**
 * LSP Worker entry point (T010).
 *
 * Runs the Rune DSL LSP server inside a SharedWorker (preferred)
 * or a dedicated Worker (fallback). Each connected port gets its
 * own @lspeasy/core Transport that bridges MessagePort ↔ LSPServer.
 *
 * Protocol:
 *   - Incoming messages on the port are JSON-RPC strings from
 *     @codemirror/lsp-client.
 *   - The Transport parses them into Message objects for @lspeasy.
 *   - Outgoing messages from the server are serialised back to
 *     JSON strings and posted to the port.
 */

import type { Message, Transport } from '@lspeasy/core';
import { createRuneLspServer } from '@rune-langium/lsp-server';

// ────────────────────────────────────────────────────────────────────────────
// Port → Transport adapter
// ────────────────────────────────────────────────────────────────────────────

/**
 * Create an @lspeasy/core Transport backed by a MessagePort or
 * the global Worker scope (self.postMessage / self.onmessage).
 */
function createPortTransport(
  postFn: (data: string) => void,
  onMessageFn: (handler: (data: string) => void) => void,
  onErrorFn?: (handler: (err: Error) => void) => void
): Transport {
  let connected = true;
  const messageHandlers: ((message: Message) => void)[] = [];
  const errorHandlers: ((error: Error) => void)[] = [];
  const closeHandlers: (() => void)[] = [];

  // Wire up incoming messages (JSON strings → Message objects)
  onMessageFn((data: string) => {
    try {
      const msg = JSON.parse(data) as Message;
      for (const h of messageHandlers) h(msg);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      for (const h of errorHandlers) h(error);
    }
  });

  if (onErrorFn) {
    onErrorFn((err: Error) => {
      for (const h of errorHandlers) h(err);
    });
  }

  return {
    async send(message: Message): Promise<void> {
      if (!connected) {
        throw new Error('Transport is closed');
      }
      postFn(JSON.stringify(message));
    },

    onMessage(handler: (message: Message) => void) {
      messageHandlers.push(handler);
      return {
        dispose() {
          const idx = messageHandlers.indexOf(handler);
          if (idx >= 0) messageHandlers.splice(idx, 1);
        }
      };
    },

    onError(handler: (error: Error) => void) {
      errorHandlers.push(handler);
      return {
        dispose() {
          const idx = errorHandlers.indexOf(handler);
          if (idx >= 0) errorHandlers.splice(idx, 1);
        }
      };
    },

    onClose(handler: () => void) {
      closeHandlers.push(handler);
      return {
        dispose() {
          const idx = closeHandlers.indexOf(handler);
          if (idx >= 0) closeHandlers.splice(idx, 1);
        }
      };
    },

    async close(): Promise<void> {
      connected = false;
      for (const h of closeHandlers) h();
    },

    isConnected(): boolean {
      return connected;
    }
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Entry — SharedWorker or dedicated Worker
// ────────────────────────────────────────────────────────────────────────────

/**
 * Serve a single port with its own LSP server instance.
 *
 * Each tab/connection creates an independent server so that
 * workspace state is isolated between tabs.
 */
function servePort(port: MessagePort): void {
  const transport = createPortTransport(
    (data) => port.postMessage(data),
    (handler) => {
      port.onmessage = (e: MessageEvent) => {
        const raw = typeof e.data === 'string' ? e.data : String(e.data);
        handler(raw);
      };
    },
    (handler) => {
      port.addEventListener('messageerror', () => {
        handler(new Error('MessagePort messageerror'));
      });
    }
  );

  const { listen } = createRuneLspServer();
  listen(transport).catch((err: unknown) => {
    console.error('[lsp-worker] LSP listen error:', err);
  });

  // Clean up transport when port encounters an error so the server
  // instance can be garbage-collected when the tab disconnects.
  port.addEventListener('messageerror', () => {
    transport.close().catch(() => {});
  });
}

// Detect whether we are running as SharedWorker or dedicated Worker.

if ('onconnect' in self) {
  // SharedWorker — each tab that opens a port gets an independent server.
  const sharedScope = self as unknown as SharedWorkerGlobalScope;
  sharedScope.onconnect = (e: MessageEvent) => {
    const port = e.ports[0]!;
    port.start();
    servePort(port);
  };
} else {
  // Dedicated Worker — single connection through global scope.
  const workerScope = self as unknown as DedicatedWorkerGlobalScope;
  const transport = createPortTransport(
    (data) => workerScope.postMessage(data),
    (handler) => {
      workerScope.onmessage = (e: MessageEvent) => {
        const raw = typeof e.data === 'string' ? e.data : String(e.data);
        handler(raw);
      };
    }
  );

  const { listen } = createRuneLspServer();
  listen(transport).catch((err: unknown) => {
    console.error('[lsp-worker] LSP listen error:', err);
  });
}
