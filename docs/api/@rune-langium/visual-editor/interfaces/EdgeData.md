[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / EdgeData

# Interface: EdgeData

Defined in: [packages/visual-editor/src/types.ts:188](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/types.ts#L188)

Data payload for graph edges.

The index signature is required for compatibility with ReactFlow's
`Edge<T extends Record<string, unknown>>` constraint.

## Indexable

> \[`key`: `string`\]: `unknown`

Required for ReactFlow compatibility: Edge<T> requires T extends Record<string, unknown>

## Properties

### cardinality?

> `optional` **cardinality?**: `string`

Defined in: [packages/visual-editor/src/types.ts:191](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/types.ts#L191)

***

### kind

> **kind**: [`EdgeKind`](../type-aliases/EdgeKind.md)

Defined in: [packages/visual-editor/src/types.ts:189](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/types.ts#L189)

***

### label?

> `optional` **label?**: `string`

Defined in: [packages/visual-editor/src/types.ts:190](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/types.ts#L190)
