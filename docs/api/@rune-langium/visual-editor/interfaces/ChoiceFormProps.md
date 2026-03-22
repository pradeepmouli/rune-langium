[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / ChoiceFormProps

# Interface: ChoiceFormProps

Defined in: [packages/visual-editor/src/components/editors/ChoiceForm.tsx:71](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/ChoiceForm.tsx#L71)

## Properties

### actions

> **actions**: [`ChoiceFormActions`](ChoiceFormActions.md)

Defined in: [packages/visual-editor/src/components/editors/ChoiceForm.tsx:79](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/ChoiceForm.tsx#L79)

Choice-specific editor form action callbacks.

***

### allNodeIds?

> `optional` **allNodeIds?**: `string`[]

Defined in: [packages/visual-editor/src/components/editors/ChoiceForm.tsx:83](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/ChoiceForm.tsx#L83)

All loaded graph node IDs for resolving type name to node ID.

***

### availableTypes

> **availableTypes**: [`TypeOption`](TypeOption.md)[]

Defined in: [packages/visual-editor/src/components/editors/ChoiceForm.tsx:77](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/ChoiceForm.tsx#L77)

Available type options for selectors.

***

### data

> **data**: [`AnyGraphNode`](../type-aliases/AnyGraphNode.md)

Defined in: [packages/visual-editor/src/components/editors/ChoiceForm.tsx:75](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/ChoiceForm.tsx#L75)

Data payload for the selected choice node (AnyGraphNode with $type='Choice').

***

### nodeId

> **nodeId**: `string`

Defined in: [packages/visual-editor/src/components/editors/ChoiceForm.tsx:73](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/ChoiceForm.tsx#L73)

Node ID of the Choice being edited.

***

### onNavigateToNode?

> `optional` **onNavigateToNode?**: [`NavigateToNodeCallback`](../type-aliases/NavigateToNodeCallback.md)

Defined in: [packages/visual-editor/src/components/editors/ChoiceForm.tsx:81](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/ChoiceForm.tsx#L81)

Callback to navigate to a type's graph node.
