/**
 * Rune DSL LSP Server
 *
 * Creates a Langium LSP-capable service container and bridges it to an
 * @lspeasy/server LSPServer via the Connection adapter.
 *
 * Flow:
 *   1. Create LSPServer                    (@lspeasy/server)
 *   2. Wrap it in a Connection adapter      (connection-adapter.ts)
 *   3. Create Langium LSP services          (langium/lsp — includes all providers)
 *   4. startLanguageServer(shared)          (Langium wires everything automatically)
 *   5. server.listen(transport)             (when a client WebSocket connects)
 */

import { LSPServer, type ServerCapabilities } from '@lspeasy/server';
import type { Transport } from '@lspeasy/core';
import { EmptyFileSystem, inject } from 'langium';
import type { LangiumServices, LangiumSharedServices } from 'langium/lsp';
import { createDefaultModule, createDefaultSharedModule, startLanguageServer } from 'langium/lsp';
import {
  RuneDslGeneratedModule,
  RuneDslGeneratedSharedModule,
  RuneDslModule,
  RuneDslValidator
} from '@rune-langium/core';

import { createConnectionAdapter } from './connection-adapter.js';

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export interface RuneLspServer {
  /** The underlying @lspeasy/server instance. */
  server: LSPServer<ServerCapabilities>;
  /** Langium shared services (for testing / advanced use). */
  shared: LangiumSharedServices;
  /** Langium language services for Rune DSL. */
  services: LangiumServices;
  /** Bind the server to a transport and start processing messages. */
  listen(transport: Transport): Promise<void>;
}

/**
 * Create a fully-wired Rune DSL LSP server.
 *
 * All Langium providers (hover, completion, definition, diagnostics, …)
 * are wired automatically via `startLanguageServer`.
 *
 * Call `result.listen(transport)` to bind to a client transport.
 */
export function createRuneLspServer(): RuneLspServer {
  // 1. Create @lspeasy/server with broad capabilities.
  //    Langium's onInitialize returns the *actual* capabilities to the client.
  //    We just need non-strict mode (default) so handler registration isn't blocked.
  const server = new LSPServer<ServerCapabilities>({
    name: 'rune-dsl-lsp',
    version: '0.1.0',
    capabilities: {
      textDocumentSync: 1,
      hoverProvider: true,
      completionProvider: { triggerCharacters: ['.', ':'] },
      definitionProvider: true,
      declarationProvider: true,
      typeDefinitionProvider: true,
      referencesProvider: true,
      documentSymbolProvider: true,
      documentHighlightProvider: true,
      foldingRangeProvider: true,
      codeActionProvider: true,
      renameProvider: { prepareProvider: true },
      documentFormattingProvider: true,
      signatureHelpProvider: { triggerCharacters: ['(', ','] },
      documentLinkProvider: {}
    }
  });

  // 2. Create the Connection adapter
  const connection = createConnectionAdapter(server);

  // 3. Create Langium *LSP* services (not core-only).
  //    createDefaultSharedModule from langium/lsp adds TextDocuments,
  //    DocumentUpdateHandler, LanguageServer, etc.
  const shared = inject(
    createDefaultSharedModule({ ...EmptyFileSystem, connection }),
    RuneDslGeneratedSharedModule
  );

  const RuneDsl = inject(createDefaultModule({ shared }), RuneDslGeneratedModule, RuneDslModule);

  // 4. Register language + validation
  shared.ServiceRegistry.register(RuneDsl);

  const validator = new RuneDslValidator();
  validator.registerChecks(RuneDsl);

  // 5. Let Langium wire all providers → connection handlers + documents
  startLanguageServer(shared);

  return {
    server,
    shared,
    services: RuneDsl,
    async listen(transport: Transport) {
      await server.listen(transport);
    }
  };
}
