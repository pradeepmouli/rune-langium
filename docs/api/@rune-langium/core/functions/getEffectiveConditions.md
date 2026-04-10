[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / getEffectiveConditions

# Function: getEffectiveConditions()

> **getEffectiveConditions**(`choice`): [`Condition`](../interfaces/Condition.md)[]

Defined in: [packages/core/src/utils/choice-utils.ts:18](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/core/src/utils/choice-utils.ts#L18)

Get conditions that are defined on the Data types within a Choice's options.
Since Choice options reference type calls, we return the conditions
from the parent Choice's enclosing Data types (if any).

## Parameters

### choice

[`Choice`](../interfaces/Choice.md)

## Returns

[`Condition`](../interfaces/Condition.md)[]
