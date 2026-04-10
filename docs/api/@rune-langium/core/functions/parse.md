[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / parse

# Function: parse()

> **parse**(`input`, `uri?`): `Promise`\<[`ParseResult`](../interfaces/ParseResult.md)\>

Defined in: [packages/core/src/api/parse.ts:49](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/api/parse.ts#L49)

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
