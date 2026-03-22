[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / filterNamespaceTree

# Function: filterNamespaceTree()

> **filterNamespaceTree**(`tree`, `query`): [`NamespaceTreeNode`](../interfaces/NamespaceTreeNode.md)[]

Defined in: [packages/visual-editor/src/utils/namespace-tree.ts:86](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/utils/namespace-tree.ts#L86)

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
