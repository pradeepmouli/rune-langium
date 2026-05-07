---
name: Deferred corpus linker — ADR 007 implementation
description: Custom RuneDslLinker implements lazy corpus deserialization via loadAstNode override; deferredModelJson map holds raw JSON until cross-ref resolution
type: project
---

ADR 007 lazy loading is implemented via a custom `RuneDslLinker extends DefaultLinker` in `packages/core/src/services/rune-dsl-linker.ts`.

**Architecture:**
- `deferredModelJson: Map<string, string>` in `parser-worker.ts` holds URI→raw JSON for all corpus files
- `RegisterExports` on `RuneDslIndexManager` populates Langium's IndexManager with lightweight stubs (type/name/path/URI) so scope resolution can find corpus types
- `RuneDslLinker.loadAstNode` intercepts when Langium needs to resolve a cross-ref to a doc not in LangiumDocuments — it calls `deferredProvider.getModel(uri)`, deserializes, `fromModel`, `addDocument`, `consume`
- `handleLinkDocument` explicitly materializes the *target* doc from `deferredModelJson` before calling `build([doc], { eagerLinking: true })`; transitive corpus deps are handled automatically by the linker override

**Why:** Corpus files (141 CDM files) should not be deserialized at workspace load — only when their types are actually needed for cross-reference resolution. Zero deserialization at `handleParseWorkspace`; one deserialization per corpus doc at first cross-ref encounter.

**Key interface:** `DeferredModelProvider { getModel(uri): AstNode | undefined; consume(uri): void }` exported from `@rune-langium/core`.
