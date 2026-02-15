# Data Model: Editor Forms

**Feature**: 004-editor-forms | **Date**: 2026-02-14

## Entity Relationship Overview

```
EditorFormPanel (dispatch)
  │
  ├── DataTypeForm ───┐
  ├── EnumForm ───────┤
  ├── ChoiceForm ─────┤── MetadataSection
  └── FunctionForm ───┘       │
        │                     ├── description (text)
        │                     ├── synonyms[] (string)
        │                     └── comments (text)
        │
        ├── TypeSelector (searchable dropdown)
        ├── AttributeRow / EnumValueRow / ChoiceOptionRow
        └── CardinalityPicker (preset + custom)
```

## Extended Types (modifications to existing types)

### TypeNodeData (extended)

File: `packages/visual-editor/src/types.ts`

```ts
export interface TypeNodeData<K extends TypeKind = TypeKind> {
  // --- Existing fields (unchanged) ---
  kind: K;
  name: string;
  namespace: string;
  definition?: string;
  members: Array<MemberDisplay<AstMemberKindMap[K]>>;
  parentName?: string;
  hasExternalRefs: boolean;
  errors: ValidationError[];
  source?: AstNodeKindMap[K];
  [key: string]: unknown;

  // --- NEW fields ---
  /** Editable synonym values for this element. */
  synonyms?: string[];
  /** Whether this element is read-only (from external/locked source). */
  isReadOnly?: boolean;
}
```

**Validation rules**:
- `name`: required, non-empty, unique within namespace (S-01)
- `parentName`: if set, must reference an existing type of the same kind; must not create circular inheritance (S-02)
- `synonyms`: each entry is a non-empty string; duplicates allowed (Rune DSL permits duplicate synonyms)

### MemberDisplay (extended)

File: `packages/visual-editor/src/types.ts`

```ts
export interface MemberDisplay<M = AstMemberType> {
  // --- Existing fields (unchanged) ---
  name: string;
  typeName?: string;
  cardinality?: string;
  isOverride: boolean;
  source?: M;

  // --- NEW fields ---
  /** Display name for enum values. Separate from typeName to avoid false edge references. */
  displayName?: string;
}
```

**Entity: MemberDisplay in context of each kind**:

| Kind | `name` | `typeName` | `cardinality` | `displayName` | `isOverride` |
|------|--------|-----------|--------------|---------------|-------------|
| Data (Attribute) | attribute name | type reference | e.g., `(0..*)` | — | extends override |
| Enum (EnumValue) | enum value name | — | — | display string | — |
| Choice (ChoiceOption) | same as typeName | type reference | — | — | — |

### TypeKind (unchanged, but documented for completeness)

```ts
export type TypeKind = 'data' | 'choice' | 'enum' | 'func';
```

Note: `'func'` is added in Phase 2 (US4). The `EditorFormPanel` dispatches to `FunctionForm` using the same `kind`-based pattern as other forms.

## New Types

### EditorFormPanelProps

File: `packages/visual-editor/src/components/editors/EditorFormPanel.tsx`

```ts
export interface EditorFormPanelProps {
  /** Currently selected node data, or null if nothing selected. */
  nodeData: TypeNodeData | null;
  /** Node ID of the selected node. */
  nodeId: string | null;
  /** Whether the form should be read-only. */
  readOnly?: boolean;
  /** All type nodes in the graph (for type selectors). */
  availableTypes: TypeOption[];
  /** Callback to dispatch store actions. */
  actions: EditorFormActions;
}
```

### TypeOption (for TypeSelector)

```ts
export interface TypeOption {
  /** Node ID, or special ID for built-in types. */
  value: string;
  /** Display label (type name). */
  label: string;
  /** Type kind for badge coloring. */
  kind: TypeKind | 'builtin';
  /** Namespace for grouping in the dropdown. */
  namespace?: string;
}
```

### EditorFormActions (callback interface)

```ts
export interface EditorFormActions {
  // --- Type operations (all kinds) ---
  renameType(nodeId: string, newName: string): void;
  deleteType(nodeId: string): void;
  updateDefinition(nodeId: string, definition: string): void;
  updateComments(nodeId: string, comments: string): void;
  addSynonym(nodeId: string, synonym: string): void;
  removeSynonym(nodeId: string, index: number): void;

  // --- Data type operations ---
  addAttribute(nodeId: string, attrName: string, typeName: string, cardinality: string): void;
  removeAttribute(nodeId: string, attrName: string): void;
  updateAttribute(nodeId: string, oldName: string, newName: string, typeName: string, cardinality: string): void;
  reorderAttribute(nodeId: string, fromIndex: number, toIndex: number): void;
  setInheritance(childId: string, parentId: string | null): void;

  // --- Enum operations ---
  addEnumValue(nodeId: string, valueName: string, displayName?: string): void;
  removeEnumValue(nodeId: string, valueName: string): void;
  updateEnumValue(nodeId: string, oldName: string, newName: string, displayName?: string): void;
  reorderEnumValue(nodeId: string, fromIndex: number, toIndex: number): void;
  setEnumParent(nodeId: string, parentId: string | null): void;

  // --- Choice operations ---
  addChoiceOption(nodeId: string, typeName: string): void;
  removeChoiceOption(nodeId: string, typeName: string): void;

  // --- Function operations (Phase 2) ---
  addInputParam(nodeId: string, paramName: string, typeName: string): void;
  removeInputParam(nodeId: string, paramName: string): void;
  updateOutputType(nodeId: string, typeName: string): void;
  updateExpression(nodeId: string, expressionText: string): void;

  // --- Validation ---
  validate(): ValidationError[];
}
```

### DataTypeFormProps

```ts
export interface DataTypeFormProps {
  nodeId: string;
  nodeData: TypeNodeData<'data'>;
  readOnly?: boolean;
  availableTypes: TypeOption[];
  actions: EditorFormActions;
}
```

**State transitions for Data type editing**:
```
Idle → User edits name → Local state updates → 500ms idle → renameType(nodeId, newName) → Graph updates
Idle → User selects parent → setInheritance(childId, parentId) → Graph updates (immediate, no debounce)
Idle → User clicks "Add Attribute" → Empty AttributeRow appears → User fills fields → 500ms idle → addAttribute(...) → Graph updates
Idle → User changes cardinality preset → updateAttribute(...) → Graph updates (immediate)
Idle → User removes attribute → removeAttribute(nodeId, attrName) → Graph updates (immediate)
Idle → User drags attribute to new position → reorderAttribute(nodeId, fromIndex, toIndex) → Graph updates (immediate)
```

### EnumFormProps

```ts
export interface EnumFormProps {
  nodeId: string;
  nodeData: TypeNodeData<'enum'>;
  readOnly?: boolean;
  availableEnums: TypeOption[];  // Only enum types for parent selection
  actions: EditorFormActions;
}
```

### ChoiceFormProps

```ts
export interface ChoiceFormProps {
  nodeId: string;
  nodeData: TypeNodeData<'choice'>;
  readOnly?: boolean;
  availableTypes: TypeOption[];  // All types for option selection
  actions: EditorFormActions;
}
```

### FunctionFormProps (Phase 2)

```ts
export interface FunctionFormProps {
  nodeId: string;
  nodeData: TypeNodeData;  // Function data extracted from source AST
  readOnly?: boolean;
  availableTypes: TypeOption[];
  actions: EditorFormActions;
}
```

### MetadataSectionProps

```ts
export interface MetadataSectionProps {
  /** Current definition/description text. */
  definition?: string;
  /** Current synonyms list. */
  synonyms?: string[];
  /** Current comments/annotations text. */
  comments?: string;
  /** Whether the metadata section is read-only. */
  readOnly?: boolean;
  /** Called when definition changes (debounced commit). */
  onDefinitionChange: (definition: string) => void;
  /** Called when a synonym is added. */
  onAddSynonym: (synonym: string) => void;
  /** Called when a synonym is removed by index. */
  onRemoveSynonym: (index: number) => void;
  /** Called when comments change (debounced commit). */
  onCommentsChange: (comments: string) => void;
}
```

### TypeSelectorProps

```ts
export interface TypeSelectorProps {
  /** Currently selected type value (node ID or built-in type name). */
  value: string | null;
  /** Available types to choose from. */
  options: TypeOption[];
  /** Placeholder text. */
  placeholder?: string;
  /** Called when a type is selected. */
  onSelect: (value: string | null) => void;
  /** Whether the selector is disabled. */
  disabled?: boolean;
  /** Whether to include a "None" / clear option. */
  allowClear?: boolean;
}
```

### AttributeRowProps

```ts
export interface AttributeRowProps {
  /** Attribute member data. */
  member: MemberDisplay;
  /** Index of this row in the attribute list (for reorder). */
  index: number;
  /** Available types for the type selector dropdown. */
  availableTypes: TypeOption[];
  /** Whether the row is read-only. */
  readOnly?: boolean;
  /** Called when any attribute field changes. */
  onChange: (oldName: string, newName: string, typeName: string, cardinality: string) => void;
  /** Called when the attribute is removed. */
  onRemove: (name: string) => void;
  /** Called when the attribute is dragged to a new position. */
  onReorder: (fromIndex: number, toIndex: number) => void;
}
```

### EnumValueRowProps

```ts
export interface EnumValueRowProps {
  /** Enum value member data. */
  member: MemberDisplay;
  /** Index of this row in the enum value list (for reorder). */
  index: number;
  /** Whether the row is read-only. */
  readOnly?: boolean;
  /** Called when the value name or display name changes. */
  onChange: (oldName: string, newName: string, displayName?: string) => void;
  /** Called when the value is removed. */
  onRemove: (name: string) => void;
  /** Called when the value is dragged to a new position. */
  onReorder: (fromIndex: number, toIndex: number) => void;
}
```

### ChoiceOptionRowProps

```ts
export interface ChoiceOptionRowProps {
  /** Choice option member data. */
  member: MemberDisplay;
  /** Whether the row is read-only. */
  readOnly?: boolean;
  /** Called when the option is removed. */
  onRemove: (typeName: string) => void;
}
```

### CardinalityPickerProps

```ts
export interface CardinalityPickerProps {
  /** Current cardinality value (e.g., "0..*"). */
  value: string;
  /** Called when cardinality changes. */
  onChange: (cardinality: string) => void;
  /** Whether the picker is disabled. */
  disabled?: boolean;
}

/** Preset cardinality values. */
export const CARDINALITY_PRESETS = [
  { label: '1..1', value: '1..1', description: 'Required, single' },
  { label: '0..1', value: '0..1', description: 'Optional, single' },
  { label: '0..*', value: '0..*', description: 'Optional, many' },
  { label: '1..*', value: '1..*', description: 'Required, many' }
] as const;
```

## Store Actions Extension

### New EditorActions (added to EditorStore)

```ts
export interface EditorActions {
  // --- Existing actions (unchanged) ---
  // loadModels, selectNode, setSearchQuery, setFilters, toggleDetailPanel,
  // relayout, getNodes, getEdges, createType, deleteType, renameType,
  // addAttribute, removeAttribute, updateCardinality, setInheritance, validate,
  // namespace visibility actions...

  // --- NEW: Extended rename with cascade ---
  renameType(nodeId: string, newName: string): void;  // UPDATED: now cascades

  // --- NEW: Attribute update (name + type + cardinality in one action) ---
  updateAttribute(nodeId: string, oldName: string, newName: string, typeName: string, cardinality: string): void;
  reorderAttribute(nodeId: string, fromIndex: number, toIndex: number): void;

  // --- NEW: Enum operations ---
  addEnumValue(nodeId: string, valueName: string, displayName?: string): void;
  removeEnumValue(nodeId: string, valueName: string): void;
  updateEnumValue(nodeId: string, oldName: string, newName: string, displayName?: string): void;
  reorderEnumValue(nodeId: string, fromIndex: number, toIndex: number): void;
  setEnumParent(nodeId: string, parentId: string | null): void;

  // --- NEW: Choice operations ---
  addChoiceOption(nodeId: string, typeName: string): void;
  removeChoiceOption(nodeId: string, typeName: string): void;

  // --- NEW: Metadata operations ---
  updateDefinition(nodeId: string, definition: string): void;
  updateComments(nodeId: string, comments: string): void;
  addSynonym(nodeId: string, synonym: string): void;
  removeSynonym(nodeId: string, index: number): void;

  // --- NEW: Function operations (Phase 2) ---
  addInputParam(nodeId: string, paramName: string, typeName: string): void;
  removeInputParam(nodeId: string, paramName: string): void;
  updateOutputType(nodeId: string, typeName: string): void;
  updateExpression(nodeId: string, expressionText: string): void;
}
```

## Validation Rules Extension

### New validation rules (added to edit-validator.ts)

```ts
// S-05: Duplicate enum value names within an enum
function detectDuplicateEnumValue(nodeId: string, valueName: string, nodes: TypeGraphNode[]): boolean;

// S-06: Empty type/enum/choice name
function detectEmptyName(name: string): boolean;

// S-07: Invalid characters in names (Rune DSL name rules)
function detectInvalidName(name: string): string | null;

// S-08: Circular enum inheritance
// (reuses detectCircularInheritance with 'enum-extends' edge kind — already supported)
```

## AST Adapter Extensions

### ast-to-graph.ts changes

The `astToGraph` function must be updated to populate new fields:
- `TypeNodeData.synonyms` — extracted from `source.synonyms` array
- `TypeNodeData.isReadOnly` — set based on source origin (external vs local)
- `MemberDisplay.displayName` — extracted from `RosettaEnumValue.display`

### graph-to-ast.ts changes

The `graphToModels` function and serializer must be updated to:
- Read `TypeNodeData.synonyms` and produce `synonym` annotations in `.rosetta` output
- Read `MemberDisplay.displayName` and produce `displayName "..."` syntax for enum values
- Handle the rename cascade (node ID changes) when building synthetic models

## Built-in Types Constant

```ts
export const BUILTIN_TYPES: TypeOption[] = [
  { value: 'string', label: 'string', kind: 'builtin' },
  { value: 'int', label: 'int', kind: 'builtin' },
  { value: 'number', label: 'number', kind: 'builtin' },
  { value: 'boolean', label: 'boolean', kind: 'builtin' },
  { value: 'date', label: 'date', kind: 'builtin' },
  { value: 'time', label: 'time', kind: 'builtin' },
  { value: 'dateTime', label: 'dateTime', kind: 'builtin' },
  { value: 'zonedDateTime', label: 'zonedDateTime', kind: 'builtin' }
];
```
