[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / EditorFormPanelProps

# Interface: EditorFormPanelProps

Defined in: [packages/visual-editor/src/components/panels/EditorFormPanel.tsx:91](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/panels/EditorFormPanel.tsx#L91)

## Properties

### actions

> **actions**: [`AllEditorFormActions`](../type-aliases/AllEditorFormActions.md)

Defined in: [packages/visual-editor/src/components/panels/EditorFormPanel.tsx:101](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/panels/EditorFormPanel.tsx#L101)

All editor form actions.

***

### allNodes?

> `optional` **allNodes?**: [`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

Defined in: [packages/visual-editor/src/components/panels/EditorFormPanel.tsx:103](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/panels/EditorFormPanel.tsx#L103)

All graph nodes (for inherited member resolution).

***

### availableTypes

> **availableTypes**: [`TypeOption`](TypeOption.md)[]

Defined in: [packages/visual-editor/src/components/panels/EditorFormPanel.tsx:99](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/panels/EditorFormPanel.tsx#L99)

Available type options for type selectors.

***

### isReadOnly?

> `optional` **isReadOnly?**: `boolean`

Defined in: [packages/visual-editor/src/components/panels/EditorFormPanel.tsx:97](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/panels/EditorFormPanel.tsx#L97)

Whether the node is read-only (from external/locked source).

***

### nodeData

> **nodeData**: [`AnyGraphNode`](../type-aliases/AnyGraphNode.md) \| `null`

Defined in: [packages/visual-editor/src/components/panels/EditorFormPanel.tsx:93](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/panels/EditorFormPanel.tsx#L93)

The selected node's data, or null if nothing is selected.

***

### nodeId

> **nodeId**: `string` \| `null`

Defined in: [packages/visual-editor/src/components/panels/EditorFormPanel.tsx:95](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/panels/EditorFormPanel.tsx#L95)

Node ID of the selected node.

***

### onClose?

> `optional` **onClose?**: () => `void`

Defined in: [packages/visual-editor/src/components/panels/EditorFormPanel.tsx:110](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/panels/EditorFormPanel.tsx#L110)

Called when the panel requests to close (e.g., Escape key).

#### Returns

`void`

***

### onNavigateToNode?

> `optional` **onNavigateToNode?**: (`nodeId`) => `void`

Defined in: [packages/visual-editor/src/components/panels/EditorFormPanel.tsx:112](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/panels/EditorFormPanel.tsx#L112)

Called when a type reference is clicked to navigate to that type's definition.

#### Parameters

##### nodeId

`string`

#### Returns

`void`

***

### renderExpressionEditor?

> `optional` **renderExpressionEditor?**: (`props`) => `ReactNode`

Defined in: [packages/visual-editor/src/components/panels/EditorFormPanel.tsx:108](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/panels/EditorFormPanel.tsx#L108)

Optional render-prop for a rich expression editor in FunctionForm.
When omitted, FunctionForm renders a plain `<Textarea>` fallback.

#### Parameters

##### props

[`ExpressionEditorSlotProps`](ExpressionEditorSlotProps.md)

#### Returns

`ReactNode`
