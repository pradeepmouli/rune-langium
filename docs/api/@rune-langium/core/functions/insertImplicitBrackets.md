[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / insertImplicitBrackets

# Function: insertImplicitBrackets()

> **insertImplicitBrackets**(`text`): `string`

Defined in: [packages/core/src/services/rune-dsl-parser.ts:196](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/services/rune-dsl-parser.ts#L196)

Scans the input text and inserts `[` and `]` around bare expressions
that follow `extract`, `filter`, or `reduce` operators.

The algorithm:
1. Scan character-by-character, skipping strings and comments
2. When a functional operator keyword is found:
   a. Check if followed by `[` — if so, skip (already InlineFunction)
   b. Check if followed by `ID [` or `ID ,` — if so, skip (closure param form)
   c. Otherwise, insert `[` before the bare expression and `]` at its end
3. Expression end is determined by tracking nesting depth and looking
   for terminators (comma, closing bracket, newline + statement keyword)

Multi-line support: when the keyword is at end of line (followed by
newline + whitespace), we look at the next line. If it starts with an
expression token (ID, `(`, `-`, `+`, etc.) and NOT a statement keyword,
we treat the next line as the start of a bare expression.

## Parameters

### text

`string`

## Returns

`string`
