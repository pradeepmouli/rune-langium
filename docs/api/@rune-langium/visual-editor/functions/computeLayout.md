[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / computeLayout

# Function: computeLayout()

> **computeLayout**(`nodes`, `edges`, `options?`): [`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

Defined in: [packages/visual-editor/src/layout/dagre-layout.ts:75](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/layout/dagre-layout.ts#L75)

Compute layout positions for ReactFlow nodes using dagre.

Returns a new array of nodes with updated positions.
Does not mutate the input.

## Parameters

### nodes

[`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

### edges

[`TypeGraphEdge`](../type-aliases/TypeGraphEdge.md)[]

### options?

[`LayoutOptions`](../interfaces/LayoutOptions.md)

## Returns

[`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]
