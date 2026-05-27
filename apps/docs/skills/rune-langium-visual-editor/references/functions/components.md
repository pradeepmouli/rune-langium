# Functions

## components

### `StructureView`
StructureView component.

Shows the expanded structure graph for the focused type, with optional
editable cell components injected via `cellComponents`.  When
`focusedTypeId` or `adapterDoc` is missing an empty-state placeholder is
rendered instead.

Stale-selection state is shown when `focusedTypeId` no longer resolves to
any node in `adapterDoc` (e.g. the type was renamed or deleted). Phase 14e/A
extends root rendering to Data, Choice, and Enum — only an unknown id falls
through to the unsupported-root branch.
```ts
StructureView(__namedParameters: StructureViewProps): ReactElement
```
**Parameters:**
- `__namedParameters: StructureViewProps`
**Returns:** `ReactElement`
