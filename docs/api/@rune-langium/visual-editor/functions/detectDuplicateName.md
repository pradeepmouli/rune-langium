[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / detectDuplicateName

# Function: detectDuplicateName()

> **detectDuplicateName**(`name`, `namespace`, `nodes`, `nodeId?`): `boolean`

Defined in: [packages/visual-editor/src/validation/edit-validator.ts:69](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/visual-editor/src/validation/edit-validator.ts#L69)

Check if a name already exists in the given namespace.

When `nodeId` is provided, checks for duplicate attribute names within
that node instead of type names.

## Parameters

### name

`string`

### namespace

`string`

### nodes

[`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

### nodeId?

`string`

## Returns

`boolean`
