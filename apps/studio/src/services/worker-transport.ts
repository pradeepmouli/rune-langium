/**
 * Worker → CM Transport adapter (T009).
 *
 * Creates a CM Transport backed by a SharedWorker (primary) or
 * dedicated Worker (fallback) running the Langium LSP server in-browser.
 */

import type { Transport } from '@codemirror/lsp-client';

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

    worker.port.onmessage = (e: MessageEvent) => {
      const data = typeof e.data === 'string' ? e.data : String(e.data);
      for (const h of handlers) h(data);
    };

    worker.port.start();

    return {
      send(message: string) {
        worker.port.postMessage(message);
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

  worker.onmessage = (e: MessageEvent) => {
    const data = typeof e.data === 'string' ? e.data : String(e.data);
    for (const h of handlers) h(data);
  };

  return {
    send(message: string) {
      worker.postMessage(message);
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
