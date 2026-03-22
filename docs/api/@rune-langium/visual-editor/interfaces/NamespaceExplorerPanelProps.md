[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / NamespaceExplorerPanelProps

# Interface: NamespaceExplorerPanelProps

Defined in: [packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:50](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx#L50)

## Properties

### className?

> `optional` **className?**: `string`

Defined in: [packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:70](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx#L70)

Optional className for outer container.

***

### expandedNamespaces

> **expandedNamespaces**: `Set`\<`string`\>

Defined in: [packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:54](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx#L54)

Set of currently expanded (visible) namespaces.

***

### hiddenNodeIds

> **hiddenNodeIds**: `Set`\<`string`\>

Defined in: [packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:56](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx#L56)

Set of individually hidden node IDs.

***

### hiddenRefCounts?

> `optional` **hiddenRefCounts?**: `Map`\<`string`, `number`\>

Defined in: [packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:72](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx#L72)

Total edge count for cross-namespace reference detection.

***

### nodes

> **nodes**: [`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

Defined in: [packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:52](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx#L52)

All graph nodes (full set, including hidden ones).

***

### onCollapseAll

> **onCollapseAll**: () => `void`

Defined in: [packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:64](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx#L64)

Collapse all namespaces.

#### Returns

`void`

***

### onExpandAll

> **onExpandAll**: () => `void`

Defined in: [packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:62](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx#L62)

Expand all namespaces.

#### Returns

`void`

***

### onSelectNode?

> `optional` **onSelectNode?**: (`nodeId`) => `void`

Defined in: [packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:66](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx#L66)

Called when a node is clicked to select it in the graph.

#### Parameters

##### nodeId

`string`

#### Returns

`void`

***

### onToggleNamespace

> **onToggleNamespace**: (`namespace`) => `void`

Defined in: [packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:58](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx#L58)

Toggle a namespace's visibility on the graph.

#### Parameters

##### namespace

`string`

#### Returns

`void`

***

### onToggleNode

> **onToggleNode**: (`nodeId`) => `void`

Defined in: [packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:60](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx#L60)

Toggle an individual node's visibility.

#### Parameters

##### nodeId

`string`

#### Returns

`void`

***

### selectedNodeId?

> `optional` **selectedNodeId?**: `string` \| `null`

Defined in: [packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:68](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx#L68)

Currently selected node ID (for highlighting).
