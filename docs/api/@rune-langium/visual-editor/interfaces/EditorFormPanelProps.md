[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / EditorFormPanelProps

# Interface: EditorFormPanelProps

Defined in: [packages/visual-editor/src/components/panels/EditorFormPanel.tsx:94](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/panels/EditorFormPanel.tsx#L94)

## Properties

### actions

> **actions**: [`AllEditorFormActions`](../type-aliases/AllEditorFormActions.md)

Defined in: [packages/visual-editor/src/components/panels/EditorFormPanel.tsx:104](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/panels/EditorFormPanel.tsx#L104)

All editor form actions.

***

### allNodes?

> `optional` **allNodes?**: [`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

Defined in: [packages/visual-editor/src/components/panels/EditorFormPanel.tsx:106](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/panels/EditorFormPanel.tsx#L106)

All graph nodes (for inherited member resolution).

***

### availableTypes

> **availableTypes**: [`TypeOption`](TypeOption.md)[]

Defined in: [packages/visual-editor/src/components/panels/EditorFormPanel.tsx:102](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/panels/EditorFormPanel.tsx#L102)

Available type options for type selectors.

***

### isReadOnly?

> `optional` **isReadOnly?**: `boolean`

Defined in: [packages/visual-editor/src/components/panels/EditorFormPanel.tsx:100](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/panels/EditorFormPanel.tsx#L100)

Whether the node is read-only (from external/locked source).

***

### nodeData

> **nodeData**: [`AnyGraphNode`](../type-aliases/AnyGraphNode.md) \| `null`

Defined in: [packages/visual-editor/src/components/panels/EditorFormPanel.tsx:96](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/panels/EditorFormPanel.tsx#L96)

The selected node's data, or null if nothing is selected.

***

### nodeId

> **nodeId**: `string` \| `null`

Defined in: [packages/visual-editor/src/components/panels/EditorFormPanel.tsx:98](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/panels/EditorFormPanel.tsx#L98)

Node ID of the selected node.

***

### onClose?

> `optional` **onClose?**: () => `void`

Defined in: [packages/visual-editor/src/components/panels/EditorFormPanel.tsx:113](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/panels/EditorFormPanel.tsx#L113)

Called when the panel requests to close (e.g., Escape key).

#### Returns

`void`

***

### onNavigateToNode?

> `optional` **onNavigateToNode?**: (`nodeId`) => `void`

Defined in: [packages/visual-editor/src/components/panels/EditorFormPanel.tsx:115](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/panels/EditorFormPanel.tsx#L115)

Called when a type reference is clicked to navigate to that type's definition.

#### Parameters

##### nodeId

`string`

#### Returns

`void`

***

### renderExpressionEditor?

> `optional` **renderExpressionEditor?**: (`props`) => `ReactNode`

Defined in: [packages/visual-editor/src/components/panels/EditorFormPanel.tsx:111](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/panels/EditorFormPanel.tsx#L111)

Optional render-prop for a rich expression editor in FunctionForm.
When omitted, FunctionForm renders a plain `<Textarea>` fallback.

#### Parameters

##### props

[`ExpressionEditorSlotProps`](ExpressionEditorSlotProps.md)

#### Returns

`ReactNode`
