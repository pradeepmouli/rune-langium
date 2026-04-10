[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / ToDateOperation

# Interface: ToDateOperation

Defined in: [packages/core/src/generated/ast.ts:5063](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/core/src/generated/ast.ts#L5063)

## Extends

- `AstNode`

## Properties

### $container

> `readonly` **$container**: [`Condition`](Condition.md) \| [`RosettaRule`](RosettaRule.md) \| [`ArithmeticOperation`](ArithmeticOperation.md) \| [`AsKeyOperation`](AsKeyOperation.md) \| [`ChoiceOperation`](ChoiceOperation.md) \| [`ComparisonOperation`](ComparisonOperation.md) \| [`ConstructorKeyValuePair`](ConstructorKeyValuePair.md) \| [`DefaultOperation`](DefaultOperation.md) \| [`DistinctOperation`](DistinctOperation.md) \| [`EqualityOperation`](EqualityOperation.md) \| [`FilterOperation`](FilterOperation.md) \| [`FirstOperation`](FirstOperation.md) \| [`FlattenOperation`](FlattenOperation.md) \| [`InlineFunction`](InlineFunction.md) \| [`JoinOperation`](JoinOperation.md) \| [`LastOperation`](LastOperation.md) \| [`ListLiteral`](ListLiteral.md) \| [`LogicalOperation`](LogicalOperation.md) \| [`MapOperation`](MapOperation.md) \| [`MaxOperation`](MaxOperation.md) \| [`MinOperation`](MinOperation.md) \| [`OneOfOperation`](OneOfOperation.md) \| [`Operation`](Operation.md) \| [`ReduceOperation`](ReduceOperation.md) \| [`ReverseOperation`](ReverseOperation.md) \| [`RosettaAbsentExpression`](RosettaAbsentExpression.md) \| [`RosettaConditionalExpression`](RosettaConditionalExpression.md) \| [`RosettaContainsExpression`](RosettaContainsExpression.md) \| [`RosettaCountOperation`](RosettaCountOperation.md) \| [`RosettaDeepFeatureCall`](RosettaDeepFeatureCall.md) \| [`RosettaDisjointExpression`](RosettaDisjointExpression.md) \| [`RosettaExistsExpression`](RosettaExistsExpression.md) \| [`RosettaFeatureCall`](RosettaFeatureCall.md) \| [`RosettaOnlyElement`](RosettaOnlyElement.md) \| [`RosettaOnlyExistsExpression`](RosettaOnlyExistsExpression.md) \| [`RosettaSuperCall`](RosettaSuperCall.md) \| [`RosettaSymbolReference`](RosettaSymbolReference.md) \| [`ShortcutDeclaration`](ShortcutDeclaration.md) \| [`SortOperation`](SortOperation.md) \| [`SumOperation`](SumOperation.md) \| [`SwitchCaseOrDefault`](SwitchCaseOrDefault.md) \| [`SwitchOperation`](SwitchOperation.md) \| [`ThenOperation`](ThenOperation.md) \| `ToDateOperation` \| [`ToDateTimeOperation`](ToDateTimeOperation.md) \| [`ToEnumOperation`](ToEnumOperation.md) \| [`ToIntOperation`](ToIntOperation.md) \| [`ToNumberOperation`](ToNumberOperation.md) \| [`ToStringOperation`](ToStringOperation.md) \| [`ToTimeOperation`](ToTimeOperation.md) \| [`ToZonedDateTimeOperation`](ToZonedDateTimeOperation.md) \| [`TypeCallArgument`](TypeCallArgument.md) \| [`WithMetaEntry`](WithMetaEntry.md) \| [`WithMetaOperation`](WithMetaOperation.md)

Defined in: [packages/core/src/generated/ast.ts:5064](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/core/src/generated/ast.ts#L5064)

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

> `readonly` **$type**: `"ToDateOperation"`

Defined in: [packages/core/src/generated/ast.ts:5119](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/core/src/generated/ast.ts#L5119)

Every AST node has a type corresponding to what was specified in the grammar declaration.

#### Overrides

`langium.AstNode.$type`

***

### argument?

> `optional` **argument?**: [`RosettaExpression`](../type-aliases/RosettaExpression.md)

Defined in: [packages/core/src/generated/ast.ts:5120](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/core/src/generated/ast.ts#L5120)

***

### operator

> **operator**: `"to-date"`

Defined in: [packages/core/src/generated/ast.ts:5121](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/core/src/generated/ast.ts#L5121)
