# Functions

## store

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
