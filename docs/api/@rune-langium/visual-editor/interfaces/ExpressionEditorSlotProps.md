[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / ExpressionEditorSlotProps

# Interface: ExpressionEditorSlotProps

Defined in: [packages/visual-editor/src/types.ts:212](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L212)

Props provided to the expression editor render-prop slot.

`packages/visual-editor` is editor-agnostic — the host app provides
the actual editor implementation (e.g. CodeMirror, Monaco) via a
`renderExpressionEditor` prop on `FunctionForm`.

## Extended by

- [`ExpressionBuilderProps`](ExpressionBuilderProps.md)

## Properties

### error?

> `optional` **error?**: `string` \| `null`

Defined in: [packages/visual-editor/src/types.ts:220](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L220)

Validation error message (null when valid).

***

### expressionAst?

> `optional` **expressionAst?**: `unknown`

Defined in: [packages/visual-editor/src/types.ts:224](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L224)

Raw AST expression object — enables direct tree conversion without reparsing text.

***

### onBlur

> **onBlur**: () => `void`

Defined in: [packages/visual-editor/src/types.ts:218](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L218)

Called when the editor loses focus — triggers validation & commit.

#### Returns

`void`

***

### onChange

> **onChange**: (`value`) => `void`

Defined in: [packages/visual-editor/src/types.ts:216](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L216)

Called on every keystroke / change.

#### Parameters

##### value

`string`

#### Returns

`void`

***

### placeholder?

> `optional` **placeholder?**: `string`

Defined in: [packages/visual-editor/src/types.ts:222](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L222)

Placeholder text shown when the editor is empty.

***

### value

> **value**: `string`

Defined in: [packages/visual-editor/src/types.ts:214](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L214)

Current expression text.
