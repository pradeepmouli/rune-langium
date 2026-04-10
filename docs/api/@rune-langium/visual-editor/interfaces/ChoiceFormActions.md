[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / ChoiceFormActions

# Interface: ChoiceFormActions

Defined in: [packages/visual-editor/src/types.ts:317](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/visual-editor/src/types.ts#L317)

Choice-specific editor actions.

## Extends

- [`CommonFormActions`](CommonFormActions.md)

## Methods

### addAnnotation()

> **addAnnotation**(`nodeId`, `annotationName`): `void`

Defined in: [packages/visual-editor/src/types.ts:267](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/visual-editor/src/types.ts#L267)

#### Parameters

##### nodeId

`string`

##### annotationName

`string`

#### Returns

`void`

#### Inherited from

[`CommonFormActions`](CommonFormActions.md).[`addAnnotation`](CommonFormActions.md#addannotation)

***

### addChoiceOption()

> **addChoiceOption**(`nodeId`, `typeName`): `void`

Defined in: [packages/visual-editor/src/types.ts:318](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/visual-editor/src/types.ts#L318)

#### Parameters

##### nodeId

`string`

##### typeName

`string`

#### Returns

`void`

***

### addCondition()

> **addCondition**(`nodeId`, `condition`): `void`

Defined in: [packages/visual-editor/src/types.ts:269](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/visual-editor/src/types.ts#L269)

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

#### Inherited from

[`CommonFormActions`](CommonFormActions.md).[`addCondition`](CommonFormActions.md#addcondition)

***

### addSynonym()

> **addSynonym**(`nodeId`, `synonym`): `void`

Defined in: [packages/visual-editor/src/types.ts:265](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/visual-editor/src/types.ts#L265)

#### Parameters

##### nodeId

`string`

##### synonym

`string`

#### Returns

`void`

#### Inherited from

[`CommonFormActions`](CommonFormActions.md).[`addSynonym`](CommonFormActions.md#addsynonym)

***

### deleteType()

> **deleteType**(`nodeId`): `void`

Defined in: [packages/visual-editor/src/types.ts:262](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/visual-editor/src/types.ts#L262)

#### Parameters

##### nodeId

`string`

#### Returns

`void`

#### Inherited from

[`CommonFormActions`](CommonFormActions.md).[`deleteType`](CommonFormActions.md#deletetype)

***

### removeAnnotation()

> **removeAnnotation**(`nodeId`, `index`): `void`

Defined in: [packages/visual-editor/src/types.ts:268](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/visual-editor/src/types.ts#L268)

#### Parameters

##### nodeId

`string`

##### index

`number`

#### Returns

`void`

#### Inherited from

[`CommonFormActions`](CommonFormActions.md).[`removeAnnotation`](CommonFormActions.md#removeannotation)

***

### removeChoiceOption()

> **removeChoiceOption**(`nodeId`, `typeName`): `void`

Defined in: [packages/visual-editor/src/types.ts:319](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/visual-editor/src/types.ts#L319)

#### Parameters

##### nodeId

`string`

##### typeName

`string`

#### Returns

`void`

***

### removeCondition()

> **removeCondition**(`nodeId`, `index`): `void`

Defined in: [packages/visual-editor/src/types.ts:278](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/visual-editor/src/types.ts#L278)

#### Parameters

##### nodeId

`string`

##### index

`number`

#### Returns

`void`

#### Inherited from

[`CommonFormActions`](CommonFormActions.md).[`removeCondition`](CommonFormActions.md#removecondition)

***

### removeSynonym()

> **removeSynonym**(`nodeId`, `index`): `void`

Defined in: [packages/visual-editor/src/types.ts:266](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/visual-editor/src/types.ts#L266)

#### Parameters

##### nodeId

`string`

##### index

`number`

#### Returns

`void`

#### Inherited from

[`CommonFormActions`](CommonFormActions.md).[`removeSynonym`](CommonFormActions.md#removesynonym)

***

### renameType()

> **renameType**(`nodeId`, `newName`): `void`

Defined in: [packages/visual-editor/src/types.ts:261](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/visual-editor/src/types.ts#L261)

#### Parameters

##### nodeId

`string`

##### newName

`string`

#### Returns

`void`

#### Inherited from

[`CommonFormActions`](CommonFormActions.md).[`renameType`](CommonFormActions.md#renametype)

***

### reorderCondition()

> **reorderCondition**(`nodeId`, `fromIndex`, `toIndex`): `void`

Defined in: [packages/visual-editor/src/types.ts:288](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/visual-editor/src/types.ts#L288)

#### Parameters

##### nodeId

`string`

##### fromIndex

`number`

##### toIndex

`number`

#### Returns

`void`

#### Inherited from

[`CommonFormActions`](CommonFormActions.md).[`reorderCondition`](CommonFormActions.md#reordercondition)

***

### updateComments()

> **updateComments**(`nodeId`, `comments`): `void`

Defined in: [packages/visual-editor/src/types.ts:264](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/visual-editor/src/types.ts#L264)

#### Parameters

##### nodeId

`string`

##### comments

`string`

#### Returns

`void`

#### Inherited from

[`CommonFormActions`](CommonFormActions.md).[`updateComments`](CommonFormActions.md#updatecomments)

***

### updateCondition()

> **updateCondition**(`nodeId`, `index`, `updates`): `void`

Defined in: [packages/visual-editor/src/types.ts:279](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/visual-editor/src/types.ts#L279)

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

#### Inherited from

[`CommonFormActions`](CommonFormActions.md).[`updateCondition`](CommonFormActions.md#updatecondition)

***

### updateDefinition()

> **updateDefinition**(`nodeId`, `definition`): `void`

Defined in: [packages/visual-editor/src/types.ts:263](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/visual-editor/src/types.ts#L263)

#### Parameters

##### nodeId

`string`

##### definition

`string`

#### Returns

`void`

#### Inherited from

[`CommonFormActions`](CommonFormActions.md).[`updateDefinition`](CommonFormActions.md#updatedefinition)

***

### validate()

> **validate**(): [`ValidationError`](ValidationError.md)[]

Defined in: [packages/visual-editor/src/types.ts:289](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/visual-editor/src/types.ts#L289)

#### Returns

[`ValidationError`](ValidationError.md)[]

#### Inherited from

[`CommonFormActions`](CommonFormActions.md).[`validate`](CommonFormActions.md#validate)
