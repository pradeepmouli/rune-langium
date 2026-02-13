/**
 * WebSocket → CM Transport adapter (T008).
 *
 * Wraps the browser WebSocket API to implement @codemirror/lsp-client's
 * Transport interface: { send, subscribe, unsubscribe }.
 */

import type { Transport } from '@codemirror/lsp-client';

/**
 * Create a WebSocket transport for @codemirror/lsp-client.
 *
 * Returns a promise that resolves once the WebSocket connection is open.
 * Rejects if the connection fails or times out.
 */
export function createWebSocketTransport(uri: string, timeout = 2000): Promise<Transport> {
  return new Promise((resolve, reject) => {
    const handlers: ((value: string) => void)[] = [];
    const sock = new WebSocket(uri);

    const timer = setTimeout(() => {
      sock.close();
      reject(new Error(`WebSocket connection to ${uri} timed out after ${timeout}ms`));
    }, timeout);

    sock.onopen = () => {
      clearTimeout(timer);
      resolve({
        send(message: string) {
          sock.send(message);
        },
        subscribe(handler: (value: string) => void) {
          handlers.push(handler);
        },
        unsubscribe(handler: (value: string) => void) {
          const idx = handlers.indexOf(handler);
          if (idx >= 0) handlers.splice(idx, 1);
        }
      });
    };

    sock.onmessage = (e) => {
      const data = typeof e.data === 'string' ? e.data : String(e.data);
      for (const h of handlers) h(data);
    };

    sock.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`WebSocket connection to ${uri} failed`));
    };
  });
}
