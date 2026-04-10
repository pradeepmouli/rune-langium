[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / RuleReferenceAnnotation

# Interface: RuleReferenceAnnotation

Defined in: [packages/core/src/generated/ast.ts:4672](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/core/src/generated/ast.ts#L4672)

## Extends

- `AstNode`

## Properties

### $container

> `readonly` **$container**: [`Attribute`](Attribute.md) \| [`ChoiceOption`](ChoiceOption.md) \| [`RosettaExternalRegularAttribute`](RosettaExternalRegularAttribute.md)

Defined in: [packages/core/src/generated/ast.ts:4673](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/core/src/generated/ast.ts#L4673)

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

> `readonly` **$type**: `"RuleReferenceAnnotation"`

Defined in: [packages/core/src/generated/ast.ts:4674](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/core/src/generated/ast.ts#L4674)

Every AST node has a type corresponding to what was specified in the grammar declaration.

#### Overrides

`langium.AstNode.$type`

***

### empty

> **empty**: `boolean`

Defined in: [packages/core/src/generated/ast.ts:4675](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/core/src/generated/ast.ts#L4675)

***

### name

> **name**: `"ruleReference"`

Defined in: [packages/core/src/generated/ast.ts:4676](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/core/src/generated/ast.ts#L4676)

***

### path?

> `optional` **path?**: [`AnnotationPathExpression`](../type-aliases/AnnotationPathExpression.md)

Defined in: [packages/core/src/generated/ast.ts:4677](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/core/src/generated/ast.ts#L4677)

***

### reportingRule?

> `optional` **reportingRule?**: `Reference`\<[`RosettaRule`](RosettaRule.md)\>

Defined in: [packages/core/src/generated/ast.ts:4678](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/core/src/generated/ast.ts#L4678)
