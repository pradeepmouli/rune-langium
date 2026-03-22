[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / validateCardinality

# Function: validateCardinality()

> **validateCardinality**(`input`): `string` \| `null`

Defined in: [packages/visual-editor/src/validation/edit-validator.ts:99](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/validation/edit-validator.ts#L99)

Validate a cardinality string.

Returns null if valid, or an error message string if invalid.
Accepts formats: "inf..sup", "(inf..sup)", "inf..*", "(inf..*)"

## Parameters

### input

`string`

## Returns

`string` \| `null`
