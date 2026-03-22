[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / EditorFormActions

# Type Alias: EditorFormActions\<K\>

> **EditorFormActions**\<`K`\> = \[[`TypeKind`](TypeKind.md)\] *extends* \[`K`\] ? [`AllEditorFormActions`](AllEditorFormActions.md) : [`FormActionsKindMap`](../interfaces/FormActionsKindMap.md)\[`K`\]

Defined in: [packages/visual-editor/src/types.ts:367](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/types.ts#L367)

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
