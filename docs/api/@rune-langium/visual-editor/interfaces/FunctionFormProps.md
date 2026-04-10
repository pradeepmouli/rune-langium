[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / FunctionFormProps

# Interface: FunctionFormProps

Defined in: [packages/visual-editor/src/components/editors/FunctionForm.tsx:146](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/FunctionForm.tsx#L146)

## Properties

### actions

> **actions**: [`FuncFormActions`](FuncFormActions.md)

Defined in: [packages/visual-editor/src/components/editors/FunctionForm.tsx:154](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/FunctionForm.tsx#L154)

Function-specific editor form action callbacks.

***

### allNodeIds?

> `optional` **allNodeIds?**: `string`[]

Defined in: [packages/visual-editor/src/components/editors/FunctionForm.tsx:165](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/FunctionForm.tsx#L165)

All loaded graph node IDs for resolving type name to node ID.

***

### availableTypes

> **availableTypes**: [`TypeOption`](TypeOption.md)[]

Defined in: [packages/visual-editor/src/components/editors/FunctionForm.tsx:152](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/FunctionForm.tsx#L152)

Available type options for selectors.

***

### data

> **data**: [`AnyGraphNode`](../type-aliases/AnyGraphNode.md)

Defined in: [packages/visual-editor/src/components/editors/FunctionForm.tsx:150](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/FunctionForm.tsx#L150)

Data payload for the selected function node (AnyGraphNode with $type='RosettaFunction').

***

### inheritedGroups?

> `optional` **inheritedGroups?**: `InheritedGroup`[]

Defined in: [packages/visual-editor/src/components/editors/FunctionForm.tsx:156](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/FunctionForm.tsx#L156)

Inherited member groups from super-function (if any).

***

### nodeId

> **nodeId**: `string`

Defined in: [packages/visual-editor/src/components/editors/FunctionForm.tsx:148](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/FunctionForm.tsx#L148)

Node ID of the Function being edited.

***

### onNavigateToNode?

> `optional` **onNavigateToNode?**: [`NavigateToNodeCallback`](../type-aliases/NavigateToNodeCallback.md)

Defined in: [packages/visual-editor/src/components/editors/FunctionForm.tsx:163](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/FunctionForm.tsx#L163)

Callback to navigate to a type's graph node.

***

### renderExpressionEditor?

> `optional` **renderExpressionEditor?**: (`props`) => `ReactNode`

Defined in: [packages/visual-editor/src/components/editors/FunctionForm.tsx:161](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/FunctionForm.tsx#L161)

Optional render-prop for a rich expression editor (e.g. CodeMirror).
When omitted, a plain `<Textarea>` is rendered as fallback.

#### Parameters

##### props

[`ExpressionEditorSlotProps`](ExpressionEditorSlotProps.md)

#### Returns

`ReactNode`
