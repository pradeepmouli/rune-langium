[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / computeLayoutIncremental

# Function: computeLayoutIncremental()

> **computeLayoutIncremental**(`nodes`, `edges`, `options?`): [`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

Defined in: [packages/visual-editor/src/layout/dagre-layout.ts:150](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/layout/dagre-layout.ts#L150)

Compute layout with cache-first strategy.

For incremental visibility changes (toggling a single namespace),
nodes with cached positions reuse them. Only nodes without cached
positions trigger a full dagre run.

When the ratio of uncached nodes is small (<30%), we place cached
nodes at their old positions and only run dagre for the new ones,
offsetting them near related cached nodes.

When the ratio is large (>=30%), we run a full dagre layout and
update the cache.

## Parameters

### nodes

[`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

### edges

[`TypeGraphEdge`](../type-aliases/TypeGraphEdge.md)[]

### options?

[`LayoutOptions`](../interfaces/LayoutOptions.md)

## Returns

[`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]
