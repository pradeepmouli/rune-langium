[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / TypeSelectorPopoverProps

# Interface: TypeSelectorPopoverProps

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:60](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/TypeSelector.tsx#L60)

## Properties

### allowClear

> **allowClear**: `boolean`

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:70](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/TypeSelector.tsx#L70)

Whether to show a "None" clear option.

***

### groups

> **groups**: [`TypeSelectorGroup`](TypeSelectorGroup.md)[]

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:62](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/TypeSelector.tsx#L62)

Grouped and filtered options ready for rendering.

***

### onSearchChange

> **onSearchChange**: (`query`) => `void`

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:66](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/TypeSelector.tsx#L66)

Update the search query.

#### Parameters

##### query

`string`

#### Returns

`void`

***

### onSelect

> **onSelect**: (`value`) => `void`

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:68](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/TypeSelector.tsx#L68)

Handle option selection.

#### Parameters

##### value

`string` \| `null`

#### Returns

`void`

***

### searchQuery

> **searchQuery**: `string`

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:64](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/TypeSelector.tsx#L64)

Current search query.

***

### selectedValue

> **selectedValue**: `string` \| `null`

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:72](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/TypeSelector.tsx#L72)

The currently selected value.
