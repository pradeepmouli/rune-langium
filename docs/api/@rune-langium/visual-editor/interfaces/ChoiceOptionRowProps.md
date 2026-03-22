[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / ChoiceOptionRowProps

# Interface: ChoiceOptionRowProps

Defined in: [packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx:18](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx#L18)

## Properties

### allNodeIds?

> `optional` **allNodeIds?**: `string`[]

Defined in: [packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx:32](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx#L32)

All loaded graph node IDs for resolving type name to node ID.

***

### availableTypes

> **availableTypes**: [`TypeOption`](TypeOption.md)[]

Defined in: [packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx:24](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx#L24)

Available type options (for badge styling lookup).

***

### disabled?

> `optional` **disabled?**: `boolean`

Defined in: [packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx:28](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx#L28)

Whether the row is disabled.

***

### nodeId

> **nodeId**: `string`

Defined in: [packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx:22](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx#L22)

Node ID owning this choice.

***

### onNavigateToNode?

> `optional` **onNavigateToNode?**: [`NavigateToNodeCallback`](../type-aliases/NavigateToNodeCallback.md)

Defined in: [packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx:30](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx#L30)

Callback to navigate to a type's graph node.

***

### onRemove

> **onRemove**: (`nodeId`, `typeName`) => `void`

Defined in: [packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx:26](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx#L26)

Remove this option.

#### Parameters

##### nodeId

`string`

##### typeName

`string`

#### Returns

`void`

***

### typeName

> **typeName**: `string`

Defined in: [packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx:20](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx#L20)

The type name for this choice option.
