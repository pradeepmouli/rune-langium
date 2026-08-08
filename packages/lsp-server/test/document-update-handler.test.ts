// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi } from 'vitest';
import { URI } from 'langium';
import { createRuneLspServer } from '../src/rune-dsl-server.js';
import { DurableObjectWebSocketTransport } from '../src/cf-durable-object-transport.js';

function makeFakeWs() {
  const sent: unknown[] = [];
  return {
    readyState: 1,
    sent,
    send(data: string) {
      sent.push(JSON.parse(data));
    },
    close() {
      /* noop */
    }
  };
}

describe('RuneDocumentUpdateHandler', () => {
  it('removes a closed document from the workspace index on a real textDocument/didClose', async () => {
    const lsp = createRuneLspServer();
    const ws = makeFakeWs();
    const transport = new DurableObjectWebSocketTransport(ws);
    void lsp.listen(transport);
    const uri = URI.parse('file:///a.rosetta');

    // fireDocumentUpdate's deletion chain awaits workspaceManager.ready,
    // which only resolves once a real initialize/initialized handshake has
    // completed — drive one, matching what a real client does.
    transport.receive(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { processId: null, rootUri: null, capabilities: {} }
      })
    );
    await vi.waitFor(() => {
      expect(ws.sent.some((m: any) => m.id === 1)).toBe(true);
    });
    transport.receive(JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} }));

    transport.receive(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'textDocument/didOpen',
        params: { textDocument: { uri: uri.toString(), languageId: 'rosetta', version: 0, text: 'namespace a' } }
      })
    );
    await vi.waitFor(() => {
      expect(lsp.shared.workspace.LangiumDocuments.getDocument(uri)).toBeDefined();
    });

    transport.receive(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'textDocument/didClose',
        params: { textDocument: { uri: uri.toString() } }
      })
    );

    await vi.waitFor(() => {
      expect(lsp.shared.workspace.LangiumDocuments.getDocument(uri)).toBeUndefined();
    });
  });
});
