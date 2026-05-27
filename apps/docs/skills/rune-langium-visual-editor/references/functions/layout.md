# Functions

## layout

### `computeLayout`
Compute layout positions for ReactFlow nodes using dagre.

Returns a new array of nodes with updated positions.
Does not mutate the input.
```ts
computeLayout(nodes: TypeGraphNode[], edges: TypeGraphEdge[], options?: LayoutOptions): TypeGraphNode[]
```
**Parameters:**
- `nodes: TypeGraphNode[]`
- `edges: TypeGraphEdge[]`
- `options: LayoutOptions` (optional)
**Returns:** `TypeGraphNode[]`

### `computeLayoutIncremental`
Compute layout with cache-first strategy.

For incremental visibility changes (toggling a single namespace),
nodes with cached positions reuse them. Only nodes without cached
positions trigger a full dagre run.

When the ratio of uncached nodes is small (<30%), we place cached
nodes at their old positions and only run dagre for the new ones,
offsetting them near related cached nodes.

When the ratio is large (>=30%), we run a full dagre layout and
update the cache.
```ts
computeLayoutIncremental(nodes: TypeGraphNode[], edges: TypeGraphEdge[], options?: LayoutOptions): TypeGraphNode[]
```
**Parameters:**
- `nodes: TypeGraphNode[]`
- `edges: TypeGraphEdge[]`
- `options: LayoutOptions` (optional)
**Returns:** `TypeGraphNode[]`

### `clearLayoutCache`
Clear the entire position cache (call on model reload).
```ts
clearLayoutCache(): void
```

### `computeLayoutAsync`
Compute layout asynchronously.

Prefers a Web Worker for true off-main-thread execution.
Falls back to requestIdleCallback-based yielding on the main thread.

Returns null if a newer layout request superseded this one.
```ts
computeLayoutAsync(nodes: TypeGraphNode[], edges: TypeGraphEdge[], options?: LayoutOptions): Promise<TypeGraphNode[] | null>
```
**Parameters:**
- `nodes: TypeGraphNode[]`
- `edges: TypeGraphEdge[]`
- `options: LayoutOptions` (optional)
**Returns:** `Promise<TypeGraphNode[] | null>`

### `cancelAsyncLayout`
Cancel any in-flight async layout.
```ts
cancelAsyncLayout(): void
```

### `computeGroupedLayout`
Layout each group independently with dagre, then arrange
groups in a grid pattern.
```ts
computeGroupedLayout(nodes: TypeGraphNode[], edges: TypeGraphEdge[], options?: LayoutOptions): TypeGraphNode[]
```
**Parameters:**
- `nodes: TypeGraphNode[]`
- `edges: TypeGraphEdge[]`
- `options: LayoutOptions` (optional)
**Returns:** `TypeGraphNode[]`

### `findInheritanceGroups`
Find inheritance-connected groups among the given nodes.
```ts
findInheritanceGroups(nodes: TypeGraphNode[], edges: TypeGraphEdge[]): GroupInfo[]
```
**Parameters:**
- `nodes: TypeGraphNode[]`
- `edges: TypeGraphEdge[]`
**Returns:** `GroupInfo[]`

### `layoutStructureGraph`
Convert a `StructureGraphInput` into React Flow nodes for the Structure View.

Phase 14e — per-instance materialization. The adapter emits one StructureNode
per visible occurrence with pre-computed instance ids; the layout consumes
those ids directly:
  - `input.nodes` is keyed by instance id (`StructureNode.instanceId`).
  - `expansions.values()` are CHILD instance ids — direct lookup keys.
  - `StructureBaseContainer.childNodeId` is the inner derived child's
    instance id.

The React Flow node id == `node.instanceId`; the `data` payload still
carries the canonical `.id` so cell renderers and AST-binding consumers
see one entry per shared type description.

Two-pass layout: size every node first (bottom-up, cycle-guarded), then
place top-down so expansion children align with their source row.

Cycle protection at placement uses a `Set<instanceId>` of ancestors; well-
formed adapter output never re-enters the same instance id (the adapter
silently drops cyclic edges in per-instance materialization), but malformed
inputs still terminate safely via the guard.
```ts
layoutStructureGraph(input: StructureGraphInput): LayoutResult
```
**Parameters:**
- `input: StructureGraphInput`
**Returns:** `LayoutResult`
