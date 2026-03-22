[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / TypeSelector

# Function: TypeSelector()

> **TypeSelector**(`__namedParameters`): `ReactNode`

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:145](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/TypeSelector.tsx#L145)

Searchable type selector with kind-colored badges.

When `renderTrigger` and `renderPopover` are provided, uses composition
to inject host app UI primitives (e.g., shadcn Popover + Command).
Otherwise falls back to a shadcn Select.

## Parameters

### \_\_namedParameters

[`TypeSelectorProps`](../interfaces/TypeSelectorProps.md)

## Returns

`ReactNode`
