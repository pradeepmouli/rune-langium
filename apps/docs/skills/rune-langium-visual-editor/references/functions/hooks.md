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
useModelSourceSync(nodes: TypeGraphNode[], edges: TypeGraphEdge[], onModelChanged?: (serialized: Map<string, string>) => void | Promise<void>, parseEpoch: number, patches: Patches, originalSourceByNamespace: Map<string, string>, inversePatches: Patches): void
```
**Parameters:**
- `nodes: TypeGraphNode[]` — Current nodes from the editor store.
- `edges: TypeGraphEdge[]` — Current edges from the editor store.
- `onModelChanged: (serialized: Map<string, string>) => void | Promise<void>` (optional) — Callback invoked with a `Map<namespace, serializedText>`
  on each content change after the initial mount.
- `parseEpoch: number` — default: `0` — The editor store's `parseEpoch` — bumped ONLY when the graph is (re)built
from a parse result. Used to gate serialization: a `nodes`/`edges` change
that arrives together with a `parseEpoch` bump came FROM the source (a
parse), so serializing it back is pointless and — for a degraded reparse
(worker unavailable) — actively corrupts the file. We serialize ONLY when
the change is USER-EDIT-origin (parseEpoch unchanged since the last run).
Optional/defaulted so non-studio callers (tests, standalone) keep the old
"serialize every content change" behavior.
- `patches: Patches` — default: `[]` — The store's accumulated Mutative patches since the last parse. Drives the
CST-reuse dirty set: only nodes/subtrees touched by a patch are
regenerated; everything else is sliced verbatim from originalSourceByNamespace.
- `originalSourceByNamespace: Map<string, string>` — default: `...` — Original source text keyed by namespace name — used as the CST baseline for
the reuse serializer. Built by the caller from the current workspace files.
Defaults to an empty map so legacy/test callers that don't supply it get an
empty output (no write-back).
- `inversePatches: Patches` — default: `[]` — The store's accumulated Mutative INVERSE patches since the last parse.
Used to derive the source byte ranges of genuinely-deleted elements so
those ranges are omitted from the assembled output. Defaults to [] so
legacy/test callers without deletion support keep the old behavior.
