# Data Model: LSP-Powered Studio Editor

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-02-12

## Overview

This feature introduces **no new persistent data models** — it wires existing runtime data (LSP protocol messages, CodeMirror editor state, zustand stores) between the studio UI, the LSP server, and the ReactFlow graph. All types below are runtime/in-memory only.

---

## Entity: TransportState

**Purpose**: Tracks the current transport connection status for the LSP client.

```typescript
type TransportMode = 'websocket' | 'embedded' | 'disconnected';

interface TransportState {
  mode: TransportMode;
  status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';
  /** WebSocket URI when mode is 'websocket' */
  wsUri?: string;
  /** Number of reconnection attempts made */
  reconnectAttempts: number;
  /** Last error message, if any */
  lastError?: string;
}
```

**Lifecycle**:
```
disconnected → connecting → connected (websocket)
                    │
                    └→ error → reconnecting (×3) → connected (websocket)
                                    │
                                    └→ connecting → connected (embedded)
```

---

## Entity: EditorTab

**Purpose**: Represents an open file tab in the SourceEditor component.

```typescript
interface EditorTab {
  /** Virtual document URI sent to LSP server */
  uri: string;
  /** Display name (filename) */
  name: string;
  /** File path from workspace */
  path: string;
  /** Whether the file has unsaved changes */
  dirty: boolean;
  /** CodeMirror EditorView instance (managed by React ref) */
  view?: EditorView;
}
```

**Relationship**: Each `EditorTab` maps 1:1 to a `WorkspaceFile` from the existing workspace service and a `client.plugin(uri)` call in `@codemirror/lsp-client`.

---

## Entity: FileDiagnostics

**Purpose**: Diagnostics received from the LSP server for a specific file.

```typescript
interface FileDiagnostics {
  /** Document URI */
  uri: string;
  /** LSP Diagnostic objects */
  diagnostics: Diagnostic[];
  /** Timestamp of last update */
  updatedAt: number;
}
```

**Note**: `Diagnostic` is the standard LSP type from `vscode-languageserver-types`:
```typescript
interface Diagnostic {
  range: Range;
  severity?: DiagnosticSeverity;
  code?: number | string;
  source?: string;
  message: string;
}
```

---

## Entity: TypeDiagnosticsSummary

**Purpose**: Aggregated diagnostic counts per Rune DSL type, used for graph node error badges.

```typescript
interface TypeDiagnosticsSummary {
  /** Fully qualified type name (e.g., "cdm.base.Trade") */
  typeName: string;
  /** Number of error-severity diagnostics */
  errorCount: number;
  /** Number of warning-severity diagnostics */
  warningCount: number;
  /** Source file URI */
  fileUri: string;
  /** Line range of this type in the source file */
  lineRange: { start: number; end: number };
}
```

**Relationship**: Maps to graph node IDs (from `AstToGraphAdapter` in visual-editor). The `diagnostics-bridge` service computes this by correlating diagnostic line ranges with type declaration positions from the AST.

---

## Entity: DiagnosticsStore (Zustand)

**Purpose**: Central store for diagnostics data consumed by both editor and graph.

```typescript
interface DiagnosticsStoreState {
  /** Map of file URI → diagnostics */
  fileDiagnostics: Map<string, FileDiagnostics>;
  /** Map of type name → diagnostic summary (for graph badges) */
  typeDiagnostics: Map<string, TypeDiagnosticsSummary>;
  /** Total error count across all files */
  totalErrors: number;
  /** Total warning count across all files */
  totalWarnings: number;
}

interface DiagnosticsStoreActions {
  /** Update diagnostics for a file (called on publishDiagnostics) */
  setFileDiagnostics(uri: string, diagnostics: Diagnostic[]): void;
  /** Clear diagnostics for a file (called on didClose) */
  clearFileDiagnostics(uri: string): void;
  /** Clear all diagnostics */
  clearAll(): void;
}
```

---

## Entity: LspClientState

**Purpose**: Manages the LSP client lifecycle and provides access to the client instance.

```typescript
interface LspClientState {
  /** The @codemirror/lsp-client instance */
  client: LSPClient | null;
  /** Current transport state */
  transport: TransportState;
  /** Server capabilities (received on initialize) */
  capabilities: ServerCapabilities | null;
  /** Whether the client is fully initialized */
  initialized: boolean;
}

interface LspClientActions {
  /** Initialize the LSP client with automatic transport selection */
  connect(options?: { wsUri?: string }): Promise<void>;
  /** Disconnect and clean up */
  disconnect(): Promise<void>;
  /** Force reconnect (e.g., user clicks "Reconnect" button) */
  reconnect(): Promise<void>;
  /** Get a plugin extension for a document URI */
  getPlugin(uri: string): Extension | null;
}
```

---

## Relationships

```
WorkspaceFile (existing)
    │ 1:1
    ▼
EditorTab ────────── client.plugin(uri) ────────── LSPClient
    │                                                  │
    │ 1:*                                              │ transport
    ▼                                                  ▼
FileDiagnostics ◄──── publishDiagnostics ◄──── rune-lsp-server
    │
    │ aggregated by diagnostics-bridge
    ▼
TypeDiagnosticsSummary ────── graph node ID ────── ReactFlow Node
```
