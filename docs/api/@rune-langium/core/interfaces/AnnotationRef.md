[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / AnnotationRef

# Interface: AnnotationRef

Defined in: [packages/core/src/generated/ast.ts:304](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L304)

## Extends

- `AstNode`

## Properties

### $container

> `readonly` **$container**: [`Attribute`](Attribute.md) \| [`ChoiceOption`](ChoiceOption.md) \| [`Data`](Data.md) \| [`RosettaFunction`](RosettaFunction.md) \| [`Choice`](Choice.md) \| [`Condition`](Condition.md) \| [`RosettaEnumValue`](RosettaEnumValue.md) \| [`RosettaEnumeration`](RosettaEnumeration.md)

Defined in: [packages/core/src/generated/ast.ts:305](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L305)

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

> `readonly` **$type**: `"AnnotationRef"`

Defined in: [packages/core/src/generated/ast.ts:314](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L314)

Every AST node has a type corresponding to what was specified in the grammar declaration.

#### Overrides

`langium.AstNode.$type`

***

### annotation

> **annotation**: `Reference`\<[`Annotation`](Annotation.md)\>

Defined in: [packages/core/src/generated/ast.ts:315](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L315)

***

### attribute?

> `optional` **attribute?**: `Reference`\<[`Attribute`](Attribute.md)\>

Defined in: [packages/core/src/generated/ast.ts:316](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L316)

***

### qualifiers

> **qualifiers**: [`AnnotationQualifier`](AnnotationQualifier.md)[]

Defined in: [packages/core/src/generated/ast.ts:317](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L317)
