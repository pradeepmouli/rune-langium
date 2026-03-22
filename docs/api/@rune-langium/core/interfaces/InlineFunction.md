[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / InlineFunction

# Interface: InlineFunction

Defined in: [packages/core/src/generated/ast.ts:1318](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/ast.ts#L1318)

## Extends

- `AstNode`

## Properties

### $container

> `readonly` **$container**: [`FilterOperation`](FilterOperation.md) \| [`MapOperation`](MapOperation.md) \| [`MaxOperation`](MaxOperation.md) \| [`MinOperation`](MinOperation.md) \| [`ReduceOperation`](ReduceOperation.md) \| [`SortOperation`](SortOperation.md) \| [`ThenOperation`](ThenOperation.md)

Defined in: [packages/core/src/generated/ast.ts:1319](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/ast.ts#L1319)

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

> `readonly` **$type**: `"InlineFunction"`

Defined in: [packages/core/src/generated/ast.ts:1327](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/ast.ts#L1327)

Every AST node has a type corresponding to what was specified in the grammar declaration.

#### Overrides

`langium.AstNode.$type`

***

### body

> **body**: [`RosettaExpression`](../type-aliases/RosettaExpression.md)

Defined in: [packages/core/src/generated/ast.ts:1328](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/ast.ts#L1328)

***

### parameters

> **parameters**: [`ClosureParameter`](ClosureParameter.md)[]

Defined in: [packages/core/src/generated/ast.ts:1329](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/ast.ts#L1329)
