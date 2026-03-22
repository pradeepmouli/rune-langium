[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / ExpressionBuilderProps

# Interface: ExpressionBuilderProps

Defined in: [packages/visual-editor/src/components/editors/expression-builder/ExpressionBuilder.tsx:28](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/expression-builder/ExpressionBuilder.tsx#L28)

Props provided to the expression editor render-prop slot.

`packages/visual-editor` is editor-agnostic — the host app provides
the actual editor implementation (e.g. CodeMirror, Monaco) via a
`renderExpressionEditor` prop on `FunctionForm`.

## Extends

- [`ExpressionEditorSlotProps`](ExpressionEditorSlotProps.md)

## Properties

### defaultMode?

> `optional` **defaultMode?**: `"text"` \| `"builder"`

Defined in: [packages/visual-editor/src/components/editors/expression-builder/ExpressionBuilder.tsx:30](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/expression-builder/ExpressionBuilder.tsx#L30)

***

### error?

> `optional` **error?**: `string` \| `null`

Defined in: [packages/visual-editor/src/types.ts:217](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L217)

Validation error message (null when valid).

#### Inherited from

[`ExpressionEditorSlotProps`](ExpressionEditorSlotProps.md).[`error`](ExpressionEditorSlotProps.md#error)

***

### expressionAst?

> `optional` **expressionAst?**: `unknown`

Defined in: [packages/visual-editor/src/components/editors/expression-builder/ExpressionBuilder.tsx:34](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/expression-builder/ExpressionBuilder.tsx#L34)

Optional raw AST expression object — when provided, used directly instead of parsing value text.

#### Overrides

[`ExpressionEditorSlotProps`](ExpressionEditorSlotProps.md).[`expressionAst`](ExpressionEditorSlotProps.md#expressionast)

***

### onBlur

> **onBlur**: () => `void`

Defined in: [packages/visual-editor/src/types.ts:215](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L215)

Called when the editor loses focus — triggers validation & commit.

#### Returns

`void`

#### Inherited from

[`ExpressionEditorSlotProps`](ExpressionEditorSlotProps.md).[`onBlur`](ExpressionEditorSlotProps.md#onblur)

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

#### Inherited from

[`ExpressionEditorSlotProps`](ExpressionEditorSlotProps.md).[`onChange`](ExpressionEditorSlotProps.md#onchange)

***

### onDragNode?

> `optional` **onDragNode?**: (`draggedNodeId`, `targetNodeId`) => `void`

Defined in: [packages/visual-editor/src/components/editors/expression-builder/ExpressionBuilder.tsx:32](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/expression-builder/ExpressionBuilder.tsx#L32)

Callback when a node is dragged to a placeholder target.

#### Parameters

##### draggedNodeId

`string`

##### targetNodeId

`string`

#### Returns

`void`

***

### placeholder?

> `optional` **placeholder?**: `string`

Defined in: [packages/visual-editor/src/types.ts:219](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L219)

Placeholder text shown when the editor is empty.

#### Inherited from

[`ExpressionEditorSlotProps`](ExpressionEditorSlotProps.md).[`placeholder`](ExpressionEditorSlotProps.md#placeholder)

***

### scope

> **scope**: [`FunctionScope`](FunctionScope.md)

Defined in: [packages/visual-editor/src/components/editors/expression-builder/ExpressionBuilder.tsx:29](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/expression-builder/ExpressionBuilder.tsx#L29)

***

### value

> **value**: `string`

Defined in: [packages/visual-editor/src/types.ts:211](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L211)

Current expression text.

#### Inherited from

[`ExpressionEditorSlotProps`](ExpressionEditorSlotProps.md).[`value`](ExpressionEditorSlotProps.md#value)
