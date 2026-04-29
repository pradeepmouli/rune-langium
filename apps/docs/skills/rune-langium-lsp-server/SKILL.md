---
name: rune-langium-lsp-server
description: "Documentation site and generated agent skills for rune-langium APIs Use when: Embedding a Rune DSL language server in a web application via WebSocket."
---

# @rune-langium/lsp-server

Documentation site and generated agent skills for rune-langium APIs

## When to Use

**Use this skill when:**
- Embedding a Rune DSL language server in a web application via WebSocket → use `createRuneLspServer`
- Running a standalone LSP server process bridging to a VS Code / Theia client → use `createRuneLspServer`
- Integration-testing LSP features (hover, completion, diagnostics) → use `createRuneLspServer`
- Wiring a custom `@lspeasy/server` instance into Langium in tests or advanced embedding scenarios where `createRuneLspServer()` does not fit. → use `createConnectionAdapter`

**Do NOT use when:**
- Parsing `.rosetta` files in a script — use `createRuneDslServices()` and `parse()` / `parseWorkspace()` instead (no LSP overhead). (`createRuneLspServer`)
- Creating multiple servers in the same process — each server maintains its own Langium workspace index; sharing a workspace across servers requires custom `ServiceRegistry` wiring. (`createRuneLspServer`)
- Normal usage — prefer `createRuneLspServer()` which calls this internally. (`createConnectionAdapter`)

API surface: 2 functions, 1 types

## Quick Reference

**LSP Server:** `createRuneLspServer` (Create a fully-wired Rune DSL LSP server backed by `@lspeasy/server`), `createConnectionAdapter` (Create a `vscode-languageserver`-compatible `Connection` backed by an
`@lspeasy/server` `LSPServer`), `RuneLspServer` (A fully-wired Rune DSL LSP server instance)

## References

Load these on demand — do NOT read all at once:

- When calling any function → read `references/functions.md` for full signatures, parameters, and return types
- When defining typed variables or function parameters → read `references/types.md`

## Links

- Author: Pradeep Mouli <pmouli@mac.com> (https://github.com/pradeepmouli)