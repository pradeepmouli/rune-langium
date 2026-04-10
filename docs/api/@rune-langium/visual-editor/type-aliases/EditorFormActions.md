[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / EditorFormActions

# Type Alias: EditorFormActions\<K\>

> **EditorFormActions**\<`K`\> = \[[`TypeKind`](TypeKind.md)\] *extends* \[`K`\] ? [`AllEditorFormActions`](AllEditorFormActions.md) : [`FormActionsKindMap`](../interfaces/FormActionsKindMap.md)\[`K`\]

Defined in: [packages/visual-editor/src/types.ts:370](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/visual-editor/src/types.ts#L370)

Kind-aware editor form actions.

When parameterized with a specific kind (e.g. `EditorFormActions<'data'>`),
only that kind's actions + common actions are available.

When unparameterized (`EditorFormActions`), resolves to the full intersection
of all kind-specific actions for backward compatibility.

## Type Parameters

### K

`K` *extends* [`TypeKind`](TypeKind.md) = [`TypeKind`](TypeKind.md)

## Example

```ts
// Narrow — DataTypeForm only sees data + common actions
const dataActions: EditorFormActions<'data'>;
dataActions.addAttribute(...); // ✅
dataActions.addEnumValue(...); // ❌ compile error

// Full — EditorFormPanel passes the complete set
const allActions: EditorFormActions;
allActions.addAttribute(...); // ✅
allActions.addEnumValue(...); // ✅
```
