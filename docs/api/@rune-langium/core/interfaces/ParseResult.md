[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / ParseResult

# Interface: ParseResult

Defined in: [packages/core/src/api/parse.ts:12](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/api/parse.ts#L12)

Result of parsing a Rosetta DSL source string.

## Properties

### hasErrors

> **hasErrors**: `boolean`

Defined in: [packages/core/src/api/parse.ts:30](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/api/parse.ts#L30)

Whether the parse completed without errors.

***

### lexerErrors

> **lexerErrors**: `object`[]

Defined in: [packages/core/src/api/parse.ts:16](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/api/parse.ts#L16)

Lexer errors encountered during parsing.

#### column?

> `optional` **column?**: `number`

#### line?

> `optional` **line?**: `number`

#### message

> **message**: `string`

#### offset

> **offset**: `number`

***

### parserErrors

> **parserErrors**: `object`[]

Defined in: [packages/core/src/api/parse.ts:23](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/api/parse.ts#L23)

Parser errors encountered during parsing.

#### column?

> `optional` **column?**: `number`

#### line?

> `optional` **line?**: `number`

#### message

> **message**: `string`

#### offset?

> `optional` **offset?**: `number`

***

### value

> **value**: [`RosettaModel`](RosettaModel.md)

Defined in: [packages/core/src/api/parse.ts:14](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/api/parse.ts#L14)

The root AST node.
