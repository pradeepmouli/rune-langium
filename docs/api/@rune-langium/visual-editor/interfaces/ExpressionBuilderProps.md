[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / ExpressionBuilderProps

# Interface: ExpressionBuilderProps

Defined in: [packages/visual-editor/src/components/editors/expression-builder/ExpressionBuilder.tsx:31](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/expression-builder/ExpressionBuilder.tsx#L31)

Props provided to the expression editor render-prop slot.

`packages/visual-editor` is editor-agnostic — the host app provides
the actual editor implementation (e.g. CodeMirror, Monaco) via a
`renderExpressionEditor` prop on `FunctionForm`.

## Extends

- [`ExpressionEditorSlotProps`](ExpressionEditorSlotProps.md)

## Properties

### defaultMode?

> `optional` **defaultMode?**: `"text"` \| `"builder"`

Defined in: [packages/visual-editor/src/components/editors/expression-builder/ExpressionBuilder.tsx:33](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/expression-builder/ExpressionBuilder.tsx#L33)

***

### error?

> `optional` **error?**: `string` \| `null`

Defined in: [packages/visual-editor/src/types.ts:220](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L220)

Validation error message (null when valid).

#### Inherited from

[`ExpressionEditorSlotProps`](ExpressionEditorSlotProps.md).[`error`](ExpressionEditorSlotProps.md#error)

***

### expressionAst?

> `optional` **expressionAst?**: `unknown`

Defined in: [packages/visual-editor/src/components/editors/expression-builder/ExpressionBuilder.tsx:37](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/expression-builder/ExpressionBuilder.tsx#L37)

Optional raw AST expression object — when provided, used directly instead of parsing value text.

#### Overrides

[`ExpressionEditorSlotProps`](ExpressionEditorSlotProps.md).[`expressionAst`](ExpressionEditorSlotProps.md#expressionast)

***

### onBlur

> **onBlur**: () => `void`

Defined in: [packages/visual-editor/src/types.ts:218](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L218)

Called when the editor loses focus — triggers validation & commit.

#### Returns

`void`

#### Inherited from

[`ExpressionEditorSlotProps`](ExpressionEditorSlotProps.md).[`onBlur`](ExpressionEditorSlotProps.md#onblur)

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

#### Inherited from

[`ExpressionEditorSlotProps`](ExpressionEditorSlotProps.md).[`onChange`](ExpressionEditorSlotProps.md#onchange)

***

### onDragNode?

> `optional` **onDragNode?**: (`draggedNodeId`, `targetNodeId`) => `void`

Defined in: [packages/visual-editor/src/components/editors/expression-builder/ExpressionBuilder.tsx:35](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/expression-builder/ExpressionBuilder.tsx#L35)

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

Defined in: [packages/visual-editor/src/types.ts:222](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L222)

Placeholder text shown when the editor is empty.

#### Inherited from

[`ExpressionEditorSlotProps`](ExpressionEditorSlotProps.md).[`placeholder`](ExpressionEditorSlotProps.md#placeholder)

***

### scope

> **scope**: [`FunctionScope`](FunctionScope.md)

Defined in: [packages/visual-editor/src/components/editors/expression-builder/ExpressionBuilder.tsx:32](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/expression-builder/ExpressionBuilder.tsx#L32)

***

### value

> **value**: `string`

Defined in: [packages/visual-editor/src/types.ts:214](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/types.ts#L214)

Current expression text.

#### Inherited from

[`ExpressionEditorSlotProps`](ExpressionEditorSlotProps.md).[`value`](ExpressionEditorSlotProps.md#value)
