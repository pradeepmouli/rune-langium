[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/codegen](../README.md) / [](../README.md) / GenerationError

# Interface: GenerationError

Defined in: [types.ts:41](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/codegen/src/types.ts#L41)

Error encountered during code generation for a specific construct.

## Properties

### construct

> **construct**: `string`

Defined in: [types.ts:45](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/codegen/src/types.ts#L45)

DSL construct that failed

***

### message

> **message**: `string`

Defined in: [types.ts:47](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/codegen/src/types.ts#L47)

Error description

***

### sourceFile

> **sourceFile**: `string`

Defined in: [types.ts:43](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/codegen/src/types.ts#L43)

.rosetta file that caused the error
