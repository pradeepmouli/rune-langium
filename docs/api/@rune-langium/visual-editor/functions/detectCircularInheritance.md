[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / detectCircularInheritance

# Function: detectCircularInheritance()

> **detectCircularInheritance**(`childId`, `parentId`, `edges`): `boolean`

Defined in: [packages/visual-editor/src/validation/edit-validator.ts:31](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/validation/edit-validator.ts#L31)

Detect whether setting `childId extends parentId` would create a cycle.

Walks the inheritance chain from parentId upward; if it reaches childId,
a cycle exists.

## Parameters

### childId

`string`

### parentId

`string`

### edges

[`TypeGraphEdge`](../type-aliases/TypeGraphEdge.md)[]

## Returns

`boolean`
