[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / Operation

# Interface: Operation

Defined in: [packages/core/src/generated/ast.ts:1951](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/core/src/generated/ast.ts#L1951)

## Extends

- `AstNode`

## Properties

### $container

> `readonly` **$container**: [`RosettaFunction`](RosettaFunction.md)

Defined in: [packages/core/src/generated/ast.ts:1952](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/core/src/generated/ast.ts#L1952)

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

> `readonly` **$type**: `"Operation"`

Defined in: [packages/core/src/generated/ast.ts:1953](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/core/src/generated/ast.ts#L1953)

Every AST node has a type corresponding to what was specified in the grammar declaration.

#### Overrides

`langium.AstNode.$type`

***

### add

> **add**: `boolean`

Defined in: [packages/core/src/generated/ast.ts:1954](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/core/src/generated/ast.ts#L1954)

***

### assignRoot

> **assignRoot**: `Reference`\<[`AssignPathRoot`](../type-aliases/AssignPathRoot.md)\>

Defined in: [packages/core/src/generated/ast.ts:1955](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/core/src/generated/ast.ts#L1955)

***

### definition?

> `optional` **definition?**: `string`

Defined in: [packages/core/src/generated/ast.ts:1956](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/core/src/generated/ast.ts#L1956)

***

### expression

> **expression**: [`RosettaExpression`](../type-aliases/RosettaExpression.md)

Defined in: [packages/core/src/generated/ast.ts:1957](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/core/src/generated/ast.ts#L1957)

***

### path?

> `optional` **path?**: [`Segment`](Segment.md)

Defined in: [packages/core/src/generated/ast.ts:1958](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/core/src/generated/ast.ts#L1958)
