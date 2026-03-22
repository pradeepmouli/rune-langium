[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/codegen](../README.md) / [](../README.md) / CodeGenerationRequest

# Interface: CodeGenerationRequest

Defined in: [types.ts:8](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/codegen/src/types.ts#L8)

Request to generate code from Rune DSL model files.

## Properties

### files

> **files**: `object`[]

Defined in: [types.ts:12](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/codegen/src/types.ts#L12)

.rosetta files with path and content

#### content

> **content**: `string`

#### path

> **path**: `string`

***

### language

> **language**: `string`

Defined in: [types.ts:10](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/codegen/src/types.ts#L10)

Target language (e.g., "java", "python", "scala", "csharp")

***

### options?

> `optional` **options?**: `Record`\<`string`, `string`\>

Defined in: [types.ts:14](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/codegen/src/types.ts#L14)

Generator-specific options
