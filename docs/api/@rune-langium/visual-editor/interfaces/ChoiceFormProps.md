[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / ChoiceFormProps

# Interface: ChoiceFormProps

Defined in: [packages/visual-editor/src/components/editors/ChoiceForm.tsx:74](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/components/editors/ChoiceForm.tsx#L74)

## Properties

### actions

> **actions**: [`ChoiceFormActions`](ChoiceFormActions.md)

Defined in: [packages/visual-editor/src/components/editors/ChoiceForm.tsx:82](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/components/editors/ChoiceForm.tsx#L82)

Choice-specific editor form action callbacks.

***

### allNodeIds?

> `optional` **allNodeIds?**: `string`[]

Defined in: [packages/visual-editor/src/components/editors/ChoiceForm.tsx:86](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/components/editors/ChoiceForm.tsx#L86)

All loaded graph node IDs for resolving type name to node ID.

***

### availableTypes

> **availableTypes**: [`TypeOption`](TypeOption.md)[]

Defined in: [packages/visual-editor/src/components/editors/ChoiceForm.tsx:80](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/components/editors/ChoiceForm.tsx#L80)

Available type options for selectors.

***

### data

> **data**: [`AnyGraphNode`](../type-aliases/AnyGraphNode.md)

Defined in: [packages/visual-editor/src/components/editors/ChoiceForm.tsx:78](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/components/editors/ChoiceForm.tsx#L78)

Data payload for the selected choice node (AnyGraphNode with $type='Choice').

***

### nodeId

> **nodeId**: `string`

Defined in: [packages/visual-editor/src/components/editors/ChoiceForm.tsx:76](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/components/editors/ChoiceForm.tsx#L76)

Node ID of the Choice being edited.

***

### onNavigateToNode?

> `optional` **onNavigateToNode?**: [`NavigateToNodeCallback`](../type-aliases/NavigateToNodeCallback.md)

Defined in: [packages/visual-editor/src/components/editors/ChoiceForm.tsx:84](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/components/editors/ChoiceForm.tsx#L84)

Callback to navigate to a type's graph node.
