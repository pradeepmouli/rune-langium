[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / EdgeData

# Interface: EdgeData

Defined in: [packages/visual-editor/src/types.ts:185](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L185)

Data payload for graph edges.

The index signature is required for compatibility with ReactFlow's
`Edge<T extends Record<string, unknown>>` constraint.

## Indexable

> \[`key`: `string`\]: `unknown`

Required for ReactFlow compatibility: Edge<T> requires T extends Record<string, unknown>

## Properties

### cardinality?

> `optional` **cardinality?**: `string`

Defined in: [packages/visual-editor/src/types.ts:188](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L188)

***

### kind

> **kind**: [`EdgeKind`](../type-aliases/EdgeKind.md)

Defined in: [packages/visual-editor/src/types.ts:186](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L186)

***

### label?

> `optional` **label?**: `string`

Defined in: [packages/visual-editor/src/types.ts:187](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L187)
