/**
 * LSP Client Service (T017).
 *
 * Manages the @codemirror/lsp-client LSPClient lifecycle:
 *   - Transport acquisition via TransportProvider
 *   - Client initialisation and document plugin creation
 *   - Diagnostics subscription bridge to the graph
 *   - Reconnect and cleanup
 */

import { LSPClient, languageServerExtensions } from '@codemirror/lsp-client';
import type { Extension } from '@codemirror/state';
import { Text } from '@codemirror/state';
import {
  createTransportProvider,
  type TransportProvider,
  type TransportProviderOptions
} from './transport-provider.js';
import type { LspDiagnostic } from '../types/diagnostics.js';
import { pathToUri } from '../utils/uri.js';

export type { LspDiagnostic } from '../types/diagnostics.js';

export interface LspClientOptions {
  /** Provide an external transport provider. */
  transportProvider?: TransportProvider;
  /** Options forwarded to the default transport provider. */
  transportOptions?: TransportProviderOptions;
}

export interface LspClientService {
  /** Connect and initialise the LSP client. */
  connect(options?: LspClientOptions): Promise<void>;
  /** Disconnect and clean up the client. */
  disconnect(): Promise<void>;
  /** Get a CM extension for a document URI. Returns null before connect. */
  getPlugin(uri: string): Extension | null;
  /** Whether the client is fully initialised. */
  isInitialized(): boolean;
  /** Subscribe to diagnostics (for graph bridge). Returns unsubscribe fn. */
  onDiagnostics(handler: (uri: string, diagnostics: LspDiagnostic[]) => void): () => void;
  /** Keep the server-side workspace in sync with loaded files (for cross-file refs). */
  syncWorkspaceFiles(files: Array<{ path: string; content: string }>): void;
  /** Force reconnect (tries WebSocket first). */
  reconnect(): Promise<void>;
  /** Clean up all resources. */
  dispose(): void;
}

// ────────────────────────────────────────────────────────────────────────────
// Implementation
// ────────────────────────────────────────────────────────────────────────────

export function createLspClientService(opts?: LspClientOptions): LspClientService {
  let provider: TransportProvider =
    opts?.transportProvider ?? createTransportProvider(opts?.transportOptions);
  let client: LSPClient | null = null;
  let initialized = false;
  const workspaceSnapshot = new Map<string, { version: number; content: string }>();

  const diagnosticHandlers: ((uri: string, diagnostics: LspDiagnostic[]) => void)[] = [];

  function buildClient(): LSPClient {
    return new LSPClient({
      rootUri: 'file:///workspace',
      notificationHandlers: {
        'textDocument/publishDiagnostics': (_client, params) => {
          const { uri, diagnostics } = params as {
            uri: string;
            diagnostics: LspDiagnostic[];
          };
          for (const h of diagnosticHandlers) h(uri, diagnostics);
          return false; // let serverDiagnostics() also handle editor underlines
        }
      },
      extensions: [...languageServerExtensions()]
    });
  }

  return {
    async connect(): Promise<void> {
      if (client) {
        client.disconnect();
        client = null;
      }
      const transport = await provider.getTransport();
      client = buildClient();
      client.connect(transport);
      initialized = true;

      // Re-open all tracked workspace files after reconnect.
      for (const [uri, entry] of workspaceSnapshot) {
        client.didOpen({
          uri,
          languageId: 'rosetta',
          version: entry.version,
          doc: Text.of(entry.content.split('\n')),
          getView: () => null
        });
      }
    },

    async disconnect(): Promise<void> {
      if (client) {
        client.disconnect();
        client = null;
      }
      initialized = false;
    },

    getPlugin(uri: string): Extension | null {
      if (!client || !initialized) return null;
      return client.plugin(uri);
    },

    isInitialized(): boolean {
      return initialized;
    },

    onDiagnostics(handler: (uri: string, diagnostics: LspDiagnostic[]) => void): () => void {
      diagnosticHandlers.push(handler);
      return () => {
        const idx = diagnosticHandlers.indexOf(handler);
        if (idx >= 0) diagnosticHandlers.splice(idx, 1);
      };
    },

    syncWorkspaceFiles(files: Array<{ path: string; content: string }>): void {
      const nextUris = new Set<string>();
      const changedUris = new Set<string>();
      let addedCount = 0;

      for (const file of files) {
        const uri = pathToUri(file.path);
        nextUris.add(uri);

        const prev = workspaceSnapshot.get(uri);
        if (!prev) {
          workspaceSnapshot.set(uri, { version: 0, content: file.content });
          addedCount++;
          changedUris.add(uri);
          if (client && initialized) {
            client.didOpen({
              uri,
              languageId: 'rosetta',
              version: 0,
              doc: Text.of(file.content.split('\n')),
              getView: () => null
            });
          }
          continue;
        }

        if (prev.content !== file.content) {
          const version = prev.version + 1;
          workspaceSnapshot.set(uri, { version, content: file.content });
          changedUris.add(uri);
          if (client && initialized) {
            client.notification('textDocument/didChange', {
              textDocument: { uri, version },
              contentChanges: [{ text: file.content }]
            });
          }
        }
      }

      for (const uri of [...workspaceSnapshot.keys()]) {
        if (nextUris.has(uri)) continue;
        workspaceSnapshot.delete(uri);
        if (client && initialized) {
          client.didClose(uri);
        }
      }

      // When many files are newly opened, early-opened files may have been
      // validated before all dependencies were present. Force a no-op content
      // refresh across unchanged files so diagnostics are recomputed with the
      // complete workspace loaded.
      if (client && initialized && addedCount > 0) {
        for (const [uri, entry] of workspaceSnapshot) {
          if (changedUris.has(uri)) continue;
          const version = entry.version + 1;
          workspaceSnapshot.set(uri, { version, content: entry.content });
          client.notification('textDocument/didChange', {
            textDocument: { uri, version },
            contentChanges: [{ text: entry.content }]
          });
        }
      }
    },

    async reconnect(): Promise<void> {
      if (client) {
        client.disconnect();
        client = null;
      }
      initialized = false;
      const transport = await provider.reconnect();
      client = buildClient();
      client.connect(transport);
      initialized = true;

      // Re-open all tracked workspace files after reconnect.
      for (const [uri, entry] of workspaceSnapshot) {
        client.didOpen({
          uri,
          languageId: 'rosetta',
          version: entry.version,
          doc: Text.of(entry.content.split('\n')),
          getView: () => null
        });
      }
    },

    dispose(): void {
      if (client) {
        client.disconnect();
        client = null;
      }
      initialized = false;
      provider.dispose();
      diagnosticHandlers.length = 0;
    }
  };
}
