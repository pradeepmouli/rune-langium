# Functions

## rune-dsl-server

### `createRuneLspServer`
Create a fully-wired Rune DSL LSP server.

All Langium providers (hover, completion, definition, diagnostics, …)
are wired automatically via `startLanguageServer`.

Call `result.listen(transport)` to bind to a client transport.
```ts
createRuneLspServer(): RuneLspServer
```
**Returns:** `RuneLspServer`

## connection-adapter

### `createConnectionAdapter`
Create a vscode-languageserver-compatible Connection backed by an
@lspeasy/server LSPServer.

Pass the returned object as `connection` to Langium's
`createDefaultSharedModule({ connection })`, then call
`startLanguageServer(shared)` — Langium wires providers automatically.
```ts
createConnectionAdapter(server: LSPServer<ServerCapabilities<any>>): any
```
**Parameters:**
- `server: LSPServer<ServerCapabilities<any>>`
**Returns:** `any`
