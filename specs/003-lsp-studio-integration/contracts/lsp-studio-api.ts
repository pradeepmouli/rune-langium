/**
 * LSP Studio Integration — Public API Contract
 *
 * Defines the interfaces for services, components, and stores
 * introduced by the LSP-powered studio editor feature (003).
 *
 * @module @rune-langium/studio (internal)
 */

import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

// ────────────────────────────────────────────────────────────────────────────
// Transport
// ────────────────────────────────────────────────────────────────────────────

/**
 * CM LSP client Transport interface (from @codemirror/lsp-client).
 * Our adapters (WebSocket, SharedWorker) implement this.
 */
export interface CMTransport {
  send(message: string): void;
  subscribe(handler: (value: string) => void): void;
  unsubscribe(handler: (value: string) => void): void;
}

export type TransportMode = 'websocket' | 'embedded' | 'disconnected';

export type TransportStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export interface TransportState {
  mode: TransportMode;
  status: TransportStatus;
  wsUri?: string;
  reconnectAttempts: number;
  lastError?: string;
}

export interface TransportProviderOptions {
  /** WebSocket URI to attempt first. Default: 'ws://localhost:3001' */
  wsUri?: string;
  /** Connection timeout in ms. Default: 2000 */
  connectionTimeout?: number;
  /** Max reconnect attempts before fallback. Default: 3 */
  maxReconnectAttempts?: number;
}

export interface TransportProvider {
  /** Get the current transport (creates on first call) */
  getTransport(): Promise<CMTransport>;
  /** Current state */
  getState(): TransportState;
  /** Force reconnect (try WebSocket again) */
  reconnect(): Promise<CMTransport>;
  /** Subscribe to state changes */
  onStateChange(handler: (state: TransportState) => void): () => void;
  /** Clean up resources */
  dispose(): void;
}

/**
 * Create a WebSocket transport adapter for @codemirror/lsp-client.
 */
export declare function createWebSocketTransport(uri: string): Promise<CMTransport>;

/**
 * Create a SharedWorker transport adapter for @codemirror/lsp-client.
 * The worker runs the Langium LSP server in-browser.
 */
export declare function createWorkerTransport(): CMTransport;

/**
 * Create a transport provider with automatic failover.
 */
export declare function createTransportProvider(
  options?: TransportProviderOptions
): TransportProvider;

// ────────────────────────────────────────────────────────────────────────────
// LSP Client Service
// ────────────────────────────────────────────────────────────────────────────

export interface LspClientOptions {
  /** Transport provider (uses default if not provided) */
  transportProvider?: TransportProvider;
}

export interface LspClientService {
  /** Connect and initialize the LSP client */
  connect(options?: LspClientOptions): Promise<void>;
  /** Disconnect and clean up */
  disconnect(): Promise<void>;
  /** Get a CM extension for a document */
  getPlugin(uri: string): Extension | null;
  /** Whether the client is fully initialized */
  isInitialized(): boolean;
  /** Subscribe to diagnostics for graph bridge */
  onDiagnostics(handler: (uri: string, diagnostics: LspDiagnostic[]) => void): () => void;
  /** Force reconnect */
  reconnect(): Promise<void>;
  /** Clean up all resources */
  dispose(): void;
}

export declare function createLspClientService(options?: LspClientOptions): LspClientService;

// ────────────────────────────────────────────────────────────────────────────
// Diagnostics
// ────────────────────────────────────────────────────────────────────────────

export interface LspDiagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity?: 1 | 2 | 3 | 4; // Error, Warning, Information, Hint
  code?: number | string;
  source?: string;
  message: string;
}

export interface TypeDiagnosticsSummary {
  typeName: string;
  errorCount: number;
  warningCount: number;
  fileUri: string;
  lineRange: { start: number; end: number };
}

export interface DiagnosticsStoreState {
  fileDiagnostics: Map<string, LspDiagnostic[]>;
  typeDiagnostics: Map<string, TypeDiagnosticsSummary>;
  totalErrors: number;
  totalWarnings: number;
}

export interface DiagnosticsStoreActions {
  setFileDiagnostics(uri: string, diagnostics: LspDiagnostic[]): void;
  clearFileDiagnostics(uri: string): void;
  clearAll(): void;
}

export type DiagnosticsStore = DiagnosticsStoreState & DiagnosticsStoreActions;

/**
 * Map LSP diagnostics to type-level summaries using AST position data.
 */
export declare function mapDiagnosticsToTypes(
  uri: string,
  diagnostics: LspDiagnostic[],
  typePositions: Map<string, { start: number; end: number }>
): TypeDiagnosticsSummary[];

// ────────────────────────────────────────────────────────────────────────────
// Components (React)
// ────────────────────────────────────────────────────────────────────────────

export interface SourceEditorProps {
  /** Workspace files to show as tabs */
  files: Array<{
    name: string;
    path: string;
    content: string;
    dirty: boolean;
  }>;
  /** Currently active file path */
  activeFile?: string;
  /** Called when user switches tabs */
  onFileSelect?: (path: string) => void;
  /** Called when editor content changes */
  onContentChange?: (path: string, content: string) => void;
  /** LSP client service (injected) */
  lspClient?: LspClientService;
}

export interface ConnectionStatusProps {
  /** Transport state to display */
  state: TransportState;
  /** Called when user clicks reconnect */
  onReconnect?: () => void;
}

export interface DiagnosticsPanelProps {
  /** Diagnostics store state */
  diagnostics: DiagnosticsStoreState;
  /** Called when user clicks a diagnostic to navigate */
  onNavigate?: (uri: string, line: number, character: number) => void;
}

// ────────────────────────────────────────────────────────────────────────────
// Editor Tab
// ────────────────────────────────────────────────────────────────────────────

export interface EditorTab {
  uri: string;
  name: string;
  path: string;
  dirty: boolean;
  view?: EditorView;
}

// ────────────────────────────────────────────────────────────────────────────
// Rune DSL Language Support
// ────────────────────────────────────────────────────────────────────────────

/**
 * CodeMirror language support for Rune DSL syntax highlighting.
 * Returns a StreamLanguage-based extension.
 */
export declare function runeDslLanguage(): Extension;
