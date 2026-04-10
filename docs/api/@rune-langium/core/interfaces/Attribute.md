[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / Attribute

# Interface: Attribute

Defined in: [packages/core/src/generated/ast.ts:485](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L485)

## Extends

- `AstNode`

## Properties

### $container

> `readonly` **$container**: [`Annotation`](Annotation.md) \| [`Data`](Data.md) \| [`RosettaFunction`](RosettaFunction.md)

Defined in: [packages/core/src/generated/ast.ts:486](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L486)

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

> `readonly` **$type**: `"Attribute"`

Defined in: [packages/core/src/generated/ast.ts:487](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L487)

Every AST node has a type corresponding to what was specified in the grammar declaration.

#### Overrides

`langium.AstNode.$type`

***

### annotations

> **annotations**: [`AnnotationRef`](AnnotationRef.md)[]

Defined in: [packages/core/src/generated/ast.ts:488](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L488)

***

### card

> **card**: [`RosettaCardinality`](RosettaCardinality.md)

Defined in: [packages/core/src/generated/ast.ts:489](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L489)

***

### definition?

> `optional` **definition?**: `string`

Defined in: [packages/core/src/generated/ast.ts:490](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L490)

***

### labels

> **labels**: [`LabelAnnotation`](LabelAnnotation.md)[]

Defined in: [packages/core/src/generated/ast.ts:491](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L491)

***

### name

> **name**: `string`

Defined in: [packages/core/src/generated/ast.ts:492](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L492)

***

### override

> **override**: `boolean`

Defined in: [packages/core/src/generated/ast.ts:493](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L493)

***

### references

> **references**: [`RosettaDocReference`](RosettaDocReference.md)[]

Defined in: [packages/core/src/generated/ast.ts:494](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L494)

***

### ruleReferences

> **ruleReferences**: [`RuleReferenceAnnotation`](RuleReferenceAnnotation.md)[]

Defined in: [packages/core/src/generated/ast.ts:495](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L495)

***

### synonyms

> **synonyms**: [`RosettaSynonym`](RosettaSynonym.md)[]

Defined in: [packages/core/src/generated/ast.ts:496](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L496)

***

### typeCall

> **typeCall**: [`TypeCall`](TypeCall.md)

Defined in: [packages/core/src/generated/ast.ts:497](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L497)

***

### typeCallArgs

> **typeCallArgs**: [`TypeCallArgument`](TypeCallArgument.md)[]

Defined in: [packages/core/src/generated/ast.ts:498](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L498)
