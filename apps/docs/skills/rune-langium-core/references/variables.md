# Variables & Constants

## ast

### `RuneDslTerminals`
```ts
const RuneDslTerminals: { ID: RegExp; INT: RegExp; STRING: RegExp; ML_COMMENT: RegExp; SL_COMMENT: RegExp; WS: RegExp }
```

### `Annotation`
```ts
let Annotation: { $type: "Annotation"; attributes: "attributes"; definition: "definition"; name: "name"; prefix: "prefix" }
```

### `AnnotationDeepPath`
```ts
let AnnotationDeepPath: { $type: "AnnotationDeepPath"; attribute: "attribute"; operator: "operator"; receiver: "receiver" }
```

### `AnnotationPath`
```ts
let AnnotationPath: { $type: "AnnotationPath"; attribute: "attribute"; operator: "operator"; receiver: "receiver" }
```

### `AnnotationPathAttributeReference`
```ts
let AnnotationPathAttributeReference: { $type: "AnnotationPathAttributeReference"; attribute: "attribute" }
```

### `AnnotationPathExpression`
```ts
let AnnotationPathExpression: { $type: "AnnotationPathExpression" }
```

### `AnnotationQualifier`
```ts
let AnnotationQualifier: { $type: "AnnotationQualifier"; qualName: "qualName"; qualPath: "qualPath"; qualValue: "qualValue" }
```

### `AnnotationRef`
```ts
let AnnotationRef: { $type: "AnnotationRef"; annotation: "annotation"; attribute: "attribute"; qualifiers: "qualifiers" }
```

### `ArithmeticOperation`
```ts
let ArithmeticOperation: { $type: "ArithmeticOperation"; left: "left"; operator: "operator"; right: "right" }
```

### `AsKeyOperation`
```ts
let AsKeyOperation: { $type: "AsKeyOperation"; argument: "argument"; operator: "operator" }
```

### `AssignPathRoot`
```ts
let AssignPathRoot: { $type: "AssignPathRoot" }
```

### `Attribute`
```ts
let Attribute: { $type: "Attribute"; annotations: "annotations"; card: "card"; definition: "definition"; labels: "labels"; name: "name"; override: "override"; references: "references"; ruleReferences: "ruleReferences"; synonyms: "synonyms"; typeCall: "typeCall"; typeCallArgs: "typeCallArgs" }
```

### `AttributeOrChoiceOption`
```ts
let AttributeOrChoiceOption: { $type: "AttributeOrChoiceOption" }
```

### `Choice`
```ts
let Choice: { $type: "Choice"; annotations: "annotations"; attributes: "attributes"; definition: "definition"; name: "name"; synonyms: "synonyms" }
```

### `ChoiceOperation`
```ts
let ChoiceOperation: { $type: "ChoiceOperation"; argument: "argument"; attributes: "attributes"; necessity: "necessity"; operator: "operator" }
```

### `ChoiceOption`
```ts
let ChoiceOption: { $type: "ChoiceOption"; annotations: "annotations"; definition: "definition"; labels: "labels"; references: "references"; ruleReferences: "ruleReferences"; synonyms: "synonyms"; typeCall: "typeCall" }
```

### `ClosureParameter`
```ts
let ClosureParameter: { $type: "ClosureParameter"; name: "name" }
```

### `ComparisonOperation`
```ts
let ComparisonOperation: { $type: "ComparisonOperation"; cardMod: "cardMod"; left: "left"; operator: "operator"; right: "right" }
```

### `Condition`
```ts
let Condition: { $type: "Condition"; annotations: "annotations"; definition: "definition"; expression: "expression"; name: "name"; postCondition: "postCondition"; references: "references" }
```

### `ConstructorKeyValuePair`
```ts
let ConstructorKeyValuePair: { $type: "ConstructorKeyValuePair"; key: "key"; value: "value" }
```

### `Data`
```ts
let Data: { $type: "Data"; annotations: "annotations"; attributes: "attributes"; conditions: "conditions"; definition: "definition"; name: "name"; references: "references"; superType: "superType"; synonyms: "synonyms" }
```

### `DataOrChoice`
```ts
let DataOrChoice: { $type: "DataOrChoice" }
```

### `DefaultOperation`
```ts
let DefaultOperation: { $type: "DefaultOperation"; left: "left"; operator: "operator"; right: "right" }
```

### `DistinctOperation`
```ts
let DistinctOperation: { $type: "DistinctOperation"; argument: "argument"; operator: "operator" }
```

### `DocumentRationale`
```ts
let DocumentRationale: { $type: "DocumentRationale"; rationale: "rationale"; rationaleAuthor: "rationaleAuthor" }
```

### `EqualityOperation`
```ts
let EqualityOperation: { $type: "EqualityOperation"; cardMod: "cardMod"; left: "left"; operator: "operator"; right: "right" }
```

### `FilterOperation`
```ts
let FilterOperation: { $type: "FilterOperation"; argument: "argument"; function: "function"; operator: "operator" }
```

### `FirstOperation`
```ts
let FirstOperation: { $type: "FirstOperation"; argument: "argument"; operator: "operator" }
```

### `FlattenOperation`
```ts
let FlattenOperation: { $type: "FlattenOperation"; argument: "argument"; operator: "operator" }
```

### `Import`
```ts
let Import: { $type: "Import"; importedNamespace: "importedNamespace"; namespaceAlias: "namespaceAlias" }
```

### `InlineFunction`
```ts
let InlineFunction: { $type: "InlineFunction"; body: "body"; parameters: "parameters" }
```

### `JoinOperation`
```ts
let JoinOperation: { $type: "JoinOperation"; left: "left"; operator: "operator"; right: "right" }
```

### `LabelAnnotation`
```ts
let LabelAnnotation: { $type: "LabelAnnotation"; deprecatedAs: "deprecatedAs"; label: "label"; name: "name"; path: "path" }
```

### `LastOperation`
```ts
let LastOperation: { $type: "LastOperation"; argument: "argument"; operator: "operator" }
```

### `ListLiteral`
```ts
let ListLiteral: { $type: "ListLiteral"; elements: "elements" }
```

### `LogicalOperation`
```ts
let LogicalOperation: { $type: "LogicalOperation"; left: "left"; operator: "operator"; right: "right" }
```

### `MapOperation`
```ts
let MapOperation: { $type: "MapOperation"; argument: "argument"; function: "function"; operator: "operator" }
```

### `MaxOperation`
```ts
let MaxOperation: { $type: "MaxOperation"; argument: "argument"; function: "function"; operator: "operator" }
```

### `MinOperation`
```ts
let MinOperation: { $type: "MinOperation"; argument: "argument"; function: "function"; operator: "operator" }
```

### `OneOfOperation`
```ts
let OneOfOperation: { $type: "OneOfOperation"; argument: "argument"; operator: "operator" }
```

### `Operation`
```ts
let Operation: { $type: "Operation"; add: "add"; assignRoot: "assignRoot"; definition: "definition"; expression: "expression"; path: "path" }
```

### `ReduceOperation`
```ts
let ReduceOperation: { $type: "ReduceOperation"; argument: "argument"; function: "function"; operator: "operator" }
```

### `RegulatoryDocumentReference`
```ts
let RegulatoryDocumentReference: { $type: "RegulatoryDocumentReference"; body: "body"; corpusList: "corpusList"; segments: "segments" }
```

### `ReverseOperation`
```ts
let ReverseOperation: { $type: "ReverseOperation"; argument: "argument"; operator: "operator" }
```

### `RosettaAbsentExpression`
```ts
let RosettaAbsentExpression: { $type: "RosettaAbsentExpression"; argument: "argument"; operator: "operator" }
```

### `RosettaAttributeReference`
```ts
let RosettaAttributeReference: { $type: "RosettaAttributeReference"; attribute: "attribute"; receiver: "receiver" }
```

### `RosettaBasicType`
```ts
let RosettaBasicType: { $type: "RosettaBasicType"; definition: "definition"; name: "name"; parameters: "parameters" }
```

### `RosettaBody`
```ts
let RosettaBody: { $type: "RosettaBody"; bodyType: "bodyType"; definition: "definition"; name: "name" }
```

### `RosettaBooleanLiteral`
```ts
let RosettaBooleanLiteral: { $type: "RosettaBooleanLiteral"; value: "value" }
```

### `RosettaCallableWithArgs`
```ts
let RosettaCallableWithArgs: { $type: "RosettaCallableWithArgs" }
```

### `RosettaCardinality`
```ts
let RosettaCardinality: { $type: "RosettaCardinality"; inf: "inf"; sup: "sup"; unbounded: "unbounded" }
```

### `RosettaClassSynonym`
```ts
let RosettaClassSynonym: { $type: "RosettaClassSynonym"; metaValue: "metaValue"; sources: "sources"; value: "value" }
```

### `RosettaConditionalExpression`
```ts
let RosettaConditionalExpression: { $type: "RosettaConditionalExpression"; elsethen: "elsethen"; full: "full"; if: "if"; ifthen: "ifthen" }
```

### `RosettaConstructorExpression`
```ts
let RosettaConstructorExpression: { $type: "RosettaConstructorExpression"; constructorTypeArgs: "constructorTypeArgs"; implicitEmpty: "implicitEmpty"; typeRef: "typeRef"; values: "values" }
```

### `RosettaContainsExpression`
```ts
let RosettaContainsExpression: { $type: "RosettaContainsExpression"; left: "left"; operator: "operator"; right: "right" }
```

### `RosettaCorpus`
```ts
let RosettaCorpus: { $type: "RosettaCorpus"; body: "body"; corpusType: "corpusType"; definition: "definition"; displayName: "displayName"; name: "name" }
```

### `RosettaCountOperation`
```ts
let RosettaCountOperation: { $type: "RosettaCountOperation"; argument: "argument"; operator: "operator" }
```

### `RosettaDataReference`
```ts
let RosettaDataReference: { $type: "RosettaDataReference"; attribute: "attribute"; data: "data"; receiver: "receiver" }
```

### `RosettaDeepFeatureCall`
```ts
let RosettaDeepFeatureCall: { $type: "RosettaDeepFeatureCall"; feature: "feature"; receiver: "receiver" }
```

### `RosettaDisjointExpression`
```ts
let RosettaDisjointExpression: { $type: "RosettaDisjointExpression"; left: "left"; operator: "operator"; right: "right" }
```

### `RosettaDocReference`
```ts
let RosettaDocReference: { $type: "RosettaDocReference"; docReference: "docReference"; name: "name"; path: "path"; provision: "provision"; rationales: "rationales"; reportedField: "reportedField"; structuredProvision: "structuredProvision" }
```

### `RosettaEnumeration`
```ts
let RosettaEnumeration: { $type: "RosettaEnumeration"; annotations: "annotations"; definition: "definition"; enumValues: "enumValues"; name: "name"; parent: "parent"; references: "references"; synonyms: "synonyms" }
```

### `RosettaEnumSynonym`
```ts
let RosettaEnumSynonym: { $type: "RosettaEnumSynonym"; definition: "definition"; patternMatch: "patternMatch"; patternReplace: "patternReplace"; removeHtml: "removeHtml"; sources: "sources"; synonymValue: "synonymValue" }
```

### `RosettaEnumValue`
```ts
let RosettaEnumValue: { $type: "RosettaEnumValue"; annotations: "annotations"; definition: "definition"; display: "display"; enumSynonyms: "enumSynonyms"; name: "name"; references: "references" }
```

### `RosettaEnumValueReference`
```ts
let RosettaEnumValueReference: { $type: "RosettaEnumValueReference"; enumeration: "enumeration"; value: "value" }
```

### `RosettaExistsExpression`
```ts
let RosettaExistsExpression: { $type: "RosettaExistsExpression"; argument: "argument"; modifier: "modifier"; operator: "operator" }
```

### `RosettaExpression`
```ts
let RosettaExpression: { $type: "RosettaExpression" }
```

### `RosettaExternalClass`
```ts
let RosettaExternalClass: { $type: "RosettaExternalClass"; data: "data"; externalClassSynonyms: "externalClassSynonyms"; regularAttributes: "regularAttributes" }
```

### `RosettaExternalClassSynonym`
```ts
let RosettaExternalClassSynonym: { $type: "RosettaExternalClassSynonym"; metaValue: "metaValue"; value: "value" }
```

### `RosettaExternalEnum`
```ts
let RosettaExternalEnum: { $type: "RosettaExternalEnum"; enumeration: "enumeration"; regularValues: "regularValues" }
```

### `RosettaExternalEnumValue`
```ts
let RosettaExternalEnumValue: { $type: "RosettaExternalEnumValue"; enumRef: "enumRef"; externalEnumSynonyms: "externalEnumSynonyms"; operator: "operator" }
```

### `RosettaExternalFunction`
```ts
let RosettaExternalFunction: { $type: "RosettaExternalFunction"; definition: "definition"; name: "name"; parameters: "parameters"; typeCall: "typeCall" }
```

### `RosettaExternalRegularAttribute`
```ts
let RosettaExternalRegularAttribute: { $type: "RosettaExternalRegularAttribute"; attributeRef: "attributeRef"; externalRuleReferences: "externalRuleReferences"; externalSynonyms: "externalSynonyms"; operator: "operator" }
```

### `RosettaExternalRuleSource`
```ts
let RosettaExternalRuleSource: { $type: "RosettaExternalRuleSource"; externalClasses: "externalClasses"; externalEnums: "externalEnums"; name: "name"; superSources: "superSources" }
```

### `RosettaExternalSynonym`
```ts
let RosettaExternalSynonym: { $type: "RosettaExternalSynonym"; body: "body" }
```

### `RosettaFeature`
```ts
let RosettaFeature: { $type: "RosettaFeature" }
```

### `RosettaFeatureCall`
```ts
let RosettaFeatureCall: { $type: "RosettaFeatureCall"; feature: "feature"; receiver: "receiver" }
```

### `RosettaFunction`
```ts
let RosettaFunction: { $type: "RosettaFunction"; annotations: "annotations"; conditions: "conditions"; definition: "definition"; dispatchAttribute: "dispatchAttribute"; dispatchValue: "dispatchValue"; inputs: "inputs"; name: "name"; operations: "operations"; output: "output"; postConditions: "postConditions"; references: "references"; shortcuts: "shortcuts"; superFunction: "superFunction" }
```

### `RosettaImplicitVariable`
```ts
let RosettaImplicitVariable: { $type: "RosettaImplicitVariable"; name: "name" }
```

### `RosettaIntLiteral`
```ts
let RosettaIntLiteral: { $type: "RosettaIntLiteral"; value: "value" }
```

### `RosettaLiteral`
```ts
let RosettaLiteral: { $type: "RosettaLiteral" }
```

### `RosettaMapPath`
```ts
let RosettaMapPath: { $type: "RosettaMapPath"; path: "path" }
```

### `RosettaMapPathValue`
```ts
let RosettaMapPathValue: { $type: "RosettaMapPathValue"; path: "path" }
```

### `RosettaMapping`
```ts
let RosettaMapping: { $type: "RosettaMapping"; instances: "instances" }
```

### `RosettaMappingInstance`
```ts
let RosettaMappingInstance: { $type: "RosettaMappingInstance"; default: "default"; set: "set"; when: "when" }
```

### `RosettaMappingPathTests`
```ts
let RosettaMappingPathTests: { $type: "RosettaMappingPathTests"; tests: "tests" }
```

### `RosettaMapRosettaPath`
```ts
let RosettaMapRosettaPath: { $type: "RosettaMapRosettaPath"; path: "path" }
```

### `RosettaMapTest`
```ts
let RosettaMapTest: { $type: "RosettaMapTest" }
```

### `RosettaMapTestAbsentExpression`
```ts
let RosettaMapTestAbsentExpression: { $type: "RosettaMapTestAbsentExpression"; argument: "argument" }
```

### `RosettaMapTestEqualityOperation`
```ts
let RosettaMapTestEqualityOperation: { $type: "RosettaMapTestEqualityOperation"; left: "left"; operator: "operator"; right: "right" }
```

### `RosettaMapTestExistsExpression`
```ts
let RosettaMapTestExistsExpression: { $type: "RosettaMapTestExistsExpression"; argument: "argument" }
```

### `RosettaMapTestExpression`
```ts
let RosettaMapTestExpression: { $type: "RosettaMapTestExpression" }
```

### `RosettaMapTestFunc`
```ts
let RosettaMapTestFunc: { $type: "RosettaMapTestFunc"; func: "func"; predicatePath: "predicatePath" }
```

### `RosettaMergeSynonymValue`
```ts
let RosettaMergeSynonymValue: { $type: "RosettaMergeSynonymValue"; excludePath: "excludePath"; name: "name" }
```

### `RosettaMetaType`
```ts
let RosettaMetaType: { $type: "RosettaMetaType"; name: "name"; typeCall: "typeCall" }
```

### `RosettaModel`
```ts
let RosettaModel: { $type: "RosettaModel"; configurations: "configurations"; definition: "definition"; elements: "elements"; imports: "imports"; name: "name"; overridden: "overridden"; scope: "scope"; version: "version" }
```

### `RosettaNumberLiteral`
```ts
let RosettaNumberLiteral: { $type: "RosettaNumberLiteral"; value: "value" }
```

### `RosettaOnlyElement`
```ts
let RosettaOnlyElement: { $type: "RosettaOnlyElement"; argument: "argument"; operator: "operator" }
```

### `RosettaOnlyExistsExpression`
```ts
let RosettaOnlyExistsExpression: { $type: "RosettaOnlyExistsExpression"; args: "args"; argument: "argument"; operator: "operator" }
```

### `RosettaParameter`
```ts
let RosettaParameter: { $type: "RosettaParameter"; isArray: "isArray"; name: "name"; typeCall: "typeCall" }
```

### `RosettaQualifiableConfiguration`
```ts
let RosettaQualifiableConfiguration: { $type: "RosettaQualifiableConfiguration"; qType: "qType"; rosettaClass: "rosettaClass" }
```

### `RosettaRecordFeature`
```ts
let RosettaRecordFeature: { $type: "RosettaRecordFeature"; name: "name"; typeCall: "typeCall" }
```

### `RosettaRecordType`
```ts

<!-- truncated -->
