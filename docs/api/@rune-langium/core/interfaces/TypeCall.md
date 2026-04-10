[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / TypeCall

# Interface: TypeCall

Defined in: [packages/core/src/generated/ast.ts:5633](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L5633)

## Extends

- `AstNode`

## Properties

### $container

> `readonly` **$container**: [`Attribute`](Attribute.md) \| [`ChoiceOption`](ChoiceOption.md) \| [`RosettaRule`](RosettaRule.md) \| [`RosettaTypeAlias`](RosettaTypeAlias.md) \| [`RosettaExternalFunction`](RosettaExternalFunction.md) \| [`RosettaMetaType`](RosettaMetaType.md) \| [`RosettaParameter`](RosettaParameter.md) \| [`RosettaRecordFeature`](RosettaRecordFeature.md) \| [`RosettaReport`](RosettaReport.md) \| [`TypeParameter`](TypeParameter.md)

Defined in: [packages/core/src/generated/ast.ts:5634](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L5634)

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

> `readonly` **$type**: `"TypeCall"`

Defined in: [packages/core/src/generated/ast.ts:5645](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L5645)

Every AST node has a type corresponding to what was specified in the grammar declaration.

#### Overrides

`langium.AstNode.$type`

***

### arguments

> **arguments**: [`TypeCallArgument`](TypeCallArgument.md)[]

Defined in: [packages/core/src/generated/ast.ts:5646](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L5646)

***

### type

> **type**: `Reference`\<[`RosettaType`](../type-aliases/RosettaType.md)\>

Defined in: [packages/core/src/generated/ast.ts:5647](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L5647)
