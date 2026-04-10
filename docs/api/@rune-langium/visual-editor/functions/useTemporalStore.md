[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / useTemporalStore

# Function: useTemporalStore()

> **useTemporalStore**\<`T`\>(`selector`): `T`

Defined in: [packages/visual-editor/src/store/history.ts:48](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/store/history.ts#L48)

Access the temporal (undo/redo) store attached to the editor store.

## Type Parameters

### T

`T`

## Parameters

### selector

(`state`) => `T`

Selector function to pick values from the temporal state.

## Returns

`T`

The selected value from the temporal store.
