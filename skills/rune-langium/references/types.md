# Types & Enums

## Types

### `RuneLspServer`
**Properties:**
- `server: LSPServer<ServerCapabilities<any>>` — The underlying @lspeasy/server instance.
- `shared: LangiumSharedServices` — Langium shared services (for testing / advanced use).
- `services: LangiumServices` — Langium language services for Rune DSL.
