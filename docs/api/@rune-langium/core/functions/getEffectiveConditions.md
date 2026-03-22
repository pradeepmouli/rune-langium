[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/core](../README.md) / [](../README.md) / getEffectiveConditions

# Function: getEffectiveConditions()

> **getEffectiveConditions**(`choice`): [`Condition`](../interfaces/Condition.md)[]

Defined in: [packages/core/src/utils/choice-utils.ts:15](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/utils/choice-utils.ts#L15)

Get conditions that are defined on the Data types within a Choice's options.
Since Choice options reference type calls, we return the conditions
from the parent Choice's enclosing Data types (if any).

## Parameters

### choice

[`Choice`](../interfaces/Choice.md)

## Returns

[`Condition`](../interfaces/Condition.md)[]
