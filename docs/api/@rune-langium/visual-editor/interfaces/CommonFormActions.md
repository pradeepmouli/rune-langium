[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / CommonFormActions

# Interface: CommonFormActions

Defined in: [packages/visual-editor/src/types.ts:257](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L257)

Actions shared by all type kinds.

## Extended by

- [`DataFormActions`](DataFormActions.md)
- [`EnumFormActions`](EnumFormActions.md)
- [`ChoiceFormActions`](ChoiceFormActions.md)
- [`FuncFormActions`](FuncFormActions.md)

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

***

### deleteType()

> **deleteType**(`nodeId`): `void`

Defined in: [packages/visual-editor/src/types.ts:259](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L259)

#### Parameters

##### nodeId

`string`

#### Returns

`void`

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

***

### validate()

> **validate**(): [`ValidationError`](ValidationError.md)[]

Defined in: [packages/visual-editor/src/types.ts:286](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L286)

#### Returns

[`ValidationError`](ValidationError.md)[]
