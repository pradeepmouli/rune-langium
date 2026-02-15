# Component API Contracts: Editor Forms

**Feature**: 004-editor-forms | **Date**: 2026-02-14

This document defines the TypeScript interfaces and component contracts for the editor form system. These contracts serve as the implementation specification for all new components.

## Table of Contents

1. [EditorFormPanel](#editformpanel)
2. [DataTypeForm](#datatypeform)
3. [EnumForm](#enumform)
4. [ChoiceForm](#choiceform)
5. [FunctionForm](#functionform)
6. [MetadataSection](#metadatasection)
7. [TypeSelector](#typeselector)
8. [AttributeRow](#attributerow)
9. [EnumValueRow](#enumvaluerow)
10. [ChoiceOptionRow](#choiceoptionrow)
11. [CardinalityPicker](#cardinalitypicker)
12. [useAutoSave Hook](#useautosave-hook)
13. [useTemporalStore Hook](#usetemporalstore-hook)
14. [Store Actions Extension](#store-actions-extension)

---

## EditorFormPanel

**Location**: `packages/visual-editor/src/components/panels/EditorFormPanel.tsx`
**Replaces**: `DetailPanel.tsx` (read-only mode retained)
**Export**: Named export from `@rune-langium/visual-editor`

```ts
export interface EditorFormPanelProps {
  /** Currently selected node data, or null if nothing selected. */
  nodeData: TypeNodeData | null;
  /** Node ID of the selected node. */
  nodeId: string | null;
  /** Whether the form should be read-only (falls back to DetailPanel display). */
  readOnly?: boolean;
  /** All type nodes in the graph (for type selectors). */
  availableTypes: TypeOption[];
  /** Callback interface for all editing actions. */
  actions: EditorFormActions;
  /** Optional CSS class name. */
  className?: string;
}
```

**Behavior**:
- Renders nothing when `nodeData` is `null`
- Dispatches to `DataTypeForm`, `EnumForm`, `ChoiceForm`, or `FunctionForm` based on `nodeData.kind`
- When `readOnly` is true, renders the existing `DetailPanel` component
- Scrollable content area with sticky header showing name + kind badge
- Close button dispatches `selectNode(null)` via parent callback

**Accessibility**:
- `role="complementary"` with `aria-label="Editor form for {name}"`
- Focus trapped within panel when open
- Escape key closes the panel

---

## DataTypeForm

**Location**: `packages/visual-editor/src/components/editors/DataTypeForm.tsx`

```ts
export interface DataTypeFormProps {
  nodeId: string;
  nodeData: TypeNodeData<'data'>;
  readOnly?: boolean;
  availableTypes: TypeOption[];
  actions: EditorFormActions;
}
```

**Form sections** (top to bottom):

| Section | Fields | Interaction |
|---------|--------|-------------|
| **Header** | Name (editable inline), Kind badge ("Data", blue) | Name auto-saves with 500ms debounce; triggers `renameType` with cascade |
| **Inheritance** | Parent type selector (TypeSelector, `allowClear: true`) | Immediate commit on selection; triggers `setInheritance` |
| **Attributes** | List of `AttributeRow` components + "Add Attribute" button | Each row manages its own debounced fields; drag handle for reorder; add creates empty row |
| **Metadata** | `MetadataSection` component | Description, synonyms |

**Keyboard shortcuts**:
- `Enter` in attribute name field: move focus to type selector
- `Tab`: navigate between fields in order
- `Escape`: cancel inline edit, revert to last committed value

---

## EnumForm

**Location**: `packages/visual-editor/src/components/editors/EnumForm.tsx`

```ts
export interface EnumFormProps {
  nodeId: string;
  nodeData: TypeNodeData<'enum'>;
  readOnly?: boolean;
  availableEnums: TypeOption[];
  actions: EditorFormActions;
}
```

**Form sections**:

| Section | Fields | Interaction |
|---------|--------|-------------|
| **Header** | Name (editable), Kind badge ("Enum", green) | Auto-save with debounce |
| **Parent Enum** | Enum type selector (filtered to `kind: 'enum'`) | Immediate commit; triggers `setEnumParent` |
| **Values** | List of `EnumValueRow` components + "Add Value" button | Each row has name + optional display name; drag handle for reorder |
| **Metadata** | `MetadataSection` | Description, synonyms |

**Notes**:
- Enum values do NOT have type references or cardinalities
- Enum values have an optional display name (human-readable label)
- "Add Value" creates an empty `EnumValueRow` with auto-focus on name field

---

## ChoiceForm

**Location**: `packages/visual-editor/src/components/editors/ChoiceForm.tsx`

```ts
export interface ChoiceFormProps {
  nodeId: string;
  nodeData: TypeNodeData<'choice'>;
  readOnly?: boolean;
  availableTypes: TypeOption[];
  actions: EditorFormActions;
}
```

**Form sections**:

| Section | Fields | Interaction |
|---------|--------|-------------|
| **Header** | Name (editable), Kind badge ("Choice", amber) | Auto-save with debounce |
| **Options** | List of `ChoiceOptionRow` + "Add Option" TypeSelector | Each option is a type reference; add uses TypeSelector inline |
| **Metadata** | `MetadataSection` | Description, synonyms |

**Notes**:
- Choices do NOT have inheritance (no parent selector)
- Each option is a reference to an existing Data type
- Adding an option creates both a member entry AND a `choice-option` edge
- Removing an option removes both the member AND the edge

---

## FunctionForm

**Location**: `packages/visual-editor/src/components/editors/FunctionForm.tsx`
**Priority**: Phase 2 (P2)

```ts
export interface FunctionFormProps {
  nodeId: string;
  functionData: FunctionDisplayData;
  readOnly?: boolean;
  availableTypes: TypeOption[];
  actions: EditorFormActions;
}

/** Display-oriented representation of a function for form editing. */
export interface FunctionDisplayData {
  name: string;
  definition?: string;
  inputs: Array<{ name: string; typeName: string }>;
  output?: { name: string; typeName: string };
  expressionText?: string;
  synonyms?: string[];
}
```

**Form sections**:

| Section | Fields | Interaction |
|---------|--------|-------------|
| **Header** | Name (editable), Kind badge ("Function", purple) | Auto-save with debounce |
| **Inputs** | List of input param rows (name + type selector) + "Add Input" | Similar to AttributeRow but without cardinality |
| **Output** | Output type selector | Immediate commit |
| **Expression** | Expression editor (`<textarea>` in P2a, CodeMirror in P2b) with autocompletion for type names, feature paths, and built-in functions | Parse-and-validate on blur/debounce; autocomplete popup on trigger |
| **Metadata** | `MetadataSection` | Description, synonyms |

---

## MetadataSection

**Location**: `packages/visual-editor/src/components/editors/MetadataSection.tsx`
**Used by**: All form components

```ts
export interface MetadataSectionProps {
  definition?: string;
  synonyms?: string[];
  comments?: string;
  readOnly?: boolean;
  onDefinitionChange: (definition: string) => void;
  onAddSynonym: (synonym: string) => void;
  onRemoveSynonym: (index: number) => void;
  onCommentsChange: (comments: string) => void;
}
```

**Layout**:
- Collapsible section with "Metadata" header (default expanded)
- **Description**: Multi-line `<textarea>` with auto-resize, placeholder "Add a description..."
- **Comments**: Multi-line `<textarea>` with auto-resize, placeholder "Add comments..."
- **Synonyms**: Tag-like list with inline "Add synonym" input; each tag has an × remove button
- Description and comments changes auto-save with 500ms debounce
- Synonym add/remove are immediate (no debounce needed)

---

## TypeSelector

**Location**: `packages/visual-editor/src/components/editors/TypeSelector.tsx`

```ts
export interface TypeSelectorProps {
  value: string | null;
  options: TypeOption[];
  placeholder?: string;
  onSelect: (value: string | null) => void;
  disabled?: boolean;
  allowClear?: boolean;
  /** Filter options to specific kinds. */
  filterKinds?: Array<TypeKind | 'builtin'>;
}

export interface TypeOption {
  value: string;
  label: string;
  kind: TypeKind | 'builtin';
  namespace?: string;
}
```

**Behavior**:
- Renders a shadcn Combobox (Popover + Command) with search input
- Options grouped by kind: "Built-in" first, then user types grouped by namespace
- Each option shows a colored badge (blue=data, amber=choice, green=enum, gray=builtin)
- Type-ahead filtering matches on label (case-insensitive)
- `allowClear` adds a "None" option at the top to deselect
- Maximum height 300px with scroll; position auto-flips when near viewport edge

---

## AttributeRow

**Location**: `packages/visual-editor/src/components/editors/AttributeRow.tsx`

```ts
export interface AttributeRowProps {
  member: MemberDisplay;
  index: number;
  availableTypes: TypeOption[];
  readOnly?: boolean;
  onChange: (oldName: string, newName: string, typeName: string, cardinality: string) => void;
  onRemove: (name: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}
```

**Layout** (horizontal row):
```
[⠿ Drag] [Name input] [TypeSelector] [CardinalityPicker] [× Remove]
```

**Behavior**:
- Name and type changes auto-save with 500ms debounce
- Cardinality preset clicks commit immediately
- Custom cardinality input debounces
- Remove button shows confirmation on hover (hold 1s) or click to remove
- Override attributes show a subtle "override" badge and dimmed styling
- Empty name field shows red border with error tooltip

---

## EnumValueRow

**Location**: `packages/visual-editor/src/components/editors/EnumValueRow.tsx`

```ts
export interface EnumValueRowProps {
  member: MemberDisplay;
  index: number;
  readOnly?: boolean;
  onChange: (oldName: string, newName: string, displayName?: string) => void;
  onRemove: (name: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}
```

**Layout** (horizontal row):
```
[⠿ Drag] [Value name input] [Display name input (optional)] [× Remove]
```

**Behavior**:
- Both fields auto-save with 500ms debounce
- Display name placeholder: "Display name (optional)"
- Empty value name shows red border

---

## ChoiceOptionRow

**Location**: `packages/visual-editor/src/components/editors/ChoiceOptionRow.tsx`

```ts
export interface ChoiceOptionRowProps {
  member: MemberDisplay;
  readOnly?: boolean;
  onRemove: (typeName: string) => void;
}
```

**Layout** (horizontal row):
```
[Type name (read-only label with kind badge)] [× Remove]
```

**Behavior**:
- Options are type references — the type name is not directly editable
- Shows the kind badge next to the type name
- Remove button removes both the member and the `choice-option` edge

---

## CardinalityPicker

**Location**: `packages/visual-editor/src/components/editors/CardinalityPicker.tsx`

```ts
export interface CardinalityPickerProps {
  value: string;
  onChange: (cardinality: string) => void;
  disabled?: boolean;
}
```

**Layout**:
```
[1..1] [0..1] [0..*] [1..*]  [Custom: ___]
```

**Behavior**:
- Preset buttons are toggle-style — clicking one selects it (immediate commit)
- Custom input allows arbitrary `inf..sup` format
- Custom input validates on blur using `validateCardinality()` from `edit-validator.ts`
- Invalid custom input shows red border + error tooltip
- Preset button that matches current value appears active (filled)

---

## useAutoSave Hook

**Location**: `packages/visual-editor/src/hooks/useAutoSave.ts`

```ts
/**
 * Auto-save hook that debounces value commits to a store action.
 *
 * - Local state changes immediately (responsive typing)
 * - Store commit happens after `delayMs` of idle time
 * - Flushes pending commit on unmount (prevents data loss)
 */
export function useAutoSave<T>(
  value: T,
  commitFn: (val: T) => void,
  delayMs?: number  // default: 500
): void;
```

---

## useTemporalStore Hook

**Location**: `packages/visual-editor/src/store/history.ts`

```ts
/**
 * Selector hook for the Zundo temporal (undo/redo) store.
 * Only tracks nodes and edges (not UI state).
 */
export function useTemporalStore<T>(
  selector: (state: TemporalState<TrackedState>) => T
): T;

// Convenience selectors
export function useCanUndo(): boolean;
export function useCanRedo(): boolean;
export function useUndo(): () => void;
export function useRedo(): () => void;
```

---

## Store Actions Extension

**Location**: `packages/visual-editor/src/store/editor-store.ts`

### New actions added to `EditorActions`

```ts
// --- Attribute update (compound: name + type + cardinality) ---
updateAttribute(
  nodeId: string,
  oldName: string,
  newName: string,
  typeName: string,
  cardinality: string
): void;
reorderAttribute(nodeId: string, fromIndex: number, toIndex: number): void;

// --- Enum operations ---
addEnumValue(nodeId: string, valueName: string, displayName?: string): void;
removeEnumValue(nodeId: string, valueName: string): void;
updateEnumValue(nodeId: string, oldName: string, newName: string, displayName?: string): void;
reorderEnumValue(nodeId: string, fromIndex: number, toIndex: number): void;
setEnumParent(nodeId: string, parentId: string | null): void;

// --- Choice operations ---
addChoiceOption(nodeId: string, typeName: string): void;
removeChoiceOption(nodeId: string, typeName: string): void;

// --- Metadata operations ---
updateDefinition(nodeId: string, definition: string): void;
updateComments(nodeId: string, comments: string): void;
addSynonym(nodeId: string, synonym: string): void;
removeSynonym(nodeId: string, index: number): void;

// --- Function operations (Phase 2) ---
addInputParam(nodeId: string, paramName: string, typeName: string): void;
removeInputParam(nodeId: string, paramName: string): void;
updateOutputType(nodeId: string, typeName: string): void;
updateExpression(nodeId: string, expressionText: string): void;
```

### renameType modification

The existing `renameType` is modified to cascade:

```ts
renameType(nodeId: string, newName: string): void;
// Now cascades: updates node name, node ID, all member type references,
// all edge source/target/labels, parentName references, selectedNodeId
```
