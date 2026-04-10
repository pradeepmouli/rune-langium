[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / AnnotationDeepPath

# Interface: AnnotationDeepPath

Defined in: [packages/core/src/generated/ast.ts:201](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/core/src/generated/ast.ts#L201)

## Extends

- `AstNode`

## Properties

### $container

> `readonly` **$container**: `AnnotationDeepPath` \| [`AnnotationPath`](AnnotationPath.md) \| [`LabelAnnotation`](LabelAnnotation.md) \| [`RosettaDocReference`](RosettaDocReference.md) \| [`RuleReferenceAnnotation`](RuleReferenceAnnotation.md)

Defined in: [packages/core/src/generated/ast.ts:202](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/core/src/generated/ast.ts#L202)

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

> `readonly` **$type**: `"AnnotationDeepPath"`

Defined in: [packages/core/src/generated/ast.ts:208](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/core/src/generated/ast.ts#L208)

Every AST node has a type corresponding to what was specified in the grammar declaration.

#### Overrides

`langium.AstNode.$type`

***

### attribute

> **attribute**: `Reference`\<[`AttributeOrChoiceOption`](../type-aliases/AttributeOrChoiceOption.md)\>

Defined in: [packages/core/src/generated/ast.ts:209](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/core/src/generated/ast.ts#L209)

***

### operator

> **operator**: `"->>"`

Defined in: [packages/core/src/generated/ast.ts:210](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/core/src/generated/ast.ts#L210)

***

### receiver

> **receiver**: [`AnnotationPathExpression`](../type-aliases/AnnotationPathExpression.md)

Defined in: [packages/core/src/generated/ast.ts:211](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/core/src/generated/ast.ts#L211)
