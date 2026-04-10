[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / ChoiceOption

# Interface: ChoiceOption

Defined in: [packages/core/src/generated/ast.ts:640](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L640)

## Extends

- `AstNode`

## Properties

### $container

> `readonly` **$container**: [`Choice`](Choice.md)

Defined in: [packages/core/src/generated/ast.ts:641](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L641)

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

> `readonly` **$type**: `"ChoiceOption"`

Defined in: [packages/core/src/generated/ast.ts:642](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L642)

Every AST node has a type corresponding to what was specified in the grammar declaration.

#### Overrides

`langium.AstNode.$type`

***

### annotations

> **annotations**: [`AnnotationRef`](AnnotationRef.md)[]

Defined in: [packages/core/src/generated/ast.ts:643](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L643)

***

### definition?

> `optional` **definition?**: `string`

Defined in: [packages/core/src/generated/ast.ts:644](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L644)

***

### labels

> **labels**: [`LabelAnnotation`](LabelAnnotation.md)[]

Defined in: [packages/core/src/generated/ast.ts:645](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L645)

***

### references

> **references**: [`RosettaDocReference`](RosettaDocReference.md)[]

Defined in: [packages/core/src/generated/ast.ts:646](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L646)

***

### ruleReferences

> **ruleReferences**: [`RuleReferenceAnnotation`](RuleReferenceAnnotation.md)[]

Defined in: [packages/core/src/generated/ast.ts:647](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L647)

***

### synonyms

> **synonyms**: [`RosettaSynonym`](RosettaSynonym.md)[]

Defined in: [packages/core/src/generated/ast.ts:648](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L648)

***

### typeCall

> **typeCall**: [`TypeCall`](TypeCall.md)

Defined in: [packages/core/src/generated/ast.ts:649](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L649)
