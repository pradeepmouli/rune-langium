[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / MetadataSectionProps

# Interface: MetadataSectionProps

Defined in: [packages/visual-editor/src/components/editors/MetadataSection.tsx:25](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/MetadataSection.tsx#L25)

## Properties

### onCommentsCommit

> **onCommentsCommit**: (`comments`) => `void`

Defined in: [packages/visual-editor/src/components/editors/MetadataSection.tsx:31](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/MetadataSection.tsx#L31)

Called when comments change (debounced commit to graph).

#### Parameters

##### comments

`string`

#### Returns

`void`

***

### onDefinitionCommit

> **onDefinitionCommit**: (`definition`) => `void`

Defined in: [packages/visual-editor/src/components/editors/MetadataSection.tsx:29](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/MetadataSection.tsx#L29)

Called when definition changes (debounced commit to graph).

#### Parameters

##### definition

`string`

#### Returns

`void`

***

### onSynonymAdd

> **onSynonymAdd**: (`synonym`) => `void`

Defined in: [packages/visual-editor/src/components/editors/MetadataSection.tsx:33](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/MetadataSection.tsx#L33)

Called when a synonym is added (immediate commit to graph).

#### Parameters

##### synonym

`string`

#### Returns

`void`

***

### onSynonymRemove

> **onSynonymRemove**: (`index`) => `void`

Defined in: [packages/visual-editor/src/components/editors/MetadataSection.tsx:35](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/MetadataSection.tsx#L35)

Called when a synonym is removed by index (immediate commit to graph).

#### Parameters

##### index

`number`

#### Returns

`void`

***

### readOnly?

> `optional` **readOnly?**: `boolean`

Defined in: [packages/visual-editor/src/components/editors/MetadataSection.tsx:27](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/MetadataSection.tsx#L27)

Whether the metadata section is read-only.
