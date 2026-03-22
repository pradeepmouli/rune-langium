[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / parseWorkspace

# Function: parseWorkspace()

> **parseWorkspace**(`entries`): `Promise`\<[`ParseResult`](../interfaces/ParseResult.md)[]\>

Defined in: [packages/core/src/api/parse.ts:83](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/api/parse.ts#L83)

Parse multiple Rosetta DSL source strings as a workspace.
Cross-references between documents will be resolved.

## Parameters

### entries

`object`[]

Array of `{ uri, content }` objects to parse together.

## Returns

`Promise`\<[`ParseResult`](../interfaces/ParseResult.md)[]\>

An array of `ParseResult` objects, one per entry.
