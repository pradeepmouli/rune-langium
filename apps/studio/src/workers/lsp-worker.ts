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
 *
 * The client generates a unique clientId and sends messages wrapped
 * in envelopes. We extract the clientId from the first message and
 * use it to create a matching SharedWorkerTransport for proper routing.
 */
function servePort(port: MessagePort): void {
  // Wait for the first message to extract the clientId from the envelope
  const handleFirstMessage = (e: MessageEvent) => {
    const data = e.data;
    
    // Check if this is an envelope with clientId
    let clientId: string;
    if (data && typeof data === 'object' && 'clientId' in data && typeof data.clientId === 'string') {
      clientId = data.clientId;
    } else {
      // Fallback: generate a clientId if the client didn't send one
      clientId = `server-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      console.warn('[lsp-worker] No clientId in first message, using generated ID:', clientId);
    }

    // Remove the first message handler
    port.removeEventListener('message', handleFirstMessage);

    // Create transport with matching clientId
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

    // Re-dispatch the first message to the transport so it gets processed
    port.dispatchEvent(new MessageEvent('message', { data }));
  };

  port.addEventListener('message', handleFirstMessage);
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
