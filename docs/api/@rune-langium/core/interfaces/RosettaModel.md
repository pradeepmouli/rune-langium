[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / RosettaModel

# Interface: RosettaModel

Defined in: [packages/core/src/generated/ast.ts:3826](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L3826)

## Extends

- `AstNode`

## Properties

### $container?

> `readonly` `optional` **$container?**: `AstNode`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/syntax-tree.d.ts:17

The container node in the AST; every node except the root node has a container.

#### Inherited from

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

> `readonly` **$type**: `"RosettaModel"`

Defined in: [packages/core/src/generated/ast.ts:3827](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L3827)

Every AST node has a type corresponding to what was specified in the grammar declaration.

#### Overrides

`langium.AstNode.$type`

***

### configurations

> **configurations**: [`RosettaQualifiableConfiguration`](RosettaQualifiableConfiguration.md)[]

Defined in: [packages/core/src/generated/ast.ts:3828](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L3828)

***

### definition?

> `optional` **definition?**: `string`

Defined in: [packages/core/src/generated/ast.ts:3829](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L3829)

***

### elements

> **elements**: [`RosettaRootElement`](../type-aliases/RosettaRootElement.md)[]

Defined in: [packages/core/src/generated/ast.ts:3830](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L3830)

***

### imports

> **imports**: [`Import`](Import.md)[]

Defined in: [packages/core/src/generated/ast.ts:3831](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L3831)

***

### name

> **name**: `string`

Defined in: [packages/core/src/generated/ast.ts:3832](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L3832)

***

### overridden

> **overridden**: `boolean`

Defined in: [packages/core/src/generated/ast.ts:3833](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L3833)

***

### scope?

> `optional` **scope?**: [`RosettaScope`](RosettaScope.md)

Defined in: [packages/core/src/generated/ast.ts:3834](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L3834)

***

### version?

> `optional` **version?**: `string`

Defined in: [packages/core/src/generated/ast.ts:3835](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L3835)
