[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / RuneTypeGraphRef

# Interface: RuneTypeGraphRef

Defined in: [packages/visual-editor/src/types.ts:448](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L448)

## Methods

### exportImage()

> **exportImage**(`format`): `Promise`\<`Blob`\>

Defined in: [packages/visual-editor/src/types.ts:455](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L455)

#### Parameters

##### format

`"svg"` \| `"png"`

#### Returns

`Promise`\<`Blob`\>

***

### exportRosetta()

> **exportRosetta**(): `Map`\<`string`, `string`\>

Defined in: [packages/visual-editor/src/types.ts:456](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L456)

#### Returns

`Map`\<`string`, `string`\>

***

### fitView()

> **fitView**(): `void`

Defined in: [packages/visual-editor/src/types.ts:449](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L449)

#### Returns

`void`

***

### focusNode()

> **focusNode**(`nodeId`): `void`

Defined in: [packages/visual-editor/src/types.ts:450](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L450)

#### Parameters

##### nodeId

`string`

#### Returns

`void`

***

### getFilters()

> **getFilters**(): [`GraphFilters`](GraphFilters.md)

Defined in: [packages/visual-editor/src/types.ts:453](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L453)

#### Returns

[`GraphFilters`](GraphFilters.md)

***

### getNodeData()

> **getNodeData**(`nodeId`): [`AnyGraphNode`](../type-aliases/AnyGraphNode.md) \| `null`

Defined in: [packages/visual-editor/src/types.ts:458](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L458)

Get current data for a node by ID (returns null if not found).

#### Parameters

##### nodeId

`string`

#### Returns

[`AnyGraphNode`](../type-aliases/AnyGraphNode.md) \| `null`

***

### getNodes()

> **getNodes**(): [`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

Defined in: [packages/visual-editor/src/types.ts:460](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L460)

Get all current nodes (for building availableTypes list).

#### Returns

[`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

***

### relayout()

> **relayout**(`options?`): `void`

Defined in: [packages/visual-editor/src/types.ts:454](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L454)

#### Parameters

##### options?

[`LayoutOptions`](LayoutOptions.md)

#### Returns

`void`

***

### search()

> **search**(`query`): `string`[]

Defined in: [packages/visual-editor/src/types.ts:451](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L451)

#### Parameters

##### query

`string`

#### Returns

`string`[]

***

### setFilters()

> **setFilters**(`filters`): `void`

Defined in: [packages/visual-editor/src/types.ts:452](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L452)

#### Parameters

##### filters

[`GraphFilters`](GraphFilters.md)

#### Returns

`void`

***

### validate()

> **validate**(): [`ValidationError`](ValidationError.md)[]

Defined in: [packages/visual-editor/src/types.ts:462](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L462)

Validate the current graph and return errors.

#### Returns

[`ValidationError`](ValidationError.md)[]
