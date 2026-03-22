[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / RosettaReport

# Interface: RosettaReport

Defined in: [packages/core/src/generated/ast.ts:4151](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/ast.ts#L4151)

## Extends

- `AstNode`

## Properties

### $container

> `readonly` **$container**: [`RosettaModel`](RosettaModel.md)

Defined in: [packages/core/src/generated/ast.ts:4152](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/ast.ts#L4152)

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

> `readonly` **$type**: `"RosettaReport"`

Defined in: [packages/core/src/generated/ast.ts:4153](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/ast.ts#L4153)

Every AST node has a type corresponding to what was specified in the grammar declaration.

#### Overrides

`langium.AstNode.$type`

***

### eligibilityRules

> **eligibilityRules**: `Reference`\<[`RosettaRule`](RosettaRule.md)\>[]

Defined in: [packages/core/src/generated/ast.ts:4154](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/ast.ts#L4154)

***

### inputType

> **inputType**: [`TypeCall`](TypeCall.md)

Defined in: [packages/core/src/generated/ast.ts:4155](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/ast.ts#L4155)

***

### regulatoryBody

> **regulatoryBody**: [`RegulatoryDocumentReference`](RegulatoryDocumentReference.md)

Defined in: [packages/core/src/generated/ast.ts:4156](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/ast.ts#L4156)

***

### reportingStandard?

> `optional` **reportingStandard?**: `Reference`\<[`RosettaCorpus`](RosettaCorpus.md)\>

Defined in: [packages/core/src/generated/ast.ts:4157](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/ast.ts#L4157)

***

### reportType

> **reportType**: `Reference`\<[`Data`](Data.md)\>

Defined in: [packages/core/src/generated/ast.ts:4158](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/ast.ts#L4158)

***

### ruleSource?

> `optional` **ruleSource?**: `Reference`\<[`RosettaExternalRuleSource`](RosettaExternalRuleSource.md)\>

Defined in: [packages/core/src/generated/ast.ts:4159](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/ast.ts#L4159)
