# Functions

## store

### `makeNodeId`
Build the canonical top-level node id `${namespace}.${name}` (core qualified name).
```ts
makeNodeId(namespace: string, name: string): string
```
**Parameters:**
- `namespace: string`
- `name: string`
**Returns:** `string`

### `nameFromNodeId`
The trailing simple name of a node id (everything after the last dot).
```ts
nameFromNodeId(nodeId: string): string
```
**Parameters:**
- `nodeId: string`
**Returns:** `string`

### `splitNodeId`
Split a node id into `{ namespace, name }` by the last dot; namespace is '' when absent.
```ts
splitNodeId(nodeId: string): { namespace: string; name: string }
```
**Parameters:**
- `nodeId: string`
**Returns:** `{ namespace: string; name: string }`

### `selectNodeRepository`
Returns a node repository derived from `nodesById`, memoized on the Map's
identity. The store swaps the Map reference on every `mutateGraph`, so a new
reference (post-reconciliation) yields a fresh repository; an unchanged
reference returns the cached instance.
```ts
selectNodeRepository(nodesById: ReadonlyMap<string, TypeGraphNode>): NodeRepository
```
**Parameters:**
- `nodesById: ReadonlyMap<string, TypeGraphNode>`
**Returns:** `NodeRepository`

### `useTemporalStore`
Access the temporal (undo/redo) store attached to the editor store.
```ts
useTemporalStore<T>(selector: (state: TemporalState<TrackedState>) => T): T
```
**Parameters:**
- `selector: (state: TemporalState<TrackedState>) => T` — Selector function to pick values from the temporal state.
**Returns:** `T` — The selected value from the temporal store.

### `useCanUndo`
Whether there are past states to undo to.
```ts
useCanUndo(): boolean
```
**Returns:** `boolean`

### `useCanRedo`
Whether there are future states to redo to.
```ts
useCanRedo(): boolean
```
**Returns:** `boolean`

### `useUndo`
Returns the undo function from the temporal store.
```ts
useUndo(): () => void
```
**Returns:** `() => void`

### `useRedo`
Returns the redo function from the temporal store.
```ts
useRedo(): () => void
```
**Returns:** `() => void`
