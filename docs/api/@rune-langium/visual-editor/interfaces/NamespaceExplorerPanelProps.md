[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / NamespaceExplorerPanelProps

# Interface: NamespaceExplorerPanelProps

Defined in: [packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:53](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx#L53)

## Properties

### className?

> `optional` **className?**: `string`

Defined in: [packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:73](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx#L73)

Optional className for outer container.

***

### expandedNamespaces

> **expandedNamespaces**: `Set`\<`string`\>

Defined in: [packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:57](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx#L57)

Set of currently expanded (visible) namespaces.

***

### hiddenNodeIds

> **hiddenNodeIds**: `Set`\<`string`\>

Defined in: [packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:59](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx#L59)

Set of individually hidden node IDs.

***

### hiddenRefCounts?

> `optional` **hiddenRefCounts?**: `Map`\<`string`, `number`\>

Defined in: [packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:75](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx#L75)

Total edge count for cross-namespace reference detection.

***

### nodes

> **nodes**: [`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

Defined in: [packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:55](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx#L55)

All graph nodes (full set, including hidden ones).

***

### onCollapseAll

> **onCollapseAll**: () => `void`

Defined in: [packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:67](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx#L67)

Collapse all namespaces.

#### Returns

`void`

***

### onExpandAll

> **onExpandAll**: () => `void`

Defined in: [packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:65](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx#L65)

Expand all namespaces.

#### Returns

`void`

***

### onSelectNode?

> `optional` **onSelectNode?**: (`nodeId`) => `void`

Defined in: [packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:69](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx#L69)

Called when a node is clicked to select it in the graph.

#### Parameters

##### nodeId

`string`

#### Returns

`void`

***

### onToggleNamespace

> **onToggleNamespace**: (`namespace`) => `void`

Defined in: [packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:61](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx#L61)

Toggle a namespace's visibility on the graph.

#### Parameters

##### namespace

`string`

#### Returns

`void`

***

### onToggleNode

> **onToggleNode**: (`nodeId`) => `void`

Defined in: [packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:63](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx#L63)

Toggle an individual node's visibility.

#### Parameters

##### nodeId

`string`

#### Returns

`void`

***

### selectedNodeId?

> `optional` **selectedNodeId?**: `string` \| `null`

Defined in: [packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx:71](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx#L71)

Currently selected node ID (for highlighting).
