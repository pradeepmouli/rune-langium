# Functions

## utils

### `buildNamespaceTree`
Build a sorted list of namespace tree entries from graph nodes.

Groups nodes by `namespace`, counts per kind, and sorts
both namespaces and their child types alphabetically.
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
