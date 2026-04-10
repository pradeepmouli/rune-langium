[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / TypeSelectorPopoverProps

# Interface: TypeSelectorPopoverProps

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:63](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/TypeSelector.tsx#L63)

## Properties

### allowClear

> **allowClear**: `boolean`

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:73](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/TypeSelector.tsx#L73)

Whether to show a "None" clear option.

***

### groups

> **groups**: [`TypeSelectorGroup`](TypeSelectorGroup.md)[]

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:65](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/TypeSelector.tsx#L65)

Grouped and filtered options ready for rendering.

***

### onSearchChange

> **onSearchChange**: (`query`) => `void`

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:69](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/TypeSelector.tsx#L69)

Update the search query.

#### Parameters

##### query

`string`

#### Returns

`void`

***

### onSelect

> **onSelect**: (`value`) => `void`

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:71](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/TypeSelector.tsx#L71)

Handle option selection.

#### Parameters

##### value

`string` \| `null`

#### Returns

`void`

***

### searchQuery

> **searchQuery**: `string`

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:67](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/TypeSelector.tsx#L67)

Current search query.

***

### selectedValue

> **selectedValue**: `string` \| `null`

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:75](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/components/editors/TypeSelector.tsx#L75)

The currently selected value.
