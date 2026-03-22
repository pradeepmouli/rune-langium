[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/codegen](../README.md) / [](../README.md) / CodeGenerationResult

# Interface: CodeGenerationResult

Defined in: [types.ts:18](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/codegen/src/types.ts#L18)

Result of a code generation run.

## Properties

### errors

> **errors**: [`GenerationError`](GenerationError.md)[]

Defined in: [types.ts:24](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/codegen/src/types.ts#L24)

Errors encountered during generation

***

### files

> **files**: [`GeneratedFile`](GeneratedFile.md)[]

Defined in: [types.ts:22](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/codegen/src/types.ts#L22)

Output code files

***

### language

> **language**: `string`

Defined in: [types.ts:20](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/codegen/src/types.ts#L20)

Target language used

***

### warnings

> **warnings**: `string`[]

Defined in: [types.ts:26](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/codegen/src/types.ts#L26)

Non-fatal warnings
