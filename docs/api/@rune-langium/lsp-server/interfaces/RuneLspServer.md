[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/lsp-server](../README.md) / RuneLspServer

# Interface: RuneLspServer

Defined in: [rune-dsl-server.ts:33](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/lsp-server/src/rune-dsl-server.ts#L33)

## Properties

### server

> **server**: `LSPServer`\<`ServerCapabilities`\<`any`\>\>

Defined in: [rune-dsl-server.ts:35](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/lsp-server/src/rune-dsl-server.ts#L35)

The underlying @lspeasy/server instance.

***

### services

> **services**: `LangiumServices`

Defined in: [rune-dsl-server.ts:39](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/lsp-server/src/rune-dsl-server.ts#L39)

Langium language services for Rune DSL.

***

### shared

> **shared**: `LangiumSharedServices`

Defined in: [rune-dsl-server.ts:37](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/lsp-server/src/rune-dsl-server.ts#L37)

Langium shared services (for testing / advanced use).

## Methods

### listen()

> **listen**(`transport`): `Promise`\<`void`\>

Defined in: [rune-dsl-server.ts:41](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/lsp-server/src/rune-dsl-server.ts#L41)

Bind the server to a transport and start processing messages.

#### Parameters

##### transport

`Transport`

#### Returns

`Promise`\<`void`\>
