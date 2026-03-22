[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / TypeSelectorProps

# Interface: TypeSelectorProps

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:26](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/TypeSelector.tsx#L26)

## Properties

### allowClear?

> `optional` **allowClear?**: `boolean`

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:38](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/TypeSelector.tsx#L38)

Whether to include a "None" / clear option.

***

### disabled?

> `optional` **disabled?**: `boolean`

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:36](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/TypeSelector.tsx#L36)

Whether the selector is disabled.

***

### filterKinds?

> `optional` **filterKinds?**: ([`TypeKind`](../type-aliases/TypeKind.md) \| `"builtin"`)[]

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:40](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/TypeSelector.tsx#L40)

Filter options to specific kinds.

***

### onSelect

> **onSelect**: (`value`) => `void`

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:34](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/TypeSelector.tsx#L34)

Called when a type is selected.

#### Parameters

##### value

`string` \| `null`

#### Returns

`void`

***

### options?

> `optional` **options?**: [`TypeOption`](TypeOption.md)[]

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:30](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/TypeSelector.tsx#L30)

Available types to choose from. May be undefined before types are loaded.

***

### placeholder?

> `optional` **placeholder?**: `string`

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:32](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/TypeSelector.tsx#L32)

Placeholder text.

***

### renderPopover?

> `optional` **renderPopover?**: (`props`) => `ReactNode`

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:44](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/TypeSelector.tsx#L44)

Render-prop for the popover content (search + list).

#### Parameters

##### props

[`TypeSelectorPopoverProps`](TypeSelectorPopoverProps.md)

#### Returns

`ReactNode`

***

### renderTrigger?

> `optional` **renderTrigger?**: (`props`) => `ReactNode`

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:42](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/TypeSelector.tsx#L42)

Render-prop for the trigger (button that opens the popover).

#### Parameters

##### props

[`TypeSelectorTriggerProps`](TypeSelectorTriggerProps.md)

#### Returns

`ReactNode`

***

### value

> **value**: `string` \| `null`

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:28](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/TypeSelector.tsx#L28)

Currently selected type value (node ID or built-in type name).
