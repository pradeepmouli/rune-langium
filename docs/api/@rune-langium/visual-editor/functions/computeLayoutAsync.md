[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / computeLayoutAsync

# Function: computeLayoutAsync()

> **computeLayoutAsync**(`nodes`, `edges`, `options?`): `Promise`\<[`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[] \| `null`\>

Defined in: [packages/visual-editor/src/layout/layout-worker.ts:39](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/layout/layout-worker.ts#L39)

Compute layout asynchronously, yielding to the main thread
between phases to keep the UI responsive.

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
