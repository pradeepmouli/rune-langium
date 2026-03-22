[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / EnumFormActions

# Interface: EnumFormActions

Defined in: [packages/visual-editor/src/types.ts:305](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L305)

Enum-specific editor actions.

## Extends

- [`CommonFormActions`](CommonFormActions.md)

## Methods

### addAnnotation()

> **addAnnotation**(`nodeId`, `annotationName`): `void`

Defined in: [packages/visual-editor/src/types.ts:264](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L264)

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

### addCondition()

> **addCondition**(`nodeId`, `condition`): `void`

Defined in: [packages/visual-editor/src/types.ts:266](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L266)

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

### addEnumValue()

> **addEnumValue**(`nodeId`, `valueName`, `displayName?`): `void`

Defined in: [packages/visual-editor/src/types.ts:306](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L306)

#### Parameters

##### nodeId

`string`

##### valueName

`string`

##### displayName?

`string`

#### Returns

`void`

***

### addSynonym()

> **addSynonym**(`nodeId`, `synonym`): `void`

Defined in: [packages/visual-editor/src/types.ts:262](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L262)

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

Defined in: [packages/visual-editor/src/types.ts:259](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L259)

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

Defined in: [packages/visual-editor/src/types.ts:265](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L265)

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

### removeCondition()

> **removeCondition**(`nodeId`, `index`): `void`

Defined in: [packages/visual-editor/src/types.ts:275](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L275)

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

### removeEnumValue()

> **removeEnumValue**(`nodeId`, `valueName`): `void`

Defined in: [packages/visual-editor/src/types.ts:307](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L307)

#### Parameters

##### nodeId

`string`

##### valueName

`string`

#### Returns

`void`

***

### removeSynonym()

> **removeSynonym**(`nodeId`, `index`): `void`

Defined in: [packages/visual-editor/src/types.ts:263](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L263)

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

Defined in: [packages/visual-editor/src/types.ts:258](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L258)

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

Defined in: [packages/visual-editor/src/types.ts:285](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L285)

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

### reorderEnumValue()

> **reorderEnumValue**(`nodeId`, `fromIndex`, `toIndex`): `void`

Defined in: [packages/visual-editor/src/types.ts:309](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L309)

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

### setEnumParent()

> **setEnumParent**(`nodeId`, `parentId`): `void`

Defined in: [packages/visual-editor/src/types.ts:310](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L310)

#### Parameters

##### nodeId

`string`

##### parentId

`string` \| `null`

#### Returns

`void`

***

### updateComments()

> **updateComments**(`nodeId`, `comments`): `void`

Defined in: [packages/visual-editor/src/types.ts:261](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L261)

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

Defined in: [packages/visual-editor/src/types.ts:276](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L276)

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

Defined in: [packages/visual-editor/src/types.ts:260](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L260)

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

### updateEnumValue()

> **updateEnumValue**(`nodeId`, `oldName`, `newName`, `displayName?`): `void`

Defined in: [packages/visual-editor/src/types.ts:308](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L308)

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

***

### validate()

> **validate**(): [`ValidationError`](ValidationError.md)[]

Defined in: [packages/visual-editor/src/types.ts:286](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L286)

#### Returns

[`ValidationError`](ValidationError.md)[]

#### Inherited from

[`CommonFormActions`](CommonFormActions.md).[`validate`](CommonFormActions.md#validate)
