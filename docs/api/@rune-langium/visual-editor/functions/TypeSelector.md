[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / TypeSelector

# Function: TypeSelector()

> **TypeSelector**(`__namedParameters`): `ReactNode`

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:148](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/visual-editor/src/components/editors/TypeSelector.tsx#L148)

Searchable type selector with kind-colored badges.

When `renderTrigger` and `renderPopover` are provided, uses composition
to inject host app UI primitives (e.g., shadcn Popover + Command).
Otherwise falls back to a shadcn Select.

## Parameters

### \_\_namedParameters

[`TypeSelectorProps`](../interfaces/TypeSelectorProps.md)

## Returns

`ReactNode`
