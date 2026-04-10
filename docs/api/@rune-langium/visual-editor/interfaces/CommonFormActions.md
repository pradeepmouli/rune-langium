[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / CommonFormActions

# Interface: CommonFormActions

Defined in: [packages/visual-editor/src/types.ts:260](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L260)

Actions shared by all type kinds.

## Extended by

- [`DataFormActions`](DataFormActions.md)
- [`EnumFormActions`](EnumFormActions.md)
- [`ChoiceFormActions`](ChoiceFormActions.md)
- [`FuncFormActions`](FuncFormActions.md)

## Methods

### addAnnotation()

> **addAnnotation**(`nodeId`, `annotationName`): `void`

Defined in: [packages/visual-editor/src/types.ts:267](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L267)

#### Parameters

##### nodeId

`string`

##### annotationName

`string`

#### Returns

`void`

***

### addCondition()

> **addCondition**(`nodeId`, `condition`): `void`

Defined in: [packages/visual-editor/src/types.ts:269](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L269)

#### Parameters

##### nodeId

`string`

##### condition

###### definition?

`string`

###### expressionText

`string`

###### isPostCondition?

`boolean`

###### name?

`string`

#### Returns

`void`

***

### addSynonym()

> **addSynonym**(`nodeId`, `synonym`): `void`

Defined in: [packages/visual-editor/src/types.ts:265](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L265)

#### Parameters

##### nodeId

`string`

##### synonym

`string`

#### Returns

`void`

***

### deleteType()

> **deleteType**(`nodeId`): `void`

Defined in: [packages/visual-editor/src/types.ts:262](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L262)

#### Parameters

##### nodeId

`string`

#### Returns

`void`

***

### removeAnnotation()

> **removeAnnotation**(`nodeId`, `index`): `void`

Defined in: [packages/visual-editor/src/types.ts:268](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L268)

#### Parameters

##### nodeId

`string`

##### index

`number`

#### Returns

`void`

***

### removeCondition()

> **removeCondition**(`nodeId`, `index`): `void`

Defined in: [packages/visual-editor/src/types.ts:278](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L278)

#### Parameters

##### nodeId

`string`

##### index

`number`

#### Returns

`void`

***

### removeSynonym()

> **removeSynonym**(`nodeId`, `index`): `void`

Defined in: [packages/visual-editor/src/types.ts:266](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L266)

#### Parameters

##### nodeId

`string`

##### index

`number`

#### Returns

`void`

***

### renameType()

> **renameType**(`nodeId`, `newName`): `void`

Defined in: [packages/visual-editor/src/types.ts:261](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L261)

#### Parameters

##### nodeId

`string`

##### newName

`string`

#### Returns

`void`

***

### reorderCondition()

> **reorderCondition**(`nodeId`, `fromIndex`, `toIndex`): `void`

Defined in: [packages/visual-editor/src/types.ts:288](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L288)

#### Parameters

##### nodeId

`string`

##### fromIndex

`number`

##### toIndex

`number`

#### Returns

`void`

***

### updateComments()

> **updateComments**(`nodeId`, `comments`): `void`

Defined in: [packages/visual-editor/src/types.ts:264](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L264)

#### Parameters

##### nodeId

`string`

##### comments

`string`

#### Returns

`void`

***

### updateCondition()

> **updateCondition**(`nodeId`, `index`, `updates`): `void`

Defined in: [packages/visual-editor/src/types.ts:279](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L279)

#### Parameters

##### nodeId

`string`

##### index

`number`

##### updates

###### definition?

`string`

###### expressionText?

`string`

###### name?

`string`

#### Returns

`void`

***

### updateDefinition()

> **updateDefinition**(`nodeId`, `definition`): `void`

Defined in: [packages/visual-editor/src/types.ts:263](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L263)

#### Parameters

##### nodeId

`string`

##### definition

`string`

#### Returns

`void`

***

### validate()

> **validate**(): [`ValidationError`](ValidationError.md)[]

Defined in: [packages/visual-editor/src/types.ts:289](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L289)

#### Returns

[`ValidationError`](ValidationError.md)[]
