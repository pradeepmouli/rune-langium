[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / RosettaFunction

# Interface: RosettaFunction

Defined in: [packages/core/src/generated/ast.ts:3380](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L3380)

## Extends

- `AstNode`

## Properties

### $container

> `readonly` **$container**: [`RosettaModel`](RosettaModel.md)

Defined in: [packages/core/src/generated/ast.ts:3381](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L3381)

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

> `readonly` **$type**: `"RosettaFunction"`

Defined in: [packages/core/src/generated/ast.ts:3382](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L3382)

Every AST node has a type corresponding to what was specified in the grammar declaration.

#### Overrides

`langium.AstNode.$type`

***

### annotations

> **annotations**: [`AnnotationRef`](AnnotationRef.md)[]

Defined in: [packages/core/src/generated/ast.ts:3383](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L3383)

***

### conditions

> **conditions**: [`Condition`](Condition.md)[]

Defined in: [packages/core/src/generated/ast.ts:3384](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L3384)

***

### definition?

> `optional` **definition?**: `string`

Defined in: [packages/core/src/generated/ast.ts:3385](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L3385)

***

### dispatchAttribute?

> `optional` **dispatchAttribute?**: `Reference`\<[`Attribute`](Attribute.md)\>

Defined in: [packages/core/src/generated/ast.ts:3386](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L3386)

***

### dispatchValue?

> `optional` **dispatchValue?**: [`RosettaEnumValueReference`](RosettaEnumValueReference.md)

Defined in: [packages/core/src/generated/ast.ts:3387](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L3387)

***

### inputs

> **inputs**: [`Attribute`](Attribute.md)[]

Defined in: [packages/core/src/generated/ast.ts:3388](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L3388)

***

### name

> **name**: `string`

Defined in: [packages/core/src/generated/ast.ts:3389](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L3389)

***

### operations

> **operations**: [`Operation`](Operation.md)[]

Defined in: [packages/core/src/generated/ast.ts:3390](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L3390)

***

### output?

> `optional` **output?**: [`Attribute`](Attribute.md)

Defined in: [packages/core/src/generated/ast.ts:3391](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L3391)

***

### postConditions

> **postConditions**: [`Condition`](Condition.md)[]

Defined in: [packages/core/src/generated/ast.ts:3392](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L3392)

***

### references

> **references**: [`RosettaDocReference`](RosettaDocReference.md)[]

Defined in: [packages/core/src/generated/ast.ts:3393](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L3393)

***

### shortcuts

> **shortcuts**: [`ShortcutDeclaration`](ShortcutDeclaration.md)[]

Defined in: [packages/core/src/generated/ast.ts:3394](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L3394)

***

### superFunction?

> `optional` **superFunction?**: `Reference`\<`RosettaFunction`\>

Defined in: [packages/core/src/generated/ast.ts:3395](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/ast.ts#L3395)
