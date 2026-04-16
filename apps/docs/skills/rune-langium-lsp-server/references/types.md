# Types & Enums

## LSP Server

### `RuneLspServer`
A fully-wired Rune DSL LSP server instance.
**Properties:**
- `server: LSPServer<ServerCapabilities<any>>` — The underlying @lspeasy/server instance.
- `shared: LangiumSharedServices` — Langium shared services (for testing / advanced use).
- `services: LangiumServices` — Langium language services for Rune DSL.
