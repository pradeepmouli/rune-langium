[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / DataTypeFormProps

# Interface: DataTypeFormProps

Defined in: [packages/visual-editor/src/components/editors/DataTypeForm.tsx:85](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/DataTypeForm.tsx#L85)

## Properties

### actions

> **actions**: [`DataFormActions`](DataFormActions.md)

Defined in: [packages/visual-editor/src/components/editors/DataTypeForm.tsx:93](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/DataTypeForm.tsx#L93)

Data-specific editor form action callbacks.

***

### allNodeIds?

> `optional` **allNodeIds?**: `string`[]

Defined in: [packages/visual-editor/src/components/editors/DataTypeForm.tsx:101](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/DataTypeForm.tsx#L101)

All loaded graph node IDs for resolving type name to node ID.

***

### allNodes?

> `optional` **allNodes?**: [`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

Defined in: [packages/visual-editor/src/components/editors/DataTypeForm.tsx:95](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/DataTypeForm.tsx#L95)

All graph nodes (for inherited member resolution via useEffectiveMembers).

***

### availableTypes

> **availableTypes**: [`TypeOption`](TypeOption.md)[]

Defined in: [packages/visual-editor/src/components/editors/DataTypeForm.tsx:91](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/DataTypeForm.tsx#L91)

Available type options for selectors.

***

### data

> **data**: [`AnyGraphNode`](../type-aliases/AnyGraphNode.md)

Defined in: [packages/visual-editor/src/components/editors/DataTypeForm.tsx:89](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/DataTypeForm.tsx#L89)

Data payload for the selected node (AnyGraphNode with $type='Data').

***

### nodeId

> **nodeId**: `string`

Defined in: [packages/visual-editor/src/components/editors/DataTypeForm.tsx:87](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/DataTypeForm.tsx#L87)

Node ID of the Data type being edited.

***

### onNavigateToNode?

> `optional` **onNavigateToNode?**: [`NavigateToNodeCallback`](../type-aliases/NavigateToNodeCallback.md)

Defined in: [packages/visual-editor/src/components/editors/DataTypeForm.tsx:99](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/DataTypeForm.tsx#L99)

Callback to navigate to a type's graph node.

***

### renderExpressionEditor?

> `optional` **renderExpressionEditor?**: (`props`) => `ReactNode`

Defined in: [packages/visual-editor/src/components/editors/DataTypeForm.tsx:97](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/DataTypeForm.tsx#L97)

Optional render-prop for a rich expression editor.

#### Parameters

##### props

[`ExpressionEditorSlotProps`](ExpressionEditorSlotProps.md)

#### Returns

`ReactNode`
