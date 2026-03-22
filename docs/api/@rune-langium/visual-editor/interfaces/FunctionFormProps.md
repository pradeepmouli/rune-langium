[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / FunctionFormProps

# Interface: FunctionFormProps

Defined in: [packages/visual-editor/src/components/editors/FunctionForm.tsx:143](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/FunctionForm.tsx#L143)

## Properties

### actions

> **actions**: [`FuncFormActions`](FuncFormActions.md)

Defined in: [packages/visual-editor/src/components/editors/FunctionForm.tsx:151](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/FunctionForm.tsx#L151)

Function-specific editor form action callbacks.

***

### allNodeIds?

> `optional` **allNodeIds?**: `string`[]

Defined in: [packages/visual-editor/src/components/editors/FunctionForm.tsx:162](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/FunctionForm.tsx#L162)

All loaded graph node IDs for resolving type name to node ID.

***

### availableTypes

> **availableTypes**: [`TypeOption`](TypeOption.md)[]

Defined in: [packages/visual-editor/src/components/editors/FunctionForm.tsx:149](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/FunctionForm.tsx#L149)

Available type options for selectors.

***

### data

> **data**: [`AnyGraphNode`](../type-aliases/AnyGraphNode.md)

Defined in: [packages/visual-editor/src/components/editors/FunctionForm.tsx:147](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/FunctionForm.tsx#L147)

Data payload for the selected function node (AnyGraphNode with $type='RosettaFunction').

***

### inheritedGroups?

> `optional` **inheritedGroups?**: `InheritedGroup`[]

Defined in: [packages/visual-editor/src/components/editors/FunctionForm.tsx:153](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/FunctionForm.tsx#L153)

Inherited member groups from super-function (if any).

***

### nodeId

> **nodeId**: `string`

Defined in: [packages/visual-editor/src/components/editors/FunctionForm.tsx:145](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/FunctionForm.tsx#L145)

Node ID of the Function being edited.

***

### onNavigateToNode?

> `optional` **onNavigateToNode?**: [`NavigateToNodeCallback`](../type-aliases/NavigateToNodeCallback.md)

Defined in: [packages/visual-editor/src/components/editors/FunctionForm.tsx:160](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/FunctionForm.tsx#L160)

Callback to navigate to a type's graph node.

***

### renderExpressionEditor?

> `optional` **renderExpressionEditor?**: (`props`) => `ReactNode`

Defined in: [packages/visual-editor/src/components/editors/FunctionForm.tsx:158](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/FunctionForm.tsx#L158)

Optional render-prop for a rich expression editor (e.g. CodeMirror).
When omitted, a plain `<Textarea>` is rendered as fallback.

#### Parameters

##### props

[`ExpressionEditorSlotProps`](ExpressionEditorSlotProps.md)

#### Returns

`ReactNode`
