[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/lsp-server](../README.md) / RuneLspServer

# Interface: RuneLspServer

Defined in: [rune-dsl-server.ts:36](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/lsp-server/src/rune-dsl-server.ts#L36)

## Properties

### server

> **server**: `LSPServer`\<`ServerCapabilities`\<`any`\>\>

Defined in: [rune-dsl-server.ts:38](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/lsp-server/src/rune-dsl-server.ts#L38)

The underlying @lspeasy/server instance.

***

### services

> **services**: `LangiumServices`

Defined in: [rune-dsl-server.ts:42](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/lsp-server/src/rune-dsl-server.ts#L42)

Langium language services for Rune DSL.

***

### shared

> **shared**: `LangiumSharedServices`

Defined in: [rune-dsl-server.ts:40](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/lsp-server/src/rune-dsl-server.ts#L40)

Langium shared services (for testing / advanced use).

## Methods

### listen()

> **listen**(`transport`): `Promise`\<`void`\>

Defined in: [rune-dsl-server.ts:44](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/lsp-server/src/rune-dsl-server.ts#L44)

Bind the server to a transport and start processing messages.

#### Parameters

##### transport

`Transport`

#### Returns

`Promise`\<`void`\>
