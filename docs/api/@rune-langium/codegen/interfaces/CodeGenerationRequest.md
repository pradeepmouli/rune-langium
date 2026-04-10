[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/codegen](../README.md) / [](../README.md) / CodeGenerationRequest

# Interface: CodeGenerationRequest

Defined in: [types.ts:11](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/codegen/src/types.ts#L11)

Request to generate code from Rune DSL model files.

## Properties

### files

> **files**: `object`[]

Defined in: [types.ts:15](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/codegen/src/types.ts#L15)

.rosetta files with path and content

#### content

> **content**: `string`

#### path

> **path**: `string`

***

### language

> **language**: `string`

Defined in: [types.ts:13](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/codegen/src/types.ts#L13)

Target language (e.g., "java", "python", "scala", "csharp")

***

### options?

> `optional` **options?**: `Record`\<`string`, `string`\>

Defined in: [types.ts:17](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/codegen/src/types.ts#L17)

Generator-specific options
