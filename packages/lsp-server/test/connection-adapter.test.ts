/**
 * Unit tests for the connection adapter.
 */

import { describe, it, expect, vi } from 'vitest';
import { createConnectionAdapter } from '../src/connection-adapter.js';

/** Minimal mock of an LSPServer (just the methods the adapter touches) */
function createMockServer() {
  const requestHandlers = new Map<string, Function>();
  const notificationHandlers = new Map<string, Function>();

  return {
    requestHandlers,
    notificationHandlers,
    onRequest: vi.fn((method: string, handler: Function) => {
      requestHandlers.set(method, handler);
      return { dispose: () => requestHandlers.delete(method) };
    }),
    onNotification: vi.fn((method: string, handler: Function) => {
      notificationHandlers.set(method, handler);
      return { dispose: () => notificationHandlers.delete(method) };
    }),
    sendRequest: vi.fn(async () => undefined),
    sendNotification: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined)
  };
}

describe('createConnectionAdapter', () => {
  it('should forward onRequest with string method', () => {
    const server = createMockServer();
    const conn = createConnectionAdapter(server as any);

    const handler = vi.fn();
    conn.onRequest('textDocument/hover', handler);

    expect(server.onRequest).toHaveBeenCalledWith('textDocument/hover', expect.any(Function));
  });

  it('should forward onRequest with ProtocolRequestType object', () => {
    const server = createMockServer();
    const conn = createConnectionAdapter(server as any);

    const handler = vi.fn();
    conn.onRequest({ method: 'textDocument/definition' }, handler);

    expect(server.onRequest).toHaveBeenCalledWith('textDocument/definition', expect.any(Function));
  });

  it('should forward onNotification with string method', () => {
    const server = createMockServer();
    const conn = createConnectionAdapter(server as any);

    const handler = vi.fn();
    conn.onNotification('textDocument/didOpen', handler);

    expect(server.onNotification).toHaveBeenCalledWith(
      'textDocument/didOpen',
      expect.any(Function)
    );
  });

  it('should map typed convenience methods — onHover', () => {
    const server = createMockServer();
    const conn = createConnectionAdapter(server as any);

    const handler = vi.fn();
    conn.onHover(handler);

    expect(server.onRequest).toHaveBeenCalledWith('textDocument/hover', expect.any(Function));
  });

  it('should map typed convenience methods — onCompletion', () => {
    const server = createMockServer();
    const conn = createConnectionAdapter(server as any);

    const handler = vi.fn();
    conn.onCompletion(handler);

    expect(server.onRequest).toHaveBeenCalledWith('textDocument/completion', expect.any(Function));
  });

  it('should map typed convenience methods — onDefinition', () => {
    const server = createMockServer();
    const conn = createConnectionAdapter(server as any);

    const handler = vi.fn();
    conn.onDefinition(handler);

    expect(server.onRequest).toHaveBeenCalledWith('textDocument/definition', expect.any(Function));
  });

  it('should map typed convenience methods — onDidOpenTextDocument', () => {
    const server = createMockServer();
    const conn = createConnectionAdapter(server as any);

    const handler = vi.fn();
    conn.onDidOpenTextDocument(handler);

    expect(server.onNotification).toHaveBeenCalledWith(
      'textDocument/didOpen',
      expect.any(Function)
    );
  });

  it('should map sendDiagnostics to sendNotification', async () => {
    const server = createMockServer();
    const conn = createConnectionAdapter(server as any);

    const params = { uri: 'file:///test.rosetta', diagnostics: [] };
    await conn.sendDiagnostics(params);

    expect(server.sendNotification).toHaveBeenCalledWith('textDocument/publishDiagnostics', params);
  });

  it('should handle sendNotification with string method', async () => {
    const server = createMockServer();
    const conn = createConnectionAdapter(server as any);

    const params = { type: 3, message: 'test' };
    await conn.sendNotification('window/logMessage', params);

    expect(server.sendNotification).toHaveBeenCalledWith('window/logMessage', params);
  });

  it('should handle sendNotification with ProtocolNotificationType object', async () => {
    const server = createMockServer();
    const conn = createConnectionAdapter(server as any);

    const params = { type: 3, message: 'test' };
    await conn.sendNotification({ method: 'window/logMessage' }, params);

    expect(server.sendNotification).toHaveBeenCalledWith('window/logMessage', params);
  });

  it('should provide a listen() method that is a no-op', () => {
    const server = createMockServer();
    const conn = createConnectionAdapter(server as any);

    expect(() => conn.listen()).not.toThrow();
  });

  it('should provide console sub-object', () => {
    const server = createMockServer();
    const conn = createConnectionAdapter(server as any);

    expect(conn.console).toBeDefined();
    expect(typeof conn.console.error).toBe('function');
    expect(typeof conn.console.warn).toBe('function');
    expect(typeof conn.console.info).toBe('function');
    expect(typeof conn.console.log).toBe('function');
  });

  it('should provide languages sub-object with nested features', () => {
    const server = createMockServer();
    const conn = createConnectionAdapter(server as any);

    expect(conn.languages).toBeDefined();
    expect(conn.languages.semanticTokens).toBeDefined();
    expect(typeof conn.languages.semanticTokens.on).toBe('function');
    expect(typeof conn.languages.callHierarchy.onPrepare).toBe('function');
    expect(typeof conn.languages.typeHierarchy.onPrepare).toBe('function');
    expect(typeof conn.languages.inlayHint.on).toBe('function');
  });

  it('should provide workspace sub-object', () => {
    const server = createMockServer();
    const conn = createConnectionAdapter(server as any);

    expect(conn.workspace).toBeDefined();
    expect(typeof conn.workspace.getConfiguration).toBe('function');
    expect(typeof conn.workspace.applyEdit).toBe('function');
    expect(typeof conn.workspace.onDidCreateFiles).toBe('function');
  });

  it('should provide client sub-object with register', () => {
    const server = createMockServer();
    const conn = createConnectionAdapter(server as any);

    expect(conn.client).toBeDefined();
    expect(typeof conn.client.register).toBe('function');
  });

  it('should return no-op disposable for unknown methods starting with on', () => {
    const server = createMockServer();
    const conn = createConnectionAdapter(server as any);

    const result = conn.onSomethingUnknown(() => {});
    expect(result).toBeDefined();
    expect(typeof result.dispose).toBe('function');
  });

  it('should forward request handler params through to Langium', async () => {
    const server = createMockServer();
    const conn = createConnectionAdapter(server as any);

    const handler = vi.fn().mockResolvedValue({ contents: 'hello' });
    conn.onHover(handler);

    // Get the wrapped handler that was registered with the server
    const wrappedHandler = server.requestHandlers.get('textDocument/hover')!;
    expect(wrappedHandler).toBeDefined();

    // Simulate a call with params and token
    const params = {
      textDocument: { uri: 'file:///test.rosetta' },
      position: { line: 0, character: 0 }
    };
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose: () => {} })
    };

    const result = await wrappedHandler(params, token);

    expect(handler).toHaveBeenCalledWith(params, token);
    expect(result).toEqual({ contents: 'hello' });
  });

  it('should map onRenameRequest to textDocument/rename', () => {
    const server = createMockServer();
    const conn = createConnectionAdapter(server as any);

    const handler = vi.fn();
    conn.onRenameRequest(handler);

    expect(server.onRequest).toHaveBeenCalledWith('textDocument/rename', expect.any(Function));
  });

  it('should map onFoldingRanges to textDocument/foldingRange', () => {
    const server = createMockServer();
    const conn = createConnectionAdapter(server as any);

    const handler = vi.fn();
    conn.onFoldingRanges(handler);

    expect(server.onRequest).toHaveBeenCalledWith(
      'textDocument/foldingRange',
      expect.any(Function)
    );
  });

  it('should map onDocumentSymbol to textDocument/documentSymbol', () => {
    const server = createMockServer();
    const conn = createConnectionAdapter(server as any);

    const handler = vi.fn();
    conn.onDocumentSymbol(handler);

    expect(server.onRequest).toHaveBeenCalledWith(
      'textDocument/documentSymbol',
      expect.any(Function)
    );
  });

  it('should map workspace file operation handlers via languages proxy', () => {
    const server = createMockServer();
    const conn = createConnectionAdapter(server as any);

    conn.languages.semanticTokens.on(() => {});
    expect(server.onRequest).toHaveBeenCalledWith(
      'textDocument/semanticTokens/full',
      expect.any(Function)
    );
  });
});
