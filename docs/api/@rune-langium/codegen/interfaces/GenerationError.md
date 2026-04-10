[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/codegen](../README.md) / [](../README.md) / GenerationError

# Interface: GenerationError

Defined in: [types.ts:41](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/codegen/src/types.ts#L41)

Error encountered during code generation for a specific construct.

## Properties

### construct

> **construct**: `string`

Defined in: [types.ts:45](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/codegen/src/types.ts#L45)

DSL construct that failed

***

### message

> **message**: `string`

Defined in: [types.ts:47](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/codegen/src/types.ts#L47)

Error description

***

### sourceFile

> **sourceFile**: `string`

Defined in: [types.ts:43](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/codegen/src/types.ts#L43)

.rosetta file that caused the error
