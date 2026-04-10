[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / GraphMetadata

# Interface: GraphMetadata

Defined in: [packages/visual-editor/src/types.ts:116](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/types.ts#L116)

## Indexable

> \[`key`: `string`\]: `unknown`

Required for ReactFlow compatibility: Node<T> requires T extends Record<string, unknown>

## Properties

### comments?

> `optional` **comments?**: `string`

Defined in: [packages/visual-editor/src/types.ts:123](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/types.ts#L123)

UI-only annotation (not from AST).

***

### errors

> **errors**: [`ValidationError`](ValidationError.md)[]

Defined in: [packages/visual-editor/src/types.ts:119](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/types.ts#L119)

***

### hasExternalRefs

> **hasExternalRefs**: `boolean`

Defined in: [packages/visual-editor/src/types.ts:121](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/types.ts#L121)

***

### isReadOnly?

> `optional` **isReadOnly?**: `boolean`

Defined in: [packages/visual-editor/src/types.ts:120](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/types.ts#L120)

***

### namespace

> **namespace**: `string`

Defined in: [packages/visual-editor/src/types.ts:117](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/types.ts#L117)

***

### position

> **position**: `object`

Defined in: [packages/visual-editor/src/types.ts:118](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/types.ts#L118)

#### x

> **x**: `number`

#### y

> **y**: `number`
