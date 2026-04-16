---
name: rune-langium-core
description: Documentation site for rune-langium
---

# @rune-langium/core

Documentation site for rune-langium

## When to Use

- Validating a single `.rosetta` file or snippet in memory
- Building a parse pipeline in a Node.js script
- Unit-testing grammar rules in isolation
- Generating code from a set of related `.rosetta` files
- Validating a full namespace bundle where types reference each other
- Running integration tests that span multiple Rosetta files
- Building a Node.js script that parses or validates `.rosetta` files
- Writing unit tests for grammar rules or validators
- Constructing a `parseWorkspace()` pipeline outside of the LSP server
- Exporting a modified AST back to `.rosetta` format after programmatic edits
- Generating a stub `.rosetta` file from a synthesized model object
- Round-trip testing: parse → mutate → serialize → re-parse
- Generating a snippet for one type definition without a full namespace header
- Preview rendering a single type in editor UI
- Batch-exporting a full CDM/DRR workspace to `.rosetta` files
- Building a zip archive of serialized models keyed by namespace

**Avoid when:**
- Parsing files that have cross-references to other documents — unresolved
- references will have `ref === undefined`. Use `parseWorkspace()` instead.
- Running inside a Langium LSP server — the DocumentBuilder is already
- managed by the server lifecycle; calling `parse()` creates a second
- services instance and wastes memory.
- Parsing a single self-contained file — use the simpler `parse()` instead
- Processing very large CDM workspaces incrementally — prefer the LSP server
- for streaming document updates
- Inside the LSP server — use `createRuneLspServer()` which provides the full
- `LangiumServices` (LSP providers) instead of core-only services.
- When you need to share a service instance across multiple requests in a
- long-running server — the returned instance is not thread-safe for concurrent
- `DocumentBuilder.build()` calls; serialize builds with a queue.
- You need to preserve user-authored comments or whitespace — use a
- CST-preserving formatter instead.
- The model contains `RosettaFunction` or `RosettaRule` elements — these are
- silently dropped; use the visual editor serializer for full round-trip fidelity.
- API surface: 173 functions, 4 classes, 160 types, 148 constants

## Pitfalls

- Do NOT call `parse()` on a file whose type references live in other
- `.rosetta` files — cross-file references will be unresolved (undefined).
- Provide all documents to `parseWorkspace()` for resolved cross-references.
- Do NOT mutate nodes in the returned `value` — Langium's index tracks AST
- node identity; mutations bypass incremental reparse and corrupt the scope graph.
- All documents must be provided in a **single** `parseWorkspace()` call for
- cross-references to resolve. Documents added across separate calls will NOT
- see each other's types.
- Do NOT reuse the `ParseResult.value` nodes after calling `parseWorkspace()`
- again with a different set — the underlying index is rebuilt and prior AST
- node identity becomes invalid.
- Workspace indexing runs synchronously after `build()` completes; very large
- workspaces (e.g., full CDM) may block for several seconds in a single-threaded
- environment.
- NEVER call `DocumentBuilder.build()` before `createRuneDslServices()` returns —
- the Langium index is not populated until services are fully constructed.
- NEVER reuse the same services instance across unrelated workspace contexts
- (e.g., two different CDM versions) — the index will conflate type names from
- both contexts and produce incorrect cross-reference resolution.
- The returned `shared` and `RuneDsl` services share an internal `ServiceRegistry`;
- do NOT register additional languages into the same `shared` for production use
- unless you understand Langium's multi-language scoping rules.
- The transformation is regex/character-scan based and cannot handle all
- edge cases in heavily nested multi-line expressions. When in doubt, use
- explicit `[ ]` brackets in your `.rosetta` source.
- Do NOT call this function on arbitrary text — it is designed specifically
- for Rune DSL (Rosetta) source and may corrupt non-Rosetta input.
- Output does NOT include function or rule bodies — function/rule elements are
- skipped entirely. Do not use for models where function definitions are critical.
- `Condition` expression bodies are emitted as `True` placeholder text — they
- are not serialized from the AST expression tree.
- The `model` parameter uses `unknown` typing (duck typing) to avoid coupling to
- generated Langium types. Pass a `RosettaModel` AST node obtained from `parse()`.
- Duplicate namespaces are silently overwritten — validate namespace uniqueness
- before calling this function.

## Quick Reference

**ast:** `isAnnotation`, `isAnnotationDeepPath`, `isAnnotationPath`, `isAnnotationPathAttributeReference`, `isAnnotationPathExpression`, `isAnnotationQualifier`, `isAnnotationRef`, `isArithmeticOperation`, `isAsKeyOperation`, `isAssignPathRoot`, `isAttribute`, `isAttributeOrChoiceOption`, `isBigDecimal`, `isCardinalityModifier`, `isChoice`, `isChoiceOperation`, `isChoiceOption`, `isClosureParameter`, `isComparisonOperation`, `isCondition`, `isConstructorKeyValuePair`, `isData`, `isDataOrChoice`, `isDefaultOperation`, `isDistinctOperation`, `isDocumentRationale`, `isEqualityOperation`, `isExistsModifier`, `isExternalValueOperator`, `isFilterOperation`, `isFirstOperation`, `isFlattenOperation`, `isImport`, `isInlineFunction`, `isInteger`, `isJoinOperation`, `isLabelAnnotation`, `isLastOperation`, `isListLiteral`, `isLogicalOperation`, `isMapOperation`, `isMaxOperation`, `isMinOperation`, `isNecessity`, `isOneOfOperation`, `isOperation`, `isQualifiedName`, `isQualifiedNameWithWildcard`, `isReduceOperation`, `isRegulatoryDocumentReference`, `isReverseOperation`, `isRosettaAbsentExpression`, `isRosettaAttributeReference`, `isRosettaBasicType`, `isRosettaBody`, `isRosettaBooleanLiteral`, `isRosettaCallableWithArgs`, `isRosettaCardinality`, `isRosettaClassSynonym`, `isRosettaConditionalExpression`, `isRosettaConstructorExpression`, `isRosettaContainsExpression`, `isRosettaCorpus`, `isRosettaCountOperation`, `isRosettaDataReference`, `isRosettaDeepFeatureCall`, `isRosettaDisjointExpression`, `isRosettaDocReference`, `isRosettaEnumeration`, `isRosettaEnumSynonym`, `isRosettaEnumValue`, `isRosettaEnumValueReference`, `isRosettaExistsExpression`, `isRosettaExpression`, `isRosettaExternalClass`, `isRosettaExternalClassSynonym`, `isRosettaExternalEnum`, `isRosettaExternalEnumValue`, `isRosettaExternalFunction`, `isRosettaExternalRegularAttribute`, `isRosettaExternalRuleSource`, `isRosettaExternalSynonym`, `isRosettaFeature`, `isRosettaFeatureCall`, `isRosettaFunction`, `isRosettaImplicitVariable`, `isRosettaIntLiteral`, `isRosettaLiteral`, `isRosettaMapPath`, `isRosettaMapPathValue`, `isRosettaMapping`, `isRosettaMappingInstance`, `isRosettaMappingPathTests`, `isRosettaMapRosettaPath`, `isRosettaMapTest`, `isRosettaMapTestAbsentExpression`, `isRosettaMapTestEqualityOperation`, `isRosettaMapTestExistsExpression`, `isRosettaMapTestExpression`, `isRosettaMapTestFunc`, `isRosettaMergeSynonymValue`, `isRosettaMetaType`, `isRosettaModel`, `isRosettaNumberLiteral`, `isRosettaOnlyElement`, `isRosettaOnlyExistsExpression`, `isRosettaParameter`, `isRosettaQualifiableConfiguration`, `isRosettaQualifiableType`, `isRosettaRecordFeature`, `isRosettaRecordType`, `isRosettaReport`, `isRosettaRootElement`, `isRosettaRule`, `isRosettaScope`, `isRosettaSegment`, `isRosettaSegmentRef`, `isRosettaStringLiteral`, `isRosettaSuperCall`, `isRosettaSymbol`, `isRosettaSymbolReference`, `isRosettaSynonym`, `isRosettaSynonymBody`, `isRosettaSynonymRef`, `isRosettaSynonymSource`, `isRosettaSynonymValueBase`, `isRosettaType`, `isRosettaTypeAlias`, `isRosettaTypedFeature`, `isRuleReferenceAnnotation`, `isSegment`, `isShortcutDeclaration`, `isSortOperation`, `isSumOperation`, `isSwitchCaseGuard`, `isSwitchCaseOrDefault`, `isSwitchCaseTarget`, `isSwitchOperation`, `isThenOperation`, `isToDateOperation`, `isToDateTimeOperation`, `isToEnumOperation`, `isToIntOperation`, `isToNumberOperation`, `isToStringOperation`, `isToTimeOperation`, `isToZonedDateTimeOperation`, `isTypeCall`, `isTypeCallArgument`, `isTypeParameter`, `isTypeParameterValidID`, `isValidID`, `isWithMetaEntry`, `isWithMetaOperation`, `RuneDslAstReflection`, `RuneDslTerminalNames`, `RuneDslKeywordNames`, `RuneDslTokenNames`, `Annotation`, `AnnotationDeepPath`, `AnnotationPath`, `AnnotationPathAttributeReference`, `AnnotationPathExpression`, `AnnotationQualifier`, `AnnotationRef`, `ArithmeticOperation`, `AsKeyOperation`, `AssignPathRoot`, `Attribute`, `AttributeOrChoiceOption`, `BigDecimal`, `CardinalityModifier`, `Choice`, `ChoiceOperation`, `ChoiceOption`, `ClosureParameter`, `ComparisonOperation`, `Condition`, `ConstructorKeyValuePair`, `Data`, `DataOrChoice`, `DefaultOperation`, `DistinctOperation`, `DocumentRationale`, `EqualityOperation`, `ExistsModifier`, `ExternalValueOperator`, `FilterOperation`, `FirstOperation`, `FlattenOperation`, `Import`, `InlineFunction`, `Integer`, `JoinOperation`, `LabelAnnotation`, `LastOperation`, `ListLiteral`, `LogicalOperation`, `MapOperation`, `MaxOperation`, `MinOperation`, `Necessity`, `OneOfOperation`, `Operation`, `QualifiedName`, `QualifiedNameWithWildcard`, `ReduceOperation`, `RegulatoryDocumentReference`, `ReverseOperation`, `RosettaAbsentExpression`, `RosettaAttributeReference`, `RosettaBasicType`, `RosettaBody`, `RosettaBooleanLiteral`, `RosettaCallableWithArgs`, `RosettaCardinality`, `RosettaClassSynonym`, `RosettaConditionalExpression`, `RosettaConstructorExpression`, `RosettaContainsExpression`, `RosettaCorpus`, `RosettaCountOperation`, `RosettaDataReference`, `RosettaDeepFeatureCall`, `RosettaDisjointExpression`, `RosettaDocReference`, `RosettaEnumeration`, `RosettaEnumSynonym`, `RosettaEnumValue`, `RosettaEnumValueReference`, `RosettaExistsExpression`, `RosettaExpression`, `RosettaExternalClass`, `RosettaExternalClassSynonym`, `RosettaExternalEnum`, `RosettaExternalEnumValue`, `RosettaExternalFunction`, `RosettaExternalRegularAttribute`, `RosettaExternalRuleSource`, `RosettaExternalSynonym`, `RosettaFeature`, `RosettaFeatureCall`, `RosettaFunction`, `RosettaImplicitVariable`, `RosettaIntLiteral`, `RosettaLiteral`, `RosettaMapPath`, `RosettaMapPathValue`, `RosettaMapping`, `RosettaMappingInstance`, `RosettaMappingPathTests`, `RosettaMapRosettaPath`, `RosettaMapTest`, `RosettaMapTestAbsentExpression`, `RosettaMapTestEqualityOperation`, `RosettaMapTestExistsExpression`, `RosettaMapTestExpression`, `RosettaMapTestFunc`, `RosettaMergeSynonymValue`, `RosettaMetaType`, `RosettaModel`, `RosettaNumberLiteral`, `RosettaOnlyElement`, `RosettaOnlyExistsExpression`, `RosettaParameter`, `RosettaQualifiableConfiguration`, `RosettaQualifiableType`, `RosettaRecordFeature`, `RosettaRecordType`, `RosettaReport`, `RosettaRootElement`, `RosettaRule`, `RosettaScope`, `RosettaSegment`, `RosettaSegmentRef`, `RosettaStringLiteral`, `RosettaSuperCall`, `RosettaSymbol`, `RosettaSymbolReference`, `RosettaSynonym`, `RosettaSynonymBody`, `RosettaSynonymRef`, `RosettaSynonymSource`, `RosettaSynonymValueBase`, `RosettaType`, `RosettaTypeAlias`, `RosettaTypedFeature`, `RuleReferenceAnnotation`, `Segment`, `ShortcutDeclaration`, `SortOperation`, `SumOperation`, `SwitchCaseGuard`, `SwitchCaseOrDefault`, `SwitchCaseTarget`, `SwitchOperation`, `ThenOperation`, `ToDateOperation`, `ToDateTimeOperation`, `ToEnumOperation`, `ToIntOperation`, `ToNumberOperation`, `ToStringOperation`, `ToTimeOperation`, `ToZonedDateTimeOperation`, `TypeCall`, `TypeCallArgument`, `TypeParameter`, `TypeParameterValidID`, `ValidID`, `WithMetaEntry`, `WithMetaOperation`, `RuneDslAstType`, `RuneDslTerminals`, `Annotation`, `AnnotationDeepPath`, `AnnotationPath`, `AnnotationPathAttributeReference`, `AnnotationPathExpression`, `AnnotationQualifier`, `AnnotationRef`, `ArithmeticOperation`, `AsKeyOperation`, `AssignPathRoot`, `Attribute`, `AttributeOrChoiceOption`, `Choice`, `ChoiceOperation`, `ChoiceOption`, `ClosureParameter`, `ComparisonOperation`, `Condition`, `ConstructorKeyValuePair`, `Data`, `DataOrChoice`, `DefaultOperation`, `DistinctOperation`, `DocumentRationale`, `EqualityOperation`, `FilterOperation`, `FirstOperation`, `FlattenOperation`, `Import`, `InlineFunction`, `JoinOperation`, `LabelAnnotation`, `LastOperation`, `ListLiteral`, `LogicalOperation`, `MapOperation`, `MaxOperation`, `MinOperation`, `OneOfOperation`, `Operation`, `ReduceOperation`, `RegulatoryDocumentReference`, `ReverseOperation`, `RosettaAbsentExpression`, `RosettaAttributeReference`, `RosettaBasicType`, `RosettaBody`, `RosettaBooleanLiteral`, `RosettaCallableWithArgs`, `RosettaCardinality`, `RosettaClassSynonym`, `RosettaConditionalExpression`, `RosettaConstructorExpression`, `RosettaContainsExpression`, `RosettaCorpus`, `RosettaCountOperation`, `RosettaDataReference`, `RosettaDeepFeatureCall`, `RosettaDisjointExpression`, `RosettaDocReference`, `RosettaEnumeration`, `RosettaEnumSynonym`, `RosettaEnumValue`, `RosettaEnumValueReference`, `RosettaExistsExpression`, `RosettaExpression`, `RosettaExternalClass`, `RosettaExternalClassSynonym`, `RosettaExternalEnum`, `RosettaExternalEnumValue`, `RosettaExternalFunction`, `RosettaExternalRegularAttribute`, `RosettaExternalRuleSource`, `RosettaExternalSynonym`, `RosettaFeature`, `RosettaFeatureCall`, `RosettaFunction`, `RosettaImplicitVariable`, `RosettaIntLiteral`, `RosettaLiteral`, `RosettaMapPath`, `RosettaMapPathValue`, `RosettaMapping`, `RosettaMappingInstance`, `RosettaMappingPathTests`, `RosettaMapRosettaPath`, `RosettaMapTest`, `RosettaMapTestAbsentExpression`, `RosettaMapTestEqualityOperation`, `RosettaMapTestExistsExpression`, `RosettaMapTestExpression`, `RosettaMapTestFunc`, `RosettaMergeSynonymValue`, `RosettaMetaType`, `RosettaModel`, `RosettaNumberLiteral`, `RosettaOnlyElement`, `RosettaOnlyExistsExpression`, `RosettaParameter`, `RosettaQualifiableConfiguration`, `RosettaRecordFeature`, `RosettaRecordType`, `RosettaReport`, `RosettaRootElement`, `RosettaRule`, `RosettaScope`, `RosettaSegment`, `RosettaSegmentRef`, `RosettaStringLiteral`, `RosettaSuperCall`, `RosettaSymbol`, `RosettaSymbolReference`, `RosettaSynonym`, `RosettaSynonymBody`, `RosettaSynonymSource`, `RosettaSynonymValueBase`, `RosettaType`, `RosettaTypeAlias`, `RosettaTypedFeature`, `RuleReferenceAnnotation`, `Segment`, `ShortcutDeclaration`, `SortOperation`, `SumOperation`, `SwitchCaseGuard`, `SwitchCaseOrDefault`, `SwitchCaseTarget`, `SwitchOperation`, `ThenOperation`, `ToDateOperation`, `ToDateTimeOperation`, `ToEnumOperation`, `ToIntOperation`, `ToNumberOperation`, `ToStringOperation`, `ToTimeOperation`, `ToZonedDateTimeOperation`, `TypeCall`, `TypeCallArgument`, `TypeParameter`, `WithMetaEntry`, `WithMetaOperation`, `reflection`
**Core:** `parse`, `parseWorkspace`, `createRuneDslServices`, `createRuneDslParser`, `insertImplicitBrackets`, `serializeModel`, `serializeElement`, `serializeModels`, `RuneDslParser`, `ParseResult`, `RuneDslServices`, `RuneDslModule`
**cardinality-utils:** `isOptional`, `isSingular`, `isPlural`, `isRequired`, `toConstraintString`
**choice-utils:** `getOptions`, `getEffectiveConditions`
**expression-utils:** `hasGeneratedInput`, `setGeneratedInputIfAbsent`, `getFunctionInputs`, `getFunctionOutput`
**rune-dsl-scope-provider:** `RuneDslScopeProvider`
**rune-dsl-validator:** `RuneDslValidator`
**module:** `RuneDslLanguageMetaData`, `RuneDslGeneratedModule`, `RuneDslGeneratedSharedModule`

## Links

- Author: Pradeep Mouli <pmouli@mac.com> (https://github.com/pradeepmouli)