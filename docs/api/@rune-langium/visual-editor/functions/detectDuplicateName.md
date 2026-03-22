[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / detectDuplicateName

# Function: detectDuplicateName()

> **detectDuplicateName**(`name`, `namespace`, `nodes`, `nodeId?`): `boolean`

Defined in: [packages/visual-editor/src/validation/edit-validator.ts:66](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/validation/edit-validator.ts#L66)

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
