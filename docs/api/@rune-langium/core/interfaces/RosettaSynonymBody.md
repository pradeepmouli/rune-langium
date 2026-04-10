[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / RosettaSynonymBody

# Interface: RosettaSynonymBody

Defined in: [packages/core/src/generated/ast.ts:4540](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L4540)

## Extends

- `AstNode`

## Properties

### $container

> `readonly` **$container**: [`RosettaSynonym`](RosettaSynonym.md) \| [`RosettaExternalSynonym`](RosettaExternalSynonym.md)

Defined in: [packages/core/src/generated/ast.ts:4541](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L4541)

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

> `readonly` **$type**: `"RosettaSynonymBody"`

Defined in: [packages/core/src/generated/ast.ts:4542](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L4542)

Every AST node has a type corresponding to what was specified in the grammar declaration.

#### Overrides

`langium.AstNode.$type`

***

### format?

> `optional` **format?**: `string`

Defined in: [packages/core/src/generated/ast.ts:4543](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L4543)

***

### hints

> **hints**: `string`[]

Defined in: [packages/core/src/generated/ast.ts:4544](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L4544)

***

### mapper?

> `optional` **mapper?**: `string`

Defined in: [packages/core/src/generated/ast.ts:4545](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L4545)

***

### mappingLogic?

> `optional` **mappingLogic?**: [`RosettaMapping`](RosettaMapping.md)

Defined in: [packages/core/src/generated/ast.ts:4546](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L4546)

***

### merge?

> `optional` **merge?**: [`RosettaMergeSynonymValue`](RosettaMergeSynonymValue.md)

Defined in: [packages/core/src/generated/ast.ts:4547](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L4547)

***

### metaValues

> **metaValues**: `string`[]

Defined in: [packages/core/src/generated/ast.ts:4548](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L4548)

***

### patternMatch?

> `optional` **patternMatch?**: `string`

Defined in: [packages/core/src/generated/ast.ts:4549](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L4549)

***

### patternReplace?

> `optional` **patternReplace?**: `string`

Defined in: [packages/core/src/generated/ast.ts:4550](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L4550)

***

### removeHtml

> **removeHtml**: `boolean`

Defined in: [packages/core/src/generated/ast.ts:4551](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L4551)

***

### values

> **values**: [`RosettaSynonymValueBase`](RosettaSynonymValueBase.md)[]

Defined in: [packages/core/src/generated/ast.ts:4552](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L4552)
