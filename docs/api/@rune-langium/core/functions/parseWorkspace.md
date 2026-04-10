[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / parseWorkspace

# Function: parseWorkspace()

> **parseWorkspace**(`entries`): `Promise`\<[`ParseResult`](../interfaces/ParseResult.md)[]\>

Defined in: [packages/core/src/api/parse.ts:86](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/api/parse.ts#L86)

Parse multiple Rosetta DSL source strings as a workspace.
Cross-references between documents will be resolved.

## Parameters

### entries

`object`[]

Array of `{ uri, content }` objects to parse together.

## Returns

`Promise`\<[`ParseResult`](../interfaces/ParseResult.md)[]\>

An array of `ParseResult` objects, one per entry.
