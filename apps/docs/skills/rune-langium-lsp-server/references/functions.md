# Functions

## LSP Server

### `createRuneLspServer`
Create a fully-wired Rune DSL LSP server backed by `@lspeasy/server`.

Initialization order (all synchronous before returning):
1. `LSPServer` created with broad capability declarations
2. `createConnectionAdapter()` wraps it to satisfy Langium's `Connection` interface
3. Langium LSP services constructed (`createDefaultSharedModule` + Rune DSL modules)
4. `RuneDslValidator` checks registered
5. `startLanguageServer(shared)` wires all providers to connection handlers

The server responds to `initialize` requests only once per lifecycle — the
connection adapter manages the `Created → Initializing → Initialized` state
machine to avoid duplicate initialization errors.
```ts
createRuneLspServer(): RuneLspServer
```
**Returns:** `RuneLspServer` — A RuneLspServer ready for `listen(transport)`.
```ts
import { createRuneLspServer } from '@rune-langium/lsp-server';
import { WebSocketTransport } from '@lspeasy/core';

const lsp = createRuneLspServer();
const transport = new WebSocketTransport(webSocket);
await lsp.listen(transport);
```

### `createConnectionAdapter`
Create a `vscode-languageserver`-compatible `Connection` backed by an
`@lspeasy/server` `LSPServer`.

Langium's `startLanguageServer()` expects a `Connection` object from
`vscode-languageserver`. This adapter bridges the gap: it translates Langium's
typed handler registration methods (`onHover`, `onCompletion`, etc.) into
`@lspeasy/server` request/notification registrations via a `Proxy`.

The `initialize` request receives special composite handling that replicates
`@lspeasy/server`'s internal state transitions
(`Created → Initializing → Initialized`) AND forwards to Langium's handler.
Without this, Langium's `startLanguageServer` would register its own handler
that bypasses the state machine, causing all subsequent non-lifecycle requests
to be rejected with `ServerNotInitialized`.
```ts
createConnectionAdapter(server: LSPServer<ServerCapabilities<any>>): any
```
**Parameters:**
- `server: LSPServer<ServerCapabilities<any>>` — The `@lspeasy/server` `LSPServer` instance to adapt.
**Returns:** `any` — A duck-typed `Connection` object compatible with Langium's
  `createDefaultSharedModule({ connection })`.
