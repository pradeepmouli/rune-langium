# Requirements Checklist: LSP-Powered Studio Editor

**Spec**: [../spec.md](../spec.md) | **Date**: 2026-02-12

## User Story 1 — Real-time Diagnostics in Editor (P1)

- [ ] Syntax errors show red underlines within 1 second of typing
- [ ] Validation errors (e.g., duplicate attribute) show inline
- [ ] Hover over underlined error shows diagnostic message
- [ ] Multi-file: each tab shows its own diagnostics independently
- [ ] Fixing an error removes the underline when re-validated
- [ ] Diagnostics also appear in DiagnosticsPanel with click-to-navigate

## User Story 2 — Hover & Go-to-Definition (P2)

- [ ] Hovering over a type reference shows definition summary tooltip
- [ ] Ctrl/Cmd+click on a type reference jumps to its declaration
- [ ] Hovering over built-in types shows description (or gracefully empty)

## User Story 3 — Code Completion (P2)

- [ ] After `extends `, completion list shows available type names
- [ ] Inside type body, completion shows keyword suggestions
- [ ] Selecting a completion item inserts it and triggers re-validation

## User Story 4 — Connection Management & Fallback (P1)

- [ ] Connects to running rune-lsp-server via WebSocket within 2 seconds
- [ ] Falls back to SharedWorker LSP server when no external server found
- [ ] Connection status indicator shows current mode (Connected/Embedded/Disconnecting)
- [ ] WebSocket disconnect detected within 5 seconds
- [ ] Exponential backoff reconnection (3 attempts) before fallback
- [ ] Manual "Reconnect" button switches back to WebSocket when available

## User Story 5 — Graph ↔ Editor Sync (P2)

- [ ] LSP diagnostics map to graph node error badges with counts
- [ ] Clicking a graph node scrolls editor to type declaration
- [ ] Clicking an error badge scrolls editor to specific error line
- [ ] Resolved diagnostics remove graph node error badge

## Non-Functional Requirements

- [ ] NFR-1: Diagnostics latency (keystroke → underline) < 500ms
- [ ] NFR-2: LSP handshake < 2s (WebSocket), < 1s (SharedWorker)
- [ ] NFR-3: Editor load time < 500ms
- [ ] NFR-4: SharedWorker memory overhead < 50MB
- [ ] NFR-5: Reconnection: 3 attempts with exponential backoff
- [ ] NFR-6: Support at least 10 simultaneous open file tabs

## Technical Requirements

- [ ] CodeMirror 6 replaces SourceView as the source editor
- [ ] @codemirror/lsp-client provides native LSP integration
- [ ] StreamLanguage provides Rune DSL syntax highlighting
- [ ] Zustand diagnostics store bridges editor and graph diagnostics
- [ ] SharedWorker runs @rune-langium/lsp-server for embedded mode
- [ ] document lifecycle (didOpen/didChange/didClose) managed per tab
- [ ] All new code has unit test coverage
