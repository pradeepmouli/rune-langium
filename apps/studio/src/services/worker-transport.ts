/**
 * Worker → CM Transport adapter (T009).
 *
 * Creates a CM Transport backed by a SharedWorker (primary) or
 * dedicated Worker (fallback) running the Langium LSP server in-browser.
 *
 * Uses @lspeasy/core worker transports which handle Message objects
 * natively, with an adapter layer for @codemirror/lsp-client's string protocol.
 */

import type { Transport } from '@codemirror/lsp-client';
import { SharedWorkerTransport, DedicatedWorkerTransport, type Message } from '@lspeasy/core';

/**
 * Create a Worker-based transport for @codemirror/lsp-client.
 *
 * Tries SharedWorker first for cross-tab sharing.
 * Falls back to a dedicated Worker if SharedWorker is unsupported.
 */
export function createWorkerTransport(): Transport {
  const handlers: ((value: string) => void)[] = [];

  // Try SharedWorker first
  if (typeof SharedWorker !== 'undefined') {
    const worker = new SharedWorker(new URL('../workers/lsp-worker.ts', import.meta.url), {
      type: 'module',
      name: 'rune-lsp-worker'
    });

    // Generate a unique client ID for this connection
    const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Start the port before creating the transport
    worker.port.start();

    const transport = new SharedWorkerTransport({
      port: worker.port,
      clientId
    });

    // Subscribe to messages from the LSP server and convert to strings
    transport.onMessage((message: Message) => {
      const data = JSON.stringify(message);
      for (const h of handlers) h(data);
    });

    return {
      send(message: string) {
        try {
          const parsed = JSON.parse(message) as Message;
          transport.send(parsed).catch((err) => {
            console.error('[worker-transport] Send error:', err);
          });
        } catch (err) {
          console.error('[worker-transport] JSON parse error:', err);
        }
      },
      subscribe(handler: (value: string) => void) {
        handlers.push(handler);
      },
      unsubscribe(handler: (value: string) => void) {
        const idx = handlers.indexOf(handler);
        if (idx >= 0) handlers.splice(idx, 1);
      }
    };
  }

  // Fallback: dedicated Worker
  const worker = new Worker(new URL('../workers/lsp-worker.ts', import.meta.url), {
    type: 'module',
    name: 'rune-lsp-worker'
  });

  const transport = new DedicatedWorkerTransport({
    worker
  });

  // Subscribe to messages from the LSP server and convert to strings
  transport.onMessage((message: Message) => {
    const data = JSON.stringify(message);
    for (const h of handlers) h(data);
  });

  return {
    send(message: string) {
      try {
        const parsed = JSON.parse(message) as Message;
        transport.send(parsed).catch((err) => {
          console.error('[worker-transport] Send error:', err);
        });
      } catch (err) {
        console.error('[worker-transport] JSON parse error:', err);
      }
    },
    subscribe(handler: (value: string) => void) {
      handlers.push(handler);
    },
    unsubscribe(handler: (value: string) => void) {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    }
  };
}
