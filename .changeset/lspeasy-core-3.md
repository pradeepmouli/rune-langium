---
"@rune-langium/lsp-server": patch
---

Bump `@lspeasy/core` from `^2.7.1` to `^3.0.0` (runtime dependency). 3.0.0 moved runtime-validation exports to `@lspeasy/core/schemas` and browser transports (including `WebSocketTransport`) to per-transport subpaths (e.g. `@lspeasy/core/transport/websocket`) to keep zod out of consumers that don't need it. Updated the one affected import site (`cli.ts`'s `WebSocketTransport`, plus its test and doc-comment example) accordingly — no other moved symbols (`LSPSchemas`, `getSchemaForMethod`, etc.) are used anywhere in this repo.
