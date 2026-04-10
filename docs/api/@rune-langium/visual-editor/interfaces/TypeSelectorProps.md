[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / TypeSelectorProps

# Interface: TypeSelectorProps

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:29](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/components/editors/TypeSelector.tsx#L29)

## Properties

### allowClear?

> `optional` **allowClear?**: `boolean`

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:41](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/components/editors/TypeSelector.tsx#L41)

Whether to include a "None" / clear option.

***

### disabled?

> `optional` **disabled?**: `boolean`

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:39](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/components/editors/TypeSelector.tsx#L39)

Whether the selector is disabled.

***

### filterKinds?

> `optional` **filterKinds?**: ([`TypeKind`](../type-aliases/TypeKind.md) \| `"builtin"`)[]

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:43](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/components/editors/TypeSelector.tsx#L43)

Filter options to specific kinds.

***

### onSelect

> **onSelect**: (`value`) => `void`

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:37](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/components/editors/TypeSelector.tsx#L37)

Called when a type is selected.

#### Parameters

##### value

`string` \| `null`

#### Returns

`void`

***

### options?

> `optional` **options?**: [`TypeOption`](TypeOption.md)[]

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:33](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/components/editors/TypeSelector.tsx#L33)

Available types to choose from. May be undefined before types are loaded.

***

### placeholder?

> `optional` **placeholder?**: `string`

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:35](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/components/editors/TypeSelector.tsx#L35)

Placeholder text.

***

### renderPopover?

> `optional` **renderPopover?**: (`props`) => `ReactNode`

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:47](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/components/editors/TypeSelector.tsx#L47)

Render-prop for the popover content (search + list).

#### Parameters

##### props

[`TypeSelectorPopoverProps`](TypeSelectorPopoverProps.md)

#### Returns

`ReactNode`

***

### renderTrigger?

> `optional` **renderTrigger?**: (`props`) => `ReactNode`

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:45](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/components/editors/TypeSelector.tsx#L45)

Render-prop for the trigger (button that opens the popover).

#### Parameters

##### props

[`TypeSelectorTriggerProps`](TypeSelectorTriggerProps.md)

#### Returns

`ReactNode`

***

### value

> **value**: `string` \| `null`

Defined in: [packages/visual-editor/src/components/editors/TypeSelector.tsx:31](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/components/editors/TypeSelector.tsx#L31)

Currently selected type value (node ID or built-in type name).
