---

description: "Task list for LSP-powered studio editor"

---

# Tasks: LSP-Powered Studio Editor

**Input**: Design documents from `/specs/003-lsp-studio-integration/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: INCLUDED (mandatory per spec.md "User Scenarios & Testing").

**Organization**: Tasks are grouped by phase (transport → editor → graph integration → polish) with user story traceability.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup & Dependencies

**Purpose**: Install CodeMirror and LSP dependencies, configure build

- [X] T001 Add CodeMirror and LSP dependencies to studio package.json: `codemirror`, `@codemirror/lsp-client`, `@codemirror/language`, `@codemirror/view`, `@codemirror/state`, `@codemirror/commands`, `@codemirror/lint`, `@lspeasy/core`, `@lspeasy/client` in apps/studio/package.json
- [X] T002 Configure Vite for SharedWorker support (worker plugin) in apps/studio/vite.config.ts
- [X] T003 [P] Add `@rune-langium/lsp-server` dependency to studio in apps/studio/package.json
- [X] T004 Run pnpm install and verify build passes

---

## Phase 2: Transport Layer (US4 — Connection Management)

**Purpose**: Implement dual transport with automatic failover
**Validates**: User Story 4 (Connection Management & Fallback)

### Tests first

- [X] T005 [P] Write unit tests for WebSocket transport adapter in apps/studio/test/services/ws-transport.test.ts
- [X] T006 [P] Write unit tests for SharedWorker transport adapter in apps/studio/test/services/worker-transport.test.ts
- [X] T007 [P] Write unit tests for transport provider (failover logic) in apps/studio/test/services/transport-provider.test.ts

### Implementation

- [X] T008 [P] [US4] Implement WebSocket → CM Transport adapter in apps/studio/src/services/ws-transport.ts
- [X] T009 [P] [US4] Implement Worker → CM Transport adapter (SharedWorker primary, dedicated Worker fallback if SharedWorker unsupported) in apps/studio/src/services/worker-transport.ts
- [X] T010 [US4] Implement Worker LSP server entry point (SharedWorker with dedicated Worker fallback) in apps/studio/src/workers/lsp-worker.ts
- [X] T011 [US4] Implement transport provider with failover logic in apps/studio/src/services/transport-provider.ts
- [X] T012 [P] [US4] Write ConnectionStatus indicator component in apps/studio/src/components/ConnectionStatus.tsx
- [X] T013 [P] [US4] Write ConnectionStatus component tests in apps/studio/test/components/ConnectionStatus.test.tsx

**Checkpoint**: Transport layer complete — WebSocket and SharedWorker transports working with automatic failover

---

## Phase 3: Rune DSL Language Support

**Purpose**: Syntax highlighting for .rosetta files in CodeMirror

- [X] T014 [P] Write tests for Rune DSL syntax highlighting in apps/studio/test/lang/rune-dsl.test.ts
- [X] T015 [P] Implement Rune DSL StreamLanguage definition in apps/studio/src/lang/rune-dsl.ts

---

## Phase 4: LSP Client Service

**Purpose**: Manage LSPClient lifecycle, document sync, and diagnostics subscription

- [X] T016 Write unit tests for LSP client service in apps/studio/test/services/lsp-client.test.ts
- [X] T017 Implement LSP client service (connect, disconnect, getPlugin, onDiagnostics) in apps/studio/src/services/lsp-client.ts

---

## Phase 5: CodeMirror Editor (US1, US2, US3 — Diagnostics, Hover, Completion)

**Purpose**: Replace SourceView with CodeMirror 6 editor wired to LSP
**Validates**: User Story 1 (Diagnostics), User Story 2 (Hover & Go-to-Definition), User Story 3 (Completion)

### Tests first

- [X] T018 [P] Write SourceEditor component tests (render, tabs, content) in apps/studio/test/components/SourceEditor.test.tsx
- [X] T019 [P] Write diagnostics display tests (underlines, hover) in apps/studio/test/components/SourceEditor.test.tsx (diagnostics describe block)

### Implementation

- [X] T020 [US1] Implement SourceEditor component with CodeMirror 6 in apps/studio/src/components/SourceEditor.tsx
- [X] T021 [US1] Wire editor to LSP client (diagnostics, document sync) in SourceEditor — `client.plugin(uri)` integration
- [X] T022 [P] [US2] Write hover integration tests (type reference hover shows tooltip, Ctrl+click navigates to definition, cross-file go-to-def opens new tab) in apps/studio/test/components/SourceEditor.test.tsx (hover describe block)
- [X] T023 [P] [US3] Write completion integration tests (extends keyword triggers type list, enter inserts selection) in apps/studio/test/components/SourceEditor.test.tsx (completion describe block)
- [X] T024 [US2] Verify hover information works via @codemirror/lsp-client in SourceEditor (hover extension included in languageServerExtensions)
- [X] T025 [US3] Verify completion works via @codemirror/lsp-client in SourceEditor (completion extension included in languageServerExtensions)
- [X] T026 Implement multi-tab support (tab bar, active tab, tab switching; cross-file go-to-definition opens/switches tab) in SourceEditor
- [X] T027 Wire EditorPage to use SourceEditor instead of SourceView in apps/studio/src/pages/EditorPage.tsx
- [X] T028 Update App.tsx to initialize LSP client on startup in apps/studio/src/App.tsx

**Checkpoint**: CodeMirror editor replacing SourceView with full LSP features

---

## Phase 6: Diagnostics Bridge & Graph Integration (US5)

**Purpose**: Connect LSP diagnostics to ReactFlow graph nodes
**Validates**: User Story 5 (Graph ↔ Editor Sync)

### Tests first

- [X] T029 [P] Write diagnostics bridge tests (LSP → type mapping) in apps/studio/test/services/diagnostics-bridge.test.ts
- [X] T030 [P] Write diagnostics store tests in apps/studio/test/store/diagnostics-store.test.ts
- [X] T031 [P] Write semantic-diff utility tests (AST structural comparison, ignore comments/whitespace) in apps/studio/test/services/semantic-diff.test.ts

### Implementation

- [X] T032 [US5] Implement diagnostics zustand store in apps/studio/src/store/diagnostics-store.ts
- [X] T033 [US5] Implement diagnostics bridge (LSP diagnostics → type name mapping) in apps/studio/src/services/diagnostics-bridge.ts
- [X] T034 [US5] Implement semantic AST diff utility (compare type declarations, inheritance, attributes; ignore cosmetic changes) in apps/studio/src/services/semantic-diff.ts
- [X] T035 [US5] Implement debounced re-parse hook (500ms idle → re-parse → semantic diff → conditional graph re-layout) in apps/studio/src/services/debounced-reparse.ts
- [X] T036 [US5] Wire diagnostics bridge to LSP client onDiagnostics callback in App.tsx or EditorPage.tsx
- [X] T037 [US5] Add error badge rendering to graph nodes (consume diagnostics store) in visual-editor DataTypeNode/ChoiceTypeNode/EnumTypeNode or EditorPage overlay
- [X] T038 [US5] Implement graph node click → editor scroll navigation in EditorPage.tsx

**Checkpoint**: Full bidirectional sync between graph and editor

---

## Phase 7: DiagnosticsPanel & Polish

**Purpose**: Error list panel, final integration, performance validation

- [X] T039 [P] Add fixture loader for LSP integration tests (reuse CDM corpus from .resources/cdm/) in apps/studio/test/helpers/fixture-loader.ts
- [X] T040 [P] Write DiagnosticsPanel component tests in apps/studio/test/components/DiagnosticsPanel.test.tsx
- [X] T041 [P] [US1] Implement DiagnosticsPanel component (error/warning list with navigation) in apps/studio/src/components/DiagnosticsPanel.tsx
- [X] T042 Wire DiagnosticsPanel into EditorPage layout in apps/studio/src/pages/EditorPage.tsx
- [X] T043 Add editor styles (CodeMirror theme, tab bar, connection indicator) in apps/studio/src/styles.css
- [X] T044 Verify NFR targets: diagnostics latency <500ms (NFR-1), handshake <2s (NFR-2), editor load <500ms (NFR-3), SharedWorker memory <50MB (NFR-4), WebSocket binds to localhost only (NFR-7)
- [X] T045 Update studio README with LSP features documentation in apps/studio/README.md
- [X] T046 Final integration test: load CDM fixtures → diagnostics store → bridge → semantic diff

---

## Phase 8: LSP Server Bug Fixes & Regression Tests

**Purpose**: Fix runtime bugs in LSP server connection and add regression tests
**Context**: Discovered during first live testing of studio ↔ LSP server integration

### Bug Fixes

- [X] T047 [US4] Fix WebSocketTransport constructor: `new WebSocketTransport(ws)` → `new WebSocketTransport({ socket: ws as any })` (options object API) in packages/lsp-server/src/cli.ts
- [X] T048 [US4] Fix pre-opened socket: add `ws.emit('open')` after transport creation to trigger @lspeasy initialization in packages/lsp-server/src/cli.ts
- [X] T049 [US1] Fix pathToUri malformed URIs: relative paths now get `/workspace/` prefix → `file:///workspace/model.rosetta` in apps/studio/src/utils/uri.ts
- [X] T050 [P] Extract `pathToUri` utility from SourceEditor to apps/studio/src/utils/uri.ts (re-exported for backward compat)

### Regression Tests

- [X] T051 [P] Add pathToUri unit tests (12 tests) in apps/studio/test/components/pathToUri.test.ts
- [X] T052 [P] Add LSP CLI transport constructor tests (5 tests) in packages/lsp-server/test/cli-transport.test.ts
- [X] T053 [P] Add LSP URI regression integration tests (20 tests) in apps/studio/test/integration/lsp-uri-regression.test.ts

**Checkpoint**: LSP server fully operational, regression tests prevent future breakage

---

## Phase 9: Two-Way Editing Integration

**Purpose**: Wire bidirectional sync between source editor and graph editor
**Context**: Source edits propagate to graph, graph edits propagate to source text

### Bug Fixes

- [X] T054 [US5] Fix `getSerializedFiles` type check: `typeof rosettaText !== 'string'` → `rosettaText.size === 0` (exportRosetta returns Map, not string) in apps/studio/src/pages/EditorPage.tsx
- [X] T055 [US5] Fix SourceEditor recreation loop: use refs for callbacks, depend on `currentFile?.path` not `currentFile` in apps/studio/src/components/SourceEditor.tsx
- [X] T056 [US5] Add external content update handling: detect graph→source text changes and update CodeMirror via `view.dispatch()` in apps/studio/src/components/SourceEditor.tsx

### Source → Graph Wiring

- [X] T057 [US5] Wire `onContentChange` callback from SourceEditor to EditorPage in apps/studio/src/pages/EditorPage.tsx
- [X] T058 [US5] Implement `handleSourceChange` to update files with dirty flag in apps/studio/src/pages/EditorPage.tsx
- [X] T059 [US5] Implement debounced reparse in App.tsx: 500ms idle → `parseWorkspaceFiles` → update models in apps/studio/src/App.tsx

### Graph → Source Wiring

- [X] T060 [US5] Wire `onModelChanged` callback from RuneTypeGraph to EditorPage in apps/studio/src/pages/EditorPage.tsx
- [X] T061 [US5] Implement namespace→file mapping for reverse sync in apps/studio/src/pages/EditorPage.tsx
- [X] T062 [US5] Implement `handleModelChanged` to map serialized namespace text back to workspace files in apps/studio/src/pages/EditorPage.tsx

**Checkpoint**: Full two-way editing — source↔graph sync operational

---

## Phase 10: Vite Build Fix — Worker Transport

**Purpose**: Fix Vite production build failure caused by Node.js-only modules in worker bundle
**Context**: `@lspeasy/core` imports `node:events`, `node:crypto` — incompatible with browser workers

- [X] T063 [US4] Remove static import of worker-transport.ts from transport-provider.ts (was triggering Vite worker bundling of Node.js modules) in apps/studio/src/services/transport-provider.ts
- [X] T064 [US4] Replace worker fallback with graceful no-op transport + error state in apps/studio/src/services/transport-provider.ts
- [X] T065 [P] Update transport-provider tests: worker fallback returns no-op with 'disconnected'/'error' state in apps/studio/test/services/transport-provider.test.ts

**Checkpoint**: Vite production build succeeds; WebSocket transport remains the production path

---

## Parallel Execution Guide

### Phase 2 parallel splits

```text
Dev A: T008 (ws-transport.ts) + T005 (test)
Dev B: T009 (worker-transport.ts) + T006 (test)
Dev C: T012 (ConnectionStatus.tsx) + T013 (test)
Dev D: T007 (transport-provider test) → T011 (transport-provider.ts)
```

### Phase 5+6 parallel splits

```text
Dev A: T020-T026 (SourceEditor, tabs, hover/completion tests)
Dev B: T032-T035 (diagnostics store + bridge + semantic diff)
Dev C: T037-T038 (graph badges + navigation)
Dev D: T039-T041 (fixtures + DiagnosticsPanel)
```

---

## Implementation Strategy

### Phase Ordering

1. **Setup (Phase 1)** — foundation for everything
2. **Transport (Phase 2)** — must work before any LSP features
3. **Language + Client (Phase 3-4)** — can run in parallel
4. **Editor (Phase 5)** — depends on transport + language + client
5. **Graph Bridge (Phase 6)** — depends on editor + diagnostics
6. **Polish (Phase 7)** — depends on everything above

### MVP First

The minimum viable integration is:
1. Phase 1 (setup)
2. Phase 2 (transport — WebSocket only, skip SharedWorker for MVP)
3. Phase 3 (syntax highlighting)
4. Phase 4 (LSP client)
5. Phase 5 (editor) → **Usable LSP editor**

SharedWorker fallback and graph integration are additive.

### Incremental Delivery

1. Setup + Transport → connection works
2. Language + Client → LSP pipeline ready
3. Editor → diagnostics, hover, completion in source editor
4. Graph bridge → errors visible on graph nodes
5. Polish → production-ready experience

### Task Count Summary

| Phase | Tasks | Parallel | Sequential |
|-------|-------|----------|------------|
| 1. Setup | 4 | 1 | 3 |
| 2. Transport | 9 | 6 | 3 |
| 3. Language | 2 | 2 | 0 |
| 4. LSP Client | 2 | 0 | 2 |
| 5. Editor | 11 | 4 | 7 |
| 6. Graph Bridge | 10 | 3 | 7 |
| 7. Polish | 8 | 3 | 5 |
| **Total** | **46** | **19** | **27** |
