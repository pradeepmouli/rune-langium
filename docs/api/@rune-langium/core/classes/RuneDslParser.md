[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / RuneDslParser

# Class: RuneDslParser

Defined in: [packages/core/src/services/rune-dsl-parser.ts:27](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/services/rune-dsl-parser.ts#L27)

Custom parser for the Rune DSL that pre-processes input text to insert
implicit `[` and `]` brackets around bare expressions after `extract`,
`filter`, and `reduce` operators.

## Background

In the Xtext-based Rune DSL, `extract`/`filter`/`reduce` can accept both
bracket-delimited inline functions (`extract [body]`) and bare expressions
(`extract FuncName(item)`), using the `=>` syntactic predicate to resolve
the ambiguity. Langium's LL(k) parser (Chevrotain) cannot replicate this —
adding both alternatives causes the parser builder to hang indefinitely
during FIRST(k) set computation.

This parser works around the limitation by transforming the input text
before parsing: bare expressions after `extract`/`filter`/`reduce` are
wrapped in `[` and `]` so the standard InlineFunction grammar rule can
handle them.

## Extends

- `LangiumParser`

## Constructors

### Constructor

> **new RuneDslParser**(`services`): `RuneDslParser`

Defined in: [packages/core/src/services/rune-dsl-parser.ts:28](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/services/rune-dsl-parser.ts#L28)

#### Parameters

##### services

`LangiumCoreServices`

#### Returns

`RuneDslParser`

#### Overrides

`LangiumParser.constructor`

## Properties

### \_unorderedGroups

> `protected` **\_unorderedGroups**: `Map`\<`string`, `boolean`[]\>

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/parser/langium-parser.d.ts:89

#### Inherited from

`LangiumParser._unorderedGroups`

***

### allRules

> `protected` **allRules**: `Map`\<`string`, `RuleResult`\>

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/parser/langium-parser.d.ts:90

#### Inherited from

`LangiumParser.allRules`

***

### lexer

> `protected` `readonly` **lexer**: `Lexer`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/parser/langium-parser.d.ts:87

#### Inherited from

`LangiumParser.lexer`

***

### mainRule

> `protected` **mainRule**: `RuleResult`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/parser/langium-parser.d.ts:91

#### Inherited from

`LangiumParser.mainRule`

***

### wrapper

> `protected` `readonly` **wrapper**: `ChevrotainWrapper`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/parser/langium-parser.d.ts:88

#### Inherited from

`LangiumParser.wrapper`

## Accessors

### definitionErrors

#### Get Signature

> **get** **definitionErrors**(): `IParserDefinitionError`[]

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/parser/langium-parser.d.ts:144

##### Returns

`IParserDefinitionError`[]

#### Inherited from

`LangiumParser.definitionErrors`

***

### unorderedGroups

#### Get Signature

> **get** **unorderedGroups**(): `Map`\<`string`, `boolean`[]\>

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/parser/langium-parser.d.ts:103

Current state of the unordered groups

##### Returns

`Map`\<`string`, `boolean`[]\>

#### Inherited from

`LangiumParser.unorderedGroups`

## Methods

### action()

> **action**(`$type`, `action`): `void`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/parser/langium-parser.d.ts:138

#### Parameters

##### $type

`string`

##### action

`Action`

#### Returns

`void`

#### Inherited from

`LangiumParser.action`

***

### alternatives()

> **alternatives**(`idx`, `choices`): `void`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/parser/langium-parser.d.ts:93

Performs alternatives parsing (the `|` operation in EBNF/Langium)

#### Parameters

##### idx

`number`

##### choices

`IOrAlt`\<`any`\>[]

#### Returns

`void`

#### Inherited from

`LangiumParser.alternatives`

***

### atLeastOne()

> **atLeastOne**(`idx`, `callback`): `void`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/parser/langium-parser.d.ts:96

Parses the callback 1 or more times (the `+` operation in EBNF/Langium)

#### Parameters

##### idx

`number`

##### callback

`DSLMethodOpts`\<`unknown`\>

#### Returns

`void`

#### Inherited from

`LangiumParser.atLeastOne`

***

### consume()

> **consume**(`idx`, `tokenType`, `feature`): `void`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/parser/langium-parser.d.ts:128

#### Parameters

##### idx

`number`

##### tokenType

`TokenType`

##### feature

`AbstractElement`

#### Returns

`void`

#### Inherited from

`LangiumParser.consume`

***

### finalize()

> **finalize**(): `void`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/parser/langium-parser.d.ts:105

#### Returns

`void`

#### Inherited from

`LangiumParser.finalize`

***

### getRule()

> **getRule**(`name`): `RuleResult` \| `undefined`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/parser/langium-parser.d.ts:101

Returns the executable rule function for the specified rule name

#### Parameters

##### name

`string`

#### Returns

`RuleResult` \| `undefined`

#### Inherited from

`LangiumParser.getRule`

***

### getRuleStack()

> **getRuleStack**(): `number`[]

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/parser/langium-parser.d.ts:104

The rule stack indicates the indices of rules that are currently invoked,
in order of their invocation.

#### Returns

`number`[]

#### Inherited from

`LangiumParser.getRuleStack`

***

### isRecording()

> **isRecording**(): `boolean`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/parser/langium-parser.d.ts:102

Whether the parser is currently actually in use or in "recording mode".
Recording mode is activated once when the parser is analyzing itself.
During this phase, no input exists and therefore no AST should be constructed

#### Returns

`boolean`

#### Inherited from

`LangiumParser.isRecording`

***

### many()

> **many**(`idx`, `callback`): `void`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/parser/langium-parser.d.ts:95

Parses the callback 0 or more times (the `*` operation in EBNF/Langium)

#### Parameters

##### idx

`number`

##### callback

`DSLMethodOpts`\<`unknown`\>

#### Returns

`void`

#### Inherited from

`LangiumParser.many`

***

### optional()

> **optional**(`idx`, `callback`): `void`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/parser/langium-parser.d.ts:94

Parses the callback as optional (the `?` operation in EBNF/Langium)

#### Parameters

##### idx

`number`

##### callback

`DSLMethodOpts`\<`unknown`\>

#### Returns

`void`

#### Inherited from

`LangiumParser.optional`

***

### parse()

> **parse**\<`T`\>(`input`, `options?`): `ParseResult`\<`T`\>

Defined in: [packages/core/src/services/rune-dsl-parser.ts:32](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/services/rune-dsl-parser.ts#L32)

#### Type Parameters

##### T

`T` *extends* `AstNode` = `AstNode`

#### Parameters

##### input

`string`

##### options?

`ParserOptions`

#### Returns

`ParseResult`\<`T`\>

#### Overrides

`LangiumParser.parse`

***

### rule()

> **rule**(`rule`, `impl`): `RuleResult`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/parser/langium-parser.d.ts:121

#### Parameters

##### rule

`ParserRule` \| `InfixRule`

##### impl

`RuleImpl`

#### Returns

`RuleResult`

#### Inherited from

`LangiumParser.rule`

***

### subrule()

> **subrule**(`idx`, `rule`, `fragment`, `feature`, `args`): `void`

Defined in: node\_modules/.pnpm/langium@4.2.1/node\_modules/langium/lib/parser/langium-parser.d.ts:136

#### Parameters

##### idx

`number`

##### rule

`RuleResult`

##### fragment

`boolean`

##### feature

`AbstractElement`

##### args

`Args`

#### Returns

`void`

#### Inherited from

`LangiumParser.subrule`
