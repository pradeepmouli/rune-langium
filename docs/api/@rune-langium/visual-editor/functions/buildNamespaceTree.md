[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / buildNamespaceTree

# Function: buildNamespaceTree()

> **buildNamespaceTree**(`nodes`): [`NamespaceTreeNode`](../interfaces/NamespaceTreeNode.md)[]

Defined in: [packages/visual-editor/src/utils/namespace-tree.ts:38](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/utils/namespace-tree.ts#L38)

Build a sorted list of namespace tree entries from graph nodes.

Groups nodes by `namespace`, counts per kind, and sorts
both namespaces and their child types alphabetically.

## Parameters

### nodes

[`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

## Returns

[`NamespaceTreeNode`](../interfaces/NamespaceTreeNode.md)[]
