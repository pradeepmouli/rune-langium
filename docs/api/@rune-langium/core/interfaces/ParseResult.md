[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / ParseResult

# Interface: ParseResult

Defined in: [packages/core/src/api/parse.ts:9](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/api/parse.ts#L9)

Result of parsing a Rosetta DSL source string.

## Properties

### hasErrors

> **hasErrors**: `boolean`

Defined in: [packages/core/src/api/parse.ts:27](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/api/parse.ts#L27)

Whether the parse completed without errors.

***

### lexerErrors

> **lexerErrors**: `object`[]

Defined in: [packages/core/src/api/parse.ts:13](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/api/parse.ts#L13)

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

Defined in: [packages/core/src/api/parse.ts:20](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/api/parse.ts#L20)

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

Defined in: [packages/core/src/api/parse.ts:11](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/api/parse.ts#L11)

The root AST node.
