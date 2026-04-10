[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / useAutoSave

# Function: useAutoSave()

> **useAutoSave**\<`T`\>(`onCommit`, `delay?`): (`value`) => `void`

Defined in: [packages/visual-editor/src/hooks/useAutoSave.ts:31](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/hooks/useAutoSave.ts#L31)

Returns a debounced callback that auto-saves the latest value after
`delay` milliseconds of inactivity. Flushes on unmount.

## Type Parameters

### T

`T`

## Parameters

### onCommit

(`value`) => `void`

Callback invoked with the latest value on commit.

### delay?

`number` = `500`

Debounce delay in milliseconds (default 500).

## Returns

A debounced setter function.

(`value`) => `void`
