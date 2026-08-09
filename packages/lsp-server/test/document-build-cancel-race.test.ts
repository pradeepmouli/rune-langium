// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Regression test for a Codex PR #480 finding (comment id 3745221064):
 * "closing the old URI [during a tab switch] can supersede building the
 * new one" via Langium's DefaultWorkspaceLock cancelling the still-running
 * build for a just-opened document when a didClose for a DIFFERENT
 * document arrives immediately behind it (both go through the same
 * fireDocumentUpdate -> workspaceLock.write -> documentBuilder.update
 * path, and workspaceLock.write() cancels whatever write is currently
 * in flight).
 *
 * Empirically verified (via an instrumented throwaway probe, not kept)
 * that the cancellation itself IS real — with a large enough document the
 * newly-opened document's own build call visibly does not reach
 * DocumentState.Validated. But Langium's DefaultDocumentBuilder self-heals
 * it: `update()`'s rebuild set (document-builder.js) is computed from ALL
 * documents currently below `DocumentState.Validated`, not just the
 * `changed`/`deleted` URIs passed to that specific call. So the didClose's
 * own `update([], [oldUri], token)` call picks up and finishes building
 * the newly-opened (but cancelled) document as a side effect, as long as
 * some write follows the cancelled one and isn't itself cancelled before
 * it completes — true for a normal tab switch, where the close is the
 * last write in the pair. The exact point at which the self-heal happens
 * (during the open's own build or the following close's rebuild) varies
 * run to run depending on microtask timing, so this test asserts only the
 * stable, externally-observable guarantee: diagnostics for the new
 * document eventually arrive. If Langium's rebuild-set computation ever
 * regresses to being scoped only to the triggering call's own
 * changed/deleted URIs (reintroducing the bug Codex described), this test
 * times out and fails.
 *
 * This test does not "fix" anything — it locks in the self-heal.
 */

import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { StdioTransport } from '@lspeasy/core/node';
import { LSPClient } from '@lspeasy/client';
import { createRuneLspServer } from '../src/rune-dsl-server.js';
import type { RuneLspServer } from '../src/rune-dsl-server.js';

function createTransportPair(): { clientTransport: StdioTransport; serverTransport: StdioTransport } {
  const clientToServer = new PassThrough();
  const serverToClient = new PassThrough();
  return {
    clientTransport: new StdioTransport({ input: serverToClient, output: clientToServer }),
    serverTransport: new StdioTransport({ input: clientToServer, output: serverToClient })
  };
}

const A_URI = 'file:///test/a.rosetta';
const B_URI = 'file:///test/b.rosetta';

const A_CONTENT = `namespace demo

type A:
  bar string (1..1)
  baz int (0..1)
`;

// A large document for B widens the window during which its build is
// still in flight when the close-A notification arrives right behind it,
// making the cancellation reliably reproducible instead of timing-lucky.
function bContent(): string {
  const lines: string[] = ['namespace demo', ''];
  for (let i = 0; i < 400; i++) {
    lines.push(`type B${i}:`);
    lines.push(`  bar string (1..1)`);
    lines.push(`  baz int (0..1)`);
    if (i > 0) {
      lines.push(`  prev B${i - 1} (0..1)`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

describe('document build survives a didOpen immediately superseded by an unrelated didClose', () => {
  it('a newly opened document still publishes diagnostics after a same-tick didClose for a different document', async () => {
    const { clientTransport, serverTransport } = createTransportPair();
    const lsp: RuneLspServer = createRuneLspServer();
    await lsp.listen(serverTransport);
    const client = new LSPClient({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);

    // A is already open and settled — the document that's about to close.
    const aDiag = client.waitForNotification('textDocument/publishDiagnostics', {
      timeout: 10_000,
      filter: (p: unknown) => (p as { uri: string }).uri === A_URI
    });
    await client.sendNotification('textDocument/didOpen', {
      textDocument: { uri: A_URI, languageId: 'rune-dsl', version: 1, text: A_CONTENT }
    });
    await aDiag;

    // Fire didOpen(B) then didClose(A) back-to-back, matching studio's
    // syncWorkspaceFiles (apps/studio/src/services/lsp-client.ts), which
    // sends both within the same synchronous function body during a tab
    // switch — the didOpen precedes the didClose with no await between.
    const bDiag = client.waitForNotification('textDocument/publishDiagnostics', {
      timeout: 30_000,
      filter: (p: unknown) => (p as { uri: string }).uri === B_URI
    });
    const openB = client.sendNotification('textDocument/didOpen', {
      textDocument: { uri: B_URI, languageId: 'rune-dsl', version: 1, text: bContent() }
    });
    const closeA = client.sendNotification('textDocument/didClose', {
      textDocument: { uri: A_URI }
    });
    await Promise.all([openB, closeA]);

    // B's diagnostics arrive despite the race — the core, externally
    // observable guarantee this test protects.
    const result = (await bDiag) as { uri: string; diagnostics: unknown[] };
    expect(result.uri).toBe(B_URI);
    expect(Array.isArray(result.diagnostics)).toBe(true);

    await client.disconnect();
  }, 40_000);
});
