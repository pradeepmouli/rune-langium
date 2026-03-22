[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / EnumValueRowProps

# Interface: EnumValueRowProps

Defined in: [packages/visual-editor/src/components/editors/EnumValueRow.tsx:23](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/EnumValueRow.tsx#L23)

## Properties

### disabled?

> `optional` **disabled?**: `boolean`

Defined in: [packages/visual-editor/src/components/editors/EnumValueRow.tsx:39](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/EnumValueRow.tsx#L39)

Whether the row is disabled.

***

### displayName

> **displayName**: `string`

Defined in: [packages/visual-editor/src/components/editors/EnumValueRow.tsx:27](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/EnumValueRow.tsx#L27)

Last-committed display name (used as diff anchor in callbacks).

***

### index

> **index**: `number`

Defined in: [packages/visual-editor/src/components/editors/EnumValueRow.tsx:31](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/EnumValueRow.tsx#L31)

Index position of this member in the useFieldArray.

***

### isOverride?

> `optional` **isOverride?**: `boolean`

Defined in: [packages/visual-editor/src/components/editors/EnumValueRow.tsx:41](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/EnumValueRow.tsx#L41)

Whether this local value overrides an inherited value with the same name.

***

### name

> **name**: `string`

Defined in: [packages/visual-editor/src/components/editors/EnumValueRow.tsx:25](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/EnumValueRow.tsx#L25)

Last-committed value name (used as oldName diff anchor in callbacks).

***

### nodeId

> **nodeId**: `string`

Defined in: [packages/visual-editor/src/components/editors/EnumValueRow.tsx:29](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/EnumValueRow.tsx#L29)

Node ID of the parent Enum — forwarded to callbacks for store dispatch.

***

### onRemove

> **onRemove**: (`nodeId`, `valueName`) => `void`

Defined in: [packages/visual-editor/src/components/editors/EnumValueRow.tsx:35](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/EnumValueRow.tsx#L35)

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

Defined in: [packages/visual-editor/src/components/editors/EnumValueRow.tsx:37](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/EnumValueRow.tsx#L37)

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

Defined in: [packages/visual-editor/src/components/editors/EnumValueRow.tsx:43](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/EnumValueRow.tsx#L43)

Callback to revert this override, restoring the inherited value.

#### Returns

`void`

***

### onUpdate

> **onUpdate**: (`nodeId`, `oldName`, `newName`, `displayName?`) => `void`

Defined in: [packages/visual-editor/src/components/editors/EnumValueRow.tsx:33](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/EnumValueRow.tsx#L33)

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
