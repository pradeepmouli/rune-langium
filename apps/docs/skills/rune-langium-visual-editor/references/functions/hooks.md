# Functions

## hooks

### `useAutoSave`
Returns a debounced callback that auto-saves the latest value after
`delay` milliseconds of inactivity. Flushes on unmount.
```ts
useAutoSave<T>(onCommit: (value: T) => void, delay: number): (value: T) => void
```
**Parameters:**
- `onCommit: (value: T) => void` — Callback invoked with the latest value on commit.
- `delay: number` — default: `500` — Debounce delay in milliseconds (default 500).
**Returns:** `(value: T) => void` — A debounced setter function.

### `useExpressionAutocomplete`
```ts
useExpressionAutocomplete(availableTypes: TypeOption[], inputParams?: { name: string; typeName?: string }[]): UseExpressionAutocompleteResult
```
**Parameters:**
- `availableTypes: TypeOption[]`
- `inputParams: { name: string; typeName?: string }[]` (optional)
**Returns:** `UseExpressionAutocompleteResult`

### `useTypeRefDrop`
```ts
useTypeRefDrop(opts: UseTypeRefDropOptions): UseTypeRefDropResult
```
**Parameters:**
- `opts: UseTypeRefDropOptions`
**Returns:** `UseTypeRefDropResult`

### `useDiagnosticsForRange`
Returns the highest-severity `RangeDiagnostic` whose range overlaps the
given `astRange`, or `undefined` when no overlap exists.

Overlap semantics: two ranges `[a.start, a.end)` and `[b.start, b.end)`
overlap iff `a.start < b.end && b.start < a.end`. This matches the
standard half-open-interval definition used by CodeMirror and LSP.
Zero-length ranges (start === end) never overlap.

Severity ordering: 1 (error) > 2 (warn) > 3 (info) > 4 (hint) — lower
numeric value wins.
```ts
useDiagnosticsForRange(astRange: { start: number; end: number } | undefined, diagnostics: readonly RangeDiagnostic[]): RangeDiagnostic | undefined
```
**Parameters:**
- `astRange: { start: number; end: number } | undefined` — Character-offset span of the row being tested. When
                 `undefined`, returns `undefined` without inspecting the
                 diagnostics array (nothing to match against).
- `diagnostics: readonly RangeDiagnostic[]` — Pre-converted diagnostics for the active file.
                    Pass a stable empty array (`[]`) when there are none.
**Returns:** `RangeDiagnostic | undefined`

### `useModelSourceSync`
Fires `onModelChanged` (serialized source keyed by namespace name) whenever
`nodes` or `edges` change in content — independent of which visual pane is
currently mounted.
```ts
useModelSourceSync(nodes: TypeGraphNode[], edges: TypeGraphEdge[], onModelChanged?: (serialized: Map<string, string>) => void | Promise<void>): void
```
**Parameters:**
- `nodes: TypeGraphNode[]` — Current nodes from the editor store.
- `edges: TypeGraphEdge[]` — Current edges from the editor store.
- `onModelChanged: (serialized: Map<string, string>) => void | Promise<void>` (optional) — Callback invoked with a `Map<namespace, serializedText>`
  on each content change after the initial mount.
