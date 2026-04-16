# Functions

## ast

### `isAnnotation`
```ts
isAnnotation(item: unknown): item is Annotation
```
**Parameters:**
- `item: unknown`
**Returns:** `item is Annotation`

### `isAnnotationDeepPath`
```ts
isAnnotationDeepPath(item: unknown): item is AnnotationDeepPath
```
**Parameters:**
- `item: unknown`
**Returns:** `item is AnnotationDeepPath`

### `isAnnotationPath`
```ts
isAnnotationPath(item: unknown): item is AnnotationPath
```
**Parameters:**
- `item: unknown`
**Returns:** `item is AnnotationPath`

### `isAnnotationPathAttributeReference`
```ts
isAnnotationPathAttributeReference(item: unknown): item is AnnotationPathAttributeReference
```
**Parameters:**
- `item: unknown`
**Returns:** `item is AnnotationPathAttributeReference`

### `isAnnotationPathExpression`
```ts
isAnnotationPathExpression(item: unknown): item is AnnotationPathExpression
```
**Parameters:**
- `item: unknown`
**Returns:** `item is AnnotationPathExpression`

### `isAnnotationQualifier`
```ts
isAnnotationQualifier(item: unknown): item is AnnotationQualifier
```
**Parameters:**
- `item: unknown`
**Returns:** `item is AnnotationQualifier`

### `isAnnotationRef`
```ts
isAnnotationRef(item: unknown): item is AnnotationRef
```
**Parameters:**
- `item: unknown`
**Returns:** `item is AnnotationRef`

### `isArithmeticOperation`
```ts
isArithmeticOperation(item: unknown): item is ArithmeticOperation
```
**Parameters:**
- `item: unknown`
**Returns:** `item is ArithmeticOperation`

### `isAsKeyOperation`
```ts
isAsKeyOperation(item: unknown): item is AsKeyOperation
```
**Parameters:**
- `item: unknown`
**Returns:** `item is AsKeyOperation`

### `isAssignPathRoot`
```ts
isAssignPathRoot(item: unknown): item is AssignPathRoot
```
**Parameters:**
- `item: unknown`
**Returns:** `item is AssignPathRoot`

### `isAttribute`
```ts
isAttribute(item: unknown): item is Attribute
```
**Parameters:**
- `item: unknown`
**Returns:** `item is Attribute`

### `isAttributeOrChoiceOption`
```ts
isAttributeOrChoiceOption(item: unknown): item is AttributeOrChoiceOption
```
**Parameters:**
- `item: unknown`
**Returns:** `item is AttributeOrChoiceOption`

### `isBigDecimal`
```ts
isBigDecimal(item: unknown): item is string
```
**Parameters:**
- `item: unknown`
**Returns:** `item is string`

### `isCardinalityModifier`
```ts
isCardinalityModifier(item: unknown): item is CardinalityModifier
```
**Parameters:**
- `item: unknown`
**Returns:** `item is CardinalityModifier`

### `isChoice`
```ts
isChoice(item: unknown): item is Choice
```
**Parameters:**
- `item: unknown`
**Returns:** `item is Choice`

### `isChoiceOperation`
```ts
isChoiceOperation(item: unknown): item is ChoiceOperation
```
**Parameters:**
- `item: unknown`
**Returns:** `item is ChoiceOperation`

### `isChoiceOption`
```ts
isChoiceOption(item: unknown): item is ChoiceOption
```
**Parameters:**
- `item: unknown`
**Returns:** `item is ChoiceOption`

### `isClosureParameter`
```ts
isClosureParameter(item: unknown): item is ClosureParameter
```
**Parameters:**
- `item: unknown`
**Returns:** `item is ClosureParameter`

### `isComparisonOperation`
```ts
isComparisonOperation(item: unknown): item is ComparisonOperation
```
**Parameters:**
- `item: unknown`
**Returns:** `item is ComparisonOperation`

### `isCondition`
```ts
isCondition(item: unknown): item is Condition
```
**Parameters:**
- `item: unknown`
**Returns:** `item is Condition`

### `isConstructorKeyValuePair`
```ts
isConstructorKeyValuePair(item: unknown): item is ConstructorKeyValuePair
```
**Parameters:**
- `item: unknown`
**Returns:** `item is ConstructorKeyValuePair`

### `isData`
```ts
isData(item: unknown): item is Data
```
**Parameters:**
- `item: unknown`
**Returns:** `item is Data`

### `isDataOrChoice`
```ts
isDataOrChoice(item: unknown): item is DataOrChoice
```
**Parameters:**
- `item: unknown`
**Returns:** `item is DataOrChoice`

### `isDefaultOperation`
```ts
isDefaultOperation(item: unknown): item is DefaultOperation
```
**Parameters:**
- `item: unknown`
**Returns:** `item is DefaultOperation`

### `isDistinctOperation`
```ts
isDistinctOperation(item: unknown): item is DistinctOperation
```
**Parameters:**
- `item: unknown`
**Returns:** `item is DistinctOperation`

### `isDocumentRationale`
```ts
isDocumentRationale(item: unknown): item is DocumentRationale
```
**Parameters:**
- `item: unknown`
**Returns:** `item is DocumentRationale`

### `isEqualityOperation`
```ts
isEqualityOperation(item: unknown): item is EqualityOperation
```
**Parameters:**
- `item: unknown`
**Returns:** `item is EqualityOperation`

### `isExistsModifier`
```ts
isExistsModifier(item: unknown): item is ExistsModifier
```
**Parameters:**
- `item: unknown`
**Returns:** `item is ExistsModifier`

### `isExternalValueOperator`
```ts
isExternalValueOperator(item: unknown): item is ExternalValueOperator
```
**Parameters:**
- `item: unknown`
**Returns:** `item is ExternalValueOperator`

### `isFilterOperation`
```ts
isFilterOperation(item: unknown): item is FilterOperation
```
**Parameters:**
- `item: unknown`
**Returns:** `item is FilterOperation`

### `isFirstOperation`
```ts
isFirstOperation(item: unknown): item is FirstOperation
```
**Parameters:**
- `item: unknown`
**Returns:** `item is FirstOperation`

### `isFlattenOperation`
```ts
isFlattenOperation(item: unknown): item is FlattenOperation
```
**Parameters:**
- `item: unknown`
**Returns:** `item is FlattenOperation`

### `isImport`
```ts
isImport(item: unknown): item is Import
```
**Parameters:**
- `item: unknown`
**Returns:** `item is Import`

### `isInlineFunction`
```ts
isInlineFunction(item: unknown): item is InlineFunction
```
**Parameters:**
- `item: unknown`
**Returns:** `item is InlineFunction`

### `isInteger`
```ts
isInteger(item: unknown): item is bigint
```
**Parameters:**
- `item: unknown`
**Returns:** `item is bigint`

### `isJoinOperation`
```ts
isJoinOperation(item: unknown): item is JoinOperation
```
**Parameters:**
- `item: unknown`
**Returns:** `item is JoinOperation`

### `isLabelAnnotation`
```ts
isLabelAnnotation(item: unknown): item is LabelAnnotation
```
**Parameters:**
- `item: unknown`
**Returns:** `item is LabelAnnotation`

### `isLastOperation`
```ts
isLastOperation(item: unknown): item is LastOperation
```
**Parameters:**
- `item: unknown`
**Returns:** `item is LastOperation`

### `isListLiteral`
```ts
isListLiteral(item: unknown): item is ListLiteral
```
**Parameters:**
- `item: unknown`
**Returns:** `item is ListLiteral`

### `isLogicalOperation`
```ts
isLogicalOperation(item: unknown): item is LogicalOperation
```
**Parameters:**
- `item: unknown`
**Returns:** `item is LogicalOperation`

### `isMapOperation`
```ts
isMapOperation(item: unknown): item is MapOperation
```
**Parameters:**
- `item: unknown`
**Returns:** `item is MapOperation`

### `isMaxOperation`
```ts
isMaxOperation(item: unknown): item is MaxOperation
```
**Parameters:**
- `item: unknown`
**Returns:** `item is MaxOperation`

### `isMinOperation`
```ts
isMinOperation(item: unknown): item is MinOperation
```
**Parameters:**
- `item: unknown`
**Returns:** `item is MinOperation`

### `isNecessity`
```ts
isNecessity(item: unknown): item is Necessity
```
**Parameters:**
- `item: unknown`
**Returns:** `item is Necessity`

### `isOneOfOperation`
```ts
isOneOfOperation(item: unknown): item is OneOfOperation
```
**Parameters:**
- `item: unknown`
**Returns:** `item is OneOfOperation`

### `isOperation`
```ts
isOperation(item: unknown): item is Operation
```
**Parameters:**
- `item: unknown`
**Returns:** `item is Operation`

### `isQualifiedName`
```ts
isQualifiedName(item: unknown): item is string
```
**Parameters:**
- `item: unknown`
**Returns:** `item is string`

### `isQualifiedNameWithWildcard`
```ts
isQualifiedNameWithWildcard(item: unknown): item is string
```
**Parameters:**
- `item: unknown`
**Returns:** `item is string`

### `isReduceOperation`
```ts
isReduceOperation(item: unknown): item is ReduceOperation
```
**Parameters:**
- `item: unknown`
**Returns:** `item is ReduceOperation`

### `isRegulatoryDocumentReference`
```ts
isRegulatoryDocumentReference(item: unknown): item is RegulatoryDocumentReference
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RegulatoryDocumentReference`

### `isReverseOperation`
```ts
isReverseOperation(item: unknown): item is ReverseOperation
```
**Parameters:**
- `item: unknown`
**Returns:** `item is ReverseOperation`

### `isRosettaAbsentExpression`
```ts
isRosettaAbsentExpression(item: unknown): item is RosettaAbsentExpression
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaAbsentExpression`

### `isRosettaAttributeReference`
```ts
isRosettaAttributeReference(item: unknown): item is RosettaAttributeReference
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaAttributeReference`

### `isRosettaBasicType`
```ts
isRosettaBasicType(item: unknown): item is RosettaBasicType
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaBasicType`

### `isRosettaBody`
```ts
isRosettaBody(item: unknown): item is RosettaBody
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaBody`

### `isRosettaBooleanLiteral`
```ts
isRosettaBooleanLiteral(item: unknown): item is RosettaBooleanLiteral
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaBooleanLiteral`

### `isRosettaCallableWithArgs`
```ts
isRosettaCallableWithArgs(item: unknown): item is RosettaCallableWithArgs
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaCallableWithArgs`

### `isRosettaCardinality`
```ts
isRosettaCardinality(item: unknown): item is RosettaCardinality
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaCardinality`

### `isRosettaClassSynonym`
```ts
isRosettaClassSynonym(item: unknown): item is RosettaClassSynonym
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaClassSynonym`

### `isRosettaConditionalExpression`
```ts
isRosettaConditionalExpression(item: unknown): item is RosettaConditionalExpression
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaConditionalExpression`

### `isRosettaConstructorExpression`
```ts
isRosettaConstructorExpression(item: unknown): item is RosettaConstructorExpression
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaConstructorExpression`

### `isRosettaContainsExpression`
```ts
isRosettaContainsExpression(item: unknown): item is RosettaContainsExpression
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaContainsExpression`

### `isRosettaCorpus`
```ts
isRosettaCorpus(item: unknown): item is RosettaCorpus
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaCorpus`

### `isRosettaCountOperation`
```ts
isRosettaCountOperation(item: unknown): item is RosettaCountOperation
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaCountOperation`

### `isRosettaDataReference`
```ts
isRosettaDataReference(item: unknown): item is RosettaDataReference
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaDataReference`

### `isRosettaDeepFeatureCall`
```ts
isRosettaDeepFeatureCall(item: unknown): item is RosettaDeepFeatureCall
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaDeepFeatureCall`

### `isRosettaDisjointExpression`
```ts
isRosettaDisjointExpression(item: unknown): item is RosettaDisjointExpression
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaDisjointExpression`

### `isRosettaDocReference`
```ts
isRosettaDocReference(item: unknown): item is RosettaDocReference
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaDocReference`

### `isRosettaEnumeration`
```ts
isRosettaEnumeration(item: unknown): item is RosettaEnumeration
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaEnumeration`

### `isRosettaEnumSynonym`
```ts
isRosettaEnumSynonym(item: unknown): item is RosettaEnumSynonym
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaEnumSynonym`

### `isRosettaEnumValue`
```ts
isRosettaEnumValue(item: unknown): item is RosettaEnumValue
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaEnumValue`

### `isRosettaEnumValueReference`
```ts
isRosettaEnumValueReference(item: unknown): item is RosettaEnumValueReference
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaEnumValueReference`

### `isRosettaExistsExpression`
```ts
isRosettaExistsExpression(item: unknown): item is RosettaExistsExpression
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaExistsExpression`

### `isRosettaExpression`
```ts
isRosettaExpression(item: unknown): item is RosettaExpression
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaExpression`

### `isRosettaExternalClass`
```ts
isRosettaExternalClass(item: unknown): item is RosettaExternalClass
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaExternalClass`

### `isRosettaExternalClassSynonym`
```ts
isRosettaExternalClassSynonym(item: unknown): item is RosettaExternalClassSynonym
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaExternalClassSynonym`

### `isRosettaExternalEnum`
```ts
isRosettaExternalEnum(item: unknown): item is RosettaExternalEnum
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaExternalEnum`

### `isRosettaExternalEnumValue`
```ts
isRosettaExternalEnumValue(item: unknown): item is RosettaExternalEnumValue
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaExternalEnumValue`

### `isRosettaExternalFunction`
```ts
isRosettaExternalFunction(item: unknown): item is RosettaExternalFunction
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaExternalFunction`

### `isRosettaExternalRegularAttribute`
```ts
isRosettaExternalRegularAttribute(item: unknown): item is RosettaExternalRegularAttribute
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaExternalRegularAttribute`

### `isRosettaExternalRuleSource`
```ts
isRosettaExternalRuleSource(item: unknown): item is RosettaExternalRuleSource
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaExternalRuleSource`

### `isRosettaExternalSynonym`
```ts
isRosettaExternalSynonym(item: unknown): item is RosettaExternalSynonym
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaExternalSynonym`

### `isRosettaFeature`
```ts
isRosettaFeature(item: unknown): item is RosettaFeature
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaFeature`

### `isRosettaFeatureCall`
```ts
isRosettaFeatureCall(item: unknown): item is RosettaFeatureCall
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaFeatureCall`

### `isRosettaFunction`
```ts
isRosettaFunction(item: unknown): item is RosettaFunction
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaFunction`

### `isRosettaImplicitVariable`
```ts
isRosettaImplicitVariable(item: unknown): item is RosettaImplicitVariable
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaImplicitVariable`

### `isRosettaIntLiteral`
```ts
isRosettaIntLiteral(item: unknown): item is RosettaIntLiteral
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaIntLiteral`

### `isRosettaLiteral`
```ts
isRosettaLiteral(item: unknown): item is RosettaLiteral
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaLiteral`

### `isRosettaMapPath`
```ts
isRosettaMapPath(item: unknown): item is RosettaMapPath
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaMapPath`

### `isRosettaMapPathValue`
```ts
isRosettaMapPathValue(item: unknown): item is RosettaMapPathValue
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaMapPathValue`

### `isRosettaMapping`
```ts
isRosettaMapping(item: unknown): item is RosettaMapping
```
**Parameters:**
- `item: unknown`
**Returns:** `item is RosettaMapping`

### `isRosettaMappingInstance`
```ts

<!-- truncated -->
