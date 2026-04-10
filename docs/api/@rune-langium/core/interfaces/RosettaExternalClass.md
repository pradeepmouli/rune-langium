[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / RosettaExternalClass

# Interface: RosettaExternalClass

Defined in: [packages/core/src/generated/ast.ts:3142](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L3142)

## Extends

- `AstNode`

## Properties

### $container

> `readonly` **$container**: [`RosettaExternalRuleSource`](RosettaExternalRuleSource.md) \| [`RosettaSynonymSource`](RosettaSynonymSource.md)

Defined in: [packages/core/src/generated/ast.ts:3143](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L3143)

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

> `readonly` **$type**: `"RosettaExternalClass"`

Defined in: [packages/core/src/generated/ast.ts:3144](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L3144)

Every AST node has a type corresponding to what was specified in the grammar declaration.

#### Overrides

`langium.AstNode.$type`

***

### data

> **data**: `Reference`\<[`DataOrChoice`](../type-aliases/DataOrChoice.md)\>

Defined in: [packages/core/src/generated/ast.ts:3145](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L3145)

***

### externalClassSynonyms

> **externalClassSynonyms**: [`RosettaExternalClassSynonym`](RosettaExternalClassSynonym.md)[]

Defined in: [packages/core/src/generated/ast.ts:3146](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L3146)

***

### regularAttributes

> **regularAttributes**: [`RosettaExternalRegularAttribute`](RosettaExternalRegularAttribute.md)[]

Defined in: [packages/core/src/generated/ast.ts:3147](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L3147)
