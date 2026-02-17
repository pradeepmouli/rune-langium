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

import { SharedWorkerTransport, DedicatedWorkerTransport } from '@lspeasy/core';
import { createRuneLspServer } from '@rune-langium/lsp-server';

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
  // Generate a unique client ID for this connection
  const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const transport = new SharedWorkerTransport({
    port,
    clientId
  });

  const { listen } = createRuneLspServer();
  listen(transport).catch((err) => {
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
