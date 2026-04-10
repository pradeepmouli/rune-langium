[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / DetailPanelProps

# Interface: DetailPanelProps

Defined in: [packages/visual-editor/src/components/panels/DetailPanel.tsx:24](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/panels/DetailPanel.tsx#L24)

## Properties

### allNodeIds?

> `optional` **allNodeIds?**: `string`[]

Defined in: [packages/visual-editor/src/components/panels/DetailPanel.tsx:29](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/panels/DetailPanel.tsx#L29)

All loaded graph node IDs for resolving type name to node ID.

***

### nodeData

> **nodeData**: [`AnyGraphNode`](../type-aliases/AnyGraphNode.md) \| `null`

Defined in: [packages/visual-editor/src/components/panels/DetailPanel.tsx:25](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/panels/DetailPanel.tsx#L25)

***

### onNavigateToNode?

> `optional` **onNavigateToNode?**: [`NavigateToNodeCallback`](../type-aliases/NavigateToNodeCallback.md)

Defined in: [packages/visual-editor/src/components/panels/DetailPanel.tsx:27](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/panels/DetailPanel.tsx#L27)

Callback to navigate to a type's graph node.
