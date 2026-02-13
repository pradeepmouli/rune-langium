# Implementation Plan: LSP-Powered Studio Editor

**Branch**: `003-lsp-studio-integration` | **Date**: 2026-02-12 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-lsp-studio-integration/spec.md`

## Summary

Wire the Rune DSL Studio with LSP support by replacing the read-only `SourceView` with a CodeMirror 6 editor connected to the Rune DSL LSP server. Uses `@codemirror/lsp-client` for native CodeMirror LSP integration, with dual transport (WebSocket primary, SharedWorker fallback). Bridges LSP diagnostics to the ReactFlow graph for unified error visualization.

**Key insight**: The `@rune-langium/lsp-server` package (Connection adapter + Langium server factory) is already built and tested. This feature focuses on the **client side** — the studio UI, editor component, transport management, and graph integration.

## Technical Context

**Language/Version**: TypeScript 5.9+ (strict mode, ESM)
**Primary Dependencies (new)**:
- `codemirror` 6.0.2 (basic setup bundle)
- `@codemirror/lsp-client` 6.2.1 (LSP integration — diagnostics, hover, completion, definition)
- `@codemirror/language` 6.12.1 (StreamLanguage for Rune DSL syntax highlighting)
- `@codemirror/view` 6.39.14 (EditorView)
- `@codemirror/state` 6.5.4 (EditorState)
- `@codemirror/commands` 6.10.2 (keymaps)
- `@codemirror/lint` 6.9.4 (diagnostics panel)
**Existing Dependencies (reused)**:
- `@rune-langium/lsp-server` workspace:* (server factory for SharedWorker)
- `@rune-langium/visual-editor` workspace:* (graph components)
- `@rune-langium/core` workspace:* (AST types for diagnostics mapping)
- `@lspeasy/core` link:* (Transport interface for SharedWorker adapter)
- `zustand` 5.x (existing state management)
- `@xyflow/react` 12.x (existing graph rendering)

**Build**: Vite 6.x (existing studio app build)
**Testing**: Vitest (unit/integration), React Testing Library (component tests)

## Constitution Check

| Principle | Status | Implementation |
|-----------|--------|----------------|
| **I. DSL Fidelity & Typed AST** | PASS | LSP features are powered by Langium providers that operate on the typed AST. No custom protocol or AST manipulation introduced. |
| **II. Deterministic Fixtures** | PASS | LSP integration tests use vendored `.rosetta` fixtures. SharedWorker and transport tests are fully in-memory. |
| **III. Validation Parity** | PASS | Diagnostics come directly from `RuneDslValidator` via Langium's diagnostic pipeline — same validation as CLI/core. |
| **IV. Performance & Workers** | PASS | SharedWorker isolates LSP server from main thread. Transport failover is non-blocking. Editor rendering uses CM6's efficient update model. |
| **V. Reversibility & Compatibility** | PASS | SourceView replacement is internal to studio app; visual-editor library API unchanged. LSP is additive — graph works without it. |

**Gate result**: PASS — no violations.

## Project Structure

### New files (in existing packages)

```text
apps/studio/
├── src/
│   ├── components/
│   │   ├── SourceEditor.tsx          # CodeMirror editor component (replaces SourceView)
│   │   ├── ConnectionStatus.tsx      # LSP connection indicator
│   │   └── DiagnosticsPanel.tsx      # Error/warning summary panel
│   ├── services/
│   │   ├── lsp-client.ts            # LSPClient lifecycle + multi-tab management
│   │   ├── transport-provider.ts    # WebSocket + SharedWorker transport factory
│   │   ├── ws-transport.ts          # WebSocket → CM Transport adapter
│   │   ├── worker-transport.ts      # SharedWorker → CM Transport adapter
│   │   └── diagnostics-bridge.ts    # LSP diagnostics → graph node mapping
│   ├── workers/
│   │   └── lsp-worker.ts            # SharedWorker entry (Langium server)
│   ├── lang/
│   │   └── rune-dsl.ts              # Rune DSL syntax highlighting (StreamLanguage)
│   └── store/
│       └── diagnostics-store.ts     # Zustand diagnostics slice
├── test/
│   ├── services/
│   │   ├── lsp-client.test.ts
│   │   ├── transport-provider.test.ts
│   │   ├── ws-transport.test.ts
│   │   ├── worker-transport.test.ts
│   │   └── diagnostics-bridge.test.ts
│   ├── components/
│   │   ├── SourceEditor.test.tsx
│   │   ├── ConnectionStatus.test.tsx
│   │   └── DiagnosticsPanel.test.tsx
│   ├── lang/
│   │   └── rune-dsl.test.ts
│   └── store/
│       └── diagnostics-store.test.ts
```

### Modified files

```text
apps/studio/
├── package.json                     # Add CodeMirror + LSP dependencies
├── src/
│   ├── App.tsx                      # Wire LSP client lifecycle
│   ├── pages/EditorPage.tsx         # Replace SourceView with SourceEditor
│   └── services/workspace.ts        # Integrate LSP document sync (optional)
├── vite.config.ts                   # SharedWorker plugin config
```

## Architecture

### Data Flow

```
User types in editor
    │
    ▼
CodeMirror EditorView (textDocument/didChange) ──→ @codemirror/lsp-client
    │                                                      │
    │                                              Transport (WS or Worker)
    │                                                      │
    │                                              rune-lsp-server (Langium)
    │                                                      │
    │                                              Langium validates
    │                                                      │
    │                                              textDocument/publishDiagnostics
    │                                                      │
    ▼                                                      ▼
CodeMirror shows underlines ◄──── @codemirror/lsp-client ─────► diagnostics-bridge
                                                                     │
                                                              diagnostics-store
                                                                     │
                                                              ReactFlow graph
                                                              (node error badges)
```

### Component Hierarchy

```
App (LSP client lifecycle)
├── ConnectionStatus (pill indicator)
├── EditorPage
│   ├── SourceEditor (CodeMirror + LSP)
│   │   ├── Tab bar (file tabs)
│   │   └── EditorView per tab
│   ├── RuneTypeGraph (visual editor)
│   │   └── Node error badges (from diagnostics-store)
│   └── DiagnosticsPanel (error/warning list)
```

## Phases

### Phase 1: Transport & Connection (Foundation)
- WebSocket transport adapter
- SharedWorker transport adapter + LSP worker
- Transport provider (failover logic)
- Connection status management
- **Validates**: US4

### Phase 2: CodeMirror Editor (Core)
- SourceEditor component (replaces SourceView)
- Rune DSL syntax highlighting
- Multi-tab editor with document lifecycle
- LSP client wiring (diagnostics, hover, completion)
- **Validates**: US1, US2, US3

### Phase 3: Graph Integration (Bridge)
- Diagnostics bridge (LSP → graph nodes)
- Diagnostics zustand store
- Graph node error badges
- Editor ↔ graph navigation (click node → scroll to source)
- **Validates**: US5

### Phase 4: Polish & Testing
- DiagnosticsPanel component (error list)
- E2E tests for full LSP flow
- Performance validation (NFR targets)
- Documentation

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `@codemirror/lsp-client` API mismatch with our LSP server | Low | High | The server follows standard LSP protocol; CM client is transport-agnostic |
| SharedWorker not supported in all browsers | Medium | Medium | Safari 16+ supports SharedWorker; fallback with regular Worker if needed |
| Langium server too heavy for SharedWorker | Low | Medium | Langium is ~2MB bundled; SharedWorker memory budget is 50MB |
| Multi-tab document sync complexity | Medium | Medium | `@codemirror/lsp-client` handles didOpen/didClose automatically per plugin |
| Graph diagnostics mapping accuracy | Medium | Low | Best-effort line → type name mapping; exact match not required for badges |

## Architecture Decisions (Post-Implementation)

### AD-LSP1: Worker Transport Infeasible — Graceful No-op Fallback

**Status**: Decided
**Date**: 2025-07-12
**Context**: `@lspeasy/core` imports `node:events` and `node:crypto`, which are Node.js built-in modules. When Vite bundles a SharedWorker or regular Worker that transitively imports these modules, the build fails with `"EventEmitter" is not exported by "__vite-browser-external"`. This is a fundamental platform mismatch, not a configuration issue.

**Decision**: Remove the static import of `worker-transport.ts` from `transport-provider.ts`. Replace the worker fallback path with a graceful no-op transport that returns `{ send(){}, subscribe(){}, unsubscribe(){} }` and sets the connection state to `{ mode: 'disconnected', status: 'error' }`. Console warning explains how to start the external LSP server.

**Consequences**:
- WebSocket transport (connecting to external `@rune-langium/lsp-server`) is the only operational LSP path
- No in-browser LSP — users must run `rune-langium lsp --port 3001` separately
- Vite production build succeeds cleanly
- Future: could revisit if `@lspeasy/core` removes Node.js dependencies or provides a browser-compatible build

### AD-LSP2: Two-Way Editing Data Flow

**Status**: Decided
**Date**: 2025-07-12
**Context**: Source editor and graph editor must stay synchronized bidirectionally. Naive approaches (e.g., recreating CodeMirror on every render, using object identity for deps) caused infinite loops.

**Decision**: Two separate data flows with stable ref patterns:

1. **Source → Graph**: `SourceEditor.onContentChange` → `EditorPage.handleSourceChange` (marks file dirty) → `App.handleFilesChange` (500ms debounced `parseWorkspaceFiles`) → updated models → graph re-renders
2. **Graph → Source**: `RuneTypeGraph.onModelChanged` → `EditorPage.handleModelChanged` (serializes namespace → maps to file → updates content) → file change triggers same debounced reparse

**Key stability patterns**:
- `onContentChangeRef` (useRef) prevents `buildExtensions` from being recreated on every render
- Effect depends on `currentFile?.path` not `currentFile` object to avoid firing on content-only changes
- External content detection: compares CodeMirror doc text vs file content, dispatches transaction only on real diffs

**Consequences**:
- No infinite render loops
- 500ms debounce avoids excessive parsing during typing
- Graph → Source requires namespace→file mapping (maintained in EditorPage)
