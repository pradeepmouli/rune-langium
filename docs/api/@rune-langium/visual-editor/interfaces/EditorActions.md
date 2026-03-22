[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / EditorActions

# Interface: EditorActions

Defined in: [packages/visual-editor/src/store/editor-store.ts:67](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L67)

## Methods

### addAnnotation()

> **addAnnotation**(`nodeId`, `annotationName`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:174](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L174)

#### Parameters

##### nodeId

`string`

##### annotationName

`string`

#### Returns

`void`

***

### addAttribute()

> **addAttribute**(`nodeId`, `attrName`, `typeName`, `cardinality`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:114](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L114)

#### Parameters

##### nodeId

`string`

##### attrName

`string`

##### typeName

`string`

##### cardinality

`string`

#### Returns

`void`

***

### addChoiceOption()

> **addChoiceOption**(`nodeId`, `typeName`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:136](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L136)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:146](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L146)

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

### addEnumValue()

> **addEnumValue**(`nodeId`, `valueName`, `displayName?`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:129](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L129)

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

### addInputParam()

> **addInputParam**(`nodeId`, `paramName`, `typeName`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:140](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L140)

#### Parameters

##### nodeId

`string`

##### paramName

`string`

##### typeName

`string`

#### Returns

`void`

***

### addSynonym()

> **addSynonym**(`nodeId`, `synonym`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:170](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L170)

#### Parameters

##### nodeId

`string`

##### synonym

`string`

#### Returns

`void`

***

### applyReactFlowEdgeChanges()

> **applyReactFlowEdgeChanges**(`changes`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:179](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L179)

#### Parameters

##### changes

`EdgeChange`\<[`TypeGraphEdge`](../type-aliases/TypeGraphEdge.md)\>[]

#### Returns

`void`

***

### applyReactFlowNodeChanges()

> **applyReactFlowNodeChanges**(`changes`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:178](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L178)

#### Parameters

##### changes

`NodeChange`\<[`TypeGraphNode`](../type-aliases/TypeGraphNode.md)\>[]

#### Returns

`void`

***

### collapseAllNamespaces()

> **collapseAllNamespaces**(): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:88](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L88)

#### Returns

`void`

***

### createType()

> **createType**(`kind`, `name`, `namespace`): `string`

Defined in: [packages/visual-editor/src/store/editor-store.ts:111](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L111)

#### Parameters

##### kind

[`TypeKind`](../type-aliases/TypeKind.md)

##### name

`string`

##### namespace

`string`

#### Returns

`string`

***

### deleteType()

> **deleteType**(`nodeId`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:112](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L112)

#### Parameters

##### nodeId

`string`

#### Returns

`void`

***

### expandAllNamespaces()

> **expandAllNamespaces**(): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:87](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L87)

#### Returns

`void`

***

### getEdges()

> **getEdges**(): [`TypeGraphEdge`](../type-aliases/TypeGraphEdge.md)[]

Defined in: [packages/visual-editor/src/store/editor-store.ts:82](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L82)

#### Returns

[`TypeGraphEdge`](../type-aliases/TypeGraphEdge.md)[]

***

### getNodes()

> **getNodes**(): [`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

Defined in: [packages/visual-editor/src/store/editor-store.ts:81](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L81)

#### Returns

[`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

***

### getVisibleEdges()

> **getVisibleEdges**(): [`TypeGraphEdge`](../type-aliases/TypeGraphEdge.md)[]

Defined in: [packages/visual-editor/src/store/editor-store.ts:92](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L92)

#### Returns

[`TypeGraphEdge`](../type-aliases/TypeGraphEdge.md)[]

***

### getVisibleNodes()

> **getVisibleNodes**(): [`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

Defined in: [packages/visual-editor/src/store/editor-store.ts:91](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L91)

#### Returns

[`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

***

### isolateNode()

> **isolateNode**(`nodeId`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:102](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L102)

Hide all nodes except the given node and its directly connected neighbors.

#### Parameters

##### nodeId

`string`

#### Returns

`void`

***

### loadModels()

> **loadModels**(`models`, `layoutOpts?`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:69](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L69)

#### Parameters

##### models

`unknown`

##### layoutOpts?

[`LayoutOptions`](LayoutOptions.md)

#### Returns

`void`

***

### relayout()

> **relayout**(`options?`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:78](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L78)

#### Parameters

##### options?

[`LayoutOptions`](LayoutOptions.md)

#### Returns

`void`

***

### removeAnnotation()

> **removeAnnotation**(`nodeId`, `index`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:175](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L175)

#### Parameters

##### nodeId

`string`

##### index

`number`

#### Returns

`void`

***

### removeAttribute()

> **removeAttribute**(`nodeId`, `attrName`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:115](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L115)

#### Parameters

##### nodeId

`string`

##### attrName

`string`

#### Returns

`void`

***

### removeChoiceOption()

> **removeChoiceOption**(`nodeId`, `typeName`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:137](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L137)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:155](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L155)

#### Parameters

##### nodeId

`string`

##### index

`number`

#### Returns

`void`

***

### removeEnumValue()

> **removeEnumValue**(`nodeId`, `valueName`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:130](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L130)

#### Parameters

##### nodeId

`string`

##### valueName

`string`

#### Returns

`void`

***

### removeInputParam()

> **removeInputParam**(`nodeId`, `paramName`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:141](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L141)

#### Parameters

##### nodeId

`string`

##### paramName

`string`

#### Returns

`void`

***

### removeSynonym()

> **removeSynonym**(`nodeId`, `index`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:171](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L171)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:113](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L113)

#### Parameters

##### nodeId

`string`

##### newName

`string`

#### Returns

`void`

***

### reorderAttribute()

> **reorderAttribute**(`nodeId`, `fromIndex`, `toIndex`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:123](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L123)

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

### reorderCondition()

> **reorderCondition**(`nodeId`, `fromIndex`, `toIndex`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:165](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L165)

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

### reorderEnumValue()

> **reorderEnumValue**(`nodeId`, `fromIndex`, `toIndex`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:132](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L132)

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

### revealNeighbors()

> **revealNeighbors**(`nodeId`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:104](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L104)

Unhide the direct neighbors of a node (expand their namespaces too).

#### Parameters

##### nodeId

`string`

#### Returns

`void`

***

### selectNode()

> **selectNode**(`nodeId`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:72](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L72)

#### Parameters

##### nodeId

`string` \| `null`

#### Returns

`void`

***

### setEnumParent()

> **setEnumParent**(`nodeId`, `parentId`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:133](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L133)

#### Parameters

##### nodeId

`string`

##### parentId

`string` \| `null`

#### Returns

`void`

***

### setFilters()

> **setFilters**(`filters`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:74](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L74)

#### Parameters

##### filters

[`GraphFilters`](GraphFilters.md)

#### Returns

`void`

***

### setInheritance()

> **setInheritance**(`childId`, `parentId`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:125](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L125)

#### Parameters

##### childId

`string`

##### parentId

`string` \| `null`

#### Returns

`void`

***

### setInitialVisibility()

> **setInitialVisibility**(`totalNodeCount`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:89](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L89)

#### Parameters

##### totalNodeCount

`number`

#### Returns

`void`

***

### setSearchQuery()

> **setSearchQuery**(`query`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:73](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L73)

#### Parameters

##### query

`string`

#### Returns

`void`

***

### showAllEdgeKinds()

> **showAllEdgeKinds**(): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:98](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L98)

#### Returns

`void`

***

### showAllNodeKinds()

> **showAllNodeKinds**(): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:97](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L97)

#### Returns

`void`

***

### showAllNodes()

> **showAllNodes**(): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:108](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L108)

Unhide all nodes (reset hiddenNodeIds).

#### Returns

`void`

***

### showOnly()

> **showOnly**(`nodeIds`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:106](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L106)

Hide all nodes except the given set.

#### Parameters

##### nodeIds

`Set`\<`string`\>

#### Returns

`void`

***

### toggleDetailPanel()

> **toggleDetailPanel**(): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:75](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L75)

#### Returns

`void`

***

### toggleEdgeKind()

> **toggleEdgeKind**(`kind`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:96](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L96)

#### Parameters

##### kind

[`EdgeKind`](../type-aliases/EdgeKind.md)

#### Returns

`void`

***

### toggleExplorer()

> **toggleExplorer**(): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:90](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L90)

#### Returns

`void`

***

### toggleNamespace()

> **toggleNamespace**(`namespace`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:85](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L85)

#### Parameters

##### namespace

`string`

#### Returns

`void`

***

### toggleNodeKind()

> **toggleNodeKind**(`kind`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:95](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L95)

#### Parameters

##### kind

[`TypeKind`](../type-aliases/TypeKind.md)

#### Returns

`void`

***

### toggleNodeVisibility()

> **toggleNodeVisibility**(`nodeId`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:86](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L86)

#### Parameters

##### nodeId

`string`

#### Returns

`void`

***

### updateAttribute()

> **updateAttribute**(`nodeId`, `oldName`, `newName`, `typeName`, `cardinality`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:116](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L116)

#### Parameters

##### nodeId

`string`

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

***

### updateCardinality()

> **updateCardinality**(`nodeId`, `attrName`, `cardinality`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:124](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L124)

#### Parameters

##### nodeId

`string`

##### attrName

`string`

##### cardinality

`string`

#### Returns

`void`

***

### updateComments()

> **updateComments**(`nodeId`, `comments`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:169](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L169)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:156](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L156)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:168](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L168)

#### Parameters

##### nodeId

`string`

##### definition

`string`

#### Returns

`void`

***

### updateEnumValue()

> **updateEnumValue**(`nodeId`, `oldName`, `newName`, `displayName?`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:131](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L131)

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

### updateExpression()

> **updateExpression**(`nodeId`, `expressionText`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:143](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L143)

#### Parameters

##### nodeId

`string`

##### expressionText

`string`

#### Returns

`void`

***

### updateOutputType()

> **updateOutputType**(`nodeId`, `typeName`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:142](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L142)

#### Parameters

##### nodeId

`string`

##### typeName

`string`

#### Returns

`void`

***

### validate()

> **validate**(): [`ValidationError`](ValidationError.md)[]

Defined in: [packages/visual-editor/src/store/editor-store.ts:126](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/store/editor-store.ts#L126)

#### Returns

[`ValidationError`](ValidationError.md)[]
