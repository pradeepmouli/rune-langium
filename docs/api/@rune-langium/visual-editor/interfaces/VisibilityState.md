[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / VisibilityState

# Interface: VisibilityState

Defined in: [packages/visual-editor/src/types.ts:487](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/types.ts#L487)

## Properties

### expandedNamespaces

> **expandedNamespaces**: `Set`\<`string`\>

Defined in: [packages/visual-editor/src/types.ts:489](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/types.ts#L489)

Namespaces whose types are currently visible on the graph.

***

### explorerOpen

> **explorerOpen**: `boolean`

Defined in: [packages/visual-editor/src/types.ts:493](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/types.ts#L493)

Whether the explorer panel is open.

***

### hiddenNodeIds

> **hiddenNodeIds**: `Set`\<`string`\>

Defined in: [packages/visual-editor/src/types.ts:491](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/types.ts#L491)

Individual nodes hidden within expanded namespaces.

***

### visibleEdgeKinds

> **visibleEdgeKinds**: `Set`\<[`EdgeKind`](../type-aliases/EdgeKind.md)\>

Defined in: [packages/visual-editor/src/types.ts:497](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/types.ts#L497)

Which edge kinds are visible (all visible by default).

***

### visibleNodeKinds

> **visibleNodeKinds**: `Set`\<[`TypeKind`](../type-aliases/TypeKind.md)\>

Defined in: [packages/visual-editor/src/types.ts:495](https://github.com/pradeepmouli/rune-langium/blob/182474bef0c125b974738a6a8e3d66cca3158ee8/packages/visual-editor/src/types.ts#L495)

Which node kinds are visible (all visible by default).
