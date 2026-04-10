[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / AttributeEditorProps

# Interface: AttributeEditorProps

Defined in: [packages/visual-editor/src/components/editors/AttributeEditor.tsx:10](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/AttributeEditor.tsx#L10)

## Properties

### nodeId

> **nodeId**: `string`

Defined in: [packages/visual-editor/src/components/editors/AttributeEditor.tsx:11](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/AttributeEditor.tsx#L11)

***

### onAddAttribute

> **onAddAttribute**: (`nodeId`, `name`, `typeName`, `cardinality`) => `void`

Defined in: [packages/visual-editor/src/components/editors/AttributeEditor.tsx:12](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/AttributeEditor.tsx#L12)

#### Parameters

##### nodeId

`string`

##### name

`string`

##### typeName

`string`

##### cardinality

`string`

#### Returns

`void`

***

### onCancel?

> `optional` **onCancel?**: () => `void`

Defined in: [packages/visual-editor/src/components/editors/AttributeEditor.tsx:14](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/AttributeEditor.tsx#L14)

#### Returns

`void`

***

### onRemoveAttribute

> **onRemoveAttribute**: (`nodeId`, `name`) => `void`

Defined in: [packages/visual-editor/src/components/editors/AttributeEditor.tsx:13](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/components/editors/AttributeEditor.tsx#L13)

#### Parameters

##### nodeId

`string`

##### name

`string`

#### Returns

`void`
