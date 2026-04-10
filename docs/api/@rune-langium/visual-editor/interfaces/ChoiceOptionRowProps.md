[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / ChoiceOptionRowProps

# Interface: ChoiceOptionRowProps

Defined in: [packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx:21](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx#L21)

## Properties

### allNodeIds?

> `optional` **allNodeIds?**: `string`[]

Defined in: [packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx:35](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx#L35)

All loaded graph node IDs for resolving type name to node ID.

***

### availableTypes

> **availableTypes**: [`TypeOption`](TypeOption.md)[]

Defined in: [packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx:27](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx#L27)

Available type options (for badge styling lookup).

***

### disabled?

> `optional` **disabled?**: `boolean`

Defined in: [packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx:31](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx#L31)

Whether the row is disabled.

***

### nodeId

> **nodeId**: `string`

Defined in: [packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx:25](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx#L25)

Node ID owning this choice.

***

### onNavigateToNode?

> `optional` **onNavigateToNode?**: [`NavigateToNodeCallback`](../type-aliases/NavigateToNodeCallback.md)

Defined in: [packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx:33](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx#L33)

Callback to navigate to a type's graph node.

***

### onRemove

> **onRemove**: (`nodeId`, `typeName`) => `void`

Defined in: [packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx:29](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx#L29)

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

Defined in: [packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx:23](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx#L23)

The type name for this choice option.
