# Functions

## utils

### `selectionState`
Returns the checkbox state for a collection of selection IDs.
```ts
selectionState(ids: readonly string[], selected: ReadonlySet<string>): boolean | "indeterminate"
```
**Parameters:**
- `ids: readonly string[]`
- `selected: ReadonlySet<string>`
**Returns:** `boolean | "indeterminate"`

### `toggleVisible`
Adds or removes only the supplied IDs, preserving every other selection.
```ts
toggleVisible(ids: readonly string[], selected: ReadonlySet<string>, checked: boolean): Set<string>
```
**Parameters:**
- `ids: readonly string[]`
- `selected: ReadonlySet<string>`
- `checked: boolean`
**Returns:** `Set<string>`

### `buildNamespaceTree`
Build a sorted list of namespace tree entries from graph nodes.

Groups nodes by `namespace`, counts per kind, and sorts
both namespaces and their child types alphabetically.

Takes a `TypeGraphNode[]` (not a `NodeRepository`): this is a public,
exported utility with no in-repo callers, so its node-array signature is
kept stable. The internal, panel-facing `buildSegmentedNamespaceTree` is the
one sourced from the repository.
```ts
buildNamespaceTree(nodes: TypeGraphNode[]): NamespaceTreeNode[]
```
**Parameters:**
- `nodes: TypeGraphNode[]`
**Returns:** `NamespaceTreeNode[]`

### `filterNamespaceTree`
Filter namespace tree entries by a search query.

Matches against both namespace name and type names.
Returns tree entries with only matching types (or the full
namespace if the namespace name itself matches).
```ts
filterNamespaceTree(tree: NamespaceTreeNode[], query: string): NamespaceTreeNode[]
```
**Parameters:**
- `tree: NamespaceTreeNode[]`
- `query: string`
**Returns:** `NamespaceTreeNode[]`

### `buildTypeOptions`
Projects the editor's canonical node repository into type-selector options.

Node ids stay qualified so same-named declarations from separate namespaces
remain independently selectable. Deferred repository entries are included
because they are valid workspace reference targets before hydration.
```ts
buildTypeOptions(repository: NodeRepository, includeBuiltins: boolean): TypeOption[]
```
**Parameters:**
- `repository: NodeRepository`
- `includeBuiltins: boolean` — default: `true`
**Returns:** `TypeOption[]`
