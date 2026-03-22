[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / DetailPanelProps

# Interface: DetailPanelProps

Defined in: [packages/visual-editor/src/components/panels/DetailPanel.tsx:21](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/panels/DetailPanel.tsx#L21)

## Properties

### allNodeIds?

> `optional` **allNodeIds?**: `string`[]

Defined in: [packages/visual-editor/src/components/panels/DetailPanel.tsx:26](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/panels/DetailPanel.tsx#L26)

All loaded graph node IDs for resolving type name to node ID.

***

### nodeData

> **nodeData**: [`AnyGraphNode`](../type-aliases/AnyGraphNode.md) \| `null`

Defined in: [packages/visual-editor/src/components/panels/DetailPanel.tsx:22](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/panels/DetailPanel.tsx#L22)

***

### onNavigateToNode?

> `optional` **onNavigateToNode?**: [`NavigateToNodeCallback`](../type-aliases/NavigateToNodeCallback.md)

Defined in: [packages/visual-editor/src/components/panels/DetailPanel.tsx:24](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/panels/DetailPanel.tsx#L24)

Callback to navigate to a type's graph node.
