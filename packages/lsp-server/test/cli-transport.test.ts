/**
 * CLI transport wiring tests.
 *
 * Regression tests for:
 *   - WebSocketTransport constructor API: must use { socket } options object
 *   - Pre-opened WebSocket must be marked connected via emit('open')
 *   - LSP server handles .rosetta document URIs without crashing
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';
import { WebSocketTransport } from '@lspeasy/core';
import { createRuneLspServer } from '../src/rune-dsl-server.js';
import type { RuneLspServer } from '../src/rune-dsl-server.js';

/** Poll isConnected() until true or timeout. */
function waitForConnection(transport: WebSocketTransport, timeout = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (transport.isConnected()) return resolve();
      if (Date.now() - start > timeout) return reject(new Error('Connection timeout'));
      setTimeout(check, 50);
    };
    check();
  });
}

// ────────────────────────────────────────────────────────────────────────────
// WebSocketTransport constructor API
// ────────────────────────────────────────────────────────────────────────────

describe('WebSocketTransport constructor', () => {
  it('accepts { socket } options object for server-mode sockets', () => {
    // Regression: passing bare WebSocket instead of { socket: ws } threw
    // "Either url or socket must be provided"
    const wss = new WebSocketServer({ port: 0 });
    const port = (wss.address() as { port: number }).port;

    return new Promise<void>((resolve, reject) => {
      wss.on('connection', (ws) => {
        try {
          const transport = new WebSocketTransport({ socket: ws as any });
          expect(transport).toBeDefined();
          // Mark the socket as connected (it's already open from wss)
          ws.emit('open');
          expect(transport.isConnected()).toBe(true);
          ws.close();
          wss.close();
          resolve();
        } catch (err) {
          wss.close();
          reject(err);
        }
      });

      // Connect a client to trigger the 'connection' event
      const client = new WebSocket(`ws://127.0.0.1:${port}`);
      client.on('error', reject);
    });
  }, 10_000);

  it('rejects missing socket and url in options', () => {
    // When neither socket nor url is provided, the constructor should throw
    expect(() => {
      new WebSocketTransport({});
    }).toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Pre-opened socket + emit('open')
// ────────────────────────────────────────────────────────────────────────────

describe('Pre-opened WebSocket transport', () => {
  it('is not connected until emit("open") is called', () => {
    const wss = new WebSocketServer({ port: 0 });
    const port = (wss.address() as { port: number }).port;

    return new Promise<void>((resolve, reject) => {
      wss.on('connection', (ws) => {
        try {
          const transport = new WebSocketTransport({ socket: ws as any });
          // Before emit('open'), transport may not be connected
          // because the 'open' event already fired before we set up the listener
          expect(transport.isConnected()).toBe(false);

          // Emit 'open' to trigger the handler inside WebSocketTransport
          ws.emit('open');
          expect(transport.isConnected()).toBe(true);

          ws.close();
          wss.close();
          resolve();
        } catch (err) {
          wss.close();
          reject(err);
        }
      });

      const client = new WebSocket(`ws://127.0.0.1:${port}`);
      client.on('error', reject);
    });
  }, 10_000);
});

// ────────────────────────────────────────────────────────────────────────────
// Full WebSocket LSP handshake (end-to-end via real sockets)
// ────────────────────────────────────────────────────────────────────────────

describe('WebSocket LSP server handshake', () => {
  let wss: WebSocketServer;
  let port: number;

  beforeAll(() => {
    wss = new WebSocketServer({ port: 0 });
    port = (wss.address() as { port: number }).port;
  });

  afterAll(() => {
    wss?.close();
  });

  it('completes initialize handshake via real WebSocket', async () => {
    // Set up server-side handler (mirrors cli.ts logic)
    const serverReady = new Promise<RuneLspServer>((resolve) => {
      wss.once('connection', async (ws) => {
        const lsp = createRuneLspServer();
        const transport = new WebSocketTransport({ socket: ws as any });
        ws.emit('open');
        await lsp.listen(transport);
        resolve(lsp);
      });
    });

    // Connect a client transport
    const clientTransport = new WebSocketTransport({
      url: `ws://127.0.0.1:${port}`
    });
    await waitForConnection(clientTransport);

    // Send a minimal initialize request
    const initRequest = {
      jsonrpc: '2.0' as const,
      id: 1,
      method: 'initialize',
      params: {
        processId: null,
        rootUri: 'file:///workspace',
        capabilities: {}
      }
    };

    const responsePromise = new Promise<any>((resolve) => {
      clientTransport.onMessage((msg) => {
        if ('id' in msg && msg.id === 1) resolve(msg);
      });
    });

    await clientTransport.send(initRequest);
    const response = await responsePromise;
    await serverReady;

    expect(response.result).toBeDefined();
    expect(response.result.capabilities).toBeDefined();
    expect(response.result.capabilities.hoverProvider).toBeTruthy();

    await clientTransport.close();
  }, 15_000);
});

// ────────────────────────────────────────────────────────────────────────────
// .rosetta extension handling
// ────────────────────────────────────────────────────────────────────────────

describe('Document URI extension handling', () => {
  let wss: WebSocketServer;
  let port: number;

  beforeAll(() => {
    wss = new WebSocketServer({ port: 0 });
    port = (wss.address() as { port: number }).port;
  });

  afterAll(() => {
    wss?.close();
  });

  it('accepts documents with proper file:///path/name.rosetta URIs', async () => {
    // Regression: URIs like file://name.rosetta (2 slashes, no path)
    // caused Langium to extract empty extension '' and crash with
    // "service registry contains no services for the extension ''"

    const serverReady = new Promise<void>((resolve) => {
      wss.once('connection', async (ws) => {
        const lsp = createRuneLspServer();
        const transport = new WebSocketTransport({ socket: ws as any });
        ws.emit('open');
        await lsp.listen(transport);
        resolve();
      });
    });

    const clientTransport = new WebSocketTransport({
      url: `ws://127.0.0.1:${port}`
    });
    await waitForConnection(clientTransport);

    // Initialize
    const initResponse = new Promise<any>((resolve) => {
      clientTransport.onMessage((msg) => {
        if ('id' in msg && msg.id === 1) resolve(msg);
      });
    });
    await clientTransport.send({
      jsonrpc: '2.0' as const,
      id: 1,
      method: 'initialize',
      params: { processId: null, rootUri: 'file:///workspace', capabilities: {} }
    });
    await initResponse;

    // Send initialized notification
    await clientTransport.send({
      jsonrpc: '2.0' as const,
      method: 'initialized',
      params: {}
    });
    await serverReady;

    // Open a document with a CORRECT URI (file:///workspace/model.rosetta)
    const diagnosticsPromise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Diagnostics timeout')), 10_000);
      clientTransport.onMessage((msg) => {
        if ('method' in msg && msg.method === 'textDocument/publishDiagnostics') {
          clearTimeout(timeout);
          resolve(msg);
        }
      });
    });

    await clientTransport.send({
      jsonrpc: '2.0' as const,
      method: 'textDocument/didOpen',
      params: {
        textDocument: {
          uri: 'file:///workspace/model.rosetta',
          languageId: 'rune-dsl',
          version: 1,
          text: 'namespace demo\n\ntype Foo:\n  bar string (1..1)\n'
        }
      }
    });

    const diagMsg = await diagnosticsPromise;
    expect(diagMsg.params.uri).toBe('file:///workspace/model.rosetta');
    expect(Array.isArray(diagMsg.params.diagnostics)).toBe(true);

    await clientTransport.close();
  }, 15_000);
});
