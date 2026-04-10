[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / Condition

# Interface: Condition

Defined in: [packages/core/src/generated/ast.ts:757](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L757)

## Extends

- `AstNode`

## Properties

### $container

> `readonly` **$container**: [`Data`](Data.md) \| [`RosettaFunction`](RosettaFunction.md) \| [`RosettaTypeAlias`](RosettaTypeAlias.md)

Defined in: [packages/core/src/generated/ast.ts:758](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L758)

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

> `readonly` **$type**: `"Condition"`

Defined in: [packages/core/src/generated/ast.ts:759](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L759)

Every AST node has a type corresponding to what was specified in the grammar declaration.

#### Overrides

`langium.AstNode.$type`

***

### annotations

> **annotations**: [`AnnotationRef`](AnnotationRef.md)[]

Defined in: [packages/core/src/generated/ast.ts:760](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L760)

***

### definition?

> `optional` **definition?**: `string`

Defined in: [packages/core/src/generated/ast.ts:761](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L761)

***

### expression

> **expression**: [`RosettaExpression`](../type-aliases/RosettaExpression.md)

Defined in: [packages/core/src/generated/ast.ts:762](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L762)

***

### name?

> `optional` **name?**: `string`

Defined in: [packages/core/src/generated/ast.ts:763](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L763)

***

### postCondition

> **postCondition**: `boolean`

Defined in: [packages/core/src/generated/ast.ts:764](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L764)

***

### references

> **references**: [`RosettaDocReference`](RosettaDocReference.md)[]

Defined in: [packages/core/src/generated/ast.ts:765](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L765)
