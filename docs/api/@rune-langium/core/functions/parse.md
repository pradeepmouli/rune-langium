[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / parse

# Function: parse()

> **parse**(`input`, `uri?`): `Promise`\<[`ParseResult`](../interfaces/ParseResult.md)\>

Defined in: [packages/core/src/api/parse.ts:46](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/api/parse.ts#L46)

Parse a Rosetta DSL source string into a typed AST.

## Parameters

### input

`string`

The Rosetta DSL source text.

### uri?

`string`

Optional URI for the document (defaults to `inmemory://model.rosetta`).

## Returns

`Promise`\<[`ParseResult`](../interfaces/ParseResult.md)\>

A `ParseResult` with the root `RosettaModel` node and any errors.
