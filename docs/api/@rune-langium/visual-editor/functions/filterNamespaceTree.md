[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / filterNamespaceTree

# Function: filterNamespaceTree()

> **filterNamespaceTree**(`tree`, `query`): [`NamespaceTreeNode`](../interfaces/NamespaceTreeNode.md)[]

Defined in: [packages/visual-editor/src/utils/namespace-tree.ts:89](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/utils/namespace-tree.ts#L89)

Filter namespace tree entries by a search query.

Matches against both namespace name and type names.
Returns tree entries with only matching types (or the full
namespace if the namespace name itself matches).

## Parameters

### tree

[`NamespaceTreeNode`](../interfaces/NamespaceTreeNode.md)[]

### query

`string`

## Returns

[`NamespaceTreeNode`](../interfaces/NamespaceTreeNode.md)[]
