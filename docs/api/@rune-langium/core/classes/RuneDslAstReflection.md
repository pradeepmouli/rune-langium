[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / RuneDslAstReflection

# Class: RuneDslAstReflection

Defined in: [packages/core/src/generated/ast.ts:5951](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/core/src/generated/ast.ts#L5951)

## Extends

- `AbstractAstReflection`

## Constructors

### Constructor

> **new RuneDslAstReflection**(): `RuneDslAstReflection`

#### Returns

`RuneDslAstReflection`

#### Inherited from

`langium.AbstractAstReflection.constructor`

## Properties

### allSubtypes

> `protected` **allSubtypes**: `Record`\<`string`, `string`[] \| `undefined`\>

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/syntax-tree.d.ts:149

#### Inherited from

`langium.AbstractAstReflection.allSubtypes`

***

### subtypes

> `protected` **subtypes**: `Record`\<`string`, `Record`\<`string`, `boolean` \| `undefined`\>\>

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/syntax-tree.d.ts:148

#### Inherited from

`langium.AbstractAstReflection.subtypes`

***

### types

> `readonly` **types**: `object`

Defined in: [packages/core/src/generated/ast.ts:5952](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/core/src/generated/ast.ts#L5952)

#### Annotation

> `readonly` **Annotation**: `object`

##### Annotation.name

> `readonly` **name**: `"Annotation"` = `Annotation.$type`

##### Annotation.properties

> `readonly` **properties**: `object`

##### Annotation.properties.attributes

> `readonly` **attributes**: `object`

##### Annotation.properties.attributes.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### Annotation.properties.attributes.name

> `readonly` **name**: `"attributes"` = `Annotation.attributes`

##### Annotation.properties.definition

> `readonly` **definition**: `object`

##### Annotation.properties.definition.name

> `readonly` **name**: `"definition"` = `Annotation.definition`

##### Annotation.properties.name

> `readonly` **name**: `object`

##### Annotation.properties.name.name

> `readonly` **name**: `"name"` = `Annotation.name`

##### Annotation.properties.prefix

> `readonly` **prefix**: `object`

##### Annotation.properties.prefix.name

> `readonly` **name**: `"prefix"` = `Annotation.prefix`

##### Annotation.superTypes

> `readonly` **superTypes**: \[`"RosettaRootElement"`\]

#### AnnotationDeepPath

> `readonly` **AnnotationDeepPath**: `object`

##### AnnotationDeepPath.name

> `readonly` **name**: `"AnnotationDeepPath"` = `AnnotationDeepPath.$type`

##### AnnotationDeepPath.properties

> `readonly` **properties**: `object`

##### AnnotationDeepPath.properties.attribute

> `readonly` **attribute**: `object`

##### AnnotationDeepPath.properties.attribute.name

> `readonly` **name**: `"attribute"` = `AnnotationDeepPath.attribute`

##### AnnotationDeepPath.properties.attribute.referenceType

> `readonly` **referenceType**: `"AttributeOrChoiceOption"` = `AttributeOrChoiceOption.$type`

##### AnnotationDeepPath.properties.operator

> `readonly` **operator**: `object`

##### AnnotationDeepPath.properties.operator.name

> `readonly` **name**: `"operator"` = `AnnotationDeepPath.operator`

##### AnnotationDeepPath.properties.receiver

> `readonly` **receiver**: `object`

##### AnnotationDeepPath.properties.receiver.name

> `readonly` **name**: `"receiver"` = `AnnotationDeepPath.receiver`

##### AnnotationDeepPath.superTypes

> `readonly` **superTypes**: \[`"AnnotationPathExpression"`\]

#### AnnotationPath

> `readonly` **AnnotationPath**: `object`

##### AnnotationPath.name

> `readonly` **name**: `"AnnotationPath"` = `AnnotationPath.$type`

##### AnnotationPath.properties

> `readonly` **properties**: `object`

##### AnnotationPath.properties.attribute

> `readonly` **attribute**: `object`

##### AnnotationPath.properties.attribute.name

> `readonly` **name**: `"attribute"` = `AnnotationPath.attribute`

##### AnnotationPath.properties.attribute.referenceType

> `readonly` **referenceType**: `"AttributeOrChoiceOption"` = `AttributeOrChoiceOption.$type`

##### AnnotationPath.properties.operator

> `readonly` **operator**: `object`

##### AnnotationPath.properties.operator.name

> `readonly` **name**: `"operator"` = `AnnotationPath.operator`

##### AnnotationPath.properties.receiver

> `readonly` **receiver**: `object`

##### AnnotationPath.properties.receiver.name

> `readonly` **name**: `"receiver"` = `AnnotationPath.receiver`

##### AnnotationPath.superTypes

> `readonly` **superTypes**: \[`"AnnotationPathExpression"`\]

#### AnnotationPathAttributeReference

> `readonly` **AnnotationPathAttributeReference**: `object`

##### AnnotationPathAttributeReference.name

> `readonly` **name**: `"AnnotationPathAttributeReference"` = `AnnotationPathAttributeReference.$type`

##### AnnotationPathAttributeReference.properties

> `readonly` **properties**: `object`

##### AnnotationPathAttributeReference.properties.attribute

> `readonly` **attribute**: `object`

##### AnnotationPathAttributeReference.properties.attribute.name

> `readonly` **name**: `"attribute"` = `AnnotationPathAttributeReference.attribute`

##### AnnotationPathAttributeReference.properties.attribute.referenceType

> `readonly` **referenceType**: `"AttributeOrChoiceOption"` = `AttributeOrChoiceOption.$type`

##### AnnotationPathAttributeReference.superTypes

> `readonly` **superTypes**: \[`"AnnotationPathExpression"`\]

#### AnnotationPathExpression

> `readonly` **AnnotationPathExpression**: `object`

##### AnnotationPathExpression.name

> `readonly` **name**: `"AnnotationPathExpression"` = `AnnotationPathExpression.$type`

##### AnnotationPathExpression.properties

> `readonly` **properties**: `object` = `{}`

##### AnnotationPathExpression.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### AnnotationQualifier

> `readonly` **AnnotationQualifier**: `object`

##### AnnotationQualifier.name

> `readonly` **name**: `"AnnotationQualifier"` = `AnnotationQualifier.$type`

##### AnnotationQualifier.properties

> `readonly` **properties**: `object`

##### AnnotationQualifier.properties.qualName

> `readonly` **qualName**: `object`

##### AnnotationQualifier.properties.qualName.name

> `readonly` **name**: `"qualName"` = `AnnotationQualifier.qualName`

##### AnnotationQualifier.properties.qualPath

> `readonly` **qualPath**: `object`

##### AnnotationQualifier.properties.qualPath.name

> `readonly` **name**: `"qualPath"` = `AnnotationQualifier.qualPath`

##### AnnotationQualifier.properties.qualValue

> `readonly` **qualValue**: `object`

##### AnnotationQualifier.properties.qualValue.name

> `readonly` **name**: `"qualValue"` = `AnnotationQualifier.qualValue`

##### AnnotationQualifier.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### AnnotationRef

> `readonly` **AnnotationRef**: `object`

##### AnnotationRef.name

> `readonly` **name**: `"AnnotationRef"` = `AnnotationRef.$type`

##### AnnotationRef.properties

> `readonly` **properties**: `object`

##### AnnotationRef.properties.annotation

> `readonly` **annotation**: `object`

##### AnnotationRef.properties.annotation.name

> `readonly` **name**: `"annotation"` = `AnnotationRef.annotation`

##### AnnotationRef.properties.annotation.referenceType

> `readonly` **referenceType**: `"Annotation"` = `Annotation.$type`

##### AnnotationRef.properties.attribute

> `readonly` **attribute**: `object`

##### AnnotationRef.properties.attribute.name

> `readonly` **name**: `"attribute"` = `AnnotationRef.attribute`

##### AnnotationRef.properties.attribute.referenceType

> `readonly` **referenceType**: `"Attribute"` = `Attribute.$type`

##### AnnotationRef.properties.qualifiers

> `readonly` **qualifiers**: `object`

##### AnnotationRef.properties.qualifiers.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### AnnotationRef.properties.qualifiers.name

> `readonly` **name**: `"qualifiers"` = `AnnotationRef.qualifiers`

##### AnnotationRef.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### ArithmeticOperation

> `readonly` **ArithmeticOperation**: `object`

##### ArithmeticOperation.name

> `readonly` **name**: `"ArithmeticOperation"` = `ArithmeticOperation.$type`

##### ArithmeticOperation.properties

> `readonly` **properties**: `object`

##### ArithmeticOperation.properties.left

> `readonly` **left**: `object`

##### ArithmeticOperation.properties.left.name

> `readonly` **name**: `"left"` = `ArithmeticOperation.left`

##### ArithmeticOperation.properties.operator

> `readonly` **operator**: `object`

##### ArithmeticOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `ArithmeticOperation.operator`

##### ArithmeticOperation.properties.right

> `readonly` **right**: `object`

##### ArithmeticOperation.properties.right.name

> `readonly` **name**: `"right"` = `ArithmeticOperation.right`

##### ArithmeticOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### AsKeyOperation

> `readonly` **AsKeyOperation**: `object`

##### AsKeyOperation.name

> `readonly` **name**: `"AsKeyOperation"` = `AsKeyOperation.$type`

##### AsKeyOperation.properties

> `readonly` **properties**: `object`

##### AsKeyOperation.properties.argument

> `readonly` **argument**: `object`

##### AsKeyOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `AsKeyOperation.argument`

##### AsKeyOperation.properties.operator

> `readonly` **operator**: `object`

##### AsKeyOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `AsKeyOperation.operator`

##### AsKeyOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### AssignPathRoot

> `readonly` **AssignPathRoot**: `object`

##### AssignPathRoot.name

> `readonly` **name**: `"AssignPathRoot"` = `AssignPathRoot.$type`

##### AssignPathRoot.properties

> `readonly` **properties**: `object` = `{}`

##### AssignPathRoot.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### Attribute

> `readonly` **Attribute**: `object`

##### Attribute.name

> `readonly` **name**: `"Attribute"` = `Attribute.$type`

##### Attribute.properties

> `readonly` **properties**: `object`

##### Attribute.properties.annotations

> `readonly` **annotations**: `object`

##### Attribute.properties.annotations.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### Attribute.properties.annotations.name

> `readonly` **name**: `"annotations"` = `Attribute.annotations`

##### Attribute.properties.card

> `readonly` **card**: `object`

##### Attribute.properties.card.name

> `readonly` **name**: `"card"` = `Attribute.card`

##### Attribute.properties.definition

> `readonly` **definition**: `object`

##### Attribute.properties.definition.name

> `readonly` **name**: `"definition"` = `Attribute.definition`

##### Attribute.properties.labels

> `readonly` **labels**: `object`

##### Attribute.properties.labels.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### Attribute.properties.labels.name

> `readonly` **name**: `"labels"` = `Attribute.labels`

##### Attribute.properties.name

> `readonly` **name**: `object`

##### Attribute.properties.name.name

> `readonly` **name**: `"name"` = `Attribute.name`

##### Attribute.properties.override

> `readonly` **override**: `object`

##### Attribute.properties.override.defaultValue

> `readonly` **defaultValue**: `false` = `false`

##### Attribute.properties.override.name

> `readonly` **name**: `"override"` = `Attribute.override`

##### Attribute.properties.references

> `readonly` **references**: `object`

##### Attribute.properties.references.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### Attribute.properties.references.name

> `readonly` **name**: `"references"` = `Attribute.references`

##### Attribute.properties.ruleReferences

> `readonly` **ruleReferences**: `object`

##### Attribute.properties.ruleReferences.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### Attribute.properties.ruleReferences.name

> `readonly` **name**: `"ruleReferences"` = `Attribute.ruleReferences`

##### Attribute.properties.synonyms

> `readonly` **synonyms**: `object`

##### Attribute.properties.synonyms.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### Attribute.properties.synonyms.name

> `readonly` **name**: `"synonyms"` = `Attribute.synonyms`

##### Attribute.properties.typeCall

> `readonly` **typeCall**: `object`

##### Attribute.properties.typeCall.name

> `readonly` **name**: `"typeCall"` = `Attribute.typeCall`

##### Attribute.properties.typeCallArgs

> `readonly` **typeCallArgs**: `object`

##### Attribute.properties.typeCallArgs.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### Attribute.properties.typeCallArgs.name

> `readonly` **name**: `"typeCallArgs"` = `Attribute.typeCallArgs`

##### Attribute.superTypes

> `readonly` **superTypes**: \[`"AssignPathRoot"`, `"AttributeOrChoiceOption"`, `"RosettaFeature"`, `"RosettaSymbol"`, `"RosettaTypedFeature"`\]

#### AttributeOrChoiceOption

> `readonly` **AttributeOrChoiceOption**: `object`

##### AttributeOrChoiceOption.name

> `readonly` **name**: `"AttributeOrChoiceOption"` = `AttributeOrChoiceOption.$type`

##### AttributeOrChoiceOption.properties

> `readonly` **properties**: `object` = `{}`

##### AttributeOrChoiceOption.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### Choice

> `readonly` **Choice**: `object`

##### Choice.name

> `readonly` **name**: `"Choice"` = `Choice.$type`

##### Choice.properties

> `readonly` **properties**: `object`

##### Choice.properties.annotations

> `readonly` **annotations**: `object`

##### Choice.properties.annotations.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### Choice.properties.annotations.name

> `readonly` **name**: `"annotations"` = `Choice.annotations`

##### Choice.properties.attributes

> `readonly` **attributes**: `object`

##### Choice.properties.attributes.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### Choice.properties.attributes.name

> `readonly` **name**: `"attributes"` = `Choice.attributes`

##### Choice.properties.definition

> `readonly` **definition**: `object`

##### Choice.properties.definition.name

> `readonly` **name**: `"definition"` = `Choice.definition`

##### Choice.properties.name

> `readonly` **name**: `object`

##### Choice.properties.name.name

> `readonly` **name**: `"name"` = `Choice.name`

##### Choice.properties.synonyms

> `readonly` **synonyms**: `object`

##### Choice.properties.synonyms.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### Choice.properties.synonyms.name

> `readonly` **name**: `"synonyms"` = `Choice.synonyms`

##### Choice.superTypes

> `readonly` **superTypes**: \[`"DataOrChoice"`, `"RosettaRootElement"`, `"RosettaSymbol"`, `"RosettaType"`, `"SwitchCaseTarget"`\]

#### ChoiceOperation

> `readonly` **ChoiceOperation**: `object`

##### ChoiceOperation.name

> `readonly` **name**: `"ChoiceOperation"` = `ChoiceOperation.$type`

##### ChoiceOperation.properties

> `readonly` **properties**: `object`

##### ChoiceOperation.properties.argument

> `readonly` **argument**: `object`

##### ChoiceOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `ChoiceOperation.argument`

##### ChoiceOperation.properties.attributes

> `readonly` **attributes**: `object`

##### ChoiceOperation.properties.attributes.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### ChoiceOperation.properties.attributes.name

> `readonly` **name**: `"attributes"` = `ChoiceOperation.attributes`

##### ChoiceOperation.properties.attributes.referenceType

> `readonly` **referenceType**: `"Attribute"` = `Attribute.$type`

##### ChoiceOperation.properties.necessity

> `readonly` **necessity**: `object`

##### ChoiceOperation.properties.necessity.name

> `readonly` **name**: `"necessity"` = `ChoiceOperation.necessity`

##### ChoiceOperation.properties.operator

> `readonly` **operator**: `object`

##### ChoiceOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `ChoiceOperation.operator`

##### ChoiceOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### ChoiceOption

> `readonly` **ChoiceOption**: `object`

##### ChoiceOption.name

> `readonly` **name**: `"ChoiceOption"` = `ChoiceOption.$type`

##### ChoiceOption.properties

> `readonly` **properties**: `object`

##### ChoiceOption.properties.annotations

> `readonly` **annotations**: `object`

##### ChoiceOption.properties.annotations.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### ChoiceOption.properties.annotations.name

> `readonly` **name**: `"annotations"` = `ChoiceOption.annotations`

##### ChoiceOption.properties.definition

> `readonly` **definition**: `object`

##### ChoiceOption.properties.definition.name

> `readonly` **name**: `"definition"` = `ChoiceOption.definition`

##### ChoiceOption.properties.labels

> `readonly` **labels**: `object`

##### ChoiceOption.properties.labels.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### ChoiceOption.properties.labels.name

> `readonly` **name**: `"labels"` = `ChoiceOption.labels`

##### ChoiceOption.properties.references

> `readonly` **references**: `object`

##### ChoiceOption.properties.references.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### ChoiceOption.properties.references.name

> `readonly` **name**: `"references"` = `ChoiceOption.references`

##### ChoiceOption.properties.ruleReferences

> `readonly` **ruleReferences**: `object`

##### ChoiceOption.properties.ruleReferences.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### ChoiceOption.properties.ruleReferences.name

> `readonly` **name**: `"ruleReferences"` = `ChoiceOption.ruleReferences`

##### ChoiceOption.properties.synonyms

> `readonly` **synonyms**: `object`

##### ChoiceOption.properties.synonyms.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### ChoiceOption.properties.synonyms.name

> `readonly` **name**: `"synonyms"` = `ChoiceOption.synonyms`

##### ChoiceOption.properties.typeCall

> `readonly` **typeCall**: `object`

##### ChoiceOption.properties.typeCall.name

> `readonly` **name**: `"typeCall"` = `ChoiceOption.typeCall`

##### ChoiceOption.superTypes

> `readonly` **superTypes**: \[`"AttributeOrChoiceOption"`, `"RosettaFeature"`\]

#### ClosureParameter

> `readonly` **ClosureParameter**: `object`

##### ClosureParameter.name

> `readonly` **name**: `"ClosureParameter"` = `ClosureParameter.$type`

##### ClosureParameter.properties

> `readonly` **properties**: `object`

##### ClosureParameter.properties.name

> `readonly` **name**: `object`

##### ClosureParameter.properties.name.name

> `readonly` **name**: `"name"` = `ClosureParameter.name`

##### ClosureParameter.superTypes

> `readonly` **superTypes**: \[`"RosettaSymbol"`\]

#### ComparisonOperation

> `readonly` **ComparisonOperation**: `object`

##### ComparisonOperation.name

> `readonly` **name**: `"ComparisonOperation"` = `ComparisonOperation.$type`

##### ComparisonOperation.properties

> `readonly` **properties**: `object`

##### ComparisonOperation.properties.cardMod

> `readonly` **cardMod**: `object`

##### ComparisonOperation.properties.cardMod.name

> `readonly` **name**: `"cardMod"` = `ComparisonOperation.cardMod`

##### ComparisonOperation.properties.left

> `readonly` **left**: `object`

##### ComparisonOperation.properties.left.name

> `readonly` **name**: `"left"` = `ComparisonOperation.left`

##### ComparisonOperation.properties.operator

> `readonly` **operator**: `object`

##### ComparisonOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `ComparisonOperation.operator`

##### ComparisonOperation.properties.right

> `readonly` **right**: `object`

##### ComparisonOperation.properties.right.name

> `readonly` **name**: `"right"` = `ComparisonOperation.right`

##### ComparisonOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### Condition

> `readonly` **Condition**: `object`

##### Condition.name

> `readonly` **name**: `"Condition"` = `Condition.$type`

##### Condition.properties

> `readonly` **properties**: `object`

##### Condition.properties.annotations

> `readonly` **annotations**: `object`

##### Condition.properties.annotations.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### Condition.properties.annotations.name

> `readonly` **name**: `"annotations"` = `Condition.annotations`

##### Condition.properties.definition

> `readonly` **definition**: `object`

##### Condition.properties.definition.name

> `readonly` **name**: `"definition"` = `Condition.definition`

##### Condition.properties.expression

> `readonly` **expression**: `object`

##### Condition.properties.expression.name

> `readonly` **name**: `"expression"` = `Condition.expression`

##### Condition.properties.name

> `readonly` **name**: `object`

##### Condition.properties.name.name

> `readonly` **name**: `"name"` = `Condition.name`

##### Condition.properties.postCondition

> `readonly` **postCondition**: `object`

##### Condition.properties.postCondition.defaultValue

> `readonly` **defaultValue**: `false` = `false`

##### Condition.properties.postCondition.name

> `readonly` **name**: `"postCondition"` = `Condition.postCondition`

##### Condition.properties.references

> `readonly` **references**: `object`

##### Condition.properties.references.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### Condition.properties.references.name

> `readonly` **name**: `"references"` = `Condition.references`

##### Condition.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### ConstructorKeyValuePair

> `readonly` **ConstructorKeyValuePair**: `object`

##### ConstructorKeyValuePair.name

> `readonly` **name**: `"ConstructorKeyValuePair"` = `ConstructorKeyValuePair.$type`

##### ConstructorKeyValuePair.properties

> `readonly` **properties**: `object`

##### ConstructorKeyValuePair.properties.key

> `readonly` **key**: `object`

##### ConstructorKeyValuePair.properties.key.name

> `readonly` **name**: `"key"` = `ConstructorKeyValuePair.key`

##### ConstructorKeyValuePair.properties.key.referenceType

> `readonly` **referenceType**: `"RosettaFeature"` = `RosettaFeature.$type`

##### ConstructorKeyValuePair.properties.value

> `readonly` **value**: `object`

##### ConstructorKeyValuePair.properties.value.name

> `readonly` **name**: `"value"` = `ConstructorKeyValuePair.value`

##### ConstructorKeyValuePair.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### Data

> `readonly` **Data**: `object`

##### Data.name

> `readonly` **name**: `"Data"` = `Data.$type`

##### Data.properties

> `readonly` **properties**: `object`

##### Data.properties.annotations

> `readonly` **annotations**: `object`

##### Data.properties.annotations.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### Data.properties.annotations.name

> `readonly` **name**: `"annotations"` = `Data.annotations`

##### Data.properties.attributes

> `readonly` **attributes**: `object`

##### Data.properties.attributes.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### Data.properties.attributes.name

> `readonly` **name**: `"attributes"` = `Data.attributes`

##### Data.properties.conditions

> `readonly` **conditions**: `object`

##### Data.properties.conditions.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### Data.properties.conditions.name

> `readonly` **name**: `"conditions"` = `Data.conditions`

##### Data.properties.definition

> `readonly` **definition**: `object`

##### Data.properties.definition.name

> `readonly` **name**: `"definition"` = `Data.definition`

##### Data.properties.name

> `readonly` **name**: `object`

##### Data.properties.name.name

> `readonly` **name**: `"name"` = `Data.name`

##### Data.properties.references

> `readonly` **references**: `object`

##### Data.properties.references.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### Data.properties.references.name

> `readonly` **name**: `"references"` = `Data.references`

##### Data.properties.superType

> `readonly` **superType**: `object`

##### Data.properties.superType.name

> `readonly` **name**: `"superType"` = `Data.superType`

##### Data.properties.superType.referenceType

> `readonly` **referenceType**: `"DataOrChoice"` = `DataOrChoice.$type`

##### Data.properties.synonyms

> `readonly` **synonyms**: `object`

##### Data.properties.synonyms.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### Data.properties.synonyms.name

> `readonly` **name**: `"synonyms"` = `Data.synonyms`

##### Data.superTypes

> `readonly` **superTypes**: \[`"DataOrChoice"`, `"RosettaRootElement"`, `"RosettaSymbol"`, `"RosettaType"`, `"SwitchCaseTarget"`\]

#### DataOrChoice

> `readonly` **DataOrChoice**: `object`

##### DataOrChoice.name

> `readonly` **name**: `"DataOrChoice"` = `DataOrChoice.$type`

##### DataOrChoice.properties

> `readonly` **properties**: `object` = `{}`

##### DataOrChoice.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### DefaultOperation

> `readonly` **DefaultOperation**: `object`

##### DefaultOperation.name

> `readonly` **name**: `"DefaultOperation"` = `DefaultOperation.$type`

##### DefaultOperation.properties

> `readonly` **properties**: `object`

##### DefaultOperation.properties.left

> `readonly` **left**: `object`

##### DefaultOperation.properties.left.name

> `readonly` **name**: `"left"` = `DefaultOperation.left`

##### DefaultOperation.properties.operator

> `readonly` **operator**: `object`

##### DefaultOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `DefaultOperation.operator`

##### DefaultOperation.properties.right

> `readonly` **right**: `object`

##### DefaultOperation.properties.right.name

> `readonly` **name**: `"right"` = `DefaultOperation.right`

##### DefaultOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### DistinctOperation

> `readonly` **DistinctOperation**: `object`

##### DistinctOperation.name

> `readonly` **name**: `"DistinctOperation"` = `DistinctOperation.$type`

##### DistinctOperation.properties

> `readonly` **properties**: `object`

##### DistinctOperation.properties.argument

> `readonly` **argument**: `object`

##### DistinctOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `DistinctOperation.argument`

##### DistinctOperation.properties.operator

> `readonly` **operator**: `object`

##### DistinctOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `DistinctOperation.operator`

##### DistinctOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### DocumentRationale

> `readonly` **DocumentRationale**: `object`

##### DocumentRationale.name

> `readonly` **name**: `"DocumentRationale"` = `DocumentRationale.$type`

##### DocumentRationale.properties

> `readonly` **properties**: `object`

##### DocumentRationale.properties.rationale

> `readonly` **rationale**: `object`

##### DocumentRationale.properties.rationale.name

> `readonly` **name**: `"rationale"` = `DocumentRationale.rationale`

##### DocumentRationale.properties.rationaleAuthor

> `readonly` **rationaleAuthor**: `object`

##### DocumentRationale.properties.rationaleAuthor.name

> `readonly` **name**: `"rationaleAuthor"` = `DocumentRationale.rationaleAuthor`

##### DocumentRationale.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### EqualityOperation

> `readonly` **EqualityOperation**: `object`

##### EqualityOperation.name

> `readonly` **name**: `"EqualityOperation"` = `EqualityOperation.$type`

##### EqualityOperation.properties

> `readonly` **properties**: `object`

##### EqualityOperation.properties.cardMod

> `readonly` **cardMod**: `object`

##### EqualityOperation.properties.cardMod.name

> `readonly` **name**: `"cardMod"` = `EqualityOperation.cardMod`

##### EqualityOperation.properties.left

> `readonly` **left**: `object`

##### EqualityOperation.properties.left.name

> `readonly` **name**: `"left"` = `EqualityOperation.left`

##### EqualityOperation.properties.operator

> `readonly` **operator**: `object`

##### EqualityOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `EqualityOperation.operator`

##### EqualityOperation.properties.right

> `readonly` **right**: `object`

##### EqualityOperation.properties.right.name

> `readonly` **name**: `"right"` = `EqualityOperation.right`

##### EqualityOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### FilterOperation

> `readonly` **FilterOperation**: `object`

##### FilterOperation.name

> `readonly` **name**: `"FilterOperation"` = `FilterOperation.$type`

##### FilterOperation.properties

> `readonly` **properties**: `object`

##### FilterOperation.properties.argument

> `readonly` **argument**: `object`

##### FilterOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `FilterOperation.argument`

##### FilterOperation.properties.function

> `readonly` **function**: `object`

##### FilterOperation.properties.function.name

> `readonly` **name**: `"function"` = `FilterOperation.function`

##### FilterOperation.properties.operator

> `readonly` **operator**: `object`

##### FilterOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `FilterOperation.operator`

##### FilterOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### FirstOperation

> `readonly` **FirstOperation**: `object`

##### FirstOperation.name

> `readonly` **name**: `"FirstOperation"` = `FirstOperation.$type`

##### FirstOperation.properties

> `readonly` **properties**: `object`

##### FirstOperation.properties.argument

> `readonly` **argument**: `object`

##### FirstOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `FirstOperation.argument`

##### FirstOperation.properties.operator

> `readonly` **operator**: `object`

##### FirstOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `FirstOperation.operator`

##### FirstOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### FlattenOperation

> `readonly` **FlattenOperation**: `object`

##### FlattenOperation.name

> `readonly` **name**: `"FlattenOperation"` = `FlattenOperation.$type`

##### FlattenOperation.properties

> `readonly` **properties**: `object`

##### FlattenOperation.properties.argument

> `readonly` **argument**: `object`

##### FlattenOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `FlattenOperation.argument`

##### FlattenOperation.properties.operator

> `readonly` **operator**: `object`

##### FlattenOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `FlattenOperation.operator`

##### FlattenOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### Import

> `readonly` **Import**: `object`

##### Import.name

> `readonly` **name**: `"Import"` = `Import.$type`

##### Import.properties

> `readonly` **properties**: `object`

##### Import.properties.importedNamespace

> `readonly` **importedNamespace**: `object`

##### Import.properties.importedNamespace.name

> `readonly` **name**: `"importedNamespace"` = `Import.importedNamespace`

##### Import.properties.namespaceAlias

> `readonly` **namespaceAlias**: `object`

##### Import.properties.namespaceAlias.name

> `readonly` **name**: `"namespaceAlias"` = `Import.namespaceAlias`

##### Import.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### InlineFunction

> `readonly` **InlineFunction**: `object`

##### InlineFunction.name

> `readonly` **name**: `"InlineFunction"` = `InlineFunction.$type`

##### InlineFunction.properties

> `readonly` **properties**: `object`

##### InlineFunction.properties.body

> `readonly` **body**: `object`

##### InlineFunction.properties.body.name

> `readonly` **name**: `"body"` = `InlineFunction.body`

##### InlineFunction.properties.parameters

> `readonly` **parameters**: `object`

##### InlineFunction.properties.parameters.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### InlineFunction.properties.parameters.name

> `readonly` **name**: `"parameters"` = `InlineFunction.parameters`

##### InlineFunction.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### JoinOperation

> `readonly` **JoinOperation**: `object`

##### JoinOperation.name

> `readonly` **name**: `"JoinOperation"` = `JoinOperation.$type`

##### JoinOperation.properties

> `readonly` **properties**: `object`

##### JoinOperation.properties.left

> `readonly` **left**: `object`

##### JoinOperation.properties.left.name

> `readonly` **name**: `"left"` = `JoinOperation.left`

##### JoinOperation.properties.operator

> `readonly` **operator**: `object`

##### JoinOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `JoinOperation.operator`

##### JoinOperation.properties.right

> `readonly` **right**: `object`

##### JoinOperation.properties.right.name

> `readonly` **name**: `"right"` = `JoinOperation.right`

##### JoinOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### LabelAnnotation

> `readonly` **LabelAnnotation**: `object`

##### LabelAnnotation.name

> `readonly` **name**: `"LabelAnnotation"` = `LabelAnnotation.$type`

##### LabelAnnotation.properties

> `readonly` **properties**: `object`

##### LabelAnnotation.properties.deprecatedAs

> `readonly` **deprecatedAs**: `object`

##### LabelAnnotation.properties.deprecatedAs.defaultValue

> `readonly` **defaultValue**: `false` = `false`

##### LabelAnnotation.properties.deprecatedAs.name

> `readonly` **name**: `"deprecatedAs"` = `LabelAnnotation.deprecatedAs`

##### LabelAnnotation.properties.label

> `readonly` **label**: `object`

##### LabelAnnotation.properties.label.name

> `readonly` **name**: `"label"` = `LabelAnnotation.label`

##### LabelAnnotation.properties.name

> `readonly` **name**: `object`

##### LabelAnnotation.properties.name.name

> `readonly` **name**: `"name"` = `LabelAnnotation.name`

##### LabelAnnotation.properties.path

> `readonly` **path**: `object`

##### LabelAnnotation.properties.path.name

> `readonly` **name**: `"path"` = `LabelAnnotation.path`

##### LabelAnnotation.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### LastOperation

> `readonly` **LastOperation**: `object`

##### LastOperation.name

> `readonly` **name**: `"LastOperation"` = `LastOperation.$type`

##### LastOperation.properties

> `readonly` **properties**: `object`

##### LastOperation.properties.argument

> `readonly` **argument**: `object`

##### LastOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `LastOperation.argument`

##### LastOperation.properties.operator

> `readonly` **operator**: `object`

##### LastOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `LastOperation.operator`

##### LastOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### ListLiteral

> `readonly` **ListLiteral**: `object`

##### ListLiteral.name

> `readonly` **name**: `"ListLiteral"` = `ListLiteral.$type`

##### ListLiteral.properties

> `readonly` **properties**: `object`

##### ListLiteral.properties.elements

> `readonly` **elements**: `object`

##### ListLiteral.properties.elements.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### ListLiteral.properties.elements.name

> `readonly` **name**: `"elements"` = `ListLiteral.elements`

##### ListLiteral.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### LogicalOperation

> `readonly` **LogicalOperation**: `object`

##### LogicalOperation.name

> `readonly` **name**: `"LogicalOperation"` = `LogicalOperation.$type`

##### LogicalOperation.properties

> `readonly` **properties**: `object`

##### LogicalOperation.properties.left

> `readonly` **left**: `object`

##### LogicalOperation.properties.left.name

> `readonly` **name**: `"left"` = `LogicalOperation.left`

##### LogicalOperation.properties.operator

> `readonly` **operator**: `object`

##### LogicalOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `LogicalOperation.operator`

##### LogicalOperation.properties.right

> `readonly` **right**: `object`

##### LogicalOperation.properties.right.name

> `readonly` **name**: `"right"` = `LogicalOperation.right`

##### LogicalOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### MapOperation

> `readonly` **MapOperation**: `object`

##### MapOperation.name

> `readonly` **name**: `"MapOperation"` = `MapOperation.$type`

##### MapOperation.properties

> `readonly` **properties**: `object`

##### MapOperation.properties.argument

> `readonly` **argument**: `object`

##### MapOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `MapOperation.argument`

##### MapOperation.properties.function

> `readonly` **function**: `object`

##### MapOperation.properties.function.name

> `readonly` **name**: `"function"` = `MapOperation.function`

##### MapOperation.properties.operator

> `readonly` **operator**: `object`

##### MapOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `MapOperation.operator`

##### MapOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### MaxOperation

> `readonly` **MaxOperation**: `object`

##### MaxOperation.name

> `readonly` **name**: `"MaxOperation"` = `MaxOperation.$type`

##### MaxOperation.properties

> `readonly` **properties**: `object`

##### MaxOperation.properties.argument

> `readonly` **argument**: `object`

##### MaxOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `MaxOperation.argument`

##### MaxOperation.properties.function

> `readonly` **function**: `object`

##### MaxOperation.properties.function.name

> `readonly` **name**: `"function"` = `MaxOperation.function`

##### MaxOperation.properties.operator

> `readonly` **operator**: `object`

##### MaxOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `MaxOperation.operator`

##### MaxOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### MinOperation

> `readonly` **MinOperation**: `object`

##### MinOperation.name

> `readonly` **name**: `"MinOperation"` = `MinOperation.$type`

##### MinOperation.properties

> `readonly` **properties**: `object`

##### MinOperation.properties.argument

> `readonly` **argument**: `object`

##### MinOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `MinOperation.argument`

##### MinOperation.properties.function

> `readonly` **function**: `object`

##### MinOperation.properties.function.name

> `readonly` **name**: `"function"` = `MinOperation.function`

##### MinOperation.properties.operator

> `readonly` **operator**: `object`

##### MinOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `MinOperation.operator`

##### MinOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### OneOfOperation

> `readonly` **OneOfOperation**: `object`

##### OneOfOperation.name

> `readonly` **name**: `"OneOfOperation"` = `OneOfOperation.$type`

##### OneOfOperation.properties

> `readonly` **properties**: `object`

##### OneOfOperation.properties.argument

> `readonly` **argument**: `object`

##### OneOfOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `OneOfOperation.argument`

##### OneOfOperation.properties.operator

> `readonly` **operator**: `object`

##### OneOfOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `OneOfOperation.operator`

##### OneOfOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### Operation

> `readonly` **Operation**: `object`

##### Operation.name

> `readonly` **name**: `"Operation"` = `Operation.$type`

##### Operation.properties

> `readonly` **properties**: `object`

##### Operation.properties.add

> `readonly` **add**: `object`

##### Operation.properties.add.defaultValue

> `readonly` **defaultValue**: `false` = `false`

##### Operation.properties.add.name

> `readonly` **name**: `"add"` = `Operation.add`

##### Operation.properties.assignRoot

> `readonly` **assignRoot**: `object`

##### Operation.properties.assignRoot.name

> `readonly` **name**: `"assignRoot"` = `Operation.assignRoot`

##### Operation.properties.assignRoot.referenceType

> `readonly` **referenceType**: `"AssignPathRoot"` = `AssignPathRoot.$type`

##### Operation.properties.definition

> `readonly` **definition**: `object`

##### Operation.properties.definition.name

> `readonly` **name**: `"definition"` = `Operation.definition`

##### Operation.properties.expression

> `readonly` **expression**: `object`

##### Operation.properties.expression.name

> `readonly` **name**: `"expression"` = `Operation.expression`

##### Operation.properties.path

> `readonly` **path**: `object`

##### Operation.properties.path.name

> `readonly` **name**: `"path"` = `Operation.path`

##### Operation.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### ReduceOperation

> `readonly` **ReduceOperation**: `object`

##### ReduceOperation.name

> `readonly` **name**: `"ReduceOperation"` = `ReduceOperation.$type`

##### ReduceOperation.properties

> `readonly` **properties**: `object`

##### ReduceOperation.properties.argument

> `readonly` **argument**: `object`

##### ReduceOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `ReduceOperation.argument`

##### ReduceOperation.properties.function

> `readonly` **function**: `object`

##### ReduceOperation.properties.function.name

> `readonly` **name**: `"function"` = `ReduceOperation.function`

##### ReduceOperation.properties.operator

> `readonly` **operator**: `object`

##### ReduceOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `ReduceOperation.operator`

##### ReduceOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### RegulatoryDocumentReference

> `readonly` **RegulatoryDocumentReference**: `object`

##### RegulatoryDocumentReference.name

> `readonly` **name**: `"RegulatoryDocumentReference"` = `RegulatoryDocumentReference.$type`

##### RegulatoryDocumentReference.properties

> `readonly` **properties**: `object`

##### RegulatoryDocumentReference.properties.body

> `readonly` **body**: `object`

##### RegulatoryDocumentReference.properties.body.name

> `readonly` **name**: `"body"` = `RegulatoryDocumentReference.body`

##### RegulatoryDocumentReference.properties.body.referenceType

> `readonly` **referenceType**: `"RosettaBody"` = `RosettaBody.$type`

##### RegulatoryDocumentReference.properties.corpusList

> `readonly` **corpusList**: `object`

##### RegulatoryDocumentReference.properties.corpusList.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RegulatoryDocumentReference.properties.corpusList.name

> `readonly` **name**: `"corpusList"` = `RegulatoryDocumentReference.corpusList`

##### RegulatoryDocumentReference.properties.corpusList.referenceType

> `readonly` **referenceType**: `"RosettaCorpus"` = `RosettaCorpus.$type`

##### RegulatoryDocumentReference.properties.segments

> `readonly` **segments**: `object`

##### RegulatoryDocumentReference.properties.segments.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RegulatoryDocumentReference.properties.segments.name

> `readonly` **name**: `"segments"` = `RegulatoryDocumentReference.segments`

##### RegulatoryDocumentReference.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### ReverseOperation

> `readonly` **ReverseOperation**: `object`

##### ReverseOperation.name

> `readonly` **name**: `"ReverseOperation"` = `ReverseOperation.$type`

##### ReverseOperation.properties

> `readonly` **properties**: `object`

##### ReverseOperation.properties.argument

> `readonly` **argument**: `object`

##### ReverseOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `ReverseOperation.argument`

##### ReverseOperation.properties.operator

> `readonly` **operator**: `object`

##### ReverseOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `ReverseOperation.operator`

##### ReverseOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### RosettaAbsentExpression

> `readonly` **RosettaAbsentExpression**: `object`

##### RosettaAbsentExpression.name

> `readonly` **name**: `"RosettaAbsentExpression"` = `RosettaAbsentExpression.$type`

##### RosettaAbsentExpression.properties

> `readonly` **properties**: `object`

##### RosettaAbsentExpression.properties.argument

> `readonly` **argument**: `object`

##### RosettaAbsentExpression.properties.argument.name

> `readonly` **name**: `"argument"` = `RosettaAbsentExpression.argument`

##### RosettaAbsentExpression.properties.operator

> `readonly` **operator**: `object`

##### RosettaAbsentExpression.properties.operator.name

> `readonly` **name**: `"operator"` = `RosettaAbsentExpression.operator`

##### RosettaAbsentExpression.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### RosettaAttributeReference

> `readonly` **RosettaAttributeReference**: `object`

##### RosettaAttributeReference.name

> `readonly` **name**: `"RosettaAttributeReference"` = `RosettaAttributeReference.$type`

##### RosettaAttributeReference.properties

> `readonly` **properties**: `object`

##### RosettaAttributeReference.properties.attribute

> `readonly` **attribute**: `object`

##### RosettaAttributeReference.properties.attribute.name

> `readonly` **name**: `"attribute"` = `RosettaAttributeReference.attribute`

##### RosettaAttributeReference.properties.attribute.referenceType

> `readonly` **referenceType**: `"AttributeOrChoiceOption"` = `AttributeOrChoiceOption.$type`

##### RosettaAttributeReference.properties.receiver

> `readonly` **receiver**: `object`

##### RosettaAttributeReference.properties.receiver.name

> `readonly` **name**: `"receiver"` = `RosettaAttributeReference.receiver`

##### RosettaAttributeReference.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaBasicType

> `readonly` **RosettaBasicType**: `object`

##### RosettaBasicType.name

> `readonly` **name**: `"RosettaBasicType"` = `RosettaBasicType.$type`

##### RosettaBasicType.properties

> `readonly` **properties**: `object`

##### RosettaBasicType.properties.definition

> `readonly` **definition**: `object`

##### RosettaBasicType.properties.definition.name

> `readonly` **name**: `"definition"` = `RosettaBasicType.definition`

##### RosettaBasicType.properties.name

> `readonly` **name**: `object`

##### RosettaBasicType.properties.name.name

> `readonly` **name**: `"name"` = `RosettaBasicType.name`

##### RosettaBasicType.properties.parameters

> `readonly` **parameters**: `object`

##### RosettaBasicType.properties.parameters.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaBasicType.properties.parameters.name

> `readonly` **name**: `"parameters"` = `RosettaBasicType.parameters`

##### RosettaBasicType.superTypes

> `readonly` **superTypes**: \[`"RosettaRootElement"`, `"RosettaType"`\]

#### RosettaBody

> `readonly` **RosettaBody**: `object`

##### RosettaBody.name

> `readonly` **name**: `"RosettaBody"` = `RosettaBody.$type`

##### RosettaBody.properties

> `readonly` **properties**: `object`

##### RosettaBody.properties.bodyType

> `readonly` **bodyType**: `object`

##### RosettaBody.properties.bodyType.name

> `readonly` **name**: `"bodyType"` = `RosettaBody.bodyType`

##### RosettaBody.properties.definition

> `readonly` **definition**: `object`

##### RosettaBody.properties.definition.name

> `readonly` **name**: `"definition"` = `RosettaBody.definition`

##### RosettaBody.properties.name

> `readonly` **name**: `object`

##### RosettaBody.properties.name.name

> `readonly` **name**: `"name"` = `RosettaBody.name`

##### RosettaBody.superTypes

> `readonly` **superTypes**: \[`"RosettaRootElement"`\]

#### RosettaBooleanLiteral

> `readonly` **RosettaBooleanLiteral**: `object`

##### RosettaBooleanLiteral.name

> `readonly` **name**: `"RosettaBooleanLiteral"` = `RosettaBooleanLiteral.$type`

##### RosettaBooleanLiteral.properties

> `readonly` **properties**: `object`

##### RosettaBooleanLiteral.properties.value

> `readonly` **value**: `object`

##### RosettaBooleanLiteral.properties.value.defaultValue

> `readonly` **defaultValue**: `false` = `false`

##### RosettaBooleanLiteral.properties.value.name

> `readonly` **name**: `"value"` = `RosettaBooleanLiteral.value`

##### RosettaBooleanLiteral.superTypes

> `readonly` **superTypes**: \[`"RosettaLiteral"`\]

#### RosettaCallableWithArgs

> `readonly` **RosettaCallableWithArgs**: `object`

##### RosettaCallableWithArgs.name

> `readonly` **name**: `"RosettaCallableWithArgs"` = `RosettaCallableWithArgs.$type`

##### RosettaCallableWithArgs.properties

> `readonly` **properties**: `object` = `{}`

##### RosettaCallableWithArgs.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaCardinality

> `readonly` **RosettaCardinality**: `object`

##### RosettaCardinality.name

> `readonly` **name**: `"RosettaCardinality"` = `RosettaCardinality.$type`

##### RosettaCardinality.properties

> `readonly` **properties**: `object`

##### RosettaCardinality.properties.inf

> `readonly` **inf**: `object`

##### RosettaCardinality.properties.inf.name

> `readonly` **name**: `"inf"` = `RosettaCardinality.inf`

##### RosettaCardinality.properties.sup

> `readonly` **sup**: `object`

##### RosettaCardinality.properties.sup.name

> `readonly` **name**: `"sup"` = `RosettaCardinality.sup`

##### RosettaCardinality.properties.unbounded

> `readonly` **unbounded**: `object`

##### RosettaCardinality.properties.unbounded.defaultValue

> `readonly` **defaultValue**: `false` = `false`

##### RosettaCardinality.properties.unbounded.name

> `readonly` **name**: `"unbounded"` = `RosettaCardinality.unbounded`

##### RosettaCardinality.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaClassSynonym

> `readonly` **RosettaClassSynonym**: `object`

##### RosettaClassSynonym.name

> `readonly` **name**: `"RosettaClassSynonym"` = `RosettaClassSynonym.$type`

##### RosettaClassSynonym.properties

> `readonly` **properties**: `object`

##### RosettaClassSynonym.properties.metaValue

> `readonly` **metaValue**: `object`

##### RosettaClassSynonym.properties.metaValue.name

> `readonly` **name**: `"metaValue"` = `RosettaClassSynonym.metaValue`

##### RosettaClassSynonym.properties.sources

> `readonly` **sources**: `object`

##### RosettaClassSynonym.properties.sources.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaClassSynonym.properties.sources.name

> `readonly` **name**: `"sources"` = `RosettaClassSynonym.sources`

##### RosettaClassSynonym.properties.sources.referenceType

> `readonly` **referenceType**: `"RosettaSynonymSource"` = `RosettaSynonymSource.$type`

##### RosettaClassSynonym.properties.value

> `readonly` **value**: `object`

##### RosettaClassSynonym.properties.value.name

> `readonly` **name**: `"value"` = `RosettaClassSynonym.value`

##### RosettaClassSynonym.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaConditionalExpression

> `readonly` **RosettaConditionalExpression**: `object`

##### RosettaConditionalExpression.name

> `readonly` **name**: `"RosettaConditionalExpression"` = `RosettaConditionalExpression.$type`

##### RosettaConditionalExpression.properties

> `readonly` **properties**: `object`

##### RosettaConditionalExpression.properties.elsethen

> `readonly` **elsethen**: `object`

##### RosettaConditionalExpression.properties.elsethen.name

> `readonly` **name**: `"elsethen"` = `RosettaConditionalExpression.elsethen`

##### RosettaConditionalExpression.properties.full

> `readonly` **full**: `object`

##### RosettaConditionalExpression.properties.full.defaultValue

> `readonly` **defaultValue**: `false` = `false`

##### RosettaConditionalExpression.properties.full.name

> `readonly` **name**: `"full"` = `RosettaConditionalExpression.full`

##### RosettaConditionalExpression.properties.if

> `readonly` **if**: `object`

##### RosettaConditionalExpression.properties.if.name

> `readonly` **name**: `"if"` = `RosettaConditionalExpression.if`

##### RosettaConditionalExpression.properties.ifthen

> `readonly` **ifthen**: `object`

##### RosettaConditionalExpression.properties.ifthen.name

> `readonly` **name**: `"ifthen"` = `RosettaConditionalExpression.ifthen`

##### RosettaConditionalExpression.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### RosettaConstructorExpression

> `readonly` **RosettaConstructorExpression**: `object`

##### RosettaConstructorExpression.name

> `readonly` **name**: `"RosettaConstructorExpression"` = `RosettaConstructorExpression.$type`

##### RosettaConstructorExpression.properties

> `readonly` **properties**: `object`

##### RosettaConstructorExpression.properties.constructorTypeArgs

> `readonly` **constructorTypeArgs**: `object`

##### RosettaConstructorExpression.properties.constructorTypeArgs.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaConstructorExpression.properties.constructorTypeArgs.name

> `readonly` **name**: `"constructorTypeArgs"` = `RosettaConstructorExpression.constructorTypeArgs`

##### RosettaConstructorExpression.properties.implicitEmpty

> `readonly` **implicitEmpty**: `object`

##### RosettaConstructorExpression.properties.implicitEmpty.defaultValue

> `readonly` **defaultValue**: `false` = `false`

##### RosettaConstructorExpression.properties.implicitEmpty.name

> `readonly` **name**: `"implicitEmpty"` = `RosettaConstructorExpression.implicitEmpty`

##### RosettaConstructorExpression.properties.typeRef

> `readonly` **typeRef**: `object`

##### RosettaConstructorExpression.properties.typeRef.name

> `readonly` **name**: `"typeRef"` = `RosettaConstructorExpression.typeRef`

##### RosettaConstructorExpression.properties.values

> `readonly` **values**: `object`

##### RosettaConstructorExpression.properties.values.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaConstructorExpression.properties.values.name

> `readonly` **name**: `"values"` = `RosettaConstructorExpression.values`

##### RosettaConstructorExpression.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### RosettaContainsExpression

> `readonly` **RosettaContainsExpression**: `object`

##### RosettaContainsExpression.name

> `readonly` **name**: `"RosettaContainsExpression"` = `RosettaContainsExpression.$type`

##### RosettaContainsExpression.properties

> `readonly` **properties**: `object`

##### RosettaContainsExpression.properties.left

> `readonly` **left**: `object`

##### RosettaContainsExpression.properties.left.name

> `readonly` **name**: `"left"` = `RosettaContainsExpression.left`

##### RosettaContainsExpression.properties.operator

> `readonly` **operator**: `object`

##### RosettaContainsExpression.properties.operator.name

> `readonly` **name**: `"operator"` = `RosettaContainsExpression.operator`

##### RosettaContainsExpression.properties.right

> `readonly` **right**: `object`

##### RosettaContainsExpression.properties.right.name

> `readonly` **name**: `"right"` = `RosettaContainsExpression.right`

##### RosettaContainsExpression.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### RosettaCorpus

> `readonly` **RosettaCorpus**: `object`

##### RosettaCorpus.name

> `readonly` **name**: `"RosettaCorpus"` = `RosettaCorpus.$type`

##### RosettaCorpus.properties

> `readonly` **properties**: `object`

##### RosettaCorpus.properties.body

> `readonly` **body**: `object`

##### RosettaCorpus.properties.body.name

> `readonly` **name**: `"body"` = `RosettaCorpus.body`

##### RosettaCorpus.properties.body.referenceType

> `readonly` **referenceType**: `"RosettaBody"` = `RosettaBody.$type`

##### RosettaCorpus.properties.corpusType

> `readonly` **corpusType**: `object`

##### RosettaCorpus.properties.corpusType.name

> `readonly` **name**: `"corpusType"` = `RosettaCorpus.corpusType`

##### RosettaCorpus.properties.definition

> `readonly` **definition**: `object`

##### RosettaCorpus.properties.definition.name

> `readonly` **name**: `"definition"` = `RosettaCorpus.definition`

##### RosettaCorpus.properties.displayName

> `readonly` **displayName**: `object`

##### RosettaCorpus.properties.displayName.name

> `readonly` **name**: `"displayName"` = `RosettaCorpus.displayName`

##### RosettaCorpus.properties.name

> `readonly` **name**: `object`

##### RosettaCorpus.properties.name.name

> `readonly` **name**: `"name"` = `RosettaCorpus.name`

##### RosettaCorpus.superTypes

> `readonly` **superTypes**: \[`"RosettaRootElement"`\]

#### RosettaCountOperation

> `readonly` **RosettaCountOperation**: `object`

##### RosettaCountOperation.name

> `readonly` **name**: `"RosettaCountOperation"` = `RosettaCountOperation.$type`

##### RosettaCountOperation.properties

> `readonly` **properties**: `object`

##### RosettaCountOperation.properties.argument

> `readonly` **argument**: `object`

##### RosettaCountOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `RosettaCountOperation.argument`

##### RosettaCountOperation.properties.operator

> `readonly` **operator**: `object`

##### RosettaCountOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `RosettaCountOperation.operator`

##### RosettaCountOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### RosettaDataReference

> `readonly` **RosettaDataReference**: `object`

##### RosettaDataReference.name

> `readonly` **name**: `"RosettaDataReference"` = `RosettaDataReference.$type`

##### RosettaDataReference.properties

> `readonly` **properties**: `object`

##### RosettaDataReference.properties.attribute

> `readonly` **attribute**: `object`

##### RosettaDataReference.properties.attribute.name

> `readonly` **name**: `"attribute"` = `RosettaDataReference.attribute`

##### RosettaDataReference.properties.attribute.referenceType

> `readonly` **referenceType**: `"AttributeOrChoiceOption"` = `AttributeOrChoiceOption.$type`

##### RosettaDataReference.properties.data

> `readonly` **data**: `object`

##### RosettaDataReference.properties.data.name

> `readonly` **name**: `"data"` = `RosettaDataReference.data`

##### RosettaDataReference.properties.data.referenceType

> `readonly` **referenceType**: `"DataOrChoice"` = `DataOrChoice.$type`

##### RosettaDataReference.properties.receiver

> `readonly` **receiver**: `object`

##### RosettaDataReference.properties.receiver.name

> `readonly` **name**: `"receiver"` = `RosettaDataReference.receiver`

##### RosettaDataReference.superTypes

> `readonly` **superTypes**: \[`"RosettaAttributeReference"`\]

#### RosettaDeepFeatureCall

> `readonly` **RosettaDeepFeatureCall**: `object`

##### RosettaDeepFeatureCall.name

> `readonly` **name**: `"RosettaDeepFeatureCall"` = `RosettaDeepFeatureCall.$type`

##### RosettaDeepFeatureCall.properties

> `readonly` **properties**: `object`

##### RosettaDeepFeatureCall.properties.feature

> `readonly` **feature**: `object`

##### RosettaDeepFeatureCall.properties.feature.name

> `readonly` **name**: `"feature"` = `RosettaDeepFeatureCall.feature`

##### RosettaDeepFeatureCall.properties.feature.referenceType

> `readonly` **referenceType**: `"Attribute"` = `Attribute.$type`

##### RosettaDeepFeatureCall.properties.receiver

> `readonly` **receiver**: `object`

##### RosettaDeepFeatureCall.properties.receiver.name

> `readonly` **name**: `"receiver"` = `RosettaDeepFeatureCall.receiver`

##### RosettaDeepFeatureCall.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### RosettaDisjointExpression

> `readonly` **RosettaDisjointExpression**: `object`

##### RosettaDisjointExpression.name

> `readonly` **name**: `"RosettaDisjointExpression"` = `RosettaDisjointExpression.$type`

##### RosettaDisjointExpression.properties

> `readonly` **properties**: `object`

##### RosettaDisjointExpression.properties.left

> `readonly` **left**: `object`

##### RosettaDisjointExpression.properties.left.name

> `readonly` **name**: `"left"` = `RosettaDisjointExpression.left`

##### RosettaDisjointExpression.properties.operator

> `readonly` **operator**: `object`

##### RosettaDisjointExpression.properties.operator.name

> `readonly` **name**: `"operator"` = `RosettaDisjointExpression.operator`

##### RosettaDisjointExpression.properties.right

> `readonly` **right**: `object`

##### RosettaDisjointExpression.properties.right.name

> `readonly` **name**: `"right"` = `RosettaDisjointExpression.right`

##### RosettaDisjointExpression.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### RosettaDocReference

> `readonly` **RosettaDocReference**: `object`

##### RosettaDocReference.name

> `readonly` **name**: `"RosettaDocReference"` = `RosettaDocReference.$type`

##### RosettaDocReference.properties

> `readonly` **properties**: `object`

##### RosettaDocReference.properties.docReference

> `readonly` **docReference**: `object`

##### RosettaDocReference.properties.docReference.name

> `readonly` **name**: `"docReference"` = `RosettaDocReference.docReference`

##### RosettaDocReference.properties.name

> `readonly` **name**: `object`

##### RosettaDocReference.properties.name.name

> `readonly` **name**: `"name"` = `RosettaDocReference.name`

##### RosettaDocReference.properties.path

> `readonly` **path**: `object`

##### RosettaDocReference.properties.path.name

> `readonly` **name**: `"path"` = `RosettaDocReference.path`

##### RosettaDocReference.properties.provision

> `readonly` **provision**: `object`

##### RosettaDocReference.properties.provision.name

> `readonly` **name**: `"provision"` = `RosettaDocReference.provision`

##### RosettaDocReference.properties.rationales

> `readonly` **rationales**: `object`

##### RosettaDocReference.properties.rationales.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaDocReference.properties.rationales.name

> `readonly` **name**: `"rationales"` = `RosettaDocReference.rationales`

##### RosettaDocReference.properties.reportedField

> `readonly` **reportedField**: `object`

##### RosettaDocReference.properties.reportedField.defaultValue

> `readonly` **defaultValue**: `false` = `false`

##### RosettaDocReference.properties.reportedField.name

> `readonly` **name**: `"reportedField"` = `RosettaDocReference.reportedField`

##### RosettaDocReference.properties.structuredProvision

> `readonly` **structuredProvision**: `object`

##### RosettaDocReference.properties.structuredProvision.name

> `readonly` **name**: `"structuredProvision"` = `RosettaDocReference.structuredProvision`

##### RosettaDocReference.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaEnumeration

> `readonly` **RosettaEnumeration**: `object`

##### RosettaEnumeration.name

> `readonly` **name**: `"RosettaEnumeration"` = `RosettaEnumeration.$type`

##### RosettaEnumeration.properties

> `readonly` **properties**: `object`

##### RosettaEnumeration.properties.annotations

> `readonly` **annotations**: `object`

##### RosettaEnumeration.properties.annotations.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaEnumeration.properties.annotations.name

> `readonly` **name**: `"annotations"` = `RosettaEnumeration.annotations`

##### RosettaEnumeration.properties.definition

> `readonly` **definition**: `object`

##### RosettaEnumeration.properties.definition.name

> `readonly` **name**: `"definition"` = `RosettaEnumeration.definition`

##### RosettaEnumeration.properties.enumValues

> `readonly` **enumValues**: `object`

##### RosettaEnumeration.properties.enumValues.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaEnumeration.properties.enumValues.name

> `readonly` **name**: `"enumValues"` = `RosettaEnumeration.enumValues`

##### RosettaEnumeration.properties.name

> `readonly` **name**: `object`

##### RosettaEnumeration.properties.name.name

> `readonly` **name**: `"name"` = `RosettaEnumeration.name`

##### RosettaEnumeration.properties.parent

> `readonly` **parent**: `object`

##### RosettaEnumeration.properties.parent.name

> `readonly` **name**: `"parent"` = `RosettaEnumeration.parent`

##### RosettaEnumeration.properties.parent.referenceType

> `readonly` **referenceType**: `"RosettaEnumeration"` = `RosettaEnumeration.$type`

##### RosettaEnumeration.properties.references

> `readonly` **references**: `object`

##### RosettaEnumeration.properties.references.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaEnumeration.properties.references.name

> `readonly` **name**: `"references"` = `RosettaEnumeration.references`

##### RosettaEnumeration.properties.synonyms

> `readonly` **synonyms**: `object`

##### RosettaEnumeration.properties.synonyms.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaEnumeration.properties.synonyms.name

> `readonly` **name**: `"synonyms"` = `RosettaEnumeration.synonyms`

##### RosettaEnumeration.superTypes

> `readonly` **superTypes**: \[`"RosettaRootElement"`, `"RosettaSymbol"`, `"RosettaType"`, `"SwitchCaseTarget"`\]

#### RosettaEnumSynonym

> `readonly` **RosettaEnumSynonym**: `object`

##### RosettaEnumSynonym.name

> `readonly` **name**: `"RosettaEnumSynonym"` = `RosettaEnumSynonym.$type`

##### RosettaEnumSynonym.properties

> `readonly` **properties**: `object`

##### RosettaEnumSynonym.properties.definition

> `readonly` **definition**: `object`

##### RosettaEnumSynonym.properties.definition.name

> `readonly` **name**: `"definition"` = `RosettaEnumSynonym.definition`

##### RosettaEnumSynonym.properties.patternMatch

> `readonly` **patternMatch**: `object`

##### RosettaEnumSynonym.properties.patternMatch.name

> `readonly` **name**: `"patternMatch"` = `RosettaEnumSynonym.patternMatch`

##### RosettaEnumSynonym.properties.patternReplace

> `readonly` **patternReplace**: `object`

##### RosettaEnumSynonym.properties.patternReplace.name

> `readonly` **name**: `"patternReplace"` = `RosettaEnumSynonym.patternReplace`

##### RosettaEnumSynonym.properties.removeHtml

> `readonly` **removeHtml**: `object`

##### RosettaEnumSynonym.properties.removeHtml.defaultValue

> `readonly` **defaultValue**: `false` = `false`

##### RosettaEnumSynonym.properties.removeHtml.name

> `readonly` **name**: `"removeHtml"` = `RosettaEnumSynonym.removeHtml`

##### RosettaEnumSynonym.properties.sources

> `readonly` **sources**: `object`

##### RosettaEnumSynonym.properties.sources.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaEnumSynonym.properties.sources.name

> `readonly` **name**: `"sources"` = `RosettaEnumSynonym.sources`

##### RosettaEnumSynonym.properties.sources.referenceType

> `readonly` **referenceType**: `"RosettaSynonymSource"` = `RosettaSynonymSource.$type`

##### RosettaEnumSynonym.properties.synonymValue

> `readonly` **synonymValue**: `object`

##### RosettaEnumSynonym.properties.synonymValue.name

> `readonly` **name**: `"synonymValue"` = `RosettaEnumSynonym.synonymValue`

##### RosettaEnumSynonym.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaEnumValue

> `readonly` **RosettaEnumValue**: `object`

##### RosettaEnumValue.name

> `readonly` **name**: `"RosettaEnumValue"` = `RosettaEnumValue.$type`

##### RosettaEnumValue.properties

> `readonly` **properties**: `object`

##### RosettaEnumValue.properties.annotations

> `readonly` **annotations**: `object`

##### RosettaEnumValue.properties.annotations.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaEnumValue.properties.annotations.name

> `readonly` **name**: `"annotations"` = `RosettaEnumValue.annotations`

##### RosettaEnumValue.properties.definition

> `readonly` **definition**: `object`

##### RosettaEnumValue.properties.definition.name

> `readonly` **name**: `"definition"` = `RosettaEnumValue.definition`

##### RosettaEnumValue.properties.display

> `readonly` **display**: `object`

##### RosettaEnumValue.properties.display.name

> `readonly` **name**: `"display"` = `RosettaEnumValue.display`

##### RosettaEnumValue.properties.enumSynonyms

> `readonly` **enumSynonyms**: `object`

##### RosettaEnumValue.properties.enumSynonyms.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaEnumValue.properties.enumSynonyms.name

> `readonly` **name**: `"enumSynonyms"` = `RosettaEnumValue.enumSynonyms`

##### RosettaEnumValue.properties.name

> `readonly` **name**: `object`

##### RosettaEnumValue.properties.name.name

> `readonly` **name**: `"name"` = `RosettaEnumValue.name`

##### RosettaEnumValue.properties.references

> `readonly` **references**: `object`

##### RosettaEnumValue.properties.references.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaEnumValue.properties.references.name

> `readonly` **name**: `"references"` = `RosettaEnumValue.references`

##### RosettaEnumValue.superTypes

> `readonly` **superTypes**: \[`"RosettaFeature"`, `"RosettaSymbol"`, `"SwitchCaseTarget"`\]

#### RosettaEnumValueReference

> `readonly` **RosettaEnumValueReference**: `object`

##### RosettaEnumValueReference.name

> `readonly` **name**: `"RosettaEnumValueReference"` = `RosettaEnumValueReference.$type`

##### RosettaEnumValueReference.properties

> `readonly` **properties**: `object`

##### RosettaEnumValueReference.properties.enumeration

> `readonly` **enumeration**: `object`

##### RosettaEnumValueReference.properties.enumeration.name

> `readonly` **name**: `"enumeration"` = `RosettaEnumValueReference.enumeration`

##### RosettaEnumValueReference.properties.enumeration.referenceType

> `readonly` **referenceType**: `"RosettaEnumeration"` = `RosettaEnumeration.$type`

##### RosettaEnumValueReference.properties.value

> `readonly` **value**: `object`

##### RosettaEnumValueReference.properties.value.name

> `readonly` **name**: `"value"` = `RosettaEnumValueReference.value`

##### RosettaEnumValueReference.properties.value.referenceType

> `readonly` **referenceType**: `"RosettaEnumValue"` = `RosettaEnumValue.$type`

##### RosettaEnumValueReference.superTypes

> `readonly` **superTypes**: \[`"RosettaMapTestExpression"`\]

#### RosettaExistsExpression

> `readonly` **RosettaExistsExpression**: `object`

##### RosettaExistsExpression.name

> `readonly` **name**: `"RosettaExistsExpression"` = `RosettaExistsExpression.$type`

##### RosettaExistsExpression.properties

> `readonly` **properties**: `object`

##### RosettaExistsExpression.properties.argument

> `readonly` **argument**: `object`

##### RosettaExistsExpression.properties.argument.name

> `readonly` **name**: `"argument"` = `RosettaExistsExpression.argument`

##### RosettaExistsExpression.properties.modifier

> `readonly` **modifier**: `object`

##### RosettaExistsExpression.properties.modifier.name

> `readonly` **name**: `"modifier"` = `RosettaExistsExpression.modifier`

##### RosettaExistsExpression.properties.operator

> `readonly` **operator**: `object`

##### RosettaExistsExpression.properties.operator.name

> `readonly` **name**: `"operator"` = `RosettaExistsExpression.operator`

##### RosettaExistsExpression.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### RosettaExpression

> `readonly` **RosettaExpression**: `object`

##### RosettaExpression.name

> `readonly` **name**: `"RosettaExpression"` = `RosettaExpression.$type`

##### RosettaExpression.properties

> `readonly` **properties**: `object` = `{}`

##### RosettaExpression.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaExternalClass

> `readonly` **RosettaExternalClass**: `object`

##### RosettaExternalClass.name

> `readonly` **name**: `"RosettaExternalClass"` = `RosettaExternalClass.$type`

##### RosettaExternalClass.properties

> `readonly` **properties**: `object`

##### RosettaExternalClass.properties.data

> `readonly` **data**: `object`

##### RosettaExternalClass.properties.data.name

> `readonly` **name**: `"data"` = `RosettaExternalClass.data`

##### RosettaExternalClass.properties.data.referenceType

> `readonly` **referenceType**: `"DataOrChoice"` = `DataOrChoice.$type`

##### RosettaExternalClass.properties.externalClassSynonyms

> `readonly` **externalClassSynonyms**: `object`

##### RosettaExternalClass.properties.externalClassSynonyms.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaExternalClass.properties.externalClassSynonyms.name

> `readonly` **name**: `"externalClassSynonyms"` = `RosettaExternalClass.externalClassSynonyms`

##### RosettaExternalClass.properties.regularAttributes

> `readonly` **regularAttributes**: `object`

##### RosettaExternalClass.properties.regularAttributes.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaExternalClass.properties.regularAttributes.name

> `readonly` **name**: `"regularAttributes"` = `RosettaExternalClass.regularAttributes`

##### RosettaExternalClass.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaExternalClassSynonym

> `readonly` **RosettaExternalClassSynonym**: `object`

##### RosettaExternalClassSynonym.name

> `readonly` **name**: `"RosettaExternalClassSynonym"` = `RosettaExternalClassSynonym.$type`

##### RosettaExternalClassSynonym.properties

> `readonly` **properties**: `object`

##### RosettaExternalClassSynonym.properties.metaValue

> `readonly` **metaValue**: `object`

##### RosettaExternalClassSynonym.properties.metaValue.name

> `readonly` **name**: `"metaValue"` = `RosettaExternalClassSynonym.metaValue`

##### RosettaExternalClassSynonym.properties.value

> `readonly` **value**: `object`

##### RosettaExternalClassSynonym.properties.value.name

> `readonly` **name**: `"value"` = `RosettaExternalClassSynonym.value`

##### RosettaExternalClassSynonym.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaExternalEnum

> `readonly` **RosettaExternalEnum**: `object`

##### RosettaExternalEnum.name

> `readonly` **name**: `"RosettaExternalEnum"` = `RosettaExternalEnum.$type`

##### RosettaExternalEnum.properties

> `readonly` **properties**: `object`

##### RosettaExternalEnum.properties.enumeration

> `readonly` **enumeration**: `object`

##### RosettaExternalEnum.properties.enumeration.name

> `readonly` **name**: `"enumeration"` = `RosettaExternalEnum.enumeration`

##### RosettaExternalEnum.properties.enumeration.referenceType

> `readonly` **referenceType**: `"RosettaEnumeration"` = `RosettaEnumeration.$type`

##### RosettaExternalEnum.properties.regularValues

> `readonly` **regularValues**: `object`

##### RosettaExternalEnum.properties.regularValues.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaExternalEnum.properties.regularValues.name

> `readonly` **name**: `"regularValues"` = `RosettaExternalEnum.regularValues`

##### RosettaExternalEnum.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaExternalEnumValue

> `readonly` **RosettaExternalEnumValue**: `object`

##### RosettaExternalEnumValue.name

> `readonly` **name**: `"RosettaExternalEnumValue"` = `RosettaExternalEnumValue.$type`

##### RosettaExternalEnumValue.properties

> `readonly` **properties**: `object`

##### RosettaExternalEnumValue.properties.enumRef

> `readonly` **enumRef**: `object`

##### RosettaExternalEnumValue.properties.enumRef.name

> `readonly` **name**: `"enumRef"` = `RosettaExternalEnumValue.enumRef`

##### RosettaExternalEnumValue.properties.enumRef.referenceType

> `readonly` **referenceType**: `"RosettaEnumValue"` = `RosettaEnumValue.$type`

##### RosettaExternalEnumValue.properties.externalEnumSynonyms

> `readonly` **externalEnumSynonyms**: `object`

##### RosettaExternalEnumValue.properties.externalEnumSynonyms.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaExternalEnumValue.properties.externalEnumSynonyms.name

> `readonly` **name**: `"externalEnumSynonyms"` = `RosettaExternalEnumValue.externalEnumSynonyms`

##### RosettaExternalEnumValue.properties.operator

> `readonly` **operator**: `object`

##### RosettaExternalEnumValue.properties.operator.name

> `readonly` **name**: `"operator"` = `RosettaExternalEnumValue.operator`

##### RosettaExternalEnumValue.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaExternalFunction

> `readonly` **RosettaExternalFunction**: `object`

##### RosettaExternalFunction.name

> `readonly` **name**: `"RosettaExternalFunction"` = `RosettaExternalFunction.$type`

##### RosettaExternalFunction.properties

> `readonly` **properties**: `object`

##### RosettaExternalFunction.properties.definition

> `readonly` **definition**: `object`

##### RosettaExternalFunction.properties.definition.name

> `readonly` **name**: `"definition"` = `RosettaExternalFunction.definition`

##### RosettaExternalFunction.properties.name

> `readonly` **name**: `object`

##### RosettaExternalFunction.properties.name.name

> `readonly` **name**: `"name"` = `RosettaExternalFunction.name`

##### RosettaExternalFunction.properties.parameters

> `readonly` **parameters**: `object`

##### RosettaExternalFunction.properties.parameters.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaExternalFunction.properties.parameters.name

> `readonly` **name**: `"parameters"` = `RosettaExternalFunction.parameters`

##### RosettaExternalFunction.properties.typeCall

> `readonly` **typeCall**: `object`

##### RosettaExternalFunction.properties.typeCall.name

> `readonly` **name**: `"typeCall"` = `RosettaExternalFunction.typeCall`

##### RosettaExternalFunction.superTypes

> `readonly` **superTypes**: \[`"RosettaCallableWithArgs"`, `"RosettaRootElement"`, `"RosettaSymbol"`\]

#### RosettaExternalRegularAttribute

> `readonly` **RosettaExternalRegularAttribute**: `object`

##### RosettaExternalRegularAttribute.name

> `readonly` **name**: `"RosettaExternalRegularAttribute"` = `RosettaExternalRegularAttribute.$type`

##### RosettaExternalRegularAttribute.properties

> `readonly` **properties**: `object`

##### RosettaExternalRegularAttribute.properties.attributeRef

> `readonly` **attributeRef**: `object`

##### RosettaExternalRegularAttribute.properties.attributeRef.name

> `readonly` **name**: `"attributeRef"` = `RosettaExternalRegularAttribute.attributeRef`

##### RosettaExternalRegularAttribute.properties.attributeRef.referenceType

> `readonly` **referenceType**: `"RosettaFeature"` = `RosettaFeature.$type`

##### RosettaExternalRegularAttribute.properties.externalRuleReferences

> `readonly` **externalRuleReferences**: `object`

##### RosettaExternalRegularAttribute.properties.externalRuleReferences.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaExternalRegularAttribute.properties.externalRuleReferences.name

> `readonly` **name**: `"externalRuleReferences"` = `RosettaExternalRegularAttribute.externalRuleReferences`

##### RosettaExternalRegularAttribute.properties.externalSynonyms

> `readonly` **externalSynonyms**: `object`

##### RosettaExternalRegularAttribute.properties.externalSynonyms.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaExternalRegularAttribute.properties.externalSynonyms.name

> `readonly` **name**: `"externalSynonyms"` = `RosettaExternalRegularAttribute.externalSynonyms`

##### RosettaExternalRegularAttribute.properties.operator

> `readonly` **operator**: `object`

##### RosettaExternalRegularAttribute.properties.operator.name

> `readonly` **name**: `"operator"` = `RosettaExternalRegularAttribute.operator`

##### RosettaExternalRegularAttribute.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaExternalRuleSource

> `readonly` **RosettaExternalRuleSource**: `object`

##### RosettaExternalRuleSource.name

> `readonly` **name**: `"RosettaExternalRuleSource"` = `RosettaExternalRuleSource.$type`

##### RosettaExternalRuleSource.properties

> `readonly` **properties**: `object`

##### RosettaExternalRuleSource.properties.externalClasses

> `readonly` **externalClasses**: `object`

##### RosettaExternalRuleSource.properties.externalClasses.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaExternalRuleSource.properties.externalClasses.name

> `readonly` **name**: `"externalClasses"` = `RosettaExternalRuleSource.externalClasses`

##### RosettaExternalRuleSource.properties.externalEnums

> `readonly` **externalEnums**: `object`

##### RosettaExternalRuleSource.properties.externalEnums.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaExternalRuleSource.properties.externalEnums.name

> `readonly` **name**: `"externalEnums"` = `RosettaExternalRuleSource.externalEnums`

##### RosettaExternalRuleSource.properties.name

> `readonly` **name**: `object`

##### RosettaExternalRuleSource.properties.name.name

> `readonly` **name**: `"name"` = `RosettaExternalRuleSource.name`

##### RosettaExternalRuleSource.properties.superSources

> `readonly` **superSources**: `object`

##### RosettaExternalRuleSource.properties.superSources.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaExternalRuleSource.properties.superSources.name

> `readonly` **name**: `"superSources"` = `RosettaExternalRuleSource.superSources`

##### RosettaExternalRuleSource.properties.superSources.referenceType

> `readonly` **referenceType**: `"RosettaExternalRuleSource"` = `RosettaExternalRuleSource.$type`

##### RosettaExternalRuleSource.superTypes

> `readonly` **superTypes**: \[`"RosettaRootElement"`\]

#### RosettaExternalSynonym

> `readonly` **RosettaExternalSynonym**: `object`

##### RosettaExternalSynonym.name

> `readonly` **name**: `"RosettaExternalSynonym"` = `RosettaExternalSynonym.$type`

##### RosettaExternalSynonym.properties

> `readonly` **properties**: `object`

##### RosettaExternalSynonym.properties.body

> `readonly` **body**: `object`

##### RosettaExternalSynonym.properties.body.name

> `readonly` **name**: `"body"` = `RosettaExternalSynonym.body`

##### RosettaExternalSynonym.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaFeature

> `readonly` **RosettaFeature**: `object`

##### RosettaFeature.name

> `readonly` **name**: `"RosettaFeature"` = `RosettaFeature.$type`

##### RosettaFeature.properties

> `readonly` **properties**: `object` = `{}`

##### RosettaFeature.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaFeatureCall

> `readonly` **RosettaFeatureCall**: `object`

##### RosettaFeatureCall.name

> `readonly` **name**: `"RosettaFeatureCall"` = `RosettaFeatureCall.$type`

##### RosettaFeatureCall.properties

> `readonly` **properties**: `object`

##### RosettaFeatureCall.properties.feature

> `readonly` **feature**: `object`

##### RosettaFeatureCall.properties.feature.name

> `readonly` **name**: `"feature"` = `RosettaFeatureCall.feature`

##### RosettaFeatureCall.properties.feature.referenceType

> `readonly` **referenceType**: `"RosettaFeature"` = `RosettaFeature.$type`

##### RosettaFeatureCall.properties.receiver

> `readonly` **receiver**: `object`

##### RosettaFeatureCall.properties.receiver.name

> `readonly` **name**: `"receiver"` = `RosettaFeatureCall.receiver`

##### RosettaFeatureCall.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### RosettaFunction

> `readonly` **RosettaFunction**: `object`

##### RosettaFunction.name

> `readonly` **name**: `"RosettaFunction"` = `RosettaFunction.$type`

##### RosettaFunction.properties

> `readonly` **properties**: `object`

##### RosettaFunction.properties.annotations

> `readonly` **annotations**: `object`

##### RosettaFunction.properties.annotations.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaFunction.properties.annotations.name

> `readonly` **name**: `"annotations"` = `RosettaFunction.annotations`

##### RosettaFunction.properties.conditions

> `readonly` **conditions**: `object`

##### RosettaFunction.properties.conditions.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaFunction.properties.conditions.name

> `readonly` **name**: `"conditions"` = `RosettaFunction.conditions`

##### RosettaFunction.properties.definition

> `readonly` **definition**: `object`

##### RosettaFunction.properties.definition.name

> `readonly` **name**: `"definition"` = `RosettaFunction.definition`

##### RosettaFunction.properties.dispatchAttribute

> `readonly` **dispatchAttribute**: `object`

##### RosettaFunction.properties.dispatchAttribute.name

> `readonly` **name**: `"dispatchAttribute"` = `RosettaFunction.dispatchAttribute`

##### RosettaFunction.properties.dispatchAttribute.referenceType

> `readonly` **referenceType**: `"Attribute"` = `Attribute.$type`

##### RosettaFunction.properties.dispatchValue

> `readonly` **dispatchValue**: `object`

##### RosettaFunction.properties.dispatchValue.name

> `readonly` **name**: `"dispatchValue"` = `RosettaFunction.dispatchValue`

##### RosettaFunction.properties.inputs

> `readonly` **inputs**: `object`

##### RosettaFunction.properties.inputs.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaFunction.properties.inputs.name

> `readonly` **name**: `"inputs"` = `RosettaFunction.inputs`

##### RosettaFunction.properties.name

> `readonly` **name**: `object`

##### RosettaFunction.properties.name.name

> `readonly` **name**: `"name"` = `RosettaFunction.name`

##### RosettaFunction.properties.operations

> `readonly` **operations**: `object`

##### RosettaFunction.properties.operations.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaFunction.properties.operations.name

> `readonly` **name**: `"operations"` = `RosettaFunction.operations`

##### RosettaFunction.properties.output

> `readonly` **output**: `object`

##### RosettaFunction.properties.output.name

> `readonly` **name**: `"output"` = `RosettaFunction.output`

##### RosettaFunction.properties.postConditions

> `readonly` **postConditions**: `object`

##### RosettaFunction.properties.postConditions.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaFunction.properties.postConditions.name

> `readonly` **name**: `"postConditions"` = `RosettaFunction.postConditions`

##### RosettaFunction.properties.references

> `readonly` **references**: `object`

##### RosettaFunction.properties.references.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaFunction.properties.references.name

> `readonly` **name**: `"references"` = `RosettaFunction.references`

##### RosettaFunction.properties.shortcuts

> `readonly` **shortcuts**: `object`

##### RosettaFunction.properties.shortcuts.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaFunction.properties.shortcuts.name

> `readonly` **name**: `"shortcuts"` = `RosettaFunction.shortcuts`

##### RosettaFunction.properties.superFunction

> `readonly` **superFunction**: `object`

##### RosettaFunction.properties.superFunction.name

> `readonly` **name**: `"superFunction"` = `RosettaFunction.superFunction`

##### RosettaFunction.properties.superFunction.referenceType

> `readonly` **referenceType**: `"RosettaFunction"` = `RosettaFunction.$type`

##### RosettaFunction.superTypes

> `readonly` **superTypes**: \[`"RosettaCallableWithArgs"`, `"RosettaRootElement"`, `"RosettaSymbol"`\]

#### RosettaImplicitVariable

> `readonly` **RosettaImplicitVariable**: `object`

##### RosettaImplicitVariable.name

> `readonly` **name**: `"RosettaImplicitVariable"` = `RosettaImplicitVariable.$type`

##### RosettaImplicitVariable.properties

> `readonly` **properties**: `object`

##### RosettaImplicitVariable.properties.name

> `readonly` **name**: `object`

##### RosettaImplicitVariable.properties.name.name

> `readonly` **name**: `"name"` = `RosettaImplicitVariable.name`

##### RosettaImplicitVariable.superTypes

> `readonly` **superTypes**: \[`"AnnotationPathExpression"`, `"RosettaExpression"`\]

#### RosettaIntLiteral

> `readonly` **RosettaIntLiteral**: `object`

##### RosettaIntLiteral.name

> `readonly` **name**: `"RosettaIntLiteral"` = `RosettaIntLiteral.$type`

##### RosettaIntLiteral.properties

> `readonly` **properties**: `object`

##### RosettaIntLiteral.properties.value

> `readonly` **value**: `object`

##### RosettaIntLiteral.properties.value.name

> `readonly` **name**: `"value"` = `RosettaIntLiteral.value`

##### RosettaIntLiteral.superTypes

> `readonly` **superTypes**: \[`"RosettaLiteral"`\]

#### RosettaLiteral

> `readonly` **RosettaLiteral**: `object`

##### RosettaLiteral.name

> `readonly` **name**: `"RosettaLiteral"` = `RosettaLiteral.$type`

##### RosettaLiteral.properties

> `readonly` **properties**: `object` = `{}`

##### RosettaLiteral.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`, `"RosettaMapTestExpression"`\]

#### RosettaMapPath

> `readonly` **RosettaMapPath**: `object`

##### RosettaMapPath.name

> `readonly` **name**: `"RosettaMapPath"` = `RosettaMapPath.$type`

##### RosettaMapPath.properties

> `readonly` **properties**: `object`

##### RosettaMapPath.properties.path

> `readonly` **path**: `object`

##### RosettaMapPath.properties.path.name

> `readonly` **name**: `"path"` = `RosettaMapPath.path`

##### RosettaMapPath.superTypes

> `readonly` **superTypes**: \[`"RosettaMapTest"`\]

#### RosettaMapPathValue

> `readonly` **RosettaMapPathValue**: `object`

##### RosettaMapPathValue.name

> `readonly` **name**: `"RosettaMapPathValue"` = `RosettaMapPathValue.$type`

##### RosettaMapPathValue.properties

> `readonly` **properties**: `object`

##### RosettaMapPathValue.properties.path

> `readonly` **path**: `object`

##### RosettaMapPathValue.properties.path.name

> `readonly` **name**: `"path"` = `RosettaMapPathValue.path`

##### RosettaMapPathValue.superTypes

> `readonly` **superTypes**: \[`"RosettaMapTestExpression"`\]

#### RosettaMapping

> `readonly` **RosettaMapping**: `object`

##### RosettaMapping.name

> `readonly` **name**: `"RosettaMapping"` = `RosettaMapping.$type`

##### RosettaMapping.properties

> `readonly` **properties**: `object`

##### RosettaMapping.properties.instances

> `readonly` **instances**: `object`

##### RosettaMapping.properties.instances.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaMapping.properties.instances.name

> `readonly` **name**: `"instances"` = `RosettaMapping.instances`

##### RosettaMapping.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaMappingInstance

> `readonly` **RosettaMappingInstance**: `object`

##### RosettaMappingInstance.name

> `readonly` **name**: `"RosettaMappingInstance"` = `RosettaMappingInstance.$type`

##### RosettaMappingInstance.properties

> `readonly` **properties**: `object`

##### RosettaMappingInstance.properties.default

> `readonly` **default**: `object`

##### RosettaMappingInstance.properties.default.defaultValue

> `readonly` **defaultValue**: `false` = `false`

##### RosettaMappingInstance.properties.default.name

> `readonly` **name**: `"default"` = `RosettaMappingInstance.default`

##### RosettaMappingInstance.properties.set

> `readonly` **set**: `object`

##### RosettaMappingInstance.properties.set.name

> `readonly` **name**: `"set"` = `RosettaMappingInstance.set`

##### RosettaMappingInstance.properties.when

> `readonly` **when**: `object`

##### RosettaMappingInstance.properties.when.name

> `readonly` **name**: `"when"` = `RosettaMappingInstance.when`

##### RosettaMappingInstance.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaMappingPathTests

> `readonly` **RosettaMappingPathTests**: `object`

##### RosettaMappingPathTests.name

> `readonly` **name**: `"RosettaMappingPathTests"` = `RosettaMappingPathTests.$type`

##### RosettaMappingPathTests.properties

> `readonly` **properties**: `object`

##### RosettaMappingPathTests.properties.tests

> `readonly` **tests**: `object`

##### RosettaMappingPathTests.properties.tests.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaMappingPathTests.properties.tests.name

> `readonly` **name**: `"tests"` = `RosettaMappingPathTests.tests`

##### RosettaMappingPathTests.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaMapRosettaPath

> `readonly` **RosettaMapRosettaPath**: `object`

##### RosettaMapRosettaPath.name

> `readonly` **name**: `"RosettaMapRosettaPath"` = `RosettaMapRosettaPath.$type`

##### RosettaMapRosettaPath.properties

> `readonly` **properties**: `object`

##### RosettaMapRosettaPath.properties.path

> `readonly` **path**: `object`

##### RosettaMapRosettaPath.properties.path.name

> `readonly` **name**: `"path"` = `RosettaMapRosettaPath.path`

##### RosettaMapRosettaPath.superTypes

> `readonly` **superTypes**: \[`"RosettaMapTest"`\]

#### RosettaMapTest

> `readonly` **RosettaMapTest**: `object`

##### RosettaMapTest.name

> `readonly` **name**: `"RosettaMapTest"` = `RosettaMapTest.$type`

##### RosettaMapTest.properties

> `readonly` **properties**: `object` = `{}`

##### RosettaMapTest.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaMapTestAbsentExpression

> `readonly` **RosettaMapTestAbsentExpression**: `object`

##### RosettaMapTestAbsentExpression.name

> `readonly` **name**: `"RosettaMapTestAbsentExpression"` = `RosettaMapTestAbsentExpression.$type`

##### RosettaMapTestAbsentExpression.properties

> `readonly` **properties**: `object`

##### RosettaMapTestAbsentExpression.properties.argument

> `readonly` **argument**: `object`

##### RosettaMapTestAbsentExpression.properties.argument.name

> `readonly` **name**: `"argument"` = `RosettaMapTestAbsentExpression.argument`

##### RosettaMapTestAbsentExpression.superTypes

> `readonly` **superTypes**: \[`"RosettaMapTestExpression"`\]

#### RosettaMapTestEqualityOperation

> `readonly` **RosettaMapTestEqualityOperation**: `object`

##### RosettaMapTestEqualityOperation.name

> `readonly` **name**: `"RosettaMapTestEqualityOperation"` = `RosettaMapTestEqualityOperation.$type`

##### RosettaMapTestEqualityOperation.properties

> `readonly` **properties**: `object`

##### RosettaMapTestEqualityOperation.properties.left

> `readonly` **left**: `object`

##### RosettaMapTestEqualityOperation.properties.left.name

> `readonly` **name**: `"left"` = `RosettaMapTestEqualityOperation.left`

##### RosettaMapTestEqualityOperation.properties.operator

> `readonly` **operator**: `object`

##### RosettaMapTestEqualityOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `RosettaMapTestEqualityOperation.operator`

##### RosettaMapTestEqualityOperation.properties.right

> `readonly` **right**: `object`

##### RosettaMapTestEqualityOperation.properties.right.name

> `readonly` **name**: `"right"` = `RosettaMapTestEqualityOperation.right`

##### RosettaMapTestEqualityOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaMapTestExpression"`\]

#### RosettaMapTestExistsExpression

> `readonly` **RosettaMapTestExistsExpression**: `object`

##### RosettaMapTestExistsExpression.name

> `readonly` **name**: `"RosettaMapTestExistsExpression"` = `RosettaMapTestExistsExpression.$type`

##### RosettaMapTestExistsExpression.properties

> `readonly` **properties**: `object`

##### RosettaMapTestExistsExpression.properties.argument

> `readonly` **argument**: `object`

##### RosettaMapTestExistsExpression.properties.argument.name

> `readonly` **name**: `"argument"` = `RosettaMapTestExistsExpression.argument`

##### RosettaMapTestExistsExpression.superTypes

> `readonly` **superTypes**: \[`"RosettaMapTestExpression"`\]

#### RosettaMapTestExpression

> `readonly` **RosettaMapTestExpression**: `object`

##### RosettaMapTestExpression.name

> `readonly` **name**: `"RosettaMapTestExpression"` = `RosettaMapTestExpression.$type`

##### RosettaMapTestExpression.properties

> `readonly` **properties**: `object` = `{}`

##### RosettaMapTestExpression.superTypes

> `readonly` **superTypes**: \[`"RosettaMapTest"`\]

#### RosettaMapTestFunc

> `readonly` **RosettaMapTestFunc**: `object`

##### RosettaMapTestFunc.name

> `readonly` **name**: `"RosettaMapTestFunc"` = `RosettaMapTestFunc.$type`

##### RosettaMapTestFunc.properties

> `readonly` **properties**: `object`

##### RosettaMapTestFunc.properties.func

> `readonly` **func**: `object`

##### RosettaMapTestFunc.properties.func.name

> `readonly` **name**: `"func"` = `RosettaMapTestFunc.func`

##### RosettaMapTestFunc.properties.func.referenceType

> `readonly` **referenceType**: `"RosettaCallableWithArgs"` = `RosettaCallableWithArgs.$type`

##### RosettaMapTestFunc.properties.predicatePath

> `readonly` **predicatePath**: `object`

##### RosettaMapTestFunc.properties.predicatePath.name

> `readonly` **name**: `"predicatePath"` = `RosettaMapTestFunc.predicatePath`

##### RosettaMapTestFunc.superTypes

> `readonly` **superTypes**: \[`"RosettaMapTest"`\]

#### RosettaMergeSynonymValue

> `readonly` **RosettaMergeSynonymValue**: `object`

##### RosettaMergeSynonymValue.name

> `readonly` **name**: `"RosettaMergeSynonymValue"` = `RosettaMergeSynonymValue.$type`

##### RosettaMergeSynonymValue.properties

> `readonly` **properties**: `object`

##### RosettaMergeSynonymValue.properties.excludePath

> `readonly` **excludePath**: `object`

##### RosettaMergeSynonymValue.properties.excludePath.name

> `readonly` **name**: `"excludePath"` = `RosettaMergeSynonymValue.excludePath`

##### RosettaMergeSynonymValue.properties.name

> `readonly` **name**: `object`

##### RosettaMergeSynonymValue.properties.name.name

> `readonly` **name**: `"name"` = `RosettaMergeSynonymValue.name`

##### RosettaMergeSynonymValue.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaMetaType

> `readonly` **RosettaMetaType**: `object`

##### RosettaMetaType.name

> `readonly` **name**: `"RosettaMetaType"` = `RosettaMetaType.$type`

##### RosettaMetaType.properties

> `readonly` **properties**: `object`

##### RosettaMetaType.properties.name

> `readonly` **name**: `object`

##### RosettaMetaType.properties.name.name

> `readonly` **name**: `"name"` = `RosettaMetaType.name`

##### RosettaMetaType.properties.typeCall

> `readonly` **typeCall**: `object`

##### RosettaMetaType.properties.typeCall.name

> `readonly` **name**: `"typeCall"` = `RosettaMetaType.typeCall`

##### RosettaMetaType.superTypes

> `readonly` **superTypes**: \[`"RosettaFeature"`, `"RosettaRootElement"`, `"RosettaSymbol"`\]

#### RosettaModel

> `readonly` **RosettaModel**: `object`

##### RosettaModel.name

> `readonly` **name**: `"RosettaModel"` = `RosettaModel.$type`

##### RosettaModel.properties

> `readonly` **properties**: `object`

##### RosettaModel.properties.configurations

> `readonly` **configurations**: `object`

##### RosettaModel.properties.configurations.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaModel.properties.configurations.name

> `readonly` **name**: `"configurations"` = `RosettaModel.configurations`

##### RosettaModel.properties.definition

> `readonly` **definition**: `object`

##### RosettaModel.properties.definition.name

> `readonly` **name**: `"definition"` = `RosettaModel.definition`

##### RosettaModel.properties.elements

> `readonly` **elements**: `object`

##### RosettaModel.properties.elements.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaModel.properties.elements.name

> `readonly` **name**: `"elements"` = `RosettaModel.elements`

##### RosettaModel.properties.imports

> `readonly` **imports**: `object`

##### RosettaModel.properties.imports.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaModel.properties.imports.name

> `readonly` **name**: `"imports"` = `RosettaModel.imports`

##### RosettaModel.properties.name

> `readonly` **name**: `object`

##### RosettaModel.properties.name.name

> `readonly` **name**: `"name"` = `RosettaModel.name`

##### RosettaModel.properties.overridden

> `readonly` **overridden**: `object`

##### RosettaModel.properties.overridden.defaultValue

> `readonly` **defaultValue**: `false` = `false`

##### RosettaModel.properties.overridden.name

> `readonly` **name**: `"overridden"` = `RosettaModel.overridden`

##### RosettaModel.properties.scope

> `readonly` **scope**: `object`

##### RosettaModel.properties.scope.name

> `readonly` **name**: `"scope"` = `RosettaModel.scope`

##### RosettaModel.properties.version

> `readonly` **version**: `object`

##### RosettaModel.properties.version.name

> `readonly` **name**: `"version"` = `RosettaModel.version`

##### RosettaModel.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaNumberLiteral

> `readonly` **RosettaNumberLiteral**: `object`

##### RosettaNumberLiteral.name

> `readonly` **name**: `"RosettaNumberLiteral"` = `RosettaNumberLiteral.$type`

##### RosettaNumberLiteral.properties

> `readonly` **properties**: `object`

##### RosettaNumberLiteral.properties.value

> `readonly` **value**: `object`

##### RosettaNumberLiteral.properties.value.name

> `readonly` **name**: `"value"` = `RosettaNumberLiteral.value`

##### RosettaNumberLiteral.superTypes

> `readonly` **superTypes**: \[`"RosettaLiteral"`\]

#### RosettaOnlyElement

> `readonly` **RosettaOnlyElement**: `object`

##### RosettaOnlyElement.name

> `readonly` **name**: `"RosettaOnlyElement"` = `RosettaOnlyElement.$type`

##### RosettaOnlyElement.properties

> `readonly` **properties**: `object`

##### RosettaOnlyElement.properties.argument

> `readonly` **argument**: `object`

##### RosettaOnlyElement.properties.argument.name

> `readonly` **name**: `"argument"` = `RosettaOnlyElement.argument`

##### RosettaOnlyElement.properties.operator

> `readonly` **operator**: `object`

##### RosettaOnlyElement.properties.operator.name

> `readonly` **name**: `"operator"` = `RosettaOnlyElement.operator`

##### RosettaOnlyElement.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### RosettaOnlyExistsExpression

> `readonly` **RosettaOnlyExistsExpression**: `object`

##### RosettaOnlyExistsExpression.name

> `readonly` **name**: `"RosettaOnlyExistsExpression"` = `RosettaOnlyExistsExpression.$type`

##### RosettaOnlyExistsExpression.properties

> `readonly` **properties**: `object`

##### RosettaOnlyExistsExpression.properties.args

> `readonly` **args**: `object`

##### RosettaOnlyExistsExpression.properties.args.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaOnlyExistsExpression.properties.args.name

> `readonly` **name**: `"args"` = `RosettaOnlyExistsExpression.args`

##### RosettaOnlyExistsExpression.properties.argument

> `readonly` **argument**: `object`

##### RosettaOnlyExistsExpression.properties.argument.name

> `readonly` **name**: `"argument"` = `RosettaOnlyExistsExpression.argument`

##### RosettaOnlyExistsExpression.properties.operator

> `readonly` **operator**: `object`

##### RosettaOnlyExistsExpression.properties.operator.name

> `readonly` **name**: `"operator"` = `RosettaOnlyExistsExpression.operator`

##### RosettaOnlyExistsExpression.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### RosettaParameter

> `readonly` **RosettaParameter**: `object`

##### RosettaParameter.name

> `readonly` **name**: `"RosettaParameter"` = `RosettaParameter.$type`

##### RosettaParameter.properties

> `readonly` **properties**: `object`

##### RosettaParameter.properties.isArray

> `readonly` **isArray**: `object`

##### RosettaParameter.properties.isArray.defaultValue

> `readonly` **defaultValue**: `false` = `false`

##### RosettaParameter.properties.isArray.name

> `readonly` **name**: `"isArray"` = `RosettaParameter.isArray`

##### RosettaParameter.properties.name

> `readonly` **name**: `object`

##### RosettaParameter.properties.name.name

> `readonly` **name**: `"name"` = `RosettaParameter.name`

##### RosettaParameter.properties.typeCall

> `readonly` **typeCall**: `object`

##### RosettaParameter.properties.typeCall.name

> `readonly` **name**: `"typeCall"` = `RosettaParameter.typeCall`

##### RosettaParameter.superTypes

> `readonly` **superTypes**: \[`"RosettaSymbol"`\]

#### RosettaQualifiableConfiguration

> `readonly` **RosettaQualifiableConfiguration**: `object`

##### RosettaQualifiableConfiguration.name

> `readonly` **name**: `"RosettaQualifiableConfiguration"` = `RosettaQualifiableConfiguration.$type`

##### RosettaQualifiableConfiguration.properties

> `readonly` **properties**: `object`

##### RosettaQualifiableConfiguration.properties.qType

> `readonly` **qType**: `object`

##### RosettaQualifiableConfiguration.properties.qType.name

> `readonly` **name**: `"qType"` = `RosettaQualifiableConfiguration.qType`

##### RosettaQualifiableConfiguration.properties.rosettaClass

> `readonly` **rosettaClass**: `object`

##### RosettaQualifiableConfiguration.properties.rosettaClass.name

> `readonly` **name**: `"rosettaClass"` = `RosettaQualifiableConfiguration.rosettaClass`

##### RosettaQualifiableConfiguration.properties.rosettaClass.referenceType

> `readonly` **referenceType**: `"Data"` = `Data.$type`

##### RosettaQualifiableConfiguration.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaRecordFeature

> `readonly` **RosettaRecordFeature**: `object`

##### RosettaRecordFeature.name

> `readonly` **name**: `"RosettaRecordFeature"` = `RosettaRecordFeature.$type`

##### RosettaRecordFeature.properties

> `readonly` **properties**: `object`

##### RosettaRecordFeature.properties.name

> `readonly` **name**: `object`

##### RosettaRecordFeature.properties.name.name

> `readonly` **name**: `"name"` = `RosettaRecordFeature.name`

##### RosettaRecordFeature.properties.typeCall

> `readonly` **typeCall**: `object`

##### RosettaRecordFeature.properties.typeCall.name

> `readonly` **name**: `"typeCall"` = `RosettaRecordFeature.typeCall`

##### RosettaRecordFeature.superTypes

> `readonly` **superTypes**: \[`"RosettaFeature"`, `"RosettaTypedFeature"`\]

#### RosettaRecordType

> `readonly` **RosettaRecordType**: `object`

##### RosettaRecordType.name

> `readonly` **name**: `"RosettaRecordType"` = `RosettaRecordType.$type`

##### RosettaRecordType.properties

> `readonly` **properties**: `object`

##### RosettaRecordType.properties.definition

> `readonly` **definition**: `object`

##### RosettaRecordType.properties.definition.name

> `readonly` **name**: `"definition"` = `RosettaRecordType.definition`

##### RosettaRecordType.properties.features

> `readonly` **features**: `object`

##### RosettaRecordType.properties.features.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaRecordType.properties.features.name

> `readonly` **name**: `"features"` = `RosettaRecordType.features`

##### RosettaRecordType.properties.name

> `readonly` **name**: `object`

##### RosettaRecordType.properties.name.name

> `readonly` **name**: `"name"` = `RosettaRecordType.name`

##### RosettaRecordType.superTypes

> `readonly` **superTypes**: \[`"RosettaRootElement"`, `"RosettaType"`\]

#### RosettaReport

> `readonly` **RosettaReport**: `object`

##### RosettaReport.name

> `readonly` **name**: `"RosettaReport"` = `RosettaReport.$type`

##### RosettaReport.properties

> `readonly` **properties**: `object`

##### RosettaReport.properties.eligibilityRules

> `readonly` **eligibilityRules**: `object`

##### RosettaReport.properties.eligibilityRules.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaReport.properties.eligibilityRules.name

> `readonly` **name**: `"eligibilityRules"` = `RosettaReport.eligibilityRules`

##### RosettaReport.properties.eligibilityRules.referenceType

> `readonly` **referenceType**: `"RosettaRule"` = `RosettaRule.$type`

##### RosettaReport.properties.inputType

> `readonly` **inputType**: `object`

##### RosettaReport.properties.inputType.name

> `readonly` **name**: `"inputType"` = `RosettaReport.inputType`

##### RosettaReport.properties.regulatoryBody

> `readonly` **regulatoryBody**: `object`

##### RosettaReport.properties.regulatoryBody.name

> `readonly` **name**: `"regulatoryBody"` = `RosettaReport.regulatoryBody`

##### RosettaReport.properties.reportingStandard

> `readonly` **reportingStandard**: `object`

##### RosettaReport.properties.reportingStandard.name

> `readonly` **name**: `"reportingStandard"` = `RosettaReport.reportingStandard`

##### RosettaReport.properties.reportingStandard.referenceType

> `readonly` **referenceType**: `"RosettaCorpus"` = `RosettaCorpus.$type`

##### RosettaReport.properties.reportType

> `readonly` **reportType**: `object`

##### RosettaReport.properties.reportType.name

> `readonly` **name**: `"reportType"` = `RosettaReport.reportType`

##### RosettaReport.properties.reportType.referenceType

> `readonly` **referenceType**: `"Data"` = `Data.$type`

##### RosettaReport.properties.ruleSource

> `readonly` **ruleSource**: `object`

##### RosettaReport.properties.ruleSource.name

> `readonly` **name**: `"ruleSource"` = `RosettaReport.ruleSource`

##### RosettaReport.properties.ruleSource.referenceType

> `readonly` **referenceType**: `"RosettaExternalRuleSource"` = `RosettaExternalRuleSource.$type`

##### RosettaReport.superTypes

> `readonly` **superTypes**: \[`"RosettaRootElement"`\]

#### RosettaRootElement

> `readonly` **RosettaRootElement**: `object`

##### RosettaRootElement.name

> `readonly` **name**: `"RosettaRootElement"` = `RosettaRootElement.$type`

##### RosettaRootElement.properties

> `readonly` **properties**: `object` = `{}`

##### RosettaRootElement.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaRule

> `readonly` **RosettaRule**: `object`

##### RosettaRule.name

> `readonly` **name**: `"RosettaRule"` = `RosettaRule.$type`

##### RosettaRule.properties

> `readonly` **properties**: `object`

##### RosettaRule.properties.definition

> `readonly` **definition**: `object`

##### RosettaRule.properties.definition.name

> `readonly` **name**: `"definition"` = `RosettaRule.definition`

##### RosettaRule.properties.eligibility

> `readonly` **eligibility**: `object`

##### RosettaRule.properties.eligibility.defaultValue

> `readonly` **defaultValue**: `false` = `false`

##### RosettaRule.properties.eligibility.name

> `readonly` **name**: `"eligibility"` = `RosettaRule.eligibility`

##### RosettaRule.properties.expression

> `readonly` **expression**: `object`

##### RosettaRule.properties.expression.name

> `readonly` **name**: `"expression"` = `RosettaRule.expression`

##### RosettaRule.properties.identifier

> `readonly` **identifier**: `object`

##### RosettaRule.properties.identifier.name

> `readonly` **name**: `"identifier"` = `RosettaRule.identifier`

##### RosettaRule.properties.input

> `readonly` **input**: `object`

##### RosettaRule.properties.input.name

> `readonly` **name**: `"input"` = `RosettaRule.input`

##### RosettaRule.properties.name

> `readonly` **name**: `object`

##### RosettaRule.properties.name.name

> `readonly` **name**: `"name"` = `RosettaRule.name`

##### RosettaRule.properties.references

> `readonly` **references**: `object`

##### RosettaRule.properties.references.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaRule.properties.references.name

> `readonly` **name**: `"references"` = `RosettaRule.references`

##### RosettaRule.superTypes

> `readonly` **superTypes**: \[`"RosettaCallableWithArgs"`, `"RosettaRootElement"`, `"RosettaSymbol"`\]

#### RosettaScope

> `readonly` **RosettaScope**: `object`

##### RosettaScope.name

> `readonly` **name**: `"RosettaScope"` = `RosettaScope.$type`

##### RosettaScope.properties

> `readonly` **properties**: `object`

##### RosettaScope.properties.definition

> `readonly` **definition**: `object`

##### RosettaScope.properties.definition.name

> `readonly` **name**: `"definition"` = `RosettaScope.definition`

##### RosettaScope.properties.name

> `readonly` **name**: `object`

##### RosettaScope.properties.name.name

> `readonly` **name**: `"name"` = `RosettaScope.name`

##### RosettaScope.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaSegment

> `readonly` **RosettaSegment**: `object`

##### RosettaSegment.name

> `readonly` **name**: `"RosettaSegment"` = `RosettaSegment.$type`

##### RosettaSegment.properties

> `readonly` **properties**: `object`

##### RosettaSegment.properties.name

> `readonly` **name**: `object`

##### RosettaSegment.properties.name.name

> `readonly` **name**: `"name"` = `RosettaSegment.name`

##### RosettaSegment.superTypes

> `readonly` **superTypes**: \[`"RosettaRootElement"`\]

#### RosettaSegmentRef

> `readonly` **RosettaSegmentRef**: `object`

##### RosettaSegmentRef.name

> `readonly` **name**: `"RosettaSegmentRef"` = `RosettaSegmentRef.$type`

##### RosettaSegmentRef.properties

> `readonly` **properties**: `object`

##### RosettaSegmentRef.properties.segment

> `readonly` **segment**: `object`

##### RosettaSegmentRef.properties.segment.name

> `readonly` **name**: `"segment"` = `RosettaSegmentRef.segment`

##### RosettaSegmentRef.properties.segment.referenceType

> `readonly` **referenceType**: `"RosettaSegment"` = `RosettaSegment.$type`

##### RosettaSegmentRef.properties.segmentRef

> `readonly` **segmentRef**: `object`

##### RosettaSegmentRef.properties.segmentRef.name

> `readonly` **name**: `"segmentRef"` = `RosettaSegmentRef.segmentRef`

##### RosettaSegmentRef.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaStringLiteral

> `readonly` **RosettaStringLiteral**: `object`

##### RosettaStringLiteral.name

> `readonly` **name**: `"RosettaStringLiteral"` = `RosettaStringLiteral.$type`

##### RosettaStringLiteral.properties

> `readonly` **properties**: `object`

##### RosettaStringLiteral.properties.value

> `readonly` **value**: `object`

##### RosettaStringLiteral.properties.value.name

> `readonly` **name**: `"value"` = `RosettaStringLiteral.value`

##### RosettaStringLiteral.superTypes

> `readonly` **superTypes**: \[`"RosettaLiteral"`\]

#### RosettaSuperCall

> `readonly` **RosettaSuperCall**: `object`

##### RosettaSuperCall.name

> `readonly` **name**: `"RosettaSuperCall"` = `RosettaSuperCall.$type`

##### RosettaSuperCall.properties

> `readonly` **properties**: `object`

##### RosettaSuperCall.properties.explicitArguments

> `readonly` **explicitArguments**: `object`

##### RosettaSuperCall.properties.explicitArguments.defaultValue

> `readonly` **defaultValue**: `false` = `false`

##### RosettaSuperCall.properties.explicitArguments.name

> `readonly` **name**: `"explicitArguments"` = `RosettaSuperCall.explicitArguments`

##### RosettaSuperCall.properties.name

> `readonly` **name**: `object`

##### RosettaSuperCall.properties.name.name

> `readonly` **name**: `"name"` = `RosettaSuperCall.name`

##### RosettaSuperCall.properties.rawArgs

> `readonly` **rawArgs**: `object`

##### RosettaSuperCall.properties.rawArgs.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaSuperCall.properties.rawArgs.name

> `readonly` **name**: `"rawArgs"` = `RosettaSuperCall.rawArgs`

##### RosettaSuperCall.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### RosettaSymbol

> `readonly` **RosettaSymbol**: `object`

##### RosettaSymbol.name

> `readonly` **name**: `"RosettaSymbol"` = `RosettaSymbol.$type`

##### RosettaSymbol.properties

> `readonly` **properties**: `object` = `{}`

##### RosettaSymbol.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaSymbolReference

> `readonly` **RosettaSymbolReference**: `object`

##### RosettaSymbolReference.name

> `readonly` **name**: `"RosettaSymbolReference"` = `RosettaSymbolReference.$type`

##### RosettaSymbolReference.properties

> `readonly` **properties**: `object`

##### RosettaSymbolReference.properties.explicitArguments

> `readonly` **explicitArguments**: `object`

##### RosettaSymbolReference.properties.explicitArguments.defaultValue

> `readonly` **defaultValue**: `false` = `false`

##### RosettaSymbolReference.properties.explicitArguments.name

> `readonly` **name**: `"explicitArguments"` = `RosettaSymbolReference.explicitArguments`

##### RosettaSymbolReference.properties.rawArgs

> `readonly` **rawArgs**: `object`

##### RosettaSymbolReference.properties.rawArgs.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaSymbolReference.properties.rawArgs.name

> `readonly` **name**: `"rawArgs"` = `RosettaSymbolReference.rawArgs`

##### RosettaSymbolReference.properties.symbol

> `readonly` **symbol**: `object`

##### RosettaSymbolReference.properties.symbol.name

> `readonly` **name**: `"symbol"` = `RosettaSymbolReference.symbol`

##### RosettaSymbolReference.properties.symbol.referenceType

> `readonly` **referenceType**: `"RosettaSymbol"` = `RosettaSymbol.$type`

##### RosettaSymbolReference.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### RosettaSynonym

> `readonly` **RosettaSynonym**: `object`

##### RosettaSynonym.name

> `readonly` **name**: `"RosettaSynonym"` = `RosettaSynonym.$type`

##### RosettaSynonym.properties

> `readonly` **properties**: `object`

##### RosettaSynonym.properties.body

> `readonly` **body**: `object`

##### RosettaSynonym.properties.body.name

> `readonly` **name**: `"body"` = `RosettaSynonym.body`

##### RosettaSynonym.properties.sources

> `readonly` **sources**: `object`

##### RosettaSynonym.properties.sources.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaSynonym.properties.sources.name

> `readonly` **name**: `"sources"` = `RosettaSynonym.sources`

##### RosettaSynonym.properties.sources.referenceType

> `readonly` **referenceType**: `"RosettaSynonymSource"` = `RosettaSynonymSource.$type`

##### RosettaSynonym.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaSynonymBody

> `readonly` **RosettaSynonymBody**: `object`

##### RosettaSynonymBody.name

> `readonly` **name**: `"RosettaSynonymBody"` = `RosettaSynonymBody.$type`

##### RosettaSynonymBody.properties

> `readonly` **properties**: `object`

##### RosettaSynonymBody.properties.format

> `readonly` **format**: `object`

##### RosettaSynonymBody.properties.format.name

> `readonly` **name**: `"format"` = `RosettaSynonymBody.format`

##### RosettaSynonymBody.properties.hints

> `readonly` **hints**: `object`

##### RosettaSynonymBody.properties.hints.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaSynonymBody.properties.hints.name

> `readonly` **name**: `"hints"` = `RosettaSynonymBody.hints`

##### RosettaSynonymBody.properties.mapper

> `readonly` **mapper**: `object`

##### RosettaSynonymBody.properties.mapper.name

> `readonly` **name**: `"mapper"` = `RosettaSynonymBody.mapper`

##### RosettaSynonymBody.properties.mappingLogic

> `readonly` **mappingLogic**: `object`

##### RosettaSynonymBody.properties.mappingLogic.name

> `readonly` **name**: `"mappingLogic"` = `RosettaSynonymBody.mappingLogic`

##### RosettaSynonymBody.properties.merge

> `readonly` **merge**: `object`

##### RosettaSynonymBody.properties.merge.name

> `readonly` **name**: `"merge"` = `RosettaSynonymBody.merge`

##### RosettaSynonymBody.properties.metaValues

> `readonly` **metaValues**: `object`

##### RosettaSynonymBody.properties.metaValues.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaSynonymBody.properties.metaValues.name

> `readonly` **name**: `"metaValues"` = `RosettaSynonymBody.metaValues`

##### RosettaSynonymBody.properties.patternMatch

> `readonly` **patternMatch**: `object`

##### RosettaSynonymBody.properties.patternMatch.name

> `readonly` **name**: `"patternMatch"` = `RosettaSynonymBody.patternMatch`

##### RosettaSynonymBody.properties.patternReplace

> `readonly` **patternReplace**: `object`

##### RosettaSynonymBody.properties.patternReplace.name

> `readonly` **name**: `"patternReplace"` = `RosettaSynonymBody.patternReplace`

##### RosettaSynonymBody.properties.removeHtml

> `readonly` **removeHtml**: `object`

##### RosettaSynonymBody.properties.removeHtml.defaultValue

> `readonly` **defaultValue**: `false` = `false`

##### RosettaSynonymBody.properties.removeHtml.name

> `readonly` **name**: `"removeHtml"` = `RosettaSynonymBody.removeHtml`

##### RosettaSynonymBody.properties.values

> `readonly` **values**: `object`

##### RosettaSynonymBody.properties.values.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaSynonymBody.properties.values.name

> `readonly` **name**: `"values"` = `RosettaSynonymBody.values`

##### RosettaSynonymBody.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaSynonymSource

> `readonly` **RosettaSynonymSource**: `object`

##### RosettaSynonymSource.name

> `readonly` **name**: `"RosettaSynonymSource"` = `RosettaSynonymSource.$type`

##### RosettaSynonymSource.properties

> `readonly` **properties**: `object`

##### RosettaSynonymSource.properties.externalClasses

> `readonly` **externalClasses**: `object`

##### RosettaSynonymSource.properties.externalClasses.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaSynonymSource.properties.externalClasses.name

> `readonly` **name**: `"externalClasses"` = `RosettaSynonymSource.externalClasses`

##### RosettaSynonymSource.properties.externalEnums

> `readonly` **externalEnums**: `object`

##### RosettaSynonymSource.properties.externalEnums.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaSynonymSource.properties.externalEnums.name

> `readonly` **name**: `"externalEnums"` = `RosettaSynonymSource.externalEnums`

##### RosettaSynonymSource.properties.name

> `readonly` **name**: `object`

##### RosettaSynonymSource.properties.name.name

> `readonly` **name**: `"name"` = `RosettaSynonymSource.name`

##### RosettaSynonymSource.properties.superSources

> `readonly` **superSources**: `object`

##### RosettaSynonymSource.properties.superSources.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaSynonymSource.properties.superSources.name

> `readonly` **name**: `"superSources"` = `RosettaSynonymSource.superSources`

##### RosettaSynonymSource.properties.superSources.referenceType

> `readonly` **referenceType**: `"RosettaSynonymSource"` = `RosettaSynonymSource.$type`

##### RosettaSynonymSource.superTypes

> `readonly` **superTypes**: \[`"RosettaRootElement"`\]

#### RosettaSynonymValueBase

> `readonly` **RosettaSynonymValueBase**: `object`

##### RosettaSynonymValueBase.name

> `readonly` **name**: `"RosettaSynonymValueBase"` = `RosettaSynonymValueBase.$type`

##### RosettaSynonymValueBase.properties

> `readonly` **properties**: `object`

##### RosettaSynonymValueBase.properties.maps

> `readonly` **maps**: `object`

##### RosettaSynonymValueBase.properties.maps.name

> `readonly` **name**: `"maps"` = `RosettaSynonymValueBase.maps`

##### RosettaSynonymValueBase.properties.name

> `readonly` **name**: `object`

##### RosettaSynonymValueBase.properties.name.name

> `readonly` **name**: `"name"` = `RosettaSynonymValueBase.name`

##### RosettaSynonymValueBase.properties.path

> `readonly` **path**: `object`

##### RosettaSynonymValueBase.properties.path.name

> `readonly` **name**: `"path"` = `RosettaSynonymValueBase.path`

##### RosettaSynonymValueBase.properties.refType

> `readonly` **refType**: `object`

##### RosettaSynonymValueBase.properties.refType.name

> `readonly` **name**: `"refType"` = `RosettaSynonymValueBase.refType`

##### RosettaSynonymValueBase.properties.value

> `readonly` **value**: `object`

##### RosettaSynonymValueBase.properties.value.name

> `readonly` **name**: `"value"` = `RosettaSynonymValueBase.value`

##### RosettaSynonymValueBase.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaType

> `readonly` **RosettaType**: `object`

##### RosettaType.name

> `readonly` **name**: `"RosettaType"` = `RosettaType.$type`

##### RosettaType.properties

> `readonly` **properties**: `object` = `{}`

##### RosettaType.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RosettaTypeAlias

> `readonly` **RosettaTypeAlias**: `object`

##### RosettaTypeAlias.name

> `readonly` **name**: `"RosettaTypeAlias"` = `RosettaTypeAlias.$type`

##### RosettaTypeAlias.properties

> `readonly` **properties**: `object`

##### RosettaTypeAlias.properties.conditions

> `readonly` **conditions**: `object`

##### RosettaTypeAlias.properties.conditions.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaTypeAlias.properties.conditions.name

> `readonly` **name**: `"conditions"` = `RosettaTypeAlias.conditions`

##### RosettaTypeAlias.properties.definition

> `readonly` **definition**: `object`

##### RosettaTypeAlias.properties.definition.name

> `readonly` **name**: `"definition"` = `RosettaTypeAlias.definition`

##### RosettaTypeAlias.properties.name

> `readonly` **name**: `object`

##### RosettaTypeAlias.properties.name.name

> `readonly` **name**: `"name"` = `RosettaTypeAlias.name`

##### RosettaTypeAlias.properties.parameters

> `readonly` **parameters**: `object`

##### RosettaTypeAlias.properties.parameters.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### RosettaTypeAlias.properties.parameters.name

> `readonly` **name**: `"parameters"` = `RosettaTypeAlias.parameters`

##### RosettaTypeAlias.properties.typeCall

> `readonly` **typeCall**: `object`

##### RosettaTypeAlias.properties.typeCall.name

> `readonly` **name**: `"typeCall"` = `RosettaTypeAlias.typeCall`

##### RosettaTypeAlias.superTypes

> `readonly` **superTypes**: \[`"RosettaRootElement"`, `"RosettaType"`\]

#### RosettaTypedFeature

> `readonly` **RosettaTypedFeature**: `object`

##### RosettaTypedFeature.name

> `readonly` **name**: `"RosettaTypedFeature"` = `RosettaTypedFeature.$type`

##### RosettaTypedFeature.properties

> `readonly` **properties**: `object` = `{}`

##### RosettaTypedFeature.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### RuleReferenceAnnotation

> `readonly` **RuleReferenceAnnotation**: `object`

##### RuleReferenceAnnotation.name

> `readonly` **name**: `"RuleReferenceAnnotation"` = `RuleReferenceAnnotation.$type`

##### RuleReferenceAnnotation.properties

> `readonly` **properties**: `object`

##### RuleReferenceAnnotation.properties.empty

> `readonly` **empty**: `object`

##### RuleReferenceAnnotation.properties.empty.defaultValue

> `readonly` **defaultValue**: `false` = `false`

##### RuleReferenceAnnotation.properties.empty.name

> `readonly` **name**: `"empty"` = `RuleReferenceAnnotation.empty`

##### RuleReferenceAnnotation.properties.name

> `readonly` **name**: `object`

##### RuleReferenceAnnotation.properties.name.name

> `readonly` **name**: `"name"` = `RuleReferenceAnnotation.name`

##### RuleReferenceAnnotation.properties.path

> `readonly` **path**: `object`

##### RuleReferenceAnnotation.properties.path.name

> `readonly` **name**: `"path"` = `RuleReferenceAnnotation.path`

##### RuleReferenceAnnotation.properties.reportingRule

> `readonly` **reportingRule**: `object`

##### RuleReferenceAnnotation.properties.reportingRule.name

> `readonly` **name**: `"reportingRule"` = `RuleReferenceAnnotation.reportingRule`

##### RuleReferenceAnnotation.properties.reportingRule.referenceType

> `readonly` **referenceType**: `"RosettaRule"` = `RosettaRule.$type`

##### RuleReferenceAnnotation.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### Segment

> `readonly` **Segment**: `object`

##### Segment.name

> `readonly` **name**: `"Segment"` = `Segment.$type`

##### Segment.properties

> `readonly` **properties**: `object`

##### Segment.properties.feature

> `readonly` **feature**: `object`

##### Segment.properties.feature.name

> `readonly` **name**: `"feature"` = `Segment.feature`

##### Segment.properties.feature.referenceType

> `readonly` **referenceType**: `"RosettaTypedFeature"` = `RosettaTypedFeature.$type`

##### Segment.properties.next

> `readonly` **next**: `object`

##### Segment.properties.next.name

> `readonly` **name**: `"next"` = `Segment.next`

##### Segment.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### ShortcutDeclaration

> `readonly` **ShortcutDeclaration**: `object`

##### ShortcutDeclaration.name

> `readonly` **name**: `"ShortcutDeclaration"` = `ShortcutDeclaration.$type`

##### ShortcutDeclaration.properties

> `readonly` **properties**: `object`

##### ShortcutDeclaration.properties.definition

> `readonly` **definition**: `object`

##### ShortcutDeclaration.properties.definition.name

> `readonly` **name**: `"definition"` = `ShortcutDeclaration.definition`

##### ShortcutDeclaration.properties.expression

> `readonly` **expression**: `object`

##### ShortcutDeclaration.properties.expression.name

> `readonly` **name**: `"expression"` = `ShortcutDeclaration.expression`

##### ShortcutDeclaration.properties.name

> `readonly` **name**: `object`

##### ShortcutDeclaration.properties.name.name

> `readonly` **name**: `"name"` = `ShortcutDeclaration.name`

##### ShortcutDeclaration.superTypes

> `readonly` **superTypes**: \[`"AssignPathRoot"`, `"RosettaSymbol"`\]

#### SortOperation

> `readonly` **SortOperation**: `object`

##### SortOperation.name

> `readonly` **name**: `"SortOperation"` = `SortOperation.$type`

##### SortOperation.properties

> `readonly` **properties**: `object`

##### SortOperation.properties.argument

> `readonly` **argument**: `object`

##### SortOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `SortOperation.argument`

##### SortOperation.properties.function

> `readonly` **function**: `object`

##### SortOperation.properties.function.name

> `readonly` **name**: `"function"` = `SortOperation.function`

##### SortOperation.properties.operator

> `readonly` **operator**: `object`

##### SortOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `SortOperation.operator`

##### SortOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### SumOperation

> `readonly` **SumOperation**: `object`

##### SumOperation.name

> `readonly` **name**: `"SumOperation"` = `SumOperation.$type`

##### SumOperation.properties

> `readonly` **properties**: `object`

##### SumOperation.properties.argument

> `readonly` **argument**: `object`

##### SumOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `SumOperation.argument`

##### SumOperation.properties.operator

> `readonly` **operator**: `object`

##### SumOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `SumOperation.operator`

##### SumOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### SwitchCaseGuard

> `readonly` **SwitchCaseGuard**: `object`

##### SwitchCaseGuard.name

> `readonly` **name**: `"SwitchCaseGuard"` = `SwitchCaseGuard.$type`

##### SwitchCaseGuard.properties

> `readonly` **properties**: `object`

##### SwitchCaseGuard.properties.literalGuard

> `readonly` **literalGuard**: `object`

##### SwitchCaseGuard.properties.literalGuard.name

> `readonly` **name**: `"literalGuard"` = `SwitchCaseGuard.literalGuard`

##### SwitchCaseGuard.properties.referenceGuard

> `readonly` **referenceGuard**: `object`

##### SwitchCaseGuard.properties.referenceGuard.name

> `readonly` **name**: `"referenceGuard"` = `SwitchCaseGuard.referenceGuard`

##### SwitchCaseGuard.properties.referenceGuard.referenceType

> `readonly` **referenceType**: `"SwitchCaseTarget"` = `SwitchCaseTarget.$type`

##### SwitchCaseGuard.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### SwitchCaseOrDefault

> `readonly` **SwitchCaseOrDefault**: `object`

##### SwitchCaseOrDefault.name

> `readonly` **name**: `"SwitchCaseOrDefault"` = `SwitchCaseOrDefault.$type`

##### SwitchCaseOrDefault.properties

> `readonly` **properties**: `object`

##### SwitchCaseOrDefault.properties.expression

> `readonly` **expression**: `object`

##### SwitchCaseOrDefault.properties.expression.name

> `readonly` **name**: `"expression"` = `SwitchCaseOrDefault.expression`

##### SwitchCaseOrDefault.properties.guard

> `readonly` **guard**: `object`

##### SwitchCaseOrDefault.properties.guard.name

> `readonly` **name**: `"guard"` = `SwitchCaseOrDefault.guard`

##### SwitchCaseOrDefault.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### SwitchCaseTarget

> `readonly` **SwitchCaseTarget**: `object`

##### SwitchCaseTarget.name

> `readonly` **name**: `"SwitchCaseTarget"` = `SwitchCaseTarget.$type`

##### SwitchCaseTarget.properties

> `readonly` **properties**: `object` = `{}`

##### SwitchCaseTarget.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### SwitchOperation

> `readonly` **SwitchOperation**: `object`

##### SwitchOperation.name

> `readonly` **name**: `"SwitchOperation"` = `SwitchOperation.$type`

##### SwitchOperation.properties

> `readonly` **properties**: `object`

##### SwitchOperation.properties.argument

> `readonly` **argument**: `object`

##### SwitchOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `SwitchOperation.argument`

##### SwitchOperation.properties.cases

> `readonly` **cases**: `object`

##### SwitchOperation.properties.cases.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### SwitchOperation.properties.cases.name

> `readonly` **name**: `"cases"` = `SwitchOperation.cases`

##### SwitchOperation.properties.operator

> `readonly` **operator**: `object`

##### SwitchOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `SwitchOperation.operator`

##### SwitchOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### ThenOperation

> `readonly` **ThenOperation**: `object`

##### ThenOperation.name

> `readonly` **name**: `"ThenOperation"` = `ThenOperation.$type`

##### ThenOperation.properties

> `readonly` **properties**: `object`

##### ThenOperation.properties.argument

> `readonly` **argument**: `object`

##### ThenOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `ThenOperation.argument`

##### ThenOperation.properties.function

> `readonly` **function**: `object`

##### ThenOperation.properties.function.name

> `readonly` **name**: `"function"` = `ThenOperation.function`

##### ThenOperation.properties.operator

> `readonly` **operator**: `object`

##### ThenOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `ThenOperation.operator`

##### ThenOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### ToDateOperation

> `readonly` **ToDateOperation**: `object`

##### ToDateOperation.name

> `readonly` **name**: `"ToDateOperation"` = `ToDateOperation.$type`

##### ToDateOperation.properties

> `readonly` **properties**: `object`

##### ToDateOperation.properties.argument

> `readonly` **argument**: `object`

##### ToDateOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `ToDateOperation.argument`

##### ToDateOperation.properties.operator

> `readonly` **operator**: `object`

##### ToDateOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `ToDateOperation.operator`

##### ToDateOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### ToDateTimeOperation

> `readonly` **ToDateTimeOperation**: `object`

##### ToDateTimeOperation.name

> `readonly` **name**: `"ToDateTimeOperation"` = `ToDateTimeOperation.$type`

##### ToDateTimeOperation.properties

> `readonly` **properties**: `object`

##### ToDateTimeOperation.properties.argument

> `readonly` **argument**: `object`

##### ToDateTimeOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `ToDateTimeOperation.argument`

##### ToDateTimeOperation.properties.operator

> `readonly` **operator**: `object`

##### ToDateTimeOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `ToDateTimeOperation.operator`

##### ToDateTimeOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### ToEnumOperation

> `readonly` **ToEnumOperation**: `object`

##### ToEnumOperation.name

> `readonly` **name**: `"ToEnumOperation"` = `ToEnumOperation.$type`

##### ToEnumOperation.properties

> `readonly` **properties**: `object`

##### ToEnumOperation.properties.argument

> `readonly` **argument**: `object`

##### ToEnumOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `ToEnumOperation.argument`

##### ToEnumOperation.properties.enumeration

> `readonly` **enumeration**: `object`

##### ToEnumOperation.properties.enumeration.name

> `readonly` **name**: `"enumeration"` = `ToEnumOperation.enumeration`

##### ToEnumOperation.properties.enumeration.referenceType

> `readonly` **referenceType**: `"RosettaEnumeration"` = `RosettaEnumeration.$type`

##### ToEnumOperation.properties.operator

> `readonly` **operator**: `object`

##### ToEnumOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `ToEnumOperation.operator`

##### ToEnumOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### ToIntOperation

> `readonly` **ToIntOperation**: `object`

##### ToIntOperation.name

> `readonly` **name**: `"ToIntOperation"` = `ToIntOperation.$type`

##### ToIntOperation.properties

> `readonly` **properties**: `object`

##### ToIntOperation.properties.argument

> `readonly` **argument**: `object`

##### ToIntOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `ToIntOperation.argument`

##### ToIntOperation.properties.operator

> `readonly` **operator**: `object`

##### ToIntOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `ToIntOperation.operator`

##### ToIntOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### ToNumberOperation

> `readonly` **ToNumberOperation**: `object`

##### ToNumberOperation.name

> `readonly` **name**: `"ToNumberOperation"` = `ToNumberOperation.$type`

##### ToNumberOperation.properties

> `readonly` **properties**: `object`

##### ToNumberOperation.properties.argument

> `readonly` **argument**: `object`

##### ToNumberOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `ToNumberOperation.argument`

##### ToNumberOperation.properties.operator

> `readonly` **operator**: `object`

##### ToNumberOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `ToNumberOperation.operator`

##### ToNumberOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### ToStringOperation

> `readonly` **ToStringOperation**: `object`

##### ToStringOperation.name

> `readonly` **name**: `"ToStringOperation"` = `ToStringOperation.$type`

##### ToStringOperation.properties

> `readonly` **properties**: `object`

##### ToStringOperation.properties.argument

> `readonly` **argument**: `object`

##### ToStringOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `ToStringOperation.argument`

##### ToStringOperation.properties.operator

> `readonly` **operator**: `object`

##### ToStringOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `ToStringOperation.operator`

##### ToStringOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### ToTimeOperation

> `readonly` **ToTimeOperation**: `object`

##### ToTimeOperation.name

> `readonly` **name**: `"ToTimeOperation"` = `ToTimeOperation.$type`

##### ToTimeOperation.properties

> `readonly` **properties**: `object`

##### ToTimeOperation.properties.argument

> `readonly` **argument**: `object`

##### ToTimeOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `ToTimeOperation.argument`

##### ToTimeOperation.properties.operator

> `readonly` **operator**: `object`

##### ToTimeOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `ToTimeOperation.operator`

##### ToTimeOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### ToZonedDateTimeOperation

> `readonly` **ToZonedDateTimeOperation**: `object`

##### ToZonedDateTimeOperation.name

> `readonly` **name**: `"ToZonedDateTimeOperation"` = `ToZonedDateTimeOperation.$type`

##### ToZonedDateTimeOperation.properties

> `readonly` **properties**: `object`

##### ToZonedDateTimeOperation.properties.argument

> `readonly` **argument**: `object`

##### ToZonedDateTimeOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `ToZonedDateTimeOperation.argument`

##### ToZonedDateTimeOperation.properties.operator

> `readonly` **operator**: `object`

##### ToZonedDateTimeOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `ToZonedDateTimeOperation.operator`

##### ToZonedDateTimeOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### TypeCall

> `readonly` **TypeCall**: `object`

##### TypeCall.name

> `readonly` **name**: `"TypeCall"` = `TypeCall.$type`

##### TypeCall.properties

> `readonly` **properties**: `object`

##### TypeCall.properties.arguments

> `readonly` **arguments**: `object`

##### TypeCall.properties.arguments.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### TypeCall.properties.arguments.name

> `readonly` **name**: `"arguments"` = `TypeCall.arguments`

##### TypeCall.properties.type

> `readonly` **type**: `object`

##### TypeCall.properties.type.name

> `readonly` **name**: `"type"` = `TypeCall.type`

##### TypeCall.properties.type.referenceType

> `readonly` **referenceType**: `"RosettaType"` = `RosettaType.$type`

##### TypeCall.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### TypeCallArgument

> `readonly` **TypeCallArgument**: `object`

##### TypeCallArgument.name

> `readonly` **name**: `"TypeCallArgument"` = `TypeCallArgument.$type`

##### TypeCallArgument.properties

> `readonly` **properties**: `object`

##### TypeCallArgument.properties.parameter

> `readonly` **parameter**: `object`

##### TypeCallArgument.properties.parameter.name

> `readonly` **name**: `"parameter"` = `TypeCallArgument.parameter`

##### TypeCallArgument.properties.parameter.referenceType

> `readonly` **referenceType**: `"TypeParameter"` = `TypeParameter.$type`

##### TypeCallArgument.properties.value

> `readonly` **value**: `object`

##### TypeCallArgument.properties.value.name

> `readonly` **name**: `"value"` = `TypeCallArgument.value`

##### TypeCallArgument.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### TypeParameter

> `readonly` **TypeParameter**: `object`

##### TypeParameter.name

> `readonly` **name**: `"TypeParameter"` = `TypeParameter.$type`

##### TypeParameter.properties

> `readonly` **properties**: `object`

##### TypeParameter.properties.definition

> `readonly` **definition**: `object`

##### TypeParameter.properties.definition.name

> `readonly` **name**: `"definition"` = `TypeParameter.definition`

##### TypeParameter.properties.name

> `readonly` **name**: `object`

##### TypeParameter.properties.name.name

> `readonly` **name**: `"name"` = `TypeParameter.name`

##### TypeParameter.properties.typeCall

> `readonly` **typeCall**: `object`

##### TypeParameter.properties.typeCall.name

> `readonly` **name**: `"typeCall"` = `TypeParameter.typeCall`

##### TypeParameter.superTypes

> `readonly` **superTypes**: \[`"RosettaSymbol"`\]

#### WithMetaEntry

> `readonly` **WithMetaEntry**: `object`

##### WithMetaEntry.name

> `readonly` **name**: `"WithMetaEntry"` = `WithMetaEntry.$type`

##### WithMetaEntry.properties

> `readonly` **properties**: `object`

##### WithMetaEntry.properties.key

> `readonly` **key**: `object`

##### WithMetaEntry.properties.key.name

> `readonly` **name**: `"key"` = `WithMetaEntry.key`

##### WithMetaEntry.properties.key.referenceType

> `readonly` **referenceType**: `"RosettaFeature"` = `RosettaFeature.$type`

##### WithMetaEntry.properties.value

> `readonly` **value**: `object`

##### WithMetaEntry.properties.value.name

> `readonly` **name**: `"value"` = `WithMetaEntry.value`

##### WithMetaEntry.superTypes

> `readonly` **superTypes**: \[\] = `[]`

#### WithMetaOperation

> `readonly` **WithMetaOperation**: `object`

##### WithMetaOperation.name

> `readonly` **name**: `"WithMetaOperation"` = `WithMetaOperation.$type`

##### WithMetaOperation.properties

> `readonly` **properties**: `object`

##### WithMetaOperation.properties.argument

> `readonly` **argument**: `object`

##### WithMetaOperation.properties.argument.name

> `readonly` **name**: `"argument"` = `WithMetaOperation.argument`

##### WithMetaOperation.properties.entries

> `readonly` **entries**: `object`

##### WithMetaOperation.properties.entries.defaultValue

> `readonly` **defaultValue**: \[\] = `[]`

##### WithMetaOperation.properties.entries.name

> `readonly` **name**: `"entries"` = `WithMetaOperation.entries`

##### WithMetaOperation.properties.operator

> `readonly` **operator**: `object`

##### WithMetaOperation.properties.operator.name

> `readonly` **name**: `"operator"` = `WithMetaOperation.operator`

##### WithMetaOperation.superTypes

> `readonly` **superTypes**: \[`"RosettaExpression"`\]

#### Overrides

`langium.AbstractAstReflection.types`

## Methods

### getAllSubTypes()

> **getAllSubTypes**(`type`): `string`[]

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/syntax-tree.d.ts:155

#### Parameters

##### type

`string`

#### Returns

`string`[]

#### Inherited from

`langium.AbstractAstReflection.getAllSubTypes`

***

### getAllTypes()

> **getAllTypes**(): `string`[]

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/syntax-tree.d.ts:150

#### Returns

`string`[]

#### Inherited from

`langium.AbstractAstReflection.getAllTypes`

***

### getReferenceType()

> **getReferenceType**(`refInfo`): `string`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/syntax-tree.d.ts:151

#### Parameters

##### refInfo

`ReferenceInfo`

#### Returns

`string`

#### Inherited from

`langium.AbstractAstReflection.getReferenceType`

***

### getTypeMetaData()

> **getTypeMetaData**(`type`): `TypeMetaData`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/syntax-tree.d.ts:152

#### Parameters

##### type

`string`

#### Returns

`TypeMetaData`

#### Inherited from

`langium.AbstractAstReflection.getTypeMetaData`

***

### isInstance()

> **isInstance**(`node`, `type`): `boolean`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/syntax-tree.d.ts:153

#### Parameters

##### node

`unknown`

##### type

`string`

#### Returns

`boolean`

#### Inherited from

`langium.AbstractAstReflection.isInstance`

***

### isSubtype()

> **isSubtype**(`subtype`, `supertype`): `boolean`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/syntax-tree.d.ts:154

#### Parameters

##### subtype

`string`

##### supertype

`string`

#### Returns

`boolean`

#### Inherited from

`langium.AbstractAstReflection.isSubtype`
