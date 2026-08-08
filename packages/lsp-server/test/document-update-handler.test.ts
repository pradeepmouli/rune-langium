// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { URI } from 'langium';
import { createRuneLspServer } from '../src/rune-dsl-server.js';
import { DurableObjectWebSocketTransport } from '../src/cf-durable-object-transport.js';

/** No-op socket — just enough to satisfy `.listen()` so post-build diagnostics
 *  notifications have somewhere to go instead of throwing "Server is not
 *  listening". This test doesn't assert on wire traffic. */
function makeNoopSocket() {
  return { readyState: 1, send() {}, close() {} };
}

describe('RuneDocumentUpdateHandler', () => {
  it('removes a closed document from the workspace index', async () => {
    const lsp = createRuneLspServer();
    void lsp.listen(new DurableObjectWebSocketTransport(makeNoopSocket()));
    const uri = URI.parse('file:///a.rosetta');

    await lsp.shared.workspace.DocumentBuilder.update(
      [],
      [] // no-op update to ensure the workspace is settled before we start
    );

    // Simulate an open + a build, matching what a real didOpen produces.
    // createDocument's synchronous overload registers the document with
    // LangiumDocuments (already at DocumentState.Parsed) and returns the
    // parsed LangiumDocument immediately. Passing its URI in update()'s
    // `changed` array would reset it to DocumentState.Changed and force a
    // re-parse via the (empty, file-less) FileSystemProvider — update([], [])
    // still picks it up via the "state < Validated" rebuild filter, running
    // only the later phases (index/link/validate), no filesystem needed.
    lsp.shared.workspace.LangiumDocuments.createDocument(uri, 'namespace a');
    await lsp.shared.workspace.DocumentBuilder.update([], []);
    expect(lsp.shared.workspace.LangiumDocuments.getDocument(uri)).toBeDefined();

    // Fire the same event Langium's TextDocuments emits on a real
    // textDocument/didClose — this is what RuneDocumentUpdateHandler hooks.
    const handler = lsp.shared.lsp.DocumentUpdateHandler as unknown as {
      didCloseDocument?(event: { document: { uri: string } }): void;
    };
    handler.didCloseDocument?.({ document: { uri: uri.toString() } });

    expect(lsp.shared.workspace.LangiumDocuments.getDocument(uri)).toBeUndefined();
  });
});
