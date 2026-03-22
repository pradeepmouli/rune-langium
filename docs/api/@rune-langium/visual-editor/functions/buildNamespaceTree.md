[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / buildNamespaceTree

# Function: buildNamespaceTree()

> **buildNamespaceTree**(`nodes`): [`NamespaceTreeNode`](../interfaces/NamespaceTreeNode.md)[]

Defined in: [packages/visual-editor/src/utils/namespace-tree.ts:35](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/utils/namespace-tree.ts#L35)

Build a sorted list of namespace tree entries from graph nodes.

Groups nodes by `namespace`, counts per kind, and sorts
both namespaces and their child types alphabetically.

## Parameters

### nodes

[`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

## Returns

[`NamespaceTreeNode`](../interfaces/NamespaceTreeNode.md)[]
