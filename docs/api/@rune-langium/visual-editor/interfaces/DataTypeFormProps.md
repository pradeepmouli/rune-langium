[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / DataTypeFormProps

# Interface: DataTypeFormProps

Defined in: [packages/visual-editor/src/components/editors/DataTypeForm.tsx:88](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/components/editors/DataTypeForm.tsx#L88)

## Properties

### actions

> **actions**: [`DataFormActions`](DataFormActions.md)

Defined in: [packages/visual-editor/src/components/editors/DataTypeForm.tsx:96](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/components/editors/DataTypeForm.tsx#L96)

Data-specific editor form action callbacks.

***

### allNodeIds?

> `optional` **allNodeIds?**: `string`[]

Defined in: [packages/visual-editor/src/components/editors/DataTypeForm.tsx:104](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/components/editors/DataTypeForm.tsx#L104)

All loaded graph node IDs for resolving type name to node ID.

***

### allNodes?

> `optional` **allNodes?**: [`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

Defined in: [packages/visual-editor/src/components/editors/DataTypeForm.tsx:98](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/components/editors/DataTypeForm.tsx#L98)

All graph nodes (for inherited member resolution via useEffectiveMembers).

***

### availableTypes

> **availableTypes**: [`TypeOption`](TypeOption.md)[]

Defined in: [packages/visual-editor/src/components/editors/DataTypeForm.tsx:94](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/components/editors/DataTypeForm.tsx#L94)

Available type options for selectors.

***

### data

> **data**: [`AnyGraphNode`](../type-aliases/AnyGraphNode.md)

Defined in: [packages/visual-editor/src/components/editors/DataTypeForm.tsx:92](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/components/editors/DataTypeForm.tsx#L92)

Data payload for the selected node (AnyGraphNode with $type='Data').

***

### nodeId

> **nodeId**: `string`

Defined in: [packages/visual-editor/src/components/editors/DataTypeForm.tsx:90](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/components/editors/DataTypeForm.tsx#L90)

Node ID of the Data type being edited.

***

### onNavigateToNode?

> `optional` **onNavigateToNode?**: [`NavigateToNodeCallback`](../type-aliases/NavigateToNodeCallback.md)

Defined in: [packages/visual-editor/src/components/editors/DataTypeForm.tsx:102](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/components/editors/DataTypeForm.tsx#L102)

Callback to navigate to a type's graph node.

***

### renderExpressionEditor?

> `optional` **renderExpressionEditor?**: (`props`) => `ReactNode`

Defined in: [packages/visual-editor/src/components/editors/DataTypeForm.tsx:100](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/components/editors/DataTypeForm.tsx#L100)

Optional render-prop for a rich expression editor.

#### Parameters

##### props

[`ExpressionEditorSlotProps`](ExpressionEditorSlotProps.md)

#### Returns

`ReactNode`
