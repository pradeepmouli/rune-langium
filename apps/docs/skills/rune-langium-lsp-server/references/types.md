# Types & Enums

## lsp-model.d

### `LspModelUpdate`
Incremental semantic documents followed by the complete current URI set.
**Properties:**
- `document: { uri: string; modelJson: string }` (optional)
- `retain: string[]` (optional)

## LSP Server

### `RuneLspServer`
A fully-wired Rune DSL LSP server instance.
**Properties:**
- `server: LSPServer<ServerCapabilities>` — The underlying @lspeasy/server instance.
- `shared: LangiumSharedServices` — Langium shared services (for testing / advanced use).
- `services: LangiumServices` — Langium language services for Rune DSL.
