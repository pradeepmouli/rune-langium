[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / computeLayoutIncremental

# Function: computeLayoutIncremental()

> **computeLayoutIncremental**(`nodes`, `edges`, `options?`): [`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

Defined in: [packages/visual-editor/src/layout/dagre-layout.ts:153](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/layout/dagre-layout.ts#L153)

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
