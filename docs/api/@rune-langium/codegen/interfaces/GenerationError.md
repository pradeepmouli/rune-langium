[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/codegen](../README.md) / [](../README.md) / GenerationError

# Interface: GenerationError

Defined in: [types.ts:38](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/codegen/src/types.ts#L38)

Error encountered during code generation for a specific construct.

## Properties

### construct

> **construct**: `string`

Defined in: [types.ts:42](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/codegen/src/types.ts#L42)

DSL construct that failed

***

### message

> **message**: `string`

Defined in: [types.ts:44](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/codegen/src/types.ts#L44)

Error description

***

### sourceFile

> **sourceFile**: `string`

Defined in: [types.ts:40](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/codegen/src/types.ts#L40)

.rosetta file that caused the error
