[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / MetadataSectionProps

# Interface: MetadataSectionProps

Defined in: [packages/visual-editor/src/components/editors/MetadataSection.tsx:22](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/MetadataSection.tsx#L22)

## Properties

### onCommentsCommit

> **onCommentsCommit**: (`comments`) => `void`

Defined in: [packages/visual-editor/src/components/editors/MetadataSection.tsx:28](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/MetadataSection.tsx#L28)

Called when comments change (debounced commit to graph).

#### Parameters

##### comments

`string`

#### Returns

`void`

***

### onDefinitionCommit

> **onDefinitionCommit**: (`definition`) => `void`

Defined in: [packages/visual-editor/src/components/editors/MetadataSection.tsx:26](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/MetadataSection.tsx#L26)

Called when definition changes (debounced commit to graph).

#### Parameters

##### definition

`string`

#### Returns

`void`

***

### onSynonymAdd

> **onSynonymAdd**: (`synonym`) => `void`

Defined in: [packages/visual-editor/src/components/editors/MetadataSection.tsx:30](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/MetadataSection.tsx#L30)

Called when a synonym is added (immediate commit to graph).

#### Parameters

##### synonym

`string`

#### Returns

`void`

***

### onSynonymRemove

> **onSynonymRemove**: (`index`) => `void`

Defined in: [packages/visual-editor/src/components/editors/MetadataSection.tsx:32](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/MetadataSection.tsx#L32)

Called when a synonym is removed by index (immediate commit to graph).

#### Parameters

##### index

`number`

#### Returns

`void`

***

### readOnly?

> `optional` **readOnly?**: `boolean`

Defined in: [packages/visual-editor/src/components/editors/MetadataSection.tsx:24](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/MetadataSection.tsx#L24)

Whether the metadata section is read-only.
