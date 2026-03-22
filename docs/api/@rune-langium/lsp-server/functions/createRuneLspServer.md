[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/lsp-server](../README.md) / createRuneLspServer

# Function: createRuneLspServer()

> **createRuneLspServer**(): [`RuneLspServer`](../interfaces/RuneLspServer.md)

Defined in: [rune-dsl-server.ts:52](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/lsp-server/src/rune-dsl-server.ts#L52)

Create a fully-wired Rune DSL LSP server.

All Langium providers (hover, completion, definition, diagnostics, …)
are wired automatically via `startLanguageServer`.

Call `result.listen(transport)` to bind to a client transport.

## Returns

[`RuneLspServer`](../interfaces/RuneLspServer.md)
