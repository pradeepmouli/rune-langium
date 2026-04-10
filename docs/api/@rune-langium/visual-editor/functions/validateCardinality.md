[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / validateCardinality

# Function: validateCardinality()

> **validateCardinality**(`input`): `string` \| `null`

Defined in: [packages/visual-editor/src/validation/edit-validator.ts:102](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/validation/edit-validator.ts#L102)

Validate a cardinality string.

Returns null if valid, or an error message string if invalid.
Accepts formats: "inf..sup", "(inf..sup)", "inf..*", "(inf..*)"

## Parameters

### input

`string`

## Returns

`string` \| `null`
