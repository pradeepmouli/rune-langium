// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

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
import { createRuneLspServer } from '@rune-langium/lsp-server';

interface CodegenGenerateMessage {
  type: 'codegen:generate';
  target?: string;
}

function isCodegenMessage(data: unknown): data is { type: string } {
  return (
    !!data &&
    typeof data === 'object' &&
    'type' in data &&
    typeof (data as Record<string, unknown>)['type'] === 'string' &&
    String((data as Record<string, unknown>)['type']).startsWith('codegen:')
  );
}

function isCodegenGenerateMessage(data: unknown): data is CodegenGenerateMessage {
  return isCodegenMessage(data) && data.type === 'codegen:generate';
}

function handleCodegenGenerateMessage(
  data: unknown,
  respond: (message: { type: 'codegen:outdated' }) => void
): void {
  if (!isCodegenGenerateMessage(data)) {
    return;
  }

  try {
    respond({ type: 'codegen:outdated' });
  } catch (err) {
    console.error('[lsp-worker] Failed to post codegen response:', err);
  }
}

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
      if (isCodegenMessage(data)) {
        return;
      }
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

  const handleError = (event: MessageEvent) => {
    const error = new Error(`MessagePort error: ${String(event.data)}`);
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

/**
 * Create a Transport for a dedicated worker global scope.
 *
 * Unlike the shared-port transport, there are no clientId envelopes to unwrap,
 * but we still need to filter `codegen:*` traffic so preview requests do not
 * get forwarded into the LSP server as JSON-RPC messages.
 */
function createDedicatedScopeTransport(scope: DedicatedWorkerGlobalScope): Transport {
  const messageHandlers = new Set<(message: Message) => void>();
  const errorHandlers = new Set<(error: Error) => void>();
  const closeHandlers = new Set<() => void>();
  let connected = true;

  const handleMessage = (e: MessageEvent) => {
    if (!connected) return;

    try {
      if (isCodegenMessage(e.data)) {
        return;
      }

      const message = e.data as Message;
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

  const handleError = (event: MessageEvent) => {
    const error = new Error(`Dedicated worker message error: ${String(event.data)}`);
    for (const handler of errorHandlers) {
      handler(error);
    }
  };

  scope.addEventListener('message', handleMessage);
  scope.addEventListener('messageerror', handleError);

  return {
    async send(message: Message): Promise<void> {
      if (!connected) {
        throw new Error('Transport is closed');
      }
      scope.postMessage(message);
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
      scope.removeEventListener('message', handleMessage);
      scope.removeEventListener('messageerror', handleError);

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
  listen(transport).catch((err: unknown) => {
    console.error('[lsp-worker] LSP listen error:', err);
  });

  // T084/T085: handle codegen:generate requests forwarded via this SharedWorker port.
  // TODO: Full document-builder integration — once the LSP server exposes built documents
  // via a shared reference, call generate(builtDocuments, { target: msg.target }) here
  // and port.postMessage a codegen:result instead of codegen:outdated.
  port.addEventListener('message', (e: MessageEvent) => {
    handleCodegenGenerateMessage(e.data, (message) => port.postMessage(message));
  });

  // Clean up transport when port encounters an error
  port.addEventListener('messageerror', (event: MessageEvent) => {
    console.error('[lsp-worker] Port messageerror:', event.data);
    transport.close().catch((err: unknown) => {
      console.error('[lsp-worker] Failed to close transport after messageerror:', err);
    });
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
  const transport = createDedicatedScopeTransport(workerScope);

  const { listen } = createRuneLspServer();
  listen(transport).catch((err: unknown) => {
    console.error('[lsp-worker] LSP listen error:', err);
  });

  // T084/T085: handle codegen:generate messages from the studio's CodePreviewPanel.
  // TODO: Full document-builder integration — once the LSP server exposes built documents
  // via a shared reference, call generate(builtDocuments, { target: msg.target }) here
  // and postMessage a codegen:result instead of codegen:outdated.
  workerScope.addEventListener('message', (e: MessageEvent) => {
    handleCodegenGenerateMessage(e.data, (message) => workerScope.postMessage(message));
  });
}
