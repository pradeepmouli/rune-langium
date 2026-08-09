// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * WebSocket → CM Transport adapter (T008).
 *
 * Wraps the browser WebSocket API to implement @codemirror/lsp-client's
 * Transport interface: { send, subscribe, unsubscribe }, plus a `close`
 * the library doesn't define but callers need for lifecycle cleanup.
 */

import type { Transport } from '@codemirror/lsp-client';
import { withInstrumentation, Capture } from './instrumentation/core.js';

/**
 * `@codemirror/lsp-client`'s own `Transport` type has no `close` — the
 * library never manages transport lifecycle, leaving it entirely to the
 * consumer. `TransportProvider` needs to close the underlying WebSocket
 * before discarding a transport (on `reconnect()`/`dispose()`), or the
 * connection — and, under per-connection Durable Object keying, its
 * server-side DO and stored documents — leaks for the lifetime of the tab.
 */
export type CloseableTransport = Transport & { close(): void };

export const createWebSocketTransport = withInstrumentation(
  function createWebSocketTransport(uri: string, timeout = 2000): Promise<CloseableTransport> {
    return new Promise((resolve, reject) => {
      const handlers: ((value: string) => void)[] = [];
      const sock = new WebSocket(uri);
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        sock.close();
        reject(new Error(`WebSocket connection to ${uri} timed out after ${timeout}ms`));
      }, timeout);

      sock.onopen = () => {
        if (settled) return;
        settled = true;
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
          },
          close() {
            sock.close();
          }
        });
      };

      sock.onmessage = (e) => {
        const data = typeof e.data === 'string' ? e.data : String(e.data);
        for (const h of handlers) h(data);
      };

      sock.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        sock.close();
        reject(new Error(`WebSocket connection to ${uri} failed`));
      };
    });
    // `uri` is the studio's own LSP infra endpoint (never model content); the
    // returned Transport is a function-bearing object, not output-capturable.
  },
  {
    op: 'createWebSocketTransport',
    capture: Capture.Input,
    sanitize: (value, which) => (which === 'input' ? value : undefined)
  }
);
