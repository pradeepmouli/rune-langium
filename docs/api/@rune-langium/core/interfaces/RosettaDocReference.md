[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / RosettaDocReference

# Interface: RosettaDocReference

Defined in: [packages/core/src/generated/ast.ts:2878](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/ast.ts#L2878)

## Extends

- `AstNode`

## Properties

### $container

> `readonly` **$container**: [`Attribute`](Attribute.md) \| [`ChoiceOption`](ChoiceOption.md) \| [`Data`](Data.md) \| [`RosettaFunction`](RosettaFunction.md) \| [`Condition`](Condition.md) \| [`RosettaEnumValue`](RosettaEnumValue.md) \| [`RosettaEnumeration`](RosettaEnumeration.md) \| [`RosettaRule`](RosettaRule.md)

Defined in: [packages/core/src/generated/ast.ts:2879](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/ast.ts#L2879)

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

> `readonly` **$type**: `"RosettaDocReference"`

Defined in: [packages/core/src/generated/ast.ts:2888](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/ast.ts#L2888)

Every AST node has a type corresponding to what was specified in the grammar declaration.

#### Overrides

`langium.AstNode.$type`

***

### docReference

> **docReference**: [`RegulatoryDocumentReference`](RegulatoryDocumentReference.md)

Defined in: [packages/core/src/generated/ast.ts:2889](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/ast.ts#L2889)

***

### name

> **name**: `"docReference"` \| `"regulatoryReference"`

Defined in: [packages/core/src/generated/ast.ts:2890](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/ast.ts#L2890)

***

### path?

> `optional` **path?**: [`AnnotationPathExpression`](../type-aliases/AnnotationPathExpression.md)

Defined in: [packages/core/src/generated/ast.ts:2891](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/ast.ts#L2891)

***

### provision?

> `optional` **provision?**: `string`

Defined in: [packages/core/src/generated/ast.ts:2892](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/ast.ts#L2892)

***

### rationales

> **rationales**: [`DocumentRationale`](DocumentRationale.md)[]

Defined in: [packages/core/src/generated/ast.ts:2893](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/ast.ts#L2893)

***

### reportedField

> **reportedField**: `boolean`

Defined in: [packages/core/src/generated/ast.ts:2894](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/ast.ts#L2894)

***

### structuredProvision?

> `optional` **structuredProvision?**: `string`

Defined in: [packages/core/src/generated/ast.ts:2895](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/ast.ts#L2895)
