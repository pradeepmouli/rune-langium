[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / VisibilityState

# Interface: VisibilityState

Defined in: [packages/visual-editor/src/types.ts:484](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L484)

## Properties

### expandedNamespaces

> **expandedNamespaces**: `Set`\<`string`\>

Defined in: [packages/visual-editor/src/types.ts:486](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L486)

Namespaces whose types are currently visible on the graph.

***

### explorerOpen

> **explorerOpen**: `boolean`

Defined in: [packages/visual-editor/src/types.ts:490](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L490)

Whether the explorer panel is open.

***

### hiddenNodeIds

> **hiddenNodeIds**: `Set`\<`string`\>

Defined in: [packages/visual-editor/src/types.ts:488](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L488)

Individual nodes hidden within expanded namespaces.

***

### visibleEdgeKinds

> **visibleEdgeKinds**: `Set`\<[`EdgeKind`](../type-aliases/EdgeKind.md)\>

Defined in: [packages/visual-editor/src/types.ts:494](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L494)

Which edge kinds are visible (all visible by default).

***

### visibleNodeKinds

> **visibleNodeKinds**: `Set`\<[`TypeKind`](../type-aliases/TypeKind.md)\>

Defined in: [packages/visual-editor/src/types.ts:492](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L492)

Which node kinds are visible (all visible by default).
