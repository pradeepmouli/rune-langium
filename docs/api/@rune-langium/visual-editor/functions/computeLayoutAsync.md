[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / computeLayoutAsync

# Function: computeLayoutAsync()

> **computeLayoutAsync**(`nodes`, `edges`, `options?`): `Promise`\<[`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[] \| `null`\>

Defined in: [packages/visual-editor/src/layout/layout-worker.ts:126](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/visual-editor/src/layout/layout-worker.ts#L126)

Compute layout asynchronously.

Prefers a Web Worker for true off-main-thread execution.
Falls back to requestIdleCallback-based yielding on the main thread.

Returns null if a newer layout request superseded this one.

## Parameters

### nodes

[`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

### edges

[`TypeGraphEdge`](../type-aliases/TypeGraphEdge.md)[]

### options?

[`LayoutOptions`](../interfaces/LayoutOptions.md)

## Returns

`Promise`\<[`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[] \| `null`\>
