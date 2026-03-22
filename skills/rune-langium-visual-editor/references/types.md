# Types & Enums

## Types

### `DetailPanelProps`

### `EditorFormPanelProps`

### `NamespaceExplorerPanelProps`

### `TypeCreatorProps`

### `AttributeEditorProps`

### `CardinalityEditorProps`

### `TypeSelectorProps`

### `TypeSelectorTriggerProps`

### `TypeSelectorPopoverProps`

### `TypeSelectorGroup`

### `CardinalityPickerProps`

### `MetadataSectionProps`

### `AttributeRowProps`

### `DataTypeFormProps`

### `EnumValueRowProps`

### `EnumFormProps`

### `ChoiceOptionRowProps`

### `ChoiceFormProps`

### `FunctionFormProps`

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

### `ValidationError`

### `ExpressionEditorSlotProps`
Props provided to the expression editor render-prop slot.

`packages/visual-editor` is editor-agnostic — the host app provides
the actual editor implementation (e.g. CodeMirror, Monaco) via a
`renderExpressionEditor` prop on `FunctionForm`.

### `TypeOption`
A type option for searchable type selectors.

### `CommonFormActions`
Actions shared by all type kinds.

### `DataFormActions`
Data type–specific editor actions.

### `EnumFormActions`
Enum-specific editor actions.

### `ChoiceFormActions`
Choice-specific editor actions.

### `FuncFormActions`
Function-specific editor actions.

### `FormActionsKindMap`
Maps each `TypeKind` to its form actions interface.

### `AllEditorFormActions`
Intersection of all kind-specific actions (every method available).
```ts
DataFormActions & EnumFormActions & ChoiceFormActions & FuncFormActions
```

### `EditorFormActions`
Kind-aware editor form actions.

When parameterized with a specific kind (e.g. `EditorFormActions<'data'>`),
only that kind's actions + common actions are available.

When unparameterized (`EditorFormActions`), resolves to the full intersection
of all kind-specific actions for backward compatibility.
```ts
[TypeKind] extends [K] ? AllEditorFormActions : FormActionsKindMap[K]
```

### `GraphFilters`

### `LayoutDirection`
```ts
"TB" | "LR" | "BT" | "RL"
```

### `LayoutOptions`

### `NodeStyleConfig`

### `EdgeStyleConfig`

### `RuneTypeGraphConfig`

### `RuneTypeGraphCallbacks`

### `RuneTypeGraphProps`

### `RuneTypeGraphRef`

### `TypeGraphNode`
```ts
Node<AnyGraphNode>
```

### `TypeGraphEdge`
```ts
Edge<EdgeData>
```

### `NamespaceTreeNode`

### `NamespaceTypeEntry`

### `VisibilityState`

### `NavigateToNodeCallback`
Callback for navigating to a type definition by node ID (namespace::name).
```ts
(nodeId: string) => void
```

### `ModelOutput`
A serializer-compatible model object.
Same shape as the legacy SyntheticModel but typed against AstNodeModel.

### `SyntheticModel`
```ts
ModelOutput
```

### `SyntheticElement`
```ts
unknown
```

### `GroupInfo`

### `EditorStore`
```ts
EditorState & EditorActions
```

### `EditorState`

### `EditorActions`

### `TrackedState`
Fields tracked by undo/redo.
UI state (selection, viewport) is NOT tracked.
```ts
Pick<EditorState, "nodes" | "edges">
```

### `ExpressionBuilderProps`
Props provided to the expression editor render-prop slot.

`packages/visual-editor` is editor-agnostic — the host app provides
the actual editor implementation (e.g. CodeMirror, Monaco) via a
`renderExpressionEditor` prop on `FunctionForm`.

### `FunctionScope`

### `FunctionScopeEntry`

### `CompletionItem`

### `UseExpressionAutocompleteResult`

### `ExpressionValidationResult`
Result of validating a Rune DSL expression.
