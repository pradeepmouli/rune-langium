# Classes

## services

### `RuneDslIndexManager`
Extended IndexManager that supports external registration of exported
symbols without requiring a full document build. Used for deferred
deserialization of curated model artifacts (ADR 007 Phase 4).
*extends `DefaultIndexManager`*
```ts
constructor(services: LangiumSharedCoreServices): RuneDslIndexManager
```
**Properties:**
- `serviceRegistry: ServiceRegistry`
- `documents: LangiumDocuments`
- `astReflection: AstReflection`
- `symbolIndex: Map<string, AstNodeDescription[]>` — The symbol index stores all `AstNodeDescription` items exported by a document.
The key used in this map is the string representation of the specific document URI.
- `symbolByTypeIndex: ContextCache<string, string, AstNodeDescription[], string>` — This is a cache for the `allElements()` method.
It caches the descriptions from `symbolIndex` grouped by types.
- `referenceIndex: Map<string, ReferenceDescription[]>` — This index keeps track of all `ReferenceDescription` items exported by a document.
This is used to compute which elements are affected by a document change
and for finding references to an AST node.
**Methods:**
- `registerExports(uri: URI, descriptions: AstNodeDescription[]): void` — Register exported symbol descriptions for a document URI without
requiring the document to be parsed or built. The descriptions are
added directly to the symbol index, making them discoverable via
`allElements()` and cross-reference resolution.

Call `clearExports(uri)` or `remove(uri)` before re-registering
to avoid duplicates.
- `clearExports(uri: URI): void` — Clear previously registered exports for a document URI.
- `findAllReferences(targetNode: AstNode, astNodePath: string): Stream<ReferenceDescription>` — Returns all known references that are pointing to the given `targetNode`.
- `allElements(nodeType?: string, uris?: Set<string>): Stream<AstNodeDescription>` — Compute a list of all exported elements, optionally filtered using a type identifier and document URIs.
- `getFileDescriptions(uri: string, nodeType?: string): AstNodeDescription[]`
- `remove(uri: URI): void` — Remove the specified document URI from the index.
Necessary when documents are deleted and not referenceable anymore.
- `removeContent(uri: URI): void` — Remove only the information about the exportable content of a document.
- `removeReferences(uri: URI): void` — Remove only the information about the cross-references of a document.
- `updateContent(document: LangiumDocument, cancelToken?: CancellationToken): Promise<void>` — Update the information about the exportable content of a document inside the index.
- `updateReferences(document: LangiumDocument, cancelToken?: CancellationToken): Promise<void>` — Update the information about the cross-references of a document inside the index.
- `isAffected(document: LangiumDocument, changedUris: Set<string>): boolean` — Determine whether the given document could be affected by changes of the documents
identified by the given URIs (second parameter). The document is typically regarded as
affected if it contains a reference to any of the changed files.

### `RuneDslLinker`
Langium linker that lazily materializes corpus documents stored in a
`DeferredModelProvider` the first time a cross-reference to them is resolved.

Without a `deferredProvider` this behaves identically to `DefaultLinker`.
*extends `DefaultLinker`*
```ts
constructor(services: LangiumCoreServices, deferredProvider?: DeferredModelProvider): RuneDslLinker
```
**Properties:**
- `reflection: AstReflection`
- `scopeProvider: ScopeProvider`
- `astNodeLocator: AstNodeLocator`
- `langiumDocuments: () => LangiumDocuments`
- `profiler: LangiumProfiler | undefined`
- `languageId: string`
**Methods:**
- `loadAstNode(nodeDescription: AstNodeDescription): AstNode | undefined`
- `link(document: LangiumDocument, cancelToken?: CancellationToken): Promise<void>` — Links all cross-references within the specified document. The default implementation loads only target
elements from documents that are present in the `LangiumDocuments` service. The linked references are
stored in the document's `references` property.
- `doLink(refInfo: ReferenceInfo, document: LangiumDocument): void`
- `unlink(document: LangiumDocument): void` — Unlinks all references within the specified document and removes them from the list of `references`.
- `getCandidate(refInfo: ReferenceInfo): AstNodeDescription | LinkingError` — Determines a candidate AST node description for linking the given reference.
- `getCandidates(refInfo: ReferenceInfo): AstNodeDescription[] | LinkingError` — Determines a candidate AST node description for linking the given reference.
- `buildReference(node: AstNode, property: string, refNode: CstNode | undefined, refText: string): Reference` — Creates a cross reference node being aware of its containing AstNode, the corresponding CstNode,
the cross reference text denoting the target AstNode being already extracted of the document text,
as well as the unique cross reference identifier.

Default behavior:
 - The returned Reference's 'ref' property pointing to the target AstNode is populated lazily on its
   first visit.
 - If the target AstNode cannot be resolved on the first visit, an error indicator will be installed
   and further resolution attempts will *not* be performed.
- `buildMultiReference(node: AstNode, property: string, refNode: CstNode | undefined, refText: string): MultiReference`
- `throwCyclicReferenceError(node: AstNode, property: string, refText: string): never`
- `getLinkedNode(refInfo: ReferenceInfo): { node?: AstNode; descr?: AstNodeDescription; error?: LinkingError }`
- `createLinkingError(refInfo: ReferenceInfo, targetDescription?: AstNodeDescription): LinkingError`

### `RuneDslScopeProvider`
Custom scope provider for the Rune DSL.

Handles the 21 cross-reference patterns from the original Xtext implementation:
- Cases 1-3: Feature calls (-> and ->>)
- Cases 4-8: Operation assign root, segments, constructor keys
- Case 9-11: Switch case guards, enum values
- Case 12: Symbol references (most complex — context-dependent)
- Cases 13-21: Annotation paths, external refs, etc.
*extends `DefaultScopeProvider`*
```ts
constructor(services: LangiumCoreServices): RuneDslScopeProvider
```
**Properties:**
- `reflection: AstReflection`
- `nameProvider: NameProvider`
- `descriptions: AstNodeDescriptionProvider`
- `indexManager: IndexManager`
- `globalScopeCache: WorkspaceCache<string, Scope>`
**Methods:**
- `getScope(context: ReferenceInfo): Scope`
- `getGlobalScope(referenceType: string, context: ReferenceInfo): Scope` — Override global scope lookup to support `import ... as <alias>` resolution.

When a file contains `import fpml.consolidated.shared.* as fpml`, references
written as `fpml.Leg` should resolve to `fpml.consolidated.shared.Leg` in the
global index.  We do this by building a thin alias-expansion layer on top of
the regular global scope: for every qualified reference name we try to replace
a known alias prefix with the full namespace prefix and retry the lookup.
- `createScope(elements: Iterable<AstNodeDescription>, outerScope?: Scope, options?: ScopeOptions): Scope` — Create a scope for the given collection of AST node descriptions.
- `createScopeForNodes(elements: Iterable<AstNode>, outerScope?: Scope, options?: ScopeOptions): Scope` — Create a scope for the given collection of AST nodes, which need to be transformed into respective
descriptions first. This is done using the `NameProvider` and `AstNodeDescriptionProvider` services.

### `RuneDslValidator`
Custom validator for the Rune DSL.

Implements structural, naming, expression, and reporting validations
ported from the original Xtext implementation.

Rule categories:
- S-##: Structural constraints (duplicates, cycles, missing fields)
- N-##: Naming convention rules
- E-##: Expression validation rules
- R-##: Reporting validation rules
```ts
constructor(): RuneDslValidator
```
**Methods:**
- `registerChecks(services: LangiumCoreServices): void` — Register validation checks with the Langium validation registry.
- `checkDataNoDuplicateAttributes(node: Data, accept: ValidationAcceptor): void` — S-01: No duplicate attribute names within a Data type.
- `checkDataExtendsCycle(node: Data, accept: ValidationAcceptor): void` — S-02: Detect circular inheritance in Data extends chain.
- `checkAttributeCardinality(node: Attribute, accept: ValidationAcceptor): void` — S-04: Attribute cardinality must have lower <= upper.
- `checkFunctionNoDuplicateInputs(node: RosettaFunction, accept: ValidationAcceptor): void` — S-06: No duplicate function input names.
- `checkFunctionOutputRequired(node: RosettaFunction, accept: ValidationAcceptor): void` — S-07: Functions should have an output.
Dispatch functions (with dispatchAttribute) are exempt — they inherit output from the parent.
- `checkEnumNoDuplicateValues(node: RosettaEnumeration, accept: ValidationAcceptor): void` — S-09: No duplicate enum value names.
- `checkChoiceNoDuplicateOptions(node: Choice, accept: ValidationAcceptor): void` — S-11: No duplicate choice option type references.
- `checkModelNoDuplicateElements(node: RosettaModel, accept: ValidationAcceptor): void` — S-13: No duplicate top-level element names in the same model.
Dispatch function overloads share the same name intentionally — skip them.
- `checkDataAttributeOverrideValid(node: Data, accept: ValidationAcceptor): void` — S-15: Override attribute must exist in the parent type.
- `checkDataMustHaveAttributesOrSuperType(_node: Data, _accept: ValidationAcceptor): void` — S-16: Data type should have at least one attribute or extend another type.
- `checkAttributeTypeResolved(node: Attribute, accept: ValidationAcceptor): void` — S-17: Attribute type reference must resolve.

NOTE: Not registered. Langium's built-in linker already emits an error for
unresolved TypeCall.type references, so registering this check would produce
duplicate error messages.
- `checkFunctionNoDuplicateShortcuts(node: RosettaFunction, accept: ValidationAcceptor): void` — S-18: No duplicate shortcut names in a function.
- `checkFunctionNoDuplicateConditions(node: RosettaFunction, accept: ValidationAcceptor): void` — S-19: No duplicate condition names in a function.
- `checkEnumExtendsCycle(node: RosettaEnumeration, accept: ValidationAcceptor): void` — S-20: Detect circular inheritance in Enum extends chain.
- `checkChoiceMinOptions(node: Choice, accept: ValidationAcceptor): void` — S-21: Choice must have at least two options.
- `checkChoiceOptionTypeResolved(node: ChoiceOption, accept: ValidationAcceptor): void` — S-22: ChoiceOption type must resolve.

NOTE: Not registered. Langium's built-in linker already emits an error for
unresolved TypeCall.type references, so registering this check would produce
duplicate error messages.
- `checkModelNamespaceValid(node: RosettaModel, accept: ValidationAcceptor): void` — S-23: Namespace must be a valid qualified name.
- `checkConditionHasExpression(node: Condition, accept: ValidationAcceptor): void` — S-24: Condition must have an expression body.
- `checkShortcutHasExpression(node: ShortcutDeclaration, accept: ValidationAcceptor): void` — S-25: ShortcutDeclaration must have an expression body.
- `checkOperationHasExpression(node: Operation, accept: ValidationAcceptor): void` — S-26: Operation must have an expression body.
- `checkImportNotEmpty(node: Import, accept: ValidationAcceptor): void` — S-27: Import path must not be empty.
- `checkDataNaming(node: Data, accept: ValidationAcceptor): void` — N-01: Data type names should start with uppercase.
- `checkAttributeNaming(node: Attribute, accept: ValidationAcceptor): void` — N-02: Attribute names should start with lowercase.
Exempt: attributes inside Annotation blocks and ChoiceOptions (matching Xtext behavior).
- `checkFunctionNaming(node: RosettaFunction, accept: ValidationAcceptor): void` — N-03: Function names should start with uppercase.
- `checkEnumNaming(node: RosettaEnumeration, accept: ValidationAcceptor): void` — N-04: Enum names should start with uppercase.
- `checkChoiceNaming(node: Choice, accept: ValidationAcceptor): void` — N-05: Choice names should start with uppercase.
- `checkConditionNaming(node: Condition, accept: ValidationAcceptor): void` — N-06: Condition names should start with uppercase.
- `checkEnumValueNaming(_node: RosettaEnumeration, _accept: ValidationAcceptor): void` — N-07: Enum value names should start with an uppercase letter (convention: PascalCase or UPPER_CASE).
- `checkEnumValueNamingRule(_node: RosettaEnumValue, _accept: ValidationAcceptor): void` — N-08: Standalone enum value naming (used from ChoiceOption context).
- `checkShortcutNaming(_node: ShortcutDeclaration, _accept: ValidationAcceptor): void` — N-09: Shortcut names should start with lowercase.
- `checkRuleNaming(node: RosettaRule, accept: ValidationAcceptor): void` — N-10: Rule names should start with uppercase.
- `checkRuleHasExpression(node: RosettaRule, accept: ValidationAcceptor): void` — R-01: Rule must have an expression body.
- `checkExpressionValid(node: RosettaExpression, accept: ValidationAcceptor): void` — Expression validator dispatcher.
Routes to specific checks based on expression $type.
