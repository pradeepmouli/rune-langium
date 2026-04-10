[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/codegen](../README.md) / [](../README.md) / CodeGenerationResult

# Interface: CodeGenerationResult

Defined in: [types.ts:21](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/codegen/src/types.ts#L21)

Result of a code generation run.

## Properties

### errors

> **errors**: [`GenerationError`](GenerationError.md)[]

Defined in: [types.ts:27](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/codegen/src/types.ts#L27)

Errors encountered during generation

***

### files

> **files**: [`GeneratedFile`](GeneratedFile.md)[]

Defined in: [types.ts:25](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/codegen/src/types.ts#L25)

Output code files

***

### language

> **language**: `string`

Defined in: [types.ts:23](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/codegen/src/types.ts#L23)

Target language used

***

### warnings

> **warnings**: `string`[]

Defined in: [types.ts:29](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/codegen/src/types.ts#L29)

Non-fatal warnings
