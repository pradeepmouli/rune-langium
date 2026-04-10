[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / EditorActions

# Interface: EditorActions

Defined in: [packages/visual-editor/src/store/editor-store.ts:70](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L70)

## Methods

### addAnnotation()

> **addAnnotation**(`nodeId`, `annotationName`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:177](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L177)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:117](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L117)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:139](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L139)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:149](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L149)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:132](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L132)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:143](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L143)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:173](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L173)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:182](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L182)

#### Parameters

##### changes

`EdgeChange`\<[`TypeGraphEdge`](../type-aliases/TypeGraphEdge.md)\>[]

#### Returns

`void`

***

### applyReactFlowNodeChanges()

> **applyReactFlowNodeChanges**(`changes`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:181](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L181)

#### Parameters

##### changes

`NodeChange`\<[`TypeGraphNode`](../type-aliases/TypeGraphNode.md)\>[]

#### Returns

`void`

***

### collapseAllNamespaces()

> **collapseAllNamespaces**(): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:91](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L91)

#### Returns

`void`

***

### createType()

> **createType**(`kind`, `name`, `namespace`): `string`

Defined in: [packages/visual-editor/src/store/editor-store.ts:114](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L114)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:115](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L115)

#### Parameters

##### nodeId

`string`

#### Returns

`void`

***

### expandAllNamespaces()

> **expandAllNamespaces**(): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:90](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L90)

#### Returns

`void`

***

### getEdges()

> **getEdges**(): [`TypeGraphEdge`](../type-aliases/TypeGraphEdge.md)[]

Defined in: [packages/visual-editor/src/store/editor-store.ts:85](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L85)

#### Returns

[`TypeGraphEdge`](../type-aliases/TypeGraphEdge.md)[]

***

### getNodes()

> **getNodes**(): [`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

Defined in: [packages/visual-editor/src/store/editor-store.ts:84](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L84)

#### Returns

[`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

***

### getVisibleEdges()

> **getVisibleEdges**(): [`TypeGraphEdge`](../type-aliases/TypeGraphEdge.md)[]

Defined in: [packages/visual-editor/src/store/editor-store.ts:95](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L95)

#### Returns

[`TypeGraphEdge`](../type-aliases/TypeGraphEdge.md)[]

***

### getVisibleNodes()

> **getVisibleNodes**(): [`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

Defined in: [packages/visual-editor/src/store/editor-store.ts:94](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L94)

#### Returns

[`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

***

### isolateNode()

> **isolateNode**(`nodeId`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:105](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L105)

Hide all nodes except the given node and its directly connected neighbors.

#### Parameters

##### nodeId

`string`

#### Returns

`void`

***

### loadModels()

> **loadModels**(`models`, `layoutOpts?`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:72](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L72)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:81](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L81)

#### Parameters

##### options?

[`LayoutOptions`](LayoutOptions.md)

#### Returns

`void`

***

### removeAnnotation()

> **removeAnnotation**(`nodeId`, `index`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:178](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L178)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:118](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L118)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:140](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L140)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:158](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L158)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:133](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L133)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:144](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L144)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:174](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L174)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:116](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L116)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:126](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L126)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:168](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L168)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:135](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L135)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:107](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L107)

Unhide the direct neighbors of a node (expand their namespaces too).

#### Parameters

##### nodeId

`string`

#### Returns

`void`

***

### selectNode()

> **selectNode**(`nodeId`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:75](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L75)

#### Parameters

##### nodeId

`string` \| `null`

#### Returns

`void`

***

### setEnumParent()

> **setEnumParent**(`nodeId`, `parentId`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:136](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L136)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:77](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L77)

#### Parameters

##### filters

[`GraphFilters`](GraphFilters.md)

#### Returns

`void`

***

### setInheritance()

> **setInheritance**(`childId`, `parentId`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:128](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L128)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:92](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L92)

#### Parameters

##### totalNodeCount

`number`

#### Returns

`void`

***

### setSearchQuery()

> **setSearchQuery**(`query`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:76](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L76)

#### Parameters

##### query

`string`

#### Returns

`void`

***

### showAllEdgeKinds()

> **showAllEdgeKinds**(): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:101](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L101)

#### Returns

`void`

***

### showAllNodeKinds()

> **showAllNodeKinds**(): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:100](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L100)

#### Returns

`void`

***

### showAllNodes()

> **showAllNodes**(): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:111](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L111)

Unhide all nodes (reset hiddenNodeIds).

#### Returns

`void`

***

### showOnly()

> **showOnly**(`nodeIds`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:109](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L109)

Hide all nodes except the given set.

#### Parameters

##### nodeIds

`Set`\<`string`\>

#### Returns

`void`

***

### toggleDetailPanel()

> **toggleDetailPanel**(): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:78](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L78)

#### Returns

`void`

***

### toggleEdgeKind()

> **toggleEdgeKind**(`kind`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:99](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L99)

#### Parameters

##### kind

[`EdgeKind`](../type-aliases/EdgeKind.md)

#### Returns

`void`

***

### toggleExplorer()

> **toggleExplorer**(): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:93](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L93)

#### Returns

`void`

***

### toggleNamespace()

> **toggleNamespace**(`namespace`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:88](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L88)

#### Parameters

##### namespace

`string`

#### Returns

`void`

***

### toggleNodeKind()

> **toggleNodeKind**(`kind`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:98](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L98)

#### Parameters

##### kind

[`TypeKind`](../type-aliases/TypeKind.md)

#### Returns

`void`

***

### toggleNodeVisibility()

> **toggleNodeVisibility**(`nodeId`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:89](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L89)

#### Parameters

##### nodeId

`string`

#### Returns

`void`

***

### updateAttribute()

> **updateAttribute**(`nodeId`, `oldName`, `newName`, `typeName`, `cardinality`): `void`

Defined in: [packages/visual-editor/src/store/editor-store.ts:119](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L119)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:127](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L127)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:172](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L172)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:159](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L159)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:171](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L171)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:134](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L134)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:146](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L146)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:145](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L145)

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

Defined in: [packages/visual-editor/src/store/editor-store.ts:129](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/store/editor-store.ts#L129)

#### Returns

[`ValidationError`](ValidationError.md)[]
