# Types & Enums

## components/panels

### `DetailPanelProps`
**Properties:**
- `nodeData: AnyGraphNode | null`
- `onNavigateToNode: NavigateToNodeCallback` (optional) — Callback to navigate to a type's graph node.
- `allNodeIds: string[]` (optional) — All loaded graph node IDs for resolving type name to node ID.

### `EditorFormPanelProps`
**Properties:**
- `nodeData: AnyGraphNode | null` — The selected node's data, or null if nothing is selected.
- `nodeId: string | null` — Node ID of the selected node.
- `isReadOnly: boolean` (optional) — Whether the node is read-only (from external/locked source).
- `availableTypes: TypeOption[]` — Available type options for type selectors.
- `actions: AllEditorFormActions` — All editor form actions.
- `allNodes: TypeGraphNode[]` (optional) — All graph nodes (for inherited member resolution).
- `renderExpressionEditor: (props: ExpressionEditorSlotProps) => ReactNode` (optional) — Optional render-prop for a rich expression editor in FunctionForm.
When omitted, FunctionForm renders a plain `<Textarea>` fallback.
- `onClose: () => void` (optional) — Called when the panel requests to close (e.g., Escape key).
- `onNavigateToNode: (nodeId: string) => void` (optional) — Called when a type reference is clicked to navigate to that type's definition.

### `NamespaceExplorerPanelProps`
**Properties:**
- `nodes: TypeGraphNode[]` — All graph nodes (full set, including hidden ones).
- `expandedNamespaces: Set<string>` — Set of currently expanded (visible) namespaces.
- `hiddenNodeIds: Set<string>` — Set of individually hidden node IDs.
- `onToggleNamespace: (namespace: string) => void` — Toggle a namespace's visibility on the graph.
- `onToggleNode: (nodeId: string) => void` — Toggle an individual node's visibility.
- `onExpandAll: () => void` — Expand all namespaces.
- `onCollapseAll: () => void` — Collapse all namespaces.
- `onSelectNode: (nodeId: string) => void` (optional) — Called when a node is clicked to select it in the graph.
- `selectedNodeId: string | null` (optional) — Currently selected node ID (for highlighting).
- `className: string` (optional) — Optional className for outer container.
- `hiddenRefCounts: Map<string, number>` (optional) — Total edge count for cross-namespace reference detection.

## components/editors

### `TypeCreatorProps`
**Properties:**
- `onCreateType: (kind: TypeKind, name: string, namespace: string) => void`
- `defaultNamespace: string` (optional)
- `onCancel: () => void` (optional)

### `AttributeEditorProps`
**Properties:**
- `nodeId: string`
- `onAddAttribute: (nodeId: string, name: string, typeName: string, cardinality: string) => void`
- `onRemoveAttribute: (nodeId: string, name: string) => void`
- `onCancel: () => void` (optional)

### `CardinalityEditorProps`
**Properties:**
- `nodeId: string`
- `attrName: string`
- `currentCardinality: string`
- `onUpdateCardinality: (nodeId: string, attrName: string, cardinality: string) => void`
- `onCancel: () => void` (optional)

### `TypeSelectorProps`
**Properties:**
- `value: string | null` — Currently selected type value (node ID or built-in type name).
- `options: TypeOption[]` (optional) — Available types to choose from. May be undefined before types are loaded.
- `placeholder: string` (optional) — Placeholder text.
- `onSelect: (value: string | null) => void` — Called when a type is selected.
- `disabled: boolean` (optional) — Whether the selector is disabled.
- `allowClear: boolean` (optional) — Whether to include a "None" / clear option.
- `filterKinds: (TypeKind | "builtin")[]` (optional) — Filter options to specific kinds.
- `triggerClassName: string` (optional) — Additional CSS classes for the fallback trigger surface.
- `renderTrigger: (props: TypeSelectorTriggerProps) => ReactNode` (optional) — Render-prop for the trigger (button that opens the popover).
- `renderPopover: (props: TypeSelectorPopoverProps) => ReactNode` (optional) — Render-prop for the popover content (search + list).

### `TypeSelectorTriggerProps`
**Properties:**
- `selected: TypeOption | null` — Currently selected option, or null.
- `placeholder: string` — Placeholder text.
- `open: boolean` — Whether the popover is open.
- `onToggle: () => void` — Toggle the popover.
- `disabled: boolean` — Whether the selector is disabled.

### `TypeSelectorPopoverProps`
**Properties:**
- `groups: TypeSelectorGroup[]` — Grouped and filtered options ready for rendering.
- `searchQuery: string` — Current search query.
- `onSearchChange: (query: string) => void` — Update the search query.
- `onSelect: (value: string | null) => void` — Handle option selection.
- `allowClear: boolean` — Whether to show a "None" clear option.
- `selectedValue: string | null` — The currently selected value.

### `TypeSelectorGroup`
**Properties:**
- `label: string`
- `options: TypeOption[]`

### `CardinalityPickerProps`
**Properties:**
- `value: string` — Current cardinality value (e.g., "(0..*)").
- `onChange: (cardinality: string) => void` — Called when cardinality changes.
- `disabled: boolean` (optional) — Whether the picker is disabled.

### `MetadataSectionProps`
**Properties:**
- `readOnly: boolean` (optional) — Whether the metadata section is read-only.
- `onDefinitionCommit: (definition: string) => void` (optional) — Called when definition changes (debounced commit to graph).
- `onCommentsCommit: (comments: string) => void` (optional) — Called when comments change (debounced commit to graph).
- `onSynonymAdd: (synonym: string) => void` (optional) — Called when a synonym is added (immediate commit to graph).
- `onSynonymRemove: (index: number) => void` (optional) — Called when a synonym is removed by index (immediate commit to graph).
- `fields: string[]` (optional) — z2f-host-supplied list of field paths this section groups (declarative
path). Optional and intentionally unused at render time per
`section-component.md` §3 — the section knows its field set.

### `AttributeRowProps`
**Properties:**
- `index: number` — Index position of this member in the useFieldArray.
- `committedName: string` — Last-committed attribute name (for graph action diffing).
- `availableTypes: TypeOption[]` — Available type options for the TypeSelector.
- `onUpdate: (index: number, oldName: string, newName: string, typeName: string, cardinality: string) => void` — Commit attribute changes to the graph.
- `onRemove: (index: number) => void` — Remove this attribute by index.
- `onReorder: (fromIndex: number, toIndex: number) => void` — Reorder (drag) callback; fromIndex → toIndex.
- `disabled: boolean` (optional) — Whether the form is read-only.
- `onNavigateToNode: NavigateToNodeCallback` (optional) — Callback to navigate to a type's graph node.
- `allNodeIds: string[]` (optional) — All loaded graph node IDs for resolving type name to node ID.
- `isOverride: boolean` (optional) — Whether this attribute overrides an inherited member.
- `onRevert: () => void` (optional) — Callback to revert an override (remove local, restore inherited).

### `DataTypeFormProps`
**Properties:**
- `nodeId: string` — Node ID of the Data type being edited.
- `data: AnyGraphNode` — Data payload for the selected node (AnyGraphNode with $type='Data').
- `availableTypes: TypeOption[]` — Available type options for selectors.
- `actions: DataFormActions` — Data-specific editor form action callbacks.
- `allNodes: TypeGraphNode[]` (optional) — All graph nodes (for inherited member resolution via useEffectiveMembers).
- `renderExpressionEditor: (props: ExpressionEditorSlotProps) => ReactNode` (optional) — Optional render-prop for a rich expression editor.
- `onNavigateToNode: NavigateToNodeCallback` (optional) — Callback to navigate to a type's graph node.
- `allNodeIds: string[]` (optional) — All loaded graph node IDs for resolving type name to node ID.

### `EnumValueRowProps`
**Properties:**
- `name: string` — Last-committed value name (used as oldName diff anchor in callbacks).
- `displayName: string` — Last-committed display name (used as diff anchor in callbacks).
- `nodeId: string` — Node ID of the parent Enum — forwarded to callbacks for store dispatch.
- `index: number` — Index position of this member in the useFieldArray.
- `onUpdate: (nodeId: string, oldName: string, newName: string, displayName?: string) => void` — Commit value name/displayName changes to the graph.
- `onRemove: (nodeId: string, valueName: string) => void` — Remove this enum value.
- `onReorder: (fromIndex: number, toIndex: number) => void` — Reorder (drag) callback; fromIndex → toIndex.
- `disabled: boolean` (optional) — Whether the row is disabled.
- `isOverride: boolean` (optional) — Whether this local value overrides an inherited value with the same name.
- `onRevert: () => void` (optional) — Callback to revert this override, restoring the inherited value.

### `EnumFormProps`
**Properties:**
- `nodeId: string` — Node ID of the Enum being edited.
- `data: AnyGraphNode` — Data payload for the selected enum node (AnyGraphNode with $type='RosettaEnumeration').
- `availableTypes: TypeOption[]` — Available type options for selectors.
- `actions: EnumFormActions` — Enum-specific editor form action callbacks.
- `allNodes: TypeGraphNode[]` (optional) — All graph nodes for inherited member resolution.
- `onNavigateToNode: NavigateToNodeCallback` (optional) — Callback to navigate to a type's graph node.
- `allNodeIds: string[]` (optional) — All loaded graph node IDs for resolving type name to node ID.

### `ChoiceOptionRowProps`
**Properties:**
- `typeName: string` — The type name for this choice option.
- `nodeId: string` — Node ID owning this choice.
- `availableTypes: TypeOption[]` — Available type options (for badge styling lookup).
- `onRemove: (nodeId: string, typeName: string) => void` — Remove this option.
- `disabled: boolean` (optional) — Whether the row is disabled.
- `onNavigateToNode: NavigateToNodeCallback` (optional) — Callback to navigate to a type's graph node.
- `allNodeIds: string[]` (optional) — All loaded graph node IDs for resolving type name to node ID.

### `ChoiceFormProps`
**Properties:**
- `nodeId: string` — Node ID of the Choice being edited.
- `data: AnyGraphNode` — Data payload for the selected choice node (AnyGraphNode with $type='Choice').
- `availableTypes: TypeOption[]` — Available type options for selectors.
- `actions: ChoiceFormActions` — Choice-specific editor form action callbacks.
- `onNavigateToNode: NavigateToNodeCallback` (optional) — Callback to navigate to a type's graph node.
- `allNodeIds: string[]` (optional) — All loaded graph node IDs for resolving type name to node ID.

### `FunctionFormProps`
**Properties:**
- `nodeId: string` — Node ID of the Function being edited.
- `data: AnyGraphNode` — Data payload for the selected function node (AnyGraphNode with $type='RosettaFunction').
- `availableTypes: TypeOption[]` — Available type options for selectors.
- `actions: FuncFormActions` — Function-specific editor form action callbacks.
- `inheritedGroups: InheritedGroup[]` (optional) — Inherited member groups from super-function (if any).
- `renderExpressionEditor: (props: ExpressionEditorSlotProps) => ReactNode` (optional) — Optional render-prop for a rich expression editor (e.g. CodeMirror).
When omitted, a plain `<Textarea>` is rendered as fallback.

Per FR-010 / R10, this slot is preserved verbatim through the
z2f migration: the bespoke expression-builder UX is owned by the
studio app and remains a controlled override.
- `onNavigateToNode: NavigateToNodeCallback` (optional) — Callback to navigate to a type's graph node.
- `allNodeIds: string[]` (optional) — All loaded graph node IDs for resolving type name to node ID.

### `ExpressionBuilderProps`
Props provided to the expression editor render-prop slot.

`packages/visual-editor` is editor-agnostic — the host app provides
the actual editor implementation (e.g. CodeMirror, Monaco) via a
`renderExpressionEditor` prop on `FunctionForm`.
**Properties:**
- `scope: FunctionScope`
- `defaultMode: "text" | "builder"` (optional)
- `onDragNode: (draggedNodeId: string, targetNodeId: string) => void` (optional) — Callback when a node is dragged to a placeholder target.
- `expressionAst: unknown` (optional) — Optional raw AST expression object — when provided, used directly instead of parsing value text.
- `value: string` — Current expression text.
- `onChange: (value: string) => void` — Called on every keystroke / change.
- `onBlur: () => void` — Called when the editor loses focus — triggers validation & commit.
- `error: string | null` (optional) — Validation error message (null when valid).
- `placeholder: string` (optional) — Placeholder text shown when the editor is empty.

## types

### `AstNodeModel`
Mapped type that plucks and recursively serializes fields from any
Langium AST node type.

`$type` is preserved as a readonly literal (derived from the generic parameter)
for runtime discrimination. All other fields are made mutable for editing.
```ts
{ $type: T["$type"] } & { -readonly [K in Exclude<keyof T, ExcludedFields | "$type">]: SerializeField<T[K]> }
```

### `AstNodeShape`
Structural constraint matching Langium's AstNode interface.
Used instead of importing langium directly (it's not a visual-editor dependency).
**Properties:**
- `$type: string`
- `$container: AstNodeShape` (optional)
- `$containerProperty: string` (optional)
- `$containerIndex: number` (optional)
- `$cstNode: unknown` (optional)
- `$document: unknown` (optional)

### `GraphNode`
Top-level graph node data: AstNodeModel with graph/editor metadata.
Used for elements rendered by ReactFlow (Data, Choice, Enum, Function, etc.).
```ts
AstNodeModel<T> & GraphMetadata
```

### `AnyGraphNode`
Union of all GraphNode variants for top-level elements.
```ts
GraphNode<Data> | GraphNode<Choice> | GraphNode<RosettaEnumeration> | GraphNode<RosettaFunction> | GraphNode<RosettaRecordType> | GraphNode<RosettaTypeAlias> | GraphNode<RosettaBasicType> | GraphNode<Annotation>
```

### `GraphMetadata`
**Properties:**
- `namespace: string`
- `position: { x: number; y: number }`
- `errors: ValidationError[]`
- `isReadOnly: boolean` (optional)
- `hasExternalRefs: boolean`
- `comments: string` (optional) — UI-only annotation (not from AST).

### `RootAstElement`
Union of all top-level AST element types that appear as graph nodes.
```ts
Data | Choice | RosettaEnumeration | RosettaFunction | RosettaRecordType | RosettaTypeAlias | RosettaBasicType | Annotation
```

### `TypeKind`
Short kind strings used for UI dispatch, badge rendering, and form actions.
```ts
"data" | "choice" | "enum" | "func" | "record" | "typeAlias" | "basicType" | "annotation"
```

### `EdgeKind`
```ts
"extends" | "attribute-ref" | "choice-option" | "enum-extends" | "type-alias-ref"
```

### `EdgeData`
Data payload for graph edges.

The index signature is required for compatibility with ReactFlow's
`Edge<T extends Record<string, unknown>>` constraint.
**Properties:**
- `kind: EdgeKind`
- `label: string` (optional)
- `cardinality: string` (optional)

### `ValidationError`
**Properties:**
- `nodeId: string`
- `severity: "error" | "warning" | "info"`
- `message: string`
- `ruleId: string` (optional)
- `line: number` (optional)
- `column: number` (optional)

### `ExpressionEditorSlotProps`
Props provided to the expression editor render-prop slot.

`packages/visual-editor` is editor-agnostic — the host app provides
the actual editor implementation (e.g. CodeMirror, Monaco) via a
`renderExpressionEditor` prop on `FunctionForm`.
**Properties:**
- `value: string` — Current expression text.
- `onChange: (value: string) => void` — Called on every keystroke / change.
- `onBlur: () => void` — Called when the editor loses focus — triggers validation & commit.
- `error: string | null` (optional) — Validation error message (null when valid).
- `placeholder: string` (optional) — Placeholder text shown when the editor is empty.

<!-- truncated -->
