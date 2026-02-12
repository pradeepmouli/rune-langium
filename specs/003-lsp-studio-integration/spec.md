# Feature Specification: LSP-Powered Studio Editor

**Feature Branch**: `003-lsp-studio-integration`
**Created**: 2026-02-12
**Status**: Draft
**Input**: User request: "wire up the studio with LSP support"

## Overview

Replace the studio's read-only `SourceView` with a full CodeMirror 6 editor backed by the Rune DSL LSP server (`@rune-langium/lsp-server`). The editor provides real-time diagnostics (inline squiggly underlines), hover information, code completion, go-to-definition, and document symbols — all powered by Langium's LSP providers.

**Dual transport architecture**:
- **Primary**: WebSocket transport to a separately-running `rune-lsp-server` process (production use)
- **Fallback**: In-browser SharedWorker running the Langium LSP logic directly (offline/demo/zero-setup mode)

The integration connects the LSP diagnostics pipeline to the existing ReactFlow graph so that type errors appear both as editor underlines and as visual markers on graph nodes.

## Dependencies

This feature builds on:
- `@rune-langium/lsp-server` (from the LSP wiring work) — Connection adapter + Langium server factory
- `@rune-langium/visual-editor` + `@rune-langium/studio` (from 002-reactflow-visual-editor) — graph visualization
- `@lspeasy/core` — Transport interface, WebSocketTransport
- `@lspeasy/client` — LSPClient for non-editor LSP interactions (graph diagnostics bridge)
- `@codemirror/lsp-client` — Official CodeMirror LSP integration (diagnostics, hover, completion, signatures)

## Clarifications

### Session 2026-02-12

**Q1**: Which code editor component should replace the SourceView?
**A**: CodeMirror 6 — lighter weight than Monaco, official `@codemirror/lsp-client` package provides native LSP integration.

**Q2**: How should the studio connect to the LSP server?
**A**: Both — WebSocket as primary transport (to external `rune-lsp-server` process), with in-browser SharedWorker fallback for offline/demo mode.

**Q3**: Should this be part of the 002 spec or a new spec?
**A**: New spec (003) — keeps concerns isolated from the visual editor feature.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Real-time Diagnostics in Editor (Priority: P1)

As a **Rune DSL developer editing .rosetta files in the studio**, I want to see syntax and validation errors inline as I type, so that I can fix problems immediately without a manual parse cycle.

**Why this priority**: Diagnostics are the most impactful LSP feature — they replace the current "load → parse → check errors map" workflow with continuous, real-time feedback directly in the source editor.

**Independent Test**: Open a `.rosetta` file with a known validation error (e.g., duplicate attribute name). Verify the editor shows an underline on the error location with a hover tooltip describing the problem.

**Acceptance Scenarios**:

1. **Given** a valid `.rosetta` file opened in the editor, **When** the user introduces a syntax error (e.g., missing closing brace), **Then** within 1 second the editor shows a red squiggly underline on the error location and a diagnostic message on hover
2. **Given** a `.rosetta` file with a Rune validation error (duplicate attribute), **When** the LSP server publishes diagnostics, **Then** the editor displays an inline warning/error and the graph view highlights the affected node
3. **Given** multiple files open in tabs, **When** the user switches between files, **Then** each editor tab shows its own diagnostics, and document lifecycle events (didOpen/didClose/didChange) are sent correctly to the LSP server
4. **Given** the user fixes an error, **When** the file re-validates clean, **Then** the underline disappears and the graph node error marker is removed

---

### User Story 2 — Hover & Go-to-Definition (Priority: P2)

As a **developer navigating a Rune model**, I want to hover over type references to see their definition summary and click to jump to their declaration, so that I can explore relationships without manually searching files.

**Why this priority**: Navigation features build on the diagnostics infrastructure and add significant value for large models (CDM 400+ types). Less critical than seeing errors but important for productivity.

**Independent Test**: Open a file with `attribute product Product (1..1)`. Hover over `Product` — verify a tooltip shows the Product type definition summary. Click/Ctrl+click to jump to the Product type declaration.

**Acceptance Scenarios**:

1. **Given** a type reference like `Product` in an attribute declaration, **When** the user hovers, **Then** a tooltip shows the type's documentation (name, supertype, attribute count)
2. **Given** a type reference, **When** the user Ctrl+clicks (or Cmd+click on macOS), **Then** the editor navigates to the file and line where that type is declared
3. **Given** a hover over a built-in type (`string`, `number`, `date`), **When** the user hovers, **Then** the tooltip shows the built-in type description (or gracefully shows nothing)

---

### User Story 3 — Code Completion (Priority: P2)

As a **developer writing Rune DSL code**, I want autocomplete suggestions for type names, keywords, and attribute types, so that I can write models faster and with fewer typos.

**Why this priority**: Completion is a core editor productivity feature. It requires the same LSP infrastructure as diagnostics/hover, so marginal implementation cost once the pipeline is established.

**Independent Test**: In a `.rosetta` file, type `extends ` and verify a completion list appears showing available type names from the loaded workspace.

**Acceptance Scenarios**:

1. **Given** the cursor is after `extends `, **When** the user triggers completion (Ctrl+Space or typing), **Then** a list of valid type names from the workspace appears
2. **Given** the cursor is at the start of a line inside a type body, **When** the user triggers completion, **Then** keyword suggestions (e.g., attribute types, cardinality patterns) appear
3. **Given** a completion item is selected, **When** the user presses Enter/Tab, **Then** the selected text is inserted and the editor re-validates

---

### User Story 4 — Connection Management & Fallback (Priority: P1)

As a **user launching the studio**, I want it to automatically connect to a running LSP server (or fall back to an embedded one), with clear status indication, so that the editing experience works regardless of whether a server is running.

**Why this priority**: Without reliable connection management, none of the LSP features work. The fallback ensures the studio is always usable — critical for demos and first-time users.

**Independent Test**: Start the studio without a running LSP server. Verify the status indicator shows "embedded" mode after a brief timeout, and diagnostics still work via the SharedWorker fallback.

**Acceptance Scenarios**:

1. **Given** `rune-lsp-server` is running on port 3001, **When** the studio loads, **Then** it connects via WebSocket within 2 seconds and the status indicator shows "Connected"
2. **Given** no LSP server is running, **When** the studio loads and WebSocket connection fails, **Then** within 3 seconds the studio falls back to the SharedWorker-based LSP server and shows "Embedded" status
3. **Given** a connected WebSocket session, **When** the server goes down, **Then** the studio detects disconnection within 5 seconds, shows "Reconnecting…" status, attempts reconnection with exponential backoff, and falls back to embedded mode after 3 failed attempts
4. **Given** the studio is in embedded mode, **When** a WebSocket server becomes available and the user clicks "Reconnect", **Then** the studio switches to WebSocket mode

---

### User Story 5 — Graph ↔ Editor Sync (Priority: P2)

As a **developer using both the graph view and source editor**, I want LSP diagnostics to appear as error markers on graph nodes, and clicking a graph node to focus the corresponding source location in the editor, so that I can navigate seamlessly between visual and textual views.

**Why this priority**: This is the differentiating feature — connecting the visual editor with the LSP-powered source editor. It justifies having both views side-by-side rather than as independent tools.

**Independent Test**: Introduce an error in a Data type. Verify the graph node shows an error badge. Click the error badge on the graph node — verify the editor scrolls to and highlights the error location.

**Acceptance Scenarios**:

1. **Given** the LSP publishes a diagnostic for type `Trade` at line 15, **When** the graph renders, **Then** the "Trade" graph node shows a red error badge with the diagnostic count
2. **Given** the user clicks a graph node "Trade", **When** the click handler fires, **Then** the source editor scrolls to the `type Trade` declaration and highlights it briefly
3. **Given** the user clicks an error badge on a graph node, **When** handled, **Then** the editor scrolls to the specific error line within that type
4. **Given** a diagnostic is resolved (user fixes the error), **When** new diagnostics arrive without the error, **Then** the graph node error badge is removed

---

## Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Diagnostics latency (keystroke → underline) | < 500ms |
| NFR-2 | Initial LSP handshake (connect → initialized) | < 2s (WS), < 1s (embedded) |
| NFR-3 | Editor load time (CodeMirror + LSP wiring) | < 500ms |
| NFR-4 | Memory overhead (SharedWorker LSP server) | < 50MB |
| NFR-5 | Reconnection attempts before fallback | 3 with exponential backoff |
| NFR-6 | Multi-file support | At least 10 simultaneous open files |

## Out of Scope

- **Rename refactoring** — Langium's rename provider requires workspace-wide file writes; deferred to future spec
- **Code actions / quick fixes** — Requires custom Langium code action providers; future work
- **Semantic tokens / syntax highlighting from LSP** — CodeMirror handles highlighting via grammar; LSP semantic tokens add marginal value
- **Collaborative editing** — Multi-user editing is a separate concern entirely
- **File save to disk** — Studio uses File System Access API from 002; no changes needed
