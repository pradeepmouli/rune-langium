[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / validateExpression

# Function: validateExpression()

> **validateExpression**(`expression`): [`ExpressionValidationResult`](../interfaces/ExpressionValidationResult.md)

Defined in: [packages/visual-editor/src/validation/edit-validator.ts:217](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/validation/edit-validator.ts#L217)

Validate an expression string.

This is a lightweight client-side check. Full parsing validation
runs in the web worker parse pipeline. This function performs basic
structural checks (balanced parentheses, non-empty).

## Parameters

### expression

`string`

The expression text to validate.

## Returns

[`ExpressionValidationResult`](../interfaces/ExpressionValidationResult.md)

Validation result with error message if invalid.
