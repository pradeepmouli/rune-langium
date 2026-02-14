# Research: LSP-Powered Studio Editor

**Spec**: [spec.md](spec.md) | **Date**: 2026-02-12

## R1: CodeMirror 6 LSP Integration

### Decision: Use `@codemirror/lsp-client` (official)

**Considered alternatives**:

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **@codemirror/lsp-client** v6.2.1 | Official CM package by Marijn; native integration with CM extensions; handles diagnostics, hover, completion, go-to-definition; simple Transport interface | Relatively new (2025); less community examples | **CHOSEN** |
| **codemirror-languageserver** v1.18.1 | More community usage; well-documented | Manages its own WebSocket internally; harder to swap transports; not official CM | Rejected |
| **@marimo-team/codemirror-languageserver** v1.16.12 | Active maintenance | Fork, not official; tied to Marimo ecosystem | Rejected |
| **Custom CM extensions** | Full control; reuse @lspeasy/client | Significant effort to implement diagnostics/hover/completion CM extensions manually | Rejected |

**Justification**: `@codemirror/lsp-client` is the official package maintained by the CodeMirror author. Its Transport interface (`{send, subscribe, unsubscribe}`) is trivially simple and transpart-agnostic — we can implement it over WebSocket or SharedWorker MessagePort. It provides `languageServerExtensions()` that handles all the CM wiring (lint panel, hover tooltips, completion source, definition links).

### API surface

```typescript
// Transport — implemented by our WebSocket and SharedWorker adapters
interface Transport {
  send(message: string): void;
  subscribe(handler: (value: string) => void): void;
  unsubscribe(handler: (value: string) => void): void;
}

// Client — manages LSP lifecycle
class LSPClient {
  constructor(options: { extensions: Extension[] });
  connect(transport: Transport): LSPClient;
  plugin(uri: string): Extension;  // Returns CM extension for a document
}

// Extensions — provides diagnostics, hover, completion, definition
function languageServerExtensions(): Extension[];
```

Usage pattern:
```typescript
import { LSPClient, languageServerExtensions, Transport } from '@codemirror/lsp-client';
import { basicSetup, EditorView } from 'codemirror';

const transport = await createWebSocketTransport('ws://localhost:3001');
const client = new LSPClient({ extensions: languageServerExtensions() }).connect(transport);

new EditorView({
  extensions: [basicSetup, client.plugin('file:///workspace/model.rosetta')],
  parent: container
});
```

---

## R2: Transport Architecture

### Decision: Dual transport with automatic failover

**Architecture**:
```
┌─────────────────────────────────────────────────────┐
│  Studio (Browser)                                    │
│                                                      │
│  CodeMirror Editor ─── @codemirror/lsp-client        │
│       │                      │                       │
│       │              TransportProvider               │
│       │              ┌────────┼────────┐             │
│       │              │        │        │             │
│       │         WebSocket  SharedWorker              │
│       │         Transport   Transport                │
│       │              │        │                      │
│  ReactFlow Graph ────┘        │                      │
│  (diagnostics bridge)        SharedWorker            │
│                              (Langium LSP)           │
└──────────┬───────────────────┘                       │
           │                                           │
           ▼ WebSocket                                 │
┌──────────────────┐                                   │
│ rune-lsp-server  │                                   │
│ (Node.js)        │                                   │
└──────────────────┘
```

### WebSocket Transport (Primary)

Wraps browser `WebSocket` to implement `@codemirror/lsp-client`'s `Transport` interface:
```typescript
function createWebSocketTransport(uri: string): Promise<Transport> {
  const handlers: ((value: string) => void)[] = [];
  const sock = new WebSocket(uri);
  sock.onmessage = (e) => { for (const h of handlers) h(e.data.toString()); };
  return new Promise((resolve, reject) => {
    sock.onopen = () => resolve({
      send: (msg) => sock.send(msg),
      subscribe: (h) => { handlers.push(h); },
      unsubscribe: (h) => { handlers.splice(handlers.indexOf(h), 1); }
    });
    sock.onerror = reject;
  });
}
```

### SharedWorker Transport (Fallback)

Runs the Langium LSP server inside a SharedWorker. The Transport interface posts JSON-RPC messages to/from the worker:
```typescript
// worker-transport.ts
function createWorkerTransport(): Transport {
  const worker = new SharedWorker(new URL('./lsp-worker.ts', import.meta.url));
  const handlers: ((value: string) => void)[] = [];
  worker.port.onmessage = (e) => { for (const h of handlers) h(e.data); };
  worker.port.start();
  return {
    send: (msg) => worker.port.postMessage(msg),
    subscribe: (h) => { handlers.push(h); },
    unsubscribe: (h) => { handlers.splice(handlers.indexOf(h), 1); }
  };
}

// lsp-worker.ts (SharedWorker)
// Runs the Langium LSP directly, using a custom Transport that
// bridges MessagePort ↔ LSPServer
```

### Failover logic

```
1. Attempt WebSocket connection to ws://host:port (default: ws://localhost:3001)
2. If connection succeeds → use WebSocket transport
3. If connection fails (timeout 2s) → fall back to SharedWorker transport
4. If WebSocket disconnects → attempt reconnect 3x with exponential backoff
5. If all reconnects fail → switch to SharedWorker transport
6. Manual "Reconnect" button available in UI to retry WebSocket
```

---

## R3: Rune DSL Syntax Highlighting in CodeMirror

### Decision: Custom Lezer grammar (lightweight) or TextMate grammar

**Options**:

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **Custom Lezer grammar** | Native CM6 integration; fast incremental parsing; tree-sitter-like | Requires writing a Lezer grammar for Rune DSL | **CHOSEN** (MVP: basic keyword highlighting) |
| **TextMate grammar** via `@codemirror/legacy-modes` | Can reuse existing TM grammars | Performance overhead; legacy API | Rejected |
| **LSP semantic tokens** | Server-driven; accurate | High latency for highlighting; CM already handles it | Out of scope |

**MVP approach**: Start with a simple Lezer grammar that highlights keywords (`type`, `enum`, `choice`, `extends`, `namespace`), strings, numbers, comments, and type names. Can be enhanced incrementally. The LSP handles the actual language intelligence (diagnostics, hover, completion) — syntax highlighting is just cosmetic.

For the MVP, we can even start with a basic `StreamLanguage` definition (simpler than a full Lezer grammar) that tokenizes Rune DSL keywords:

```typescript
import { StreamLanguage } from '@codemirror/language';

const runeDsl = StreamLanguage.define({
  token(stream) {
    if (stream.match(/\/\/.*/)) return 'comment';
    if (stream.match(/\/\*[\s\S]*?\*\//)) return 'comment';
    if (stream.match(/"[^"]*"/)) return 'string';
    if (stream.match(/\b(namespace|type|enum|choice|extends|condition|func|reporting|rule|isEvent|isProduct)\b/))
      return 'keyword';
    if (stream.match(/\b(string|number|int|boolean|date|time|dateTime|zonedDateTime)\b/))
      return 'typeName';
    if (stream.match(/\b\d+(\.\d+)?\b/)) return 'number';
    if (stream.match(/[A-Z]\w*/)) return 'typeName';
    stream.next();
    return null;
  }
});
```

---

## R4: Graph ↔ Editor Diagnostics Bridge

### Decision: Shared diagnostics store via zustand

The `@codemirror/lsp-client` handles editor-side diagnostics natively. For the graph side, we need to intercept `textDocument/publishDiagnostics` notifications and map them to graph node IDs.

**Approach**:
- `@codemirror/lsp-client` manages editor diagnostics (underlines, hover tooltips) automatically
- A separate listener on the same transport captures `publishDiagnostics` notifications
- Diagnostics are mapped to type names using line → AST node correlation
- Results stored in a zustand slice (`diagnosticsStore`) that both the graph and editor consume

```typescript
interface DiagnosticsState {
  /** Map of file URI → diagnostics array */
  fileDiagnostics: Map<string, Diagnostic[]>;
  /** Map of type name → diagnostic count (for graph node badges) */
  typeDiagnostics: Map<string, { errors: number; warnings: number }>;
}
```

---

## R5: Document URI Scheme

### Decision: `file:///` URIs for workspace files

CodeMirror LSP client uses document URIs to identify files. Since the studio manages in-memory files (loaded via File System Access API), we need a consistent URI scheme:

- Files loaded from disk: `file:///workspace/{filename}` (virtual path)
- The LSP server receives `textDocument/didOpen` with these URIs
- Cross-file references resolved by the Langium workspace manager

The `EmptyFileSystem` used by the LSP server means all file content comes from `textDocument/didOpen` — no actual file reads. This works perfectly for the browser-based studio.

---

## R6: Multi-tab Editor Architecture

### Decision: Single LSPClient, multiple EditorViews

`@codemirror/lsp-client`'s architecture supports a single `LSPClient` shared across multiple `EditorView` instances. Each file tab gets its own `EditorView` with `client.plugin(uri)` providing file-specific LSP features.

```
LSPClient (one per studio session)
  ├── Transport (WebSocket or SharedWorker)
  ├── EditorView (file1.rosetta) ← client.plugin("file:///workspace/file1.rosetta")
  ├── EditorView (file2.rosetta) ← client.plugin("file:///workspace/file2.rosetta")
  └── EditorView (file3.rosetta) ← client.plugin("file:///workspace/file3.rosetta")
```

Document lifecycle:
- Tab opened → `textDocument/didOpen` (automatic via CM LSP client)
- User types → `textDocument/didChange` (automatic incremental sync)
- Tab closed → `textDocument/didClose` (automatic via CM LSP client)
- Tab switched → Editor view hidden/shown; no LSP messages needed

---

## R7: SharedWorker Langium Server

### Decision: Port-based Transport adapter

The SharedWorker needs to run the Langium LSP server and bridge it to the CM LSP client. We reuse the existing `@rune-langium/lsp-server` package:

```typescript
// lsp-worker.ts (SharedWorker entry)
import { createRuneLspServer } from '@rune-langium/lsp-server';
import type { Transport } from '@lspeasy/core';

const server = createRuneLspServer();
const ports: MessagePort[] = [];

self.addEventListener('connect', (e: MessageEvent) => {
  const port = e.ports[0];
  ports.push(port);

  // Create a Transport that bridges MessagePort ↔ @lspeasy/core Transport
  const transport: Transport = {
    send(data: string) { port.postMessage(data); },
    onMessage(handler) { port.addEventListener('message', (e) => handler(e.data)); },
    onError(handler) { /* SharedWorker errors */ },
    onClose(handler) { /* port close */ },
    close() { port.close(); },
    isConnected() { return true; }
  };

  server.listen(transport);
  port.start();
});
```

**Note**: The `@lspeasy/core` Transport interface (`send`, `onMessage`, `onError`, `onClose`, `close`, `isConnected`) differs from `@codemirror/lsp-client` Transport (`send`, `subscribe`, `unsubscribe`). We need two transport adapters:
1. **Client-side**: MessagePort → CM Transport (`subscribe`/`unsubscribe` pattern)
2. **Server-side**: MessagePort → LSPEasy Transport (`onMessage` pattern)

---

## Summary of Decisions

| ID | Decision | Confidence |
|----|----------|------------|
| R1 | `@codemirror/lsp-client` v6.2.1 for native CM6 LSP integration | High |
| R2 | Dual transport: WebSocket primary, SharedWorker fallback | High |
| R3 | StreamLanguage-based syntax highlighting for MVP; Lezer grammar later | Medium |
| R4 | Zustand diagnostics store bridges LSP → graph node badges | High |
| R5 | `file:///workspace/{name}` URI scheme for in-memory files | High |
| R6 | Single LSPClient, multiple EditorViews for multi-tab | High |
| R7 | SharedWorker runs `createRuneLspServer()` with port-based Transport | High |
