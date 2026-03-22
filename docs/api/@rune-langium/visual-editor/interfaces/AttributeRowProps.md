[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / AttributeRowProps

# Interface: AttributeRowProps

Defined in: [packages/visual-editor/src/components/editors/AttributeRow.tsx:27](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/AttributeRow.tsx#L27)

## Properties

### allNodeIds?

> `optional` **allNodeIds?**: `string`[]

Defined in: [packages/visual-editor/src/components/editors/AttributeRow.tsx:51](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/AttributeRow.tsx#L51)

All loaded graph node IDs for resolving type name to node ID.

***

### availableTypes

> **availableTypes**: [`TypeOption`](TypeOption.md)[]

Defined in: [packages/visual-editor/src/components/editors/AttributeRow.tsx:33](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/AttributeRow.tsx#L33)

Available type options for the TypeSelector.

***

### committedName

> **committedName**: `string`

Defined in: [packages/visual-editor/src/components/editors/AttributeRow.tsx:31](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/AttributeRow.tsx#L31)

Last-committed attribute name (for graph action diffing).

***

### disabled?

> `optional` **disabled?**: `boolean`

Defined in: [packages/visual-editor/src/components/editors/AttributeRow.tsx:47](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/AttributeRow.tsx#L47)

Whether the form is read-only.

***

### index

> **index**: `number`

Defined in: [packages/visual-editor/src/components/editors/AttributeRow.tsx:29](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/AttributeRow.tsx#L29)

Index position of this member in the useFieldArray.

***

### isOverride?

> `optional` **isOverride?**: `boolean`

Defined in: [packages/visual-editor/src/components/editors/AttributeRow.tsx:53](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/AttributeRow.tsx#L53)

Whether this attribute overrides an inherited member.

***

### onNavigateToNode?

> `optional` **onNavigateToNode?**: [`NavigateToNodeCallback`](../type-aliases/NavigateToNodeCallback.md)

Defined in: [packages/visual-editor/src/components/editors/AttributeRow.tsx:49](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/AttributeRow.tsx#L49)

Callback to navigate to a type's graph node.

***

### onRemove

> **onRemove**: (`index`) => `void`

Defined in: [packages/visual-editor/src/components/editors/AttributeRow.tsx:43](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/AttributeRow.tsx#L43)

Remove this attribute by index.

#### Parameters

##### index

`number`

#### Returns

`void`

***

### onReorder

> **onReorder**: (`fromIndex`, `toIndex`) => `void`

Defined in: [packages/visual-editor/src/components/editors/AttributeRow.tsx:45](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/AttributeRow.tsx#L45)

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

Defined in: [packages/visual-editor/src/components/editors/AttributeRow.tsx:55](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/AttributeRow.tsx#L55)

Callback to revert an override (remove local, restore inherited).

#### Returns

`void`

***

### onUpdate

> **onUpdate**: (`index`, `oldName`, `newName`, `typeName`, `cardinality`) => `void`

Defined in: [packages/visual-editor/src/components/editors/AttributeRow.tsx:35](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/AttributeRow.tsx#L35)

Commit attribute changes to the graph.

#### Parameters

##### index

`number`

##### oldName

`string`

##### newName

`string`

##### typeName

`string`

##### cardinality

`string`

#### Returns

`void`
