[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / RuneDslScopeProvider

# Class: RuneDslScopeProvider

Defined in: [packages/core/src/services/rune-dsl-scope-provider.ts:147](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/services/rune-dsl-scope-provider.ts#L147)

Custom scope provider for the Rune DSL.

Handles the 21 cross-reference patterns from the original Xtext implementation:
- Cases 1-3: Feature calls (-> and ->>)
- Cases 4-8: Operation assign root, segments, constructor keys
- Case 9-11: Switch case guards, enum values
- Case 12: Symbol references (most complex — context-dependent)
- Cases 13-21: Annotation paths, external refs, etc.

## Extends

- `DefaultScopeProvider`

## Constructors

### Constructor

> **new RuneDslScopeProvider**(`services`): `RuneDslScopeProvider`

Defined in: [packages/core/src/services/rune-dsl-scope-provider.ts:148](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/services/rune-dsl-scope-provider.ts#L148)

#### Parameters

##### services

`LangiumCoreServices`

#### Returns

`RuneDslScopeProvider`

#### Overrides

`DefaultScopeProvider.constructor`

## Properties

### descriptions

> `protected` `readonly` **descriptions**: `AstNodeDescriptionProvider`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/references/scope-provider.d.ts:28

#### Inherited from

`DefaultScopeProvider.descriptions`

***

### globalScopeCache

> `protected` `readonly` **globalScopeCache**: `WorkspaceCache`\<`string`, `Scope`\>

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/references/scope-provider.d.ts:30

#### Inherited from

`DefaultScopeProvider.globalScopeCache`

***

### indexManager

> `protected` `readonly` **indexManager**: `IndexManager`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/references/scope-provider.d.ts:29

#### Inherited from

`DefaultScopeProvider.indexManager`

***

### nameProvider

> `protected` `readonly` **nameProvider**: `NameProvider`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/references/scope-provider.d.ts:27

#### Inherited from

`DefaultScopeProvider.nameProvider`

***

### reflection

> `protected` `readonly` **reflection**: `AstReflection`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/references/scope-provider.d.ts:26

#### Inherited from

`DefaultScopeProvider.reflection`

## Methods

### createScope()

> `protected` **createScope**(`elements`, `outerScope?`, `options?`): `Scope`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/references/scope-provider.d.ts:36

Create a scope for the given collection of AST node descriptions.

#### Parameters

##### elements

`Iterable`\<`AstNodeDescription`\>

##### outerScope?

`Scope`

##### options?

`ScopeOptions`

#### Returns

`Scope`

#### Inherited from

`DefaultScopeProvider.createScope`

***

### createScopeForNodes()

> `protected` **createScopeForNodes**(`elements`, `outerScope?`, `options?`): `Scope`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/references/scope-provider.d.ts:41

Create a scope for the given collection of AST nodes, which need to be transformed into respective
descriptions first. This is done using the `NameProvider` and `AstNodeDescriptionProvider` services.

#### Parameters

##### elements

`Iterable`\<`AstNode`\>

##### outerScope?

`Scope`

##### options?

`ScopeOptions`

#### Returns

`Scope`

#### Inherited from

`DefaultScopeProvider.createScopeForNodes`

***

### getGlobalScope()

> `protected` **getGlobalScope**(`referenceType`, `context`): `Scope`

Defined in: [packages/core/src/services/rune-dsl-scope-provider.ts:1355](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/services/rune-dsl-scope-provider.ts#L1355)

Override global scope lookup to support `import ... as <alias>` resolution.

When a file contains `import fpml.consolidated.shared.* as fpml`, references
written as `fpml.Leg` should resolve to `fpml.consolidated.shared.Leg` in the
global index.  We do this by building a thin alias-expansion layer on top of
the regular global scope: for every qualified reference name we try to replace
a known alias prefix with the full namespace prefix and retry the lookup.

#### Parameters

##### referenceType

`string`

##### context

`ReferenceInfo`

#### Returns

`Scope`

#### Overrides

`DefaultScopeProvider.getGlobalScope`

***

### getScope()

> **getScope**(`context`): `Scope`

Defined in: [packages/core/src/services/rune-dsl-scope-provider.ts:152](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/services/rune-dsl-scope-provider.ts#L152)

#### Parameters

##### context

`ReferenceInfo`

#### Returns

`Scope`

#### Overrides

`DefaultScopeProvider.getScope`
