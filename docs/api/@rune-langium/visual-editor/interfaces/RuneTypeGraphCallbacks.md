[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / RuneTypeGraphCallbacks

# Interface: RuneTypeGraphCallbacks

Defined in: [packages/visual-editor/src/types.ts:425](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L425)

## Properties

### onContextMenu?

> `optional` **onContextMenu?**: (`position`) => `void`

Defined in: [packages/visual-editor/src/types.ts:431](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L431)

#### Parameters

##### position

###### x

`number`

###### y

`number`

#### Returns

`void`

***

### onEdgeSelect?

> `optional` **onEdgeSelect?**: (`edgeId`, `data`) => `void`

Defined in: [packages/visual-editor/src/types.ts:429](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L429)

#### Parameters

##### edgeId

`string`

##### data

[`EdgeData`](EdgeData.md)

#### Returns

`void`

***

### onModelChanged?

> `optional` **onModelChanged?**: (`serialized`) => `void`

Defined in: [packages/visual-editor/src/types.ts:434](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L434)

#### Parameters

##### serialized

`Map`\<`string`, `string`\>

#### Returns

`void`

***

### onNavigateToType?

> `optional` **onNavigateToType?**: [`NavigateToNodeCallback`](../type-aliases/NavigateToNodeCallback.md)

Defined in: [packages/visual-editor/src/types.ts:428](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L428)

Called when a type reference is clicked within a graph node (e.g., attribute type name).

***

### onNodeDoubleClick?

> `optional` **onNodeDoubleClick?**: (`nodeId`, `data`) => `void`

Defined in: [packages/visual-editor/src/types.ts:426](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L426)

#### Parameters

##### nodeId

`string`

##### data

[`AnyGraphNode`](../type-aliases/AnyGraphNode.md)

#### Returns

`void`

***

### onSelectionClear?

> `optional` **onSelectionClear?**: () => `void`

Defined in: [packages/visual-editor/src/types.ts:430](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L430)

#### Returns

`void`

***

### onTypeCreated?

> `optional` **onTypeCreated?**: (`nodeId`, `kind`, `name`) => `void`

Defined in: [packages/visual-editor/src/types.ts:432](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L432)

#### Parameters

##### nodeId

`string`

##### kind

[`TypeKind`](../type-aliases/TypeKind.md)

##### name

`string`

#### Returns

`void`

***

### onTypeDeleted?

> `optional` **onTypeDeleted?**: (`nodeId`) => `void`

Defined in: [packages/visual-editor/src/types.ts:433](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L433)

#### Parameters

##### nodeId

`string`

#### Returns

`void`

***

### onValidationChange?

> `optional` **onValidationChange?**: (`errors`) => `void`

Defined in: [packages/visual-editor/src/types.ts:435](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L435)

#### Parameters

##### errors

[`ValidationError`](ValidationError.md)[]

#### Returns

`void`
