---
name: rune-langium-lsp-server
description: Documentation site for rune-langium
---

# @rune-langium/lsp-server

Documentation site for rune-langium

## When to Use

- Embedding a Rune DSL language server in a web application via WebSocket
- Running a standalone LSP server process bridging to a VS Code / Theia client
- Integration-testing LSP features (hover, completion, diagnostics)
- Wiring a custom `@lspeasy/server` instance into Langium in tests or advanced
- embedding scenarios where `createRuneLspServer()` does not fit.

**Avoid when:**
- Parsing `.rosetta` files in a script — use `createRuneDslServices()` and
- `parse()` / `parseWorkspace()` instead (no LSP overhead).
- Creating multiple servers in the same process — each server maintains its
- own Langium workspace index; sharing a workspace across servers requires
- custom `ServiceRegistry` wiring.
- Normal usage — prefer `createRuneLspServer()` which calls this internally.
- API surface: 2 functions, 1 types

## Pitfalls

- The workspace index is empty until the client sends `textDocument/didOpen`
- or `workspace/didChangeWatchedFiles`. Do NOT respond to semantic requests
- (hover, completion) before at least one `didOpen` has triggered a document
- build — results will be empty or stale.
- Diagnostics are push-only (`textDocument/publishDiagnostics` notifications).
- There is no request-response path for diagnostics — the client must handle
- the notification asynchronously.
- Langium batches diagnostic notifications; a burst of `didChange` events may
- not produce one notification per change. The final stable state is always
- published but intermediate states may be coalesced.
- The returned object is typed `any` — do not expose it to callers that
- expect `vscode-languageserver.Connection`; the shape matches but TypeScript
- cannot verify structural compatibility without the vscode-languageserver
- package installed.
- Sub-objects (`console`, `window`, `workspace`, `languages`) are stubs or
- delegates. Methods that require two-way communication (e.g.,
- `workspace.getConfiguration`) may return empty results if the underlying
- transport is not yet connected.

## Quick Reference

**LSP Server:** `createRuneLspServer`, `createConnectionAdapter`, `RuneLspServer`

## Links

- Author: Pradeep Mouli <pmouli@mac.com> (https://github.com/pradeepmouli)