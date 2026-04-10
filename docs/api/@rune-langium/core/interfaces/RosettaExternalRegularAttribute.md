[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / RosettaExternalRegularAttribute

# Interface: RosettaExternalRegularAttribute

Defined in: [packages/core/src/generated/ast.ts:3235](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L3235)

## Extends

- `AstNode`

## Properties

### $container

> `readonly` **$container**: [`RosettaExternalClass`](RosettaExternalClass.md)

Defined in: [packages/core/src/generated/ast.ts:3236](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L3236)

The container node in the AST; every node except the root node has a container.

#### Overrides

`langium.AstNode.$container`

***

### $containerIndex?

> `readonly` `optional` **$containerIndex?**: `number`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/syntax-tree.d.ts:21

In case `$containerProperty` is an array, the array index is stored here.

#### Inherited from

`langium.AstNode.$containerIndex`

***

### $containerProperty?

> `readonly` `optional` **$containerProperty?**: `string`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/syntax-tree.d.ts:19

The property of the `$container` node that contains this node. This is either a direct reference or an array.

#### Inherited from

`langium.AstNode.$containerProperty`

***

### $cstNode?

> `readonly` `optional` **$cstNode?**: `CstNode`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/syntax-tree.d.ts:23

The Concrete Syntax Tree (CST) node of the text range from which this node was parsed.

#### Inherited from

`langium.AstNode.$cstNode`

***

### $document?

> `readonly` `optional` **$document?**: `LangiumDocument`\<`AstNode`\>

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/syntax-tree.d.ts:25

The document containing the AST; only the root node has a direct reference to the document.

#### Inherited from

`langium.AstNode.$document`

***

### $type

> `readonly` **$type**: `"RosettaExternalRegularAttribute"`

Defined in: [packages/core/src/generated/ast.ts:3237](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L3237)

Every AST node has a type corresponding to what was specified in the grammar declaration.

#### Overrides

`langium.AstNode.$type`

***

### attributeRef

> **attributeRef**: `Reference`\<[`RosettaFeature`](../type-aliases/RosettaFeature.md)\>

Defined in: [packages/core/src/generated/ast.ts:3238](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L3238)

***

### externalRuleReferences

> **externalRuleReferences**: [`RuleReferenceAnnotation`](RuleReferenceAnnotation.md)[]

Defined in: [packages/core/src/generated/ast.ts:3239](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L3239)

***

### externalSynonyms

> **externalSynonyms**: [`RosettaExternalSynonym`](RosettaExternalSynonym.md)[]

Defined in: [packages/core/src/generated/ast.ts:3240](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L3240)

***

### operator

> **operator**: [`ExternalValueOperator`](../type-aliases/ExternalValueOperator.md)

Defined in: [packages/core/src/generated/ast.ts:3241](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L3241)
