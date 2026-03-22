[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/lsp-server](../README.md) / createConnectionAdapter

# Function: createConnectionAdapter()

> **createConnectionAdapter**(`server`): `any`

Defined in: [connection-adapter.ts:256](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/lsp-server/src/connection-adapter.ts#L256)

Create a vscode-languageserver-compatible Connection backed by an
@lspeasy/server LSPServer.

Pass the returned object as `connection` to Langium's
`createDefaultSharedModule({ connection })`, then call
`startLanguageServer(shared)` — Langium wires providers automatically.

## Parameters

### server

`LSPServer`\<`ServerCapabilities`\<`any`\>\>

## Returns

`any`
