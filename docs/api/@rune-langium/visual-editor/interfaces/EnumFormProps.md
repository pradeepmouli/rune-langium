[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / EnumFormProps

# Interface: EnumFormProps

Defined in: [packages/visual-editor/src/components/editors/EnumForm.tsx:79](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/EnumForm.tsx#L79)

## Properties

### actions

> **actions**: [`EnumFormActions`](EnumFormActions.md)

Defined in: [packages/visual-editor/src/components/editors/EnumForm.tsx:87](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/EnumForm.tsx#L87)

Enum-specific editor form action callbacks.

***

### allNodeIds?

> `optional` **allNodeIds?**: `string`[]

Defined in: [packages/visual-editor/src/components/editors/EnumForm.tsx:93](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/EnumForm.tsx#L93)

All loaded graph node IDs for resolving type name to node ID.

***

### allNodes?

> `optional` **allNodes?**: [`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

Defined in: [packages/visual-editor/src/components/editors/EnumForm.tsx:89](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/EnumForm.tsx#L89)

All graph nodes for inherited member resolution.

***

### availableTypes

> **availableTypes**: [`TypeOption`](TypeOption.md)[]

Defined in: [packages/visual-editor/src/components/editors/EnumForm.tsx:85](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/EnumForm.tsx#L85)

Available type options for selectors.

***

### data

> **data**: [`AnyGraphNode`](../type-aliases/AnyGraphNode.md)

Defined in: [packages/visual-editor/src/components/editors/EnumForm.tsx:83](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/EnumForm.tsx#L83)

Data payload for the selected enum node (AnyGraphNode with $type='RosettaEnumeration').

***

### nodeId

> **nodeId**: `string`

Defined in: [packages/visual-editor/src/components/editors/EnumForm.tsx:81](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/EnumForm.tsx#L81)

Node ID of the Enum being edited.

***

### onNavigateToNode?

> `optional` **onNavigateToNode?**: [`NavigateToNodeCallback`](../type-aliases/NavigateToNodeCallback.md)

Defined in: [packages/visual-editor/src/components/editors/EnumForm.tsx:91](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/EnumForm.tsx#L91)

Callback to navigate to a type's graph node.
