---
"@rune-langium/codegen": minor
---

**Breaking:** `importModel` is now `async` and returns `Promise<ImportResult>` instead of `ImportResult` synchronously (spec 021 Phase 2c, T3 — required to support the tree-sitter-backed SQL DDL reader, whose WASM grammar loads asynchronously). Callers must `await importModel(...)` (or otherwise handle the returned Promise) — a synchronous call site will now receive a Promise instead of the resolved `ImportResult`.
