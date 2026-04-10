[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/lsp-server](../README.md) / createConnectionAdapter

# Function: createConnectionAdapter()

> **createConnectionAdapter**(`server`): `any`

Defined in: [connection-adapter.ts:259](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/lsp-server/src/connection-adapter.ts#L259)

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
