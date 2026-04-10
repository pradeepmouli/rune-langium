[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / EnumValueRowProps

# Interface: EnumValueRowProps

Defined in: [packages/visual-editor/src/components/editors/EnumValueRow.tsx:26](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/EnumValueRow.tsx#L26)

## Properties

### disabled?

> `optional` **disabled?**: `boolean`

Defined in: [packages/visual-editor/src/components/editors/EnumValueRow.tsx:42](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/EnumValueRow.tsx#L42)

Whether the row is disabled.

***

### displayName

> **displayName**: `string`

Defined in: [packages/visual-editor/src/components/editors/EnumValueRow.tsx:30](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/EnumValueRow.tsx#L30)

Last-committed display name (used as diff anchor in callbacks).

***

### index

> **index**: `number`

Defined in: [packages/visual-editor/src/components/editors/EnumValueRow.tsx:34](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/EnumValueRow.tsx#L34)

Index position of this member in the useFieldArray.

***

### isOverride?

> `optional` **isOverride?**: `boolean`

Defined in: [packages/visual-editor/src/components/editors/EnumValueRow.tsx:44](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/EnumValueRow.tsx#L44)

Whether this local value overrides an inherited value with the same name.

***

### name

> **name**: `string`

Defined in: [packages/visual-editor/src/components/editors/EnumValueRow.tsx:28](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/EnumValueRow.tsx#L28)

Last-committed value name (used as oldName diff anchor in callbacks).

***

### nodeId

> **nodeId**: `string`

Defined in: [packages/visual-editor/src/components/editors/EnumValueRow.tsx:32](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/EnumValueRow.tsx#L32)

Node ID of the parent Enum — forwarded to callbacks for store dispatch.

***

### onRemove

> **onRemove**: (`nodeId`, `valueName`) => `void`

Defined in: [packages/visual-editor/src/components/editors/EnumValueRow.tsx:38](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/EnumValueRow.tsx#L38)

Remove this enum value.

#### Parameters

##### nodeId

`string`

##### valueName

`string`

#### Returns

`void`

***

### onReorder

> **onReorder**: (`fromIndex`, `toIndex`) => `void`

Defined in: [packages/visual-editor/src/components/editors/EnumValueRow.tsx:40](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/EnumValueRow.tsx#L40)

Reorder (drag) callback; fromIndex → toIndex.

#### Parameters

##### fromIndex

`number`

##### toIndex

`number`

#### Returns

`void`

***

### onRevert?

> `optional` **onRevert?**: () => `void`

Defined in: [packages/visual-editor/src/components/editors/EnumValueRow.tsx:46](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/EnumValueRow.tsx#L46)

Callback to revert this override, restoring the inherited value.

#### Returns

`void`

***

### onUpdate

> **onUpdate**: (`nodeId`, `oldName`, `newName`, `displayName?`) => `void`

Defined in: [packages/visual-editor/src/components/editors/EnumValueRow.tsx:36](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/EnumValueRow.tsx#L36)

Commit value name/displayName changes to the graph.

#### Parameters

##### nodeId

`string`

##### oldName

`string`

##### newName

`string`

##### displayName?

`string`

#### Returns

`void`
