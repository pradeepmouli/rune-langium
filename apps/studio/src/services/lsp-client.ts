// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * LSP Client Service (T017).
 *
 * Manages the @codemirror/lsp-client LSPClient lifecycle:
 *   - Transport acquisition via TransportProvider
 *   - Client initialisation and document plugin creation
 *   - Diagnostics subscription bridge to the graph
 *   - Reconnect and cleanup
 */

import { LSPClient, languageServerExtensions, Workspace } from '@codemirror/lsp-client';
import type { WorkspaceFile } from '@codemirror/lsp-client';
import type { Extension } from '@codemirror/state';
import { ChangeSet, Text } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { LSPPlugin } from '@codemirror/lsp-client';
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
  /**
   * Register a handler for cross-file definition navigation (Task 7).
   *
   * When `jumpToDefinition` resolves to a file URI that is known in the
   * workspace snapshot, `displayFile` on the custom workspace calls this
   * handler with the target URI so the host can open the file tab and
   * return the resulting EditorView.
   *
   * Returns an unsubscribe function.
   */
  onDisplayFile(
    handler: (uri: string) => Promise<import('@codemirror/view').EditorView | null>
  ): () => void;
  /** Force reconnect (tries WebSocket first). */
  reconnect(): Promise<void>;
  /** Clean up all resources. */
  dispose(): void;
}

// ────────────────────────────────────────────────────────────────────────────
// Custom Workspace (Task 7) — extends DefaultWorkspace to support
// cross-file displayFile via a registered callback.
// ────────────────────────────────────────────────────────────────────────────

type DisplayFileHandler = (uri: string) => Promise<EditorView | null>;

interface StudioWorkspaceFile extends WorkspaceFile {
  view: EditorView;
}

/**
 * A workspace implementation that supports cross-file go-to-definition
 * by delegating `displayFile` to an externally registered handler.
 *
 * The handler (set via `onDisplayFile`) is responsible for opening the
 * target file tab in the SourceEditor and returning the EditorView.
 */
class StudioWorkspace extends Workspace {
  files: StudioWorkspaceFile[] = [];
  private fileVersions: Record<string, number> = Object.create(null);
  displayFileHandler: DisplayFileHandler | null = null;

  nextFileVersion(uri: string): number {
    return (this.fileVersions[uri] = (this.fileVersions[uri] ?? -1) + 1);
  }

  syncFiles() {
    const result: Array<{ file: WorkspaceFile; prevDoc: Text; changes: ChangeSet }> = [];
    for (const file of this.files) {
      const plugin = LSPPlugin.get(file.view);
      if (!plugin) continue;
      const changes = plugin.unsyncedChanges;
      if (!changes.empty) {
        result.push({ changes, file, prevDoc: file.doc });
        file.doc = file.view.state.doc;
        file.version = this.nextFileVersion(file.uri);
        plugin.clear();
      }
    }
    return result;
  }

  openFile(uri: string, languageId: string, view: EditorView): void {
    // Allow re-opening the same file (tab switch destroys + recreates).
    // Send didClose first to keep open/close pairs balanced for the LSP server.
    const existing = this.files.findIndex((f) => f.uri === uri);
    if (existing >= 0) {
      this.files.splice(existing, 1);
      this.client.didClose(uri);
    }
    const file: StudioWorkspaceFile = {
      uri,
      languageId,
      version: this.nextFileVersion(uri),
      doc: view.state.doc,
      view,
      getView: () => view
    };
    this.files.push(file);
    this.client.didOpen(file);
  }

  closeFile(uri: string, _view: EditorView): void {
    const file = this.getFile(uri);
    if (file) {
      this.files = this.files.filter((f) => f !== file);
      this.client.didClose(uri);
    }
  }

  override displayFile(uri: string): Promise<EditorView | null> {
    // Try to find an already-open file first
    const file = this.getFile(uri);
    if (file) {
      const view = file.getView();
      if (view) return Promise.resolve(view);
    }
    // Delegate to the registered handler for cross-file navigation
    if (this.displayFileHandler) {
      return this.displayFileHandler(uri);
    }
    return Promise.resolve(null);
  }
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
  let _pendingRefreshId: ReturnType<typeof setTimeout> | null = null;

  const diagnosticHandlers: ((uri: string, diagnostics: LspDiagnostic[]) => void)[] = [];

  // Task 7: displayFile handler for cross-file go-to-definition
  let displayFileHandler: DisplayFileHandler | null = null;

  function cancelPendingRefresh(): void {
    if (_pendingRefreshId !== null) {
      clearTimeout(_pendingRefreshId);
      _pendingRefreshId = null;
    }
  }

  function buildClient(): LSPClient {
    return new LSPClient({
      rootUri: 'file:///workspace',
      workspace: (lspClient) => {
        const ws = new StudioWorkspace(lspClient);
        ws.displayFileHandler = displayFileHandler;
        return ws;
      },
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
      cancelPendingRefresh();
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
      //
      // Debounced via setTimeout(0) to yield the UI thread and coalesce
      // multiple rapid syncWorkspaceFiles calls into a single batch refresh.
      if (client && initialized && addedCount > 0) {
        const urisToSkip = new Set(changedUris);
        cancelPendingRefresh();
        _pendingRefreshId = setTimeout(() => {
          _pendingRefreshId = null;
          if (!client || !initialized) return;
          for (const [uri, entry] of workspaceSnapshot) {
            if (urisToSkip.has(uri)) continue;
            const version = entry.version + 1;
            workspaceSnapshot.set(uri, { version, content: entry.content });
            client.notification('textDocument/didChange', {
              textDocument: { uri, version },
              contentChanges: [{ text: entry.content }]
            });
          }
        }, 0);
      }
    },

    onDisplayFile(handler: (uri: string) => Promise<EditorView | null>): () => void {
      displayFileHandler = handler;
      // Update existing workspace if client is already connected
      if (client) {
        const ws = client.workspace as StudioWorkspace;
        if (ws && 'displayFileHandler' in ws) {
          ws.displayFileHandler = handler;
        }
      }
      return () => {
        if (displayFileHandler === handler) {
          displayFileHandler = null;
          if (client) {
            const ws = client.workspace as StudioWorkspace;
            if (ws && 'displayFileHandler' in ws) {
              ws.displayFileHandler = null;
            }
          }
        }
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
      cancelPendingRefresh();
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
