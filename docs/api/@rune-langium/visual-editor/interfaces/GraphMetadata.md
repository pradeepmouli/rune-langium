[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / GraphMetadata

# Interface: GraphMetadata

Defined in: [packages/visual-editor/src/types.ts:113](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L113)

## Indexable

> \[`key`: `string`\]: `unknown`

Required for ReactFlow compatibility: Node<T> requires T extends Record<string, unknown>

## Properties

### comments?

> `optional` **comments?**: `string`

Defined in: [packages/visual-editor/src/types.ts:120](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L120)

UI-only annotation (not from AST).

***

### errors

> **errors**: [`ValidationError`](ValidationError.md)[]

Defined in: [packages/visual-editor/src/types.ts:116](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L116)

***

### hasExternalRefs

> **hasExternalRefs**: `boolean`

Defined in: [packages/visual-editor/src/types.ts:118](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L118)

***

### isReadOnly?

> `optional` **isReadOnly?**: `boolean`

Defined in: [packages/visual-editor/src/types.ts:117](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L117)

***

### namespace

> **namespace**: `string`

Defined in: [packages/visual-editor/src/types.ts:114](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L114)

***

### position

> **position**: `object`

Defined in: [packages/visual-editor/src/types.ts:115](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L115)

#### x

> **x**: `number`

#### y

> **y**: `number`
