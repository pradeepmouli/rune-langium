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
import {
  createTransportProvider,
  type TransportProvider,
  type TransportProviderOptions
} from './transport-provider.js';
import type { LspDiagnostic } from '../types/diagnostics.js';

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
