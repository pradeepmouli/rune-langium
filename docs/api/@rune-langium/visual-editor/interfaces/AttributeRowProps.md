[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / AttributeRowProps

# Interface: AttributeRowProps

Defined in: [packages/visual-editor/src/components/editors/AttributeRow.tsx:30](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/AttributeRow.tsx#L30)

## Properties

### allNodeIds?

> `optional` **allNodeIds?**: `string`[]

Defined in: [packages/visual-editor/src/components/editors/AttributeRow.tsx:54](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/AttributeRow.tsx#L54)

All loaded graph node IDs for resolving type name to node ID.

***

### availableTypes

> **availableTypes**: [`TypeOption`](TypeOption.md)[]

Defined in: [packages/visual-editor/src/components/editors/AttributeRow.tsx:36](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/AttributeRow.tsx#L36)

Available type options for the TypeSelector.

***

### committedName

> **committedName**: `string`

Defined in: [packages/visual-editor/src/components/editors/AttributeRow.tsx:34](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/AttributeRow.tsx#L34)

Last-committed attribute name (for graph action diffing).

***

### disabled?

> `optional` **disabled?**: `boolean`

Defined in: [packages/visual-editor/src/components/editors/AttributeRow.tsx:50](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/AttributeRow.tsx#L50)

Whether the form is read-only.

***

### index

> **index**: `number`

Defined in: [packages/visual-editor/src/components/editors/AttributeRow.tsx:32](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/AttributeRow.tsx#L32)

Index position of this member in the useFieldArray.

***

### isOverride?

> `optional` **isOverride?**: `boolean`

Defined in: [packages/visual-editor/src/components/editors/AttributeRow.tsx:56](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/AttributeRow.tsx#L56)

Whether this attribute overrides an inherited member.

***

### onNavigateToNode?

> `optional` **onNavigateToNode?**: [`NavigateToNodeCallback`](../type-aliases/NavigateToNodeCallback.md)

Defined in: [packages/visual-editor/src/components/editors/AttributeRow.tsx:52](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/AttributeRow.tsx#L52)

Callback to navigate to a type's graph node.

***

### onRemove

> **onRemove**: (`index`) => `void`

Defined in: [packages/visual-editor/src/components/editors/AttributeRow.tsx:46](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/AttributeRow.tsx#L46)

Remove this attribute by index.

#### Parameters

##### index

`number`

#### Returns

`void`

***

### onReorder

> **onReorder**: (`fromIndex`, `toIndex`) => `void`

Defined in: [packages/visual-editor/src/components/editors/AttributeRow.tsx:48](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/AttributeRow.tsx#L48)

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

Defined in: [packages/visual-editor/src/components/editors/AttributeRow.tsx:58](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/AttributeRow.tsx#L58)

Callback to revert an override (remove local, restore inherited).

#### Returns

`void`

***

### onUpdate

> **onUpdate**: (`index`, `oldName`, `newName`, `typeName`, `cardinality`) => `void`

Defined in: [packages/visual-editor/src/components/editors/AttributeRow.tsx:38](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/AttributeRow.tsx#L38)

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
