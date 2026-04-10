[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / RosettaSymbolReference

# Interface: RosettaSymbolReference

Defined in: [packages/core/src/generated/ast.ts:4449](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L4449)

## Extends

- `AstNode`

## Properties

### $container

> `readonly` **$container**: [`Condition`](Condition.md) \| [`RosettaRule`](RosettaRule.md) \| [`ArithmeticOperation`](ArithmeticOperation.md) \| [`AsKeyOperation`](AsKeyOperation.md) \| [`ChoiceOperation`](ChoiceOperation.md) \| [`ComparisonOperation`](ComparisonOperation.md) \| [`ConstructorKeyValuePair`](ConstructorKeyValuePair.md) \| [`DefaultOperation`](DefaultOperation.md) \| [`DistinctOperation`](DistinctOperation.md) \| [`EqualityOperation`](EqualityOperation.md) \| [`FilterOperation`](FilterOperation.md) \| [`FirstOperation`](FirstOperation.md) \| [`FlattenOperation`](FlattenOperation.md) \| [`InlineFunction`](InlineFunction.md) \| [`JoinOperation`](JoinOperation.md) \| [`LastOperation`](LastOperation.md) \| [`ListLiteral`](ListLiteral.md) \| [`LogicalOperation`](LogicalOperation.md) \| [`MapOperation`](MapOperation.md) \| [`MaxOperation`](MaxOperation.md) \| [`MinOperation`](MinOperation.md) \| [`OneOfOperation`](OneOfOperation.md) \| [`Operation`](Operation.md) \| [`ReduceOperation`](ReduceOperation.md) \| [`ReverseOperation`](ReverseOperation.md) \| [`RosettaAbsentExpression`](RosettaAbsentExpression.md) \| [`RosettaConditionalExpression`](RosettaConditionalExpression.md) \| [`RosettaContainsExpression`](RosettaContainsExpression.md) \| [`RosettaCountOperation`](RosettaCountOperation.md) \| [`RosettaDeepFeatureCall`](RosettaDeepFeatureCall.md) \| [`RosettaDisjointExpression`](RosettaDisjointExpression.md) \| [`RosettaExistsExpression`](RosettaExistsExpression.md) \| [`RosettaFeatureCall`](RosettaFeatureCall.md) \| [`RosettaOnlyElement`](RosettaOnlyElement.md) \| [`RosettaOnlyExistsExpression`](RosettaOnlyExistsExpression.md) \| [`RosettaSuperCall`](RosettaSuperCall.md) \| `RosettaSymbolReference` \| [`ShortcutDeclaration`](ShortcutDeclaration.md) \| [`SortOperation`](SortOperation.md) \| [`SumOperation`](SumOperation.md) \| [`SwitchCaseOrDefault`](SwitchCaseOrDefault.md) \| [`SwitchOperation`](SwitchOperation.md) \| [`ThenOperation`](ThenOperation.md) \| [`ToDateOperation`](ToDateOperation.md) \| [`ToDateTimeOperation`](ToDateTimeOperation.md) \| [`ToEnumOperation`](ToEnumOperation.md) \| [`ToIntOperation`](ToIntOperation.md) \| [`ToNumberOperation`](ToNumberOperation.md) \| [`ToStringOperation`](ToStringOperation.md) \| [`ToTimeOperation`](ToTimeOperation.md) \| [`ToZonedDateTimeOperation`](ToZonedDateTimeOperation.md) \| [`TypeCallArgument`](TypeCallArgument.md) \| [`WithMetaEntry`](WithMetaEntry.md) \| [`WithMetaOperation`](WithMetaOperation.md) \| [`RosettaConstructorExpression`](RosettaConstructorExpression.md)

Defined in: [packages/core/src/generated/ast.ts:4450](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L4450)

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

> `readonly` **$type**: `"RosettaSymbolReference"`

Defined in: [packages/core/src/generated/ast.ts:4506](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L4506)

Every AST node has a type corresponding to what was specified in the grammar declaration.

#### Overrides

`langium.AstNode.$type`

***

### explicitArguments

> **explicitArguments**: `boolean`

Defined in: [packages/core/src/generated/ast.ts:4507](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L4507)

***

### rawArgs

> **rawArgs**: [`RosettaExpression`](../type-aliases/RosettaExpression.md)[]

Defined in: [packages/core/src/generated/ast.ts:4508](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L4508)

***

### symbol

> **symbol**: `Reference`\<[`RosettaSymbol`](../type-aliases/RosettaSymbol.md)\>

Defined in: [packages/core/src/generated/ast.ts:4509](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/ast.ts#L4509)
