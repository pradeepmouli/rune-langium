[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / EnumFormProps

# Interface: EnumFormProps

Defined in: [packages/visual-editor/src/components/editors/EnumForm.tsx:76](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/EnumForm.tsx#L76)

## Properties

### actions

> **actions**: [`EnumFormActions`](EnumFormActions.md)

Defined in: [packages/visual-editor/src/components/editors/EnumForm.tsx:84](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/EnumForm.tsx#L84)

Enum-specific editor form action callbacks.

***

### allNodeIds?

> `optional` **allNodeIds?**: `string`[]

Defined in: [packages/visual-editor/src/components/editors/EnumForm.tsx:90](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/EnumForm.tsx#L90)

All loaded graph node IDs for resolving type name to node ID.

***

### allNodes?

> `optional` **allNodes?**: [`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

Defined in: [packages/visual-editor/src/components/editors/EnumForm.tsx:86](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/EnumForm.tsx#L86)

All graph nodes for inherited member resolution.

***

### availableTypes

> **availableTypes**: [`TypeOption`](TypeOption.md)[]

Defined in: [packages/visual-editor/src/components/editors/EnumForm.tsx:82](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/EnumForm.tsx#L82)

Available type options for selectors.

***

### data

> **data**: [`AnyGraphNode`](../type-aliases/AnyGraphNode.md)

Defined in: [packages/visual-editor/src/components/editors/EnumForm.tsx:80](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/EnumForm.tsx#L80)

Data payload for the selected enum node (AnyGraphNode with $type='RosettaEnumeration').

***

### nodeId

> **nodeId**: `string`

Defined in: [packages/visual-editor/src/components/editors/EnumForm.tsx:78](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/EnumForm.tsx#L78)

Node ID of the Enum being edited.

***

### onNavigateToNode?

> `optional` **onNavigateToNode?**: [`NavigateToNodeCallback`](../type-aliases/NavigateToNodeCallback.md)

Defined in: [packages/visual-editor/src/components/editors/EnumForm.tsx:88](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/EnumForm.tsx#L88)

Callback to navigate to a type's graph node.
