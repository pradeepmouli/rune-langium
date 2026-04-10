[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / parseWorkspace

# Function: parseWorkspace()

> **parseWorkspace**(`entries`): `Promise`\<[`ParseResult`](../interfaces/ParseResult.md)[]\>

Defined in: [packages/core/src/api/parse.ts:86](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/api/parse.ts#L86)

Parse multiple Rosetta DSL source strings as a workspace.
Cross-references between documents will be resolved.

## Parameters

### entries

`object`[]

Array of `{ uri, content }` objects to parse together.

## Returns

`Promise`\<[`ParseResult`](../interfaces/ParseResult.md)[]\>

An array of `ParseResult` objects, one per entry.
