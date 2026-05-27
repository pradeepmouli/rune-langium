# Types & Enums

## types

### `TypeRefKind`
```ts
typeof TYPE_REF_KINDS[number]
```

### `TypeRefPayload`
Drag payload emitted by NamespaceExplorer items and consumed by drop targets.

**Field semantics:**
- `typeId`   — canonical node id in `ns::Name` format (e.g. `cdm.trade::Trade`).
              Used by `setInheritance` and other operations that reference nodes
              by their fully-qualified id.
- `typeName` — bare display/AST name (e.g. `Trade`) used in `$refText` writes,
              e.g. `updateAttributeType`. This is what the grammar stores as the
              unqualified cross-reference text.

Drag sources MUST set both fields.
**Properties:**
- `rune: "type-ref"`
- `namespaceUri: string`
- `typeId: string` — Canonical node id in `ns::Name` format. Used by setInheritance.
- `typeName: string` — Bare AST/display name used in $refText writes. Used by updateAttributeType.
- `kind: "Annotation" | "Choice" | "Data" | "Enum" | "BasicType" | "Record" | "TypeAlias" | "Func"`

### `StructureExpansionKey`
Key used in the expansion map; encodes namespace + type + attribute, plus
an optional per-instance discriminator.

**Per-instance semantics (Phase 14d, spec 020).** Each visible occurrence of
a type tracks its own expansion state — matching XmlSpy / Altova UModel /
Liquid Studio / Oxygen XML conventions. The `instancePath` carries the chain
of React Flow instance ids of the ancestors leading TO this row's owner (NOT
including the owner itself). Two placements of the same type at the same
depth produce different `instancePath`s because their parent instance ids
differ (e.g. `Trade::buyer::Party` vs `Trade::seller::Party`), so chevrons
inside them stay independent.

The separator inside the path uses `>` (not `:`) because `:` is already the
field separator and we need to round-trip the path through a single string.
**Properties:**
- `namespaceUri: string`
- `typeId: string`
- `attrName: string`
- `instancePath: readonly string[]` (optional) — Chain of React Flow instance ids of ancestors leading to this row's owner,
NOT including the owner. Empty/undefined = root-level instance (no ancestors).

### `StructureRow`
Single row inside a Data node, as the Structure View sees it.
**Properties:**
- `attrName: string`
- `typeName: string`
- `typeKind: "Choice" | "Data" | "Enum" | "BasicType" | "Record" | "TypeAlias" | "Unresolved"`
- `targetNodeId: string` (optional)
- `targetNamespaceUri: string` (optional)
- `cardinality: string`
- `isOptional: boolean`
- `isInherited: boolean`
- `astRange: { start: number; end: number }` (optional) — Range in the source document (for diagnostic binding + cursor sync).

### `StructureDataNode`
A Data node in the Structure View graph.
**Properties:**
- `id: string` — CANONICAL node id (e.g. `cdm.trade::Party`). Cells / editors look up the
shared type description by this id. Multiple visible instances of the same
type share the same `id` — they are distinguished by `instanceId`.
- `instanceId: string` (optional) — Per-instance discriminator id (Phase 14e). The adapter emits one
StructureDataNode per visible occurrence of a type; each carries its own
`expansions` map so chevrons on different instances don't bleed into each
other (e.g. `buyer.Party` vs `seller.Party`).

For root placements this equals the canonical `id`. For nested instances
it follows the layout's instance-id format
(`${parentInstanceId}::${attrName}::${canonicalId}`).

The `nodes` map in `StructureGraphInput` is keyed on `instanceId` when
the adapter populates it. Layout-only test fixtures may omit `instanceId`;
the layout falls back to `id` so existing fixtures continue to work.
- `kind: "data"`
- `name: string`
- `namespaceUri: string`
- `extendsName: string` (optional)
- `extendsNodeId: string` (optional)
- `rows: readonly StructureRow[]`
- `expansions: ReadonlyMap<string, string>` — Direct expansions (attrName → child INSTANCE id). The child id keys into
`StructureGraphInput.nodes` (which is per-instance keyed).

### `StructureChoiceArm`
A Choice arm — represents one option in a Choice. Unlike Data attributes,
Choice arms have no `name` of their own (their identity IS their type) and
no cardinality (they are alternatives, not multi-valued).
**Properties:**
- `typeName: string` — The arm's type name as written in source (e.g., "CashPayment").
- `typeKind: "Choice" | "Data" | "Enum" | "Record" | "TypeAlias" | "Unresolved" | "Builtin"` — Classification of the referenced type, mirroring StructureRow.typeKind.
- `targetNodeId: string` (optional) — Canonical id of the referenced node, when resolvable.

### `StructureChoiceNode`
A Choice node in the Structure View graph.
**Properties:**
- `id: string` — Canonical node id; see `StructureDataNode.id` for the per-instance contract.
- `instanceId: string` (optional) — Per-instance discriminator (Phase 14e); see `StructureDataNode.instanceId`.
- `kind: "choice"`
- `name: string`
- `namespaceUri: string`
- `options: readonly StructureChoiceArm[]`
- `expansions: ReadonlyMap<string, string>` — Per-arm expansions (Phase 14e/B). Keyed by the arm's `typeName` (since
arms have no `attrName` — their identity IS the referenced type), value
is the child INSTANCE id in `StructureGraphInput.nodes`. Only arms whose
`typeKind` is `Data` or `Choice` are eligible to be expanded; terminal
arms (Enum / Builtin / Unresolved) never appear here.

Empty (default) for arms that have not been expanded by the user.

### `StructureEnumNode`
A read-only Enum node in the Structure View graph (Phase 14e/A). Materialized
when the user focuses an Enum from the namespace explorer; lists the enum's
values as plain rows. Enums are terminal — no per-value expansion, no
cellComponents wiring, no chevrons.
**Properties:**
- `id: string`
- `instanceId: string` (optional)
- `kind: "enum"`
- `name: string`
- `namespaceUri: string`
- `values: readonly string[]` — Enum value names in source order.

### `StructureBaseContainer`
A base-type GroupContainer wrap.
**Properties:**
- `id: string` — Canonical wrapper id (e.g. `cdm.trade::Trade::__base::cdm.trade::TradeBase`).
Multiple instances of the same wrapper (one per visible occurrence of the
outer type) share the canonical id but differ in `instanceId`.
- `instanceId: string` (optional) — Per-instance discriminator (Phase 14e); see `StructureDataNode.instanceId`.
- `kind: "base"`
- `baseTypeName: string`
- `baseTypeNamespaceUri: string`
- `baseRows: readonly StructureRow[]`
- `childNodeId: string` — INSTANCE id of the child Data node inside this base container.
- `expansions: ReadonlyMap<string, string>` — Containment edges from this base level's inherited rows into expanded
target nodes (Data/Choice that the user clicked to expand). Values are
INSTANCE ids (mirroring StructureDataNode.expansions). Spec §3.2 — base
level rows can carry their own expansion edges, scoped per-instance.

### `StructureNode`
```ts
StructureDataNode | StructureChoiceNode | StructureBaseContainer | StructureEnumNode
```

### `StructureGraphInput`
Full graph input produced by the adapter.
**Properties:**
- `rootNodeId: string` — INSTANCE id of the root node. Keys into `nodes`. For the root placement
the instance id equals the canonical id of the outermost wrapper, so
existing callers that pass canonical ids through this field continue to
work for non-nested roots.

Phase 14e/A: roots may be `data`, `choice`, or `enum` kinds — the adapter
materializes whichever the focused type resolves to.
- `nodes: ReadonlyMap<string, StructureNode>` — Per-instance node map. Keys are `StructureNode.instanceId`; each visible
occurrence of a type is its own entry with its own `expansions` map.
Look up a node's shared canonical metadata via `.id`.

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
- `deferred: boolean` (optional) — True only on deferred-export placeholder nodes (list-only curated types
 not yet hydrated). Drives on-demand hydration gating in the explorer.

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
- `expressionAst: unknown` (optional) — Raw AST expression object — enables direct tree conversion without reparsing text.

### `TypeOption`
A type option for searchable type selectors.
**Properties:**
- `value: string` — Node ID, or special ID for built-in types.
- `label: string` — Display label (type name).
- `kind: TypeKind | "builtin"` — Type kind for badge coloring.
- `namespace: string` (optional) — Namespace for grouping in the dropdown.

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
**Properties:**
- `data: DataFormActions`
- `enum: EnumFormActions`
- `choice: ChoiceFormActions`
- `func: FuncFormActions`
- `record: CommonFormActions`
- `typeAlias: CommonFormActions`
- `basicType: CommonFormActions`
- `annotation: CommonFormActions`

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

### `LayoutDirection`
```ts
"TB" | "LR" | "BT" | "RL"
```

### `TypeGraphNode`
```ts
Node<AnyGraphNode>
```

### `TypeGraphEdge`
```ts
Edge<EdgeData>
```

### `NamespaceTreeNode`
**Properties:**
- `namespace: string`
- `types: NamespaceTypeEntry[]`
- `totalCount: number`
- `dataCount: number`
- `choiceCount: number`
- `enumCount: number`
- `funcCount: number`

### `NamespaceTypeEntry`
**Properties:**
- `nodeId: string`
- `name: string`
- `kind: TypeKind`
- `isSystem: boolean` (optional) — Whether this entry is from a system/base-type file (read-only).

### `VisibilityState`
**Properties:**
- `expandedNamespaces: Set<string>` — Namespaces whose types are currently visible on the graph.
- `hiddenNodeIds: Set<string>` — Individual nodes hidden within expanded namespaces.
- `explorerOpen: boolean` — Whether the explorer panel is open.
- `visibleNodeKinds: Set<TypeKind>` — Which node kinds are visible (all visible by default).
- `visibleEdgeKinds: Set<EdgeKind>` — Which edge kinds are visible (all visible by default).

### `NavigateToNodeCallback`
Callback for navigating to a type definition by node ID (namespace::name).
```ts
(nodeId: string) => void
```

## components/panels

### `DetailPanelProps`
**Properties:**
- `nodeData: AnyGraphNode | null`
- `onNavigateToNode: NavigateToNodeCallback` (optional) — Callback to navigate to a type's graph node.
- `allNodeIds: string[]` (optional) — All loaded graph node IDs for resolving type name to node ID.
- `refOnly: boolean` (optional) — True when the node's source file is a curated reference-only entry
(no client-side source text). Renders a "Reference Only" pill next
to the kind badge so users understand why the panel is non-editable.

### `EditorFormPanelProps`
**Properties:**
- `nodeData: AnyGraphNode | null` — The selected node's data, or null if nothing is selected.
- `nodeId: string | null` — Node ID of the selected node.
- `isReadOnly: boolean` (optional) — Whether the node is read-only (from external/locked source).
- `refOnly: boolean` (optional) — True when the node's source file is a refOnly curated reference (no
client-side source text). Forces the read-only fallback view and
surfaces a "Reference Only" pill in the panel header so the user
understands why edits are disabled.
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

<!-- truncated -->
