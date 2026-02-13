# @rune-langium/studio

Web-based visual editor for Rune DSL models with integrated LSP support.

## Features

- **ReactFlow Graph** — Interactive DAG visualization of Rune DSL types, enums, and choice types
- **CodeMirror 6 Editor** — Full-featured source editor with Rune DSL syntax highlighting
- **LSP Integration** — Real-time diagnostics, hover information, code completion, and go-to-definition
- **Dual Transport** — WebSocket connection to external `rune-lsp-server` with automatic SharedWorker/Worker fallback
- **Diagnostics Bridge** — LSP errors appear as inline editor underlines _and_ as badges on graph nodes
- **Multi-file Support** — Tab bar for switching between `.rosetta` files with per-file LSP document lifecycle

## Architecture

```text
App (LSP client lifecycle)
├── ConnectionStatus (pill indicator)
├── EditorPage
│   ├── SourceEditor (CodeMirror 6 + LSP)
│   │   ├── Tab bar (file tabs)
│   │   └── EditorView per tab
│   ├── RuneTypeGraph (visual editor)
│   │   └── Node error badges (from diagnostics-store)
│   └── DiagnosticsPanel (error/warning list)
```

### Transport Failover

1. **Try WebSocket** → `ws://localhost:3001` (external LSP server)
2. **Retry** up to 3 times with exponential backoff
3. **Fall back** to embedded SharedWorker (or dedicated Worker) running Langium in-browser

### Data Flow

```text
User types in editor
    → CodeMirror (textDocument/didChange) → @codemirror/lsp-client
    → Transport (WS or Worker) → rune-lsp-server (Langium)
    → Langium validates → textDocument/publishDiagnostics
    → @codemirror/lsp-client → editor underlines
    → diagnostics-bridge → diagnostics-store → graph node badges
```

## Development

```bash
# From monorepo root
pnpm install

# Start dev server
pnpm --filter @rune-langium/studio dev

# Run tests (94 tests across 13 files)
pnpm --filter @rune-langium/studio test

# Type-check
pnpm --filter @rune-langium/studio run type-check
```

### With external LSP server

For full LSP features via WebSocket:

```bash
# Terminal 1: Start the LSP server
pnpm --filter @rune-langium/lsp-server start

# Terminal 2: Start the studio
pnpm --filter @rune-langium/studio dev
```

The studio will connect to `ws://localhost:3001` automatically. If no server is running, it falls back to the embedded worker.

## Key Files

| File | Purpose |
|------|---------|
| `src/components/SourceEditor.tsx` | CodeMirror 6 editor with multi-tab support |
| `src/components/DiagnosticsPanel.tsx` | Error/warning list with click-to-navigate |
| `src/components/ConnectionStatus.tsx` | Transport status indicator |
| `src/services/lsp-client.ts` | LSPClient lifecycle management |
| `src/services/transport-provider.ts` | WebSocket + Worker failover logic |
| `src/services/ws-transport.ts` | WebSocket → CM Transport adapter |
| `src/services/worker-transport.ts` | Worker → CM Transport adapter |
| `src/services/diagnostics-bridge.ts` | LSP diagnostics → type name mapping |
| `src/services/semantic-diff.ts` | Structural AST comparison |
| `src/workers/lsp-worker.ts` | SharedWorker/Worker entry point |
| `src/store/diagnostics-store.ts` | Zustand diagnostics state |
| `src/lang/rune-dsl.ts` | Rune DSL syntax highlighting |

## Non-Functional Requirements

| NFR | Target | Implementation |
|-----|--------|----------------|
| Diagnostics latency | < 500ms | Direct LSP pipeline, no intermediate buffering |
| LSP handshake | < 2s (WS), < 1s (embedded) | 2s connection timeout, immediate Worker fallback |
| Editor load | < 500ms | Lazy CodeMirror initialization per tab |
| SharedWorker memory | < 50MB | Langium ~2MB bundled, well within budget |
| Reconnection | 3 attempts with exponential backoff | Configurable via `TransportProviderOptions` |
| WebSocket security | Localhost-only | Default URI: `ws://localhost:3001` |

## Testing

Tests use the CDM corpus from `.resources/cdm/` (142 Rune DSL files) for realistic integration testing.

```bash
# Run all studio tests
pnpm --filter @rune-langium/studio test

# Run specific test file
pnpm --filter @rune-langium/studio exec vitest run test/components/SourceEditor.test.tsx
```
