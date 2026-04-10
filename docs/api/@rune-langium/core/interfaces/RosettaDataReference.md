[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / RosettaDataReference

# Interface: RosettaDataReference

Defined in: [packages/core/src/generated/ast.ts:2717](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L2717)

## Extends

- [`RosettaAttributeReference`](RosettaAttributeReference.md)

## Properties

### $container

> `readonly` **$container**: [`RosettaAttributeReference`](RosettaAttributeReference.md)

Defined in: [packages/core/src/generated/ast.ts:2718](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L2718)

The container node in the AST; every node except the root node has a container.

#### Overrides

[`RosettaAttributeReference`](RosettaAttributeReference.md).[`$container`](RosettaAttributeReference.md#container)

***

### $containerIndex?

> `readonly` `optional` **$containerIndex?**: `number`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/syntax-tree.d.ts:21

In case `$containerProperty` is an array, the array index is stored here.

#### Inherited from

[`RosettaAttributeReference`](RosettaAttributeReference.md).[`$containerIndex`](RosettaAttributeReference.md#containerindex)

***

### $containerProperty?

> `readonly` `optional` **$containerProperty?**: `string`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/syntax-tree.d.ts:19

The property of the `$container` node that contains this node. This is either a direct reference or an array.

#### Inherited from

[`RosettaAttributeReference`](RosettaAttributeReference.md).[`$containerProperty`](RosettaAttributeReference.md#containerproperty)

***

### $cstNode?

> `readonly` `optional` **$cstNode?**: `CstNode`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/syntax-tree.d.ts:23

The Concrete Syntax Tree (CST) node of the text range from which this node was parsed.

#### Inherited from

[`RosettaAttributeReference`](RosettaAttributeReference.md).[`$cstNode`](RosettaAttributeReference.md#cstnode)

***

### $document?

> `readonly` `optional` **$document?**: `LangiumDocument`\<`AstNode`\>

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/syntax-tree.d.ts:25

The document containing the AST; only the root node has a direct reference to the document.

#### Inherited from

[`RosettaAttributeReference`](RosettaAttributeReference.md).[`$document`](RosettaAttributeReference.md#document)

***

### $type

> `readonly` **$type**: `"RosettaDataReference"`

Defined in: [packages/core/src/generated/ast.ts:2719](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L2719)

Every AST node has a type corresponding to what was specified in the grammar declaration.

#### Overrides

[`RosettaAttributeReference`](RosettaAttributeReference.md).[`$type`](RosettaAttributeReference.md#type)

***

### attribute

> **attribute**: `Reference`\<[`AttributeOrChoiceOption`](../type-aliases/AttributeOrChoiceOption.md)\>

Defined in: [packages/core/src/generated/ast.ts:2223](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L2223)

#### Inherited from

[`RosettaAttributeReference`](RosettaAttributeReference.md).[`attribute`](RosettaAttributeReference.md#attribute)

***

### data

> **data**: `Reference`\<[`DataOrChoice`](../type-aliases/DataOrChoice.md)\>

Defined in: [packages/core/src/generated/ast.ts:2720](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L2720)

***

### receiver

> **receiver**: `RosettaDataReference`

Defined in: [packages/core/src/generated/ast.ts:2224](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L2224)

#### Inherited from

[`RosettaAttributeReference`](RosettaAttributeReference.md).[`receiver`](RosettaAttributeReference.md#receiver)
