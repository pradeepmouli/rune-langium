# Functions

## naming

### `qualifiedExportPath`
The canonical Langium scope key for a top-level exported element:
`${namespace}.${name}`. Namespaces are dot-joined identifiers and element
names are dotless (grammar `ValidID`), so the result is injective and the
last dot separates namespace from name. An empty namespace yields the bare
name (no leading dot).

This is the single source of truth for the dot qualified name. (The
visual-editor's `::` node id is a SEPARATE convention, retired in a later
phase — do not couple to it here.)
```ts
qualifiedExportPath(namespace: string, name: string): string
```
**Parameters:**
- `namespace: string`
- `name: string`
**Returns:** `string`

### `namespaceFromSource`
Extract the namespace from raw `.rosetta` source text. Returns `''` when no
`namespace` declaration is present (matching the historical callers).
```ts
namespaceFromSource(text: string): string
```
**Parameters:**
- `text: string`
**Returns:** `string`

### `namespaceFromModelName`
Normalize a `RosettaModel.name` value (which may be a plain string, a quoted
STRING-named namespace, or a `{ segments: string[] }` qualified-name object)
to its dotted string form. Returns `undefined` for null/unknown shapes; the
caller supplies any `''`/`'unknown'` fallback it needs.
```ts
namespaceFromModelName(name: unknown): string | undefined
```
**Parameters:**
- `name: unknown`
**Returns:** `string | undefined`
