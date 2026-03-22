[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / ExpressionEditorSlotProps

# Interface: ExpressionEditorSlotProps

Defined in: [packages/visual-editor/src/types.ts:209](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L209)

Props provided to the expression editor render-prop slot.

`packages/visual-editor` is editor-agnostic — the host app provides
the actual editor implementation (e.g. CodeMirror, Monaco) via a
`renderExpressionEditor` prop on `FunctionForm`.

## Extended by

- [`ExpressionBuilderProps`](ExpressionBuilderProps.md)

## Properties

### error?

> `optional` **error?**: `string` \| `null`

Defined in: [packages/visual-editor/src/types.ts:217](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L217)

Validation error message (null when valid).

***

### expressionAst?

> `optional` **expressionAst?**: `unknown`

Defined in: [packages/visual-editor/src/types.ts:221](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L221)

Raw AST expression object — enables direct tree conversion without reparsing text.

***

### onBlur

> **onBlur**: () => `void`

Defined in: [packages/visual-editor/src/types.ts:215](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L215)

Called when the editor loses focus — triggers validation & commit.

#### Returns

`void`

***

### onChange

> **onChange**: (`value`) => `void`

Defined in: [packages/visual-editor/src/types.ts:213](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L213)

Called on every keystroke / change.

#### Parameters

##### value

`string`

#### Returns

`void`

***

### placeholder?

> `optional` **placeholder?**: `string`

Defined in: [packages/visual-editor/src/types.ts:219](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L219)

Placeholder text shown when the editor is empty.

***

### value

> **value**: `string`

Defined in: [packages/visual-editor/src/types.ts:211](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L211)

Current expression text.
