[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / AttributeEditorProps

# Interface: AttributeEditorProps

Defined in: [packages/visual-editor/src/components/editors/AttributeEditor.tsx:7](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/AttributeEditor.tsx#L7)

## Properties

### nodeId

> **nodeId**: `string`

Defined in: [packages/visual-editor/src/components/editors/AttributeEditor.tsx:8](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/AttributeEditor.tsx#L8)

***

### onAddAttribute

> **onAddAttribute**: (`nodeId`, `name`, `typeName`, `cardinality`) => `void`

Defined in: [packages/visual-editor/src/components/editors/AttributeEditor.tsx:9](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/AttributeEditor.tsx#L9)

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

Defined in: [packages/visual-editor/src/components/editors/AttributeEditor.tsx:11](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/AttributeEditor.tsx#L11)

#### Returns

`void`

***

### onRemoveAttribute

> **onRemoveAttribute**: (`nodeId`, `name`) => `void`

Defined in: [packages/visual-editor/src/components/editors/AttributeEditor.tsx:10](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/components/editors/AttributeEditor.tsx#L10)

#### Parameters

##### nodeId

`string`

##### name

`string`

#### Returns

`void`
