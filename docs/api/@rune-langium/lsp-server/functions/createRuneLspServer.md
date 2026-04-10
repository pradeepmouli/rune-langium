[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/lsp-server](../README.md) / createRuneLspServer

# Function: createRuneLspServer()

> **createRuneLspServer**(): [`RuneLspServer`](../interfaces/RuneLspServer.md)

Defined in: [rune-dsl-server.ts:55](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/lsp-server/src/rune-dsl-server.ts#L55)

Create a fully-wired Rune DSL LSP server.

All Langium providers (hover, completion, definition, diagnostics, …)
are wired automatically via `startLanguageServer`.

Call `result.listen(transport)` to bind to a client transport.

## Returns

[`RuneLspServer`](../interfaces/RuneLspServer.md)
