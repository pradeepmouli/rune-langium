# Types & Enums

## Types

### `RuneDslTerminalNames`
```ts
keyof typeof RuneDslTerminals
```

### `RuneDslKeywordNames`
```ts
"(" | ")" | "*" | "+" | "," | "-" | "->" | "->>" | "." | ".." | "..." | "/" | ":" | ";" | "<" | "<=" | "<>" | "=" | ">" | ">=" | "ASATP" | "E" | "False" | "T+1" | "T+2" | "T+3" | "T+4" | "T+5" | "True" | "[" | "]" | "absent" | "add" | "alias" | "all" | "and" | "annotation" | "any" | "as" | "as-key" | "basicType" | "body" | "choice" | "componentID" | "condition" | "condition-func" | "condition-path" | "contains" | "corpus" | "count" | "dateFormat" | "default" | "definition" | "disjoint" | "displayName" | "distinct" | "docReference" | "e" | "eligibility" | "else" | "empty" | "enum" | "enums" | "exists" | "extends" | "extract" | "filter" | "first" | "flatten" | "for" | "from" | "func" | "function" | "hint" | "if" | "import" | "in" | "inputs" | "is" | "isEvent" | "isProduct" | "item" | "join" | "label" | "last" | "library" | "mapper" | "maps" | "max" | "merge" | "meta" | "metaType" | "min" | "multiple" | "namespace" | "one-of" | "only" | "only-element" | "optional" | "or" | "output" | "override" | "path" | "pattern" | "post-condition" | "prefix" | "provision" | "rationale" | "rationale_author" | "real-time" | "recordType" | "reduce" | "regulatoryReference" | "removeHtml" | "report" | "reportedField" | "reporting" | "required" | "reverse" | "root" | "rosettaPath" | "rule" | "ruleReference" | "scope" | "segment" | "set" | "single" | "sort" | "source" | "standard" | "structured_provision" | "sum" | "super" | "switch" | "synonym" | "tag" | "then" | "to" | "to-date" | "to-date-time" | "to-enum" | "to-int" | "to-number" | "to-string" | "to-time" | "to-zoned-date-time" | "type" | "typeAlias" | "using" | "value" | "version" | "when" | "with" | "with-meta" | "{" | "}"
```

### `RuneDslTokenNames`
```ts
RuneDslTerminalNames | RuneDslKeywordNames
```

### `Annotation`

### `AnnotationDeepPath`

### `AnnotationPath`

### `AnnotationPathAttributeReference`

### `AnnotationPathExpression`
```ts
AnnotationDeepPath | AnnotationPath | AnnotationPathAttributeReference | RosettaImplicitVariable
```

### `AnnotationQualifier`

### `AnnotationRef`

### `ArithmeticOperation`

### `AsKeyOperation`

### `AssignPathRoot`
```ts
Attribute | ShortcutDeclaration
```

### `Attribute`

### `AttributeOrChoiceOption`
```ts
Attribute | ChoiceOption
```

### `BigDecimal`
```ts
string
```

### `CardinalityModifier`
```ts
"all" | "any"
```

### `Choice`

### `ChoiceOperation`

### `ChoiceOption`

### `ClosureParameter`

### `ComparisonOperation`

### `Condition`

### `ConstructorKeyValuePair`

### `Data`

### `DataOrChoice`
```ts
Choice | Data
```

### `DefaultOperation`

### `DistinctOperation`

### `DocumentRationale`

### `EqualityOperation`

### `ExistsModifier`
```ts
"multiple" | "single"
```

### `ExternalValueOperator`
```ts
"+" | "-"
```

### `FilterOperation`

### `FirstOperation`

### `FlattenOperation`

### `Import`

### `InlineFunction`

### `Integer`
```ts
bigint
```

### `JoinOperation`

### `LabelAnnotation`

### `LastOperation`

### `ListLiteral`

### `LogicalOperation`

### `MapOperation`

### `MaxOperation`

### `MinOperation`

### `Necessity`
```ts
"optional" | "required"
```

### `OneOfOperation`

### `Operation`

### `QualifiedName`
```ts
string
```

### `QualifiedNameWithWildcard`
```ts
string
```

### `ReduceOperation`

### `RegulatoryDocumentReference`

### `ReverseOperation`

### `RosettaAbsentExpression`

### `RosettaAttributeReference`

### `RosettaBasicType`

### `RosettaBody`

### `RosettaBooleanLiteral`

### `RosettaCallableWithArgs`
```ts
RosettaExternalFunction | RosettaFunction | RosettaRule
```

### `RosettaCardinality`

### `RosettaClassSynonym`

### `RosettaConditionalExpression`

### `RosettaConstructorExpression`

### `RosettaContainsExpression`

### `RosettaCorpus`

### `RosettaCountOperation`

### `RosettaDataReference`

### `RosettaDeepFeatureCall`

### `RosettaDisjointExpression`

### `RosettaDocReference`

### `RosettaEnumeration`

### `RosettaEnumSynonym`

### `RosettaEnumValue`

### `RosettaEnumValueReference`

### `RosettaExistsExpression`

### `RosettaExpression`
```ts
ArithmeticOperation | AsKeyOperation | ChoiceOperation | ComparisonOperation | DefaultOperation | DistinctOperation | EqualityOperation | FilterOperation | FirstOperation | FlattenOperation | JoinOperation | LastOperation | ListLiteral | LogicalOperation | MapOperation | MaxOperation | MinOperation | OneOfOperation | ReduceOperation | ReverseOperation | RosettaAbsentExpression | RosettaConditionalExpression | RosettaConstructorExpression | RosettaContainsExpression | RosettaCountOperation | RosettaDeepFeatureCall | RosettaDisjointExpression | RosettaExistsExpression | RosettaFeatureCall | RosettaImplicitVariable | RosettaLiteral | RosettaOnlyElement | RosettaOnlyExistsExpression | RosettaSuperCall | RosettaSymbolReference | SortOperation | SumOperation | SwitchOperation | ThenOperation | ToDateOperation | ToDateTimeOperation | ToEnumOperation | ToIntOperation | ToNumberOperation | ToStringOperation | ToTimeOperation | ToZonedDateTimeOperation | WithMetaOperation
```

### `RosettaExternalClass`

### `RosettaExternalClassSynonym`

### `RosettaExternalEnum`

### `RosettaExternalEnumValue`

### `RosettaExternalFunction`

### `RosettaExternalRegularAttribute`

### `RosettaExternalRuleSource`

### `RosettaExternalSynonym`

### `RosettaFeature`
```ts
Attribute | ChoiceOption | RosettaEnumValue | RosettaMetaType | RosettaRecordFeature
```

### `RosettaFeatureCall`

### `RosettaFunction`

### `RosettaImplicitVariable`

### `RosettaIntLiteral`

### `RosettaLiteral`
```ts
RosettaBooleanLiteral | RosettaIntLiteral | RosettaNumberLiteral | RosettaStringLiteral
```

### `RosettaMapPath`

### `RosettaMapPathValue`

### `RosettaMapping`

### `RosettaMappingInstance`

### `RosettaMappingPathTests`

### `RosettaMapRosettaPath`

### `RosettaMapTest`
```ts
RosettaMapPath | RosettaMapRosettaPath | RosettaMapTestExpression | RosettaMapTestFunc
```

### `RosettaMapTestAbsentExpression`

### `RosettaMapTestEqualityOperation`

### `RosettaMapTestExistsExpression`

### `RosettaMapTestExpression`
```ts
RosettaEnumValueReference | RosettaLiteral | RosettaMapPathValue | RosettaMapTestAbsentExpression | RosettaMapTestEqualityOperation | RosettaMapTestExistsExpression
```

### `RosettaMapTestFunc`

### `RosettaMergeSynonymValue`

### `RosettaMetaType`

### `RosettaModel`

### `RosettaNumberLiteral`

### `RosettaOnlyElement`

### `RosettaOnlyExistsExpression`

### `RosettaParameter`

### `RosettaQualifiableConfiguration`

### `RosettaQualifiableType`
```ts
"isEvent" | "isProduct"
```

### `RosettaRecordFeature`

### `RosettaRecordType`

### `RosettaReport`

### `RosettaRootElement`
```ts
Annotation | Choice | Data | RosettaBasicType | RosettaBody | RosettaCorpus | RosettaEnumeration | RosettaExternalFunction | RosettaExternalRuleSource | RosettaFunction | RosettaMetaType | RosettaRecordType | RosettaReport | RosettaRule | RosettaSegment | RosettaSynonymSource | RosettaTypeAlias
```

### `RosettaRule`

### `RosettaScope`

### `RosettaSegment`

### `RosettaSegmentRef`

### `RosettaStringLiteral`

### `RosettaSuperCall`

### `RosettaSymbol`
```ts
Attribute | Choice | ClosureParameter | Data | RosettaEnumValue | RosettaEnumeration | RosettaExternalFunction | RosettaFunction | RosettaMetaType | RosettaParameter | RosettaRule | ShortcutDeclaration | TypeParameter
```

### `RosettaSymbolReference`

### `RosettaSynonym`

### `RosettaSynonymBody`

### `RosettaSynonymRef`
```ts
"componentID" | "tag"
```

### `RosettaSynonymSource`

### `RosettaSynonymValueBase`

### `RosettaType`
```ts
Choice | Data | RosettaBasicType | RosettaEnumeration | RosettaRecordType | RosettaTypeAlias
```

### `RosettaTypeAlias`

### `RosettaTypedFeature`
```ts
Attribute | RosettaRecordFeature
```

### `RuleReferenceAnnotation`

### `Segment`

### `ShortcutDeclaration`

### `SortOperation`

### `SumOperation`

### `SwitchCaseGuard`

### `SwitchCaseOrDefault`

### `SwitchCaseTarget`
```ts
Choice | Data | RosettaEnumValue | RosettaEnumeration
```

### `SwitchOperation`

### `ThenOperation`

### `ToDateOperation`

### `ToDateTimeOperation`

### `ToEnumOperation`

### `ToIntOperation`

### `ToNumberOperation`

### `ToStringOperation`

### `ToTimeOperation`

### `ToZonedDateTimeOperation`

### `TypeCall`

### `TypeCallArgument`

### `TypeParameter`

### `TypeParameterValidID`
```ts
"max" | "min" | ValidID
```

### `ValidID`
```ts
"condition" | "pattern" | "scope" | "source" | "value" | "version" | string
```

### `WithMetaEntry`

### `WithMetaOperation`

### `RuneDslAstType`

### `ParseResult`
Result of parsing a Rosetta DSL source string.

### `RuneDslServices`
Union type for all services available in the Rune DSL language.
```ts
LangiumCoreServices
```
