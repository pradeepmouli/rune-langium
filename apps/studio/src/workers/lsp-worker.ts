/// <reference lib="webworker" />

/**
 * LSP Worker entry point (T010).
 *
 * Runs the Rune DSL LSP server inside a SharedWorker (preferred)
 * or a dedicated Worker (fallback). Uses native @lspeasy/core
 * transports for MessagePort ↔ LSPServer communication.
 *
 * In SharedWorker mode, each connected port gets its own LSP server
 * instance so that workspace state is isolated between tabs.
 */

import type { Transport, Message } from '@lspeasy/core';
import { DedicatedWorkerTransport } from '@lspeasy/core';
import { createRuneLspServer } from '@rune-langium/lsp-server';

// ────────────────────────────────────────────────────────────────────────────
// Port Transport Adapter
// ────────────────────────────────────────────────────────────────────────────

/**
 * Create a simple Transport for a MessagePort that unwraps envelopes.
 * 
 * The client side uses SharedWorkerTransport which sends envelopes with
 * {clientId, message}. This adapter unwraps those envelopes and passes
 * plain Message objects to the LSP server.
 */
function createPortTransport(port: MessagePort): Transport {
  const messageHandlers = new Set<(message: Message) => void>();
  const errorHandlers = new Set<(error: Error) => void>();
  const closeHandlers = new Set<() => void>();
  let connected = true;

  const handleMessage = (e: MessageEvent) => {
    if (!connected) return;

    try {
      const data = e.data;
      let message: Message;

      // Unwrap envelope if present
      if (data && typeof data === 'object' && 'clientId' in data && 'message' in data) {
        message = data.message as Message;
      } else {
        // Plain message (for backwards compatibility or direct communication)
        message = data as Message;
      }

      for (const handler of messageHandlers) {
        handler(message);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      for (const handler of errorHandlers) {
        handler(error);
      }
    }
  };

  const handleError = () => {
    const error = new Error('MessagePort error');
    for (const handler of errorHandlers) {
      handler(error);
    }
  };

  port.addEventListener('message', handleMessage);
  port.addEventListener('messageerror', handleError);

  return {
    async send(message: Message): Promise<void> {
      if (!connected) {
        throw new Error('Transport is closed');
      }
      // Send plain message (client will wrap in envelope if needed)
      port.postMessage(message);
    },

    onMessage(handler: (message: Message) => void) {
      messageHandlers.add(handler);
      return {
        dispose: () => {
          messageHandlers.delete(handler);
        }
      };
    },

    onError(handler: (error: Error) => void) {
      errorHandlers.add(handler);
      return {
        dispose: () => {
          errorHandlers.delete(handler);
        }
      };
    },

    onClose(handler: () => void) {
      closeHandlers.add(handler);
      return {
        dispose: () => {
          closeHandlers.delete(handler);
        }
      };
    },

    async close(): Promise<void> {
      if (!connected) return;
      
      connected = false;
      port.removeEventListener('message', handleMessage);
      port.removeEventListener('messageerror', handleError);
      
      for (const handler of closeHandlers) {
        handler();
      }
      
      messageHandlers.clear();
      errorHandlers.clear();
      closeHandlers.clear();
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
  const transport = createPortTransport(port);

  const { listen } = createRuneLspServer();
  listen(transport).catch((err) => {
    console.error('[lsp-worker] LSP listen error:', err);
  });

  // Clean up transport when port encounters an error
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

  // Adapt the worker global scope to a Worker-like interface expected by
  // DedicatedWorkerTransport, without claiming the scope itself is a Worker.
  const workerLike = {
    postMessage: (...args: Parameters<DedicatedWorkerGlobalScope['postMessage']>) =>
      workerScope.postMessage(...args),
    addEventListener: workerScope.addEventListener.bind(workerScope),
    removeEventListener: workerScope.removeEventListener.bind(workerScope),
    dispatchEvent: workerScope.dispatchEvent.bind(workerScope),
  } as unknown as Worker;

  const transport = new DedicatedWorkerTransport({
    worker: workerLike
  });

  const { listen } = createRuneLspServer();
  listen(transport).catch((err) => {
    console.error('[lsp-worker] LSP listen error:', err);
  });
}
