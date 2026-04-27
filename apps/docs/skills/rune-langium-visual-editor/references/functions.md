# Functions

## DetailPanel

### `DetailPanel`
```ts
DetailPanel(__namedParameters: DetailPanelProps): Element | null
```
**Parameters:**
- `__namedParameters: DetailPanelProps`
**Returns:** `Element | null`

## TypeSelector

### `TypeSelector`
Searchable type selector with kind-colored badges.

When `renderTrigger` and `renderPopover` are provided, uses composition
to inject host app UI primitives (e.g., shadcn Popover + Command).
Otherwise falls back to a shadcn Select.
```ts
TypeSelector(__namedParameters: TypeSelectorProps): ReactNode
```
**Parameters:**
- `__namedParameters: TypeSelectorProps`
**Returns:** `ReactNode`

### `getKindBadgeClasses`
Returns badge CSS classes for a given type kind. Wraps the design-system
`badgeVariants` so callers (e.g. `ChoiceOptionRow`, `TypeLink`) get
token-backed colors automatically.
```ts
getKindBadgeClasses(kind: TypeKind | "builtin"): string
```
**Parameters:**
- `kind: TypeKind | "builtin"`
**Returns:** `string`

### `getKindLabel`
Returns a human-readable label for a type kind.
```ts
getKindLabel(kind: TypeKind | "builtin"): string
```
**Parameters:**
- `kind: TypeKind | "builtin"`
**Returns:** `string`

## CardinalityPicker

### `CardinalityPicker`
Cardinality picker as a compact dropdown with 4 presets and a custom option.

Preset selection commits immediately. Choosing "Custom…" shows an inline
input that validates with `validateCardinality()` on blur or Enter.
```ts
CardinalityPicker(__namedParameters: CardinalityPickerProps): ReactNode
```
**Parameters:**
- `__namedParameters: CardinalityPickerProps`
**Returns:** `ReactNode`

## MetadataSection

### `MetadataSection`
Collapsible metadata section with description, comments, and synonym fields.

Reads field values from the parent `FormProvider` context. Auto-resize
textareas for description and comments, tag-list with inline add for synonyms.
```ts
MetadataSection(__namedParameters: MetadataSectionProps): ReactNode
```
**Parameters:**
- `__namedParameters: MetadataSectionProps`
**Returns:** `ReactNode`

## AttributeRow

### `AttributeRow`
```ts
AttributeRow(__namedParameters: AttributeRowProps): Element
```
**Parameters:**
- `__namedParameters: AttributeRowProps`
**Returns:** `Element`

## DataTypeForm

### `DataTypeForm`
```ts
DataTypeForm(__namedParameters: DataTypeFormProps): Element
```
**Parameters:**
- `__namedParameters: DataTypeFormProps`
**Returns:** `Element`

## EnumValueRow

### `EnumValueRow`
```ts
EnumValueRow(__namedParameters: EnumValueRowProps): Element
```
**Parameters:**
- `__namedParameters: EnumValueRowProps`
**Returns:** `Element`

## EnumForm

### `EnumForm`
```ts
EnumForm(__namedParameters: EnumFormProps): Element
```
**Parameters:**
- `__namedParameters: EnumFormProps`
**Returns:** `Element`

## ChoiceOptionRow

### `ChoiceOptionRow`
```ts
ChoiceOptionRow(__namedParameters: ChoiceOptionRowProps): Element
```
**Parameters:**
- `__namedParameters: ChoiceOptionRowProps`
**Returns:** `Element`

## ChoiceForm

### `ChoiceForm`
```ts
ChoiceForm(__namedParameters: ChoiceFormProps): Element
```
**Parameters:**
- `__namedParameters: ChoiceFormProps`
**Returns:** `Element`

## FunctionForm

### `FunctionForm`
```ts
FunctionForm(__namedParameters: FunctionFormProps): Element
```
**Parameters:**
- `__namedParameters: FunctionFormProps`
**Returns:** `Element`

## ast-to-model

### `astToModel`
Convert RosettaModel AST roots into ReactFlow nodes and edges.

Each graph node's `data` IS the AstNodeModel (AST fields spread)
plus GraphMetadata (namespace, position, errors, etc.).
```ts
astToModel(models: unknown, options?: AstToModelOptions): AstToModelResult
```
**Parameters:**
- `models: unknown`
- `options: AstToModelOptions` (optional)
**Returns:** `AstToModelResult`

## model-to-ast

### `modelsToAst`
Convert graph nodes and edges to serializer-compatible model objects.
Groups nodes by namespace and produces one model per namespace.
```ts
modelsToAst(nodes: TypeGraphNode[], edges: TypeGraphEdge[]): ModelOutput[]
```
**Parameters:**
- `nodes: TypeGraphNode[]`
- `edges: TypeGraphEdge[]`
**Returns:** `ModelOutput[]`

## model-helpers

### `formatCardinality`
Format a RosettaCardinality model as a display string, e.g. `(1..*)`.
```ts
formatCardinality(card: CardinalityShape | undefined): string
```
**Parameters:**
- `card: CardinalityShape | undefined`
**Returns:** `string`

### `parseCardinality`
Parse a cardinality display string back to structured form.
```ts
parseCardinality(card?: string): CardinalityShape
```
**Parameters:**
- `card: string` (optional)
**Returns:** `CardinalityShape`

### `getTypeRefText`
Get the display name of a type reference (e.g. from a TypeCall).
```ts
getTypeRefText(typeCall: TypeCallShape | undefined): string | undefined
```
**Parameters:**
- `typeCall: TypeCallShape | undefined`
**Returns:** `string | undefined`

### `getRefText`
Get display text from a Reference-like object.
```ts
getRefText(ref: ReferenceShape | undefined): string | undefined
```
**Parameters:**
- `ref: ReferenceShape | undefined`
**Returns:** `string | undefined`

### `annotationsToDisplay`
Convert AstNodeModel<AnnotationRef>[] to display-friendly objects.
```ts
annotationsToDisplay(annotations: AnnotationRefShape[] | undefined): AnnotationDisplayInfo[]
```
**Parameters:**
- `annotations: AnnotationRefShape[] | undefined`
**Returns:** `AnnotationDisplayInfo[]`

### `conditionsToDisplay`
Convert condition models to display-friendly objects.
```ts
conditionsToDisplay(conditions: ConditionShape[] | undefined, postConditions?: ConditionShape[]): ConditionDisplayInfo[]
```
**Parameters:**
- `conditions: ConditionShape[] | undefined`
- `postConditions: ConditionShape[]` (optional)
**Returns:** `ConditionDisplayInfo[]`

### `classExprSynonymsToStrings`
Extract display strings from Data/Choice class synonyms.
```ts
classExprSynonymsToStrings(synonyms: ClassSynonymShape[] | undefined): string[]
```
**Parameters:**
- `synonyms: ClassSynonymShape[] | undefined`
**Returns:** `string[]`

### `enumSynonymsToStrings`
Extract display strings from Enum synonyms.
```ts
enumSynonymsToStrings(synonyms: EnumSynonymShape[] | undefined): string[]
```
**Parameters:**
- `synonyms: EnumSynonymShape[] | undefined`
**Returns:** `string[]`

## dagre-layout

### `computeLayout`
Compute layout positions for ReactFlow nodes using dagre.

Returns a new array of nodes with updated positions.
Does not mutate the input.
```ts
computeLayout(nodes: TypeGraphNode[], edges: TypeGraphEdge[], options?: LayoutOptions): TypeGraphNode[]
```
**Parameters:**
- `nodes: TypeGraphNode[]`
- `edges: TypeGraphEdge[]`
- `options: LayoutOptions` (optional)
**Returns:** `TypeGraphNode[]`

### `computeLayoutIncremental`
Compute layout with cache-first strategy.

For incremental visibility changes (toggling a single namespace),
nodes with cached positions reuse them. Only nodes without cached
positions trigger a full dagre run.

When the ratio of uncached nodes is small (<30%), we place cached
nodes at their old positions and only run dagre for the new ones,
offsetting them near related cached nodes.

When the ratio is large (>=30%), we run a full dagre layout and
update the cache.
```ts
computeLayoutIncremental(nodes: TypeGraphNode[], edges: TypeGraphEdge[], options?: LayoutOptions): TypeGraphNode[]
```
**Parameters:**
- `nodes: TypeGraphNode[]`
- `edges: TypeGraphEdge[]`
- `options: LayoutOptions` (optional)
**Returns:** `TypeGraphNode[]`

### `clearLayoutCache`
Clear the entire position cache (call on model reload).
```ts
clearLayoutCache(): void
```

## layout-worker

### `computeLayoutAsync`
Compute layout asynchronously.

Prefers a Web Worker for true off-main-thread execution.
Falls back to requestIdleCallback-based yielding on the main thread.

Returns null if a newer layout request superseded this one.
```ts
computeLayoutAsync(nodes: TypeGraphNode[], edges: TypeGraphEdge[], options?: LayoutOptions): Promise<TypeGraphNode[] | null>
```
**Parameters:**
- `nodes: TypeGraphNode[]`
- `edges: TypeGraphEdge[]`
- `options: LayoutOptions` (optional)
**Returns:** `Promise<TypeGraphNode[] | null>`

### `cancelAsyncLayout`
Cancel any in-flight async layout.
```ts
cancelAsyncLayout(): void
```

## grouped-layout

### `computeGroupedLayout`
Layout each group independently with dagre, then arrange
groups in a grid pattern.
```ts
computeGroupedLayout(nodes: TypeGraphNode[], edges: TypeGraphEdge[], options?: LayoutOptions): TypeGraphNode[]
```
**Parameters:**
- `nodes: TypeGraphNode[]`
- `edges: TypeGraphEdge[]`
- `options: LayoutOptions` (optional)
**Returns:** `TypeGraphNode[]`

### `findInheritanceGroups`
Find inheritance-connected groups among the given nodes.
```ts
findInheritanceGroups(nodes: TypeGraphNode[], edges: TypeGraphEdge[]): GroupInfo[]
```
**Parameters:**
- `nodes: TypeGraphNode[]`
- `edges: TypeGraphEdge[]`
**Returns:** `GroupInfo[]`

## namespace-tree

### `buildNamespaceTree`
Build a sorted list of namespace tree entries from graph nodes.

Groups nodes by `namespace`, counts per kind, and sorts
both namespaces and their child types alphabetically.
```ts
buildNamespaceTree(nodes: TypeGraphNode[]): NamespaceTreeNode[]
```
**Parameters:**
- `nodes: TypeGraphNode[]`
**Returns:** `NamespaceTreeNode[]`

### `filterNamespaceTree`
Filter namespace tree entries by a search query.

Matches against both namespace name and type names.
Returns tree entries with only matching types (or the full
namespace if the namespace name itself matches).
```ts
filterNamespaceTree(tree: NamespaceTreeNode[], query: string): NamespaceTreeNode[]
```
**Parameters:**
- `tree: NamespaceTreeNode[]`
- `query: string`
**Returns:** `NamespaceTreeNode[]`

## Visual Editor

### `createEditorStore`
Create an isolated zustand editor store instance.

Returns a new zustand `useStore` hook bound to a fresh store instance.
Use this when embedding multiple independent `RuneTypeGraph` components
in the same React tree — each graph must own a separate store.

The store is wrapped with `zundo` temporal middleware for undo/redo support.
Access undo/redo via `useTemporalStore`.
```ts
createEditorStore(overrides?: Partial<EditorState>): UseBoundStore<Write<StoreApi<EditorStore>, { temporal: StoreApi }>>
```
**Parameters:**
- `overrides: Partial<EditorState>` (optional) — Optional partial initial state to override defaults.
**Returns:** `UseBoundStore<Write<StoreApi<EditorStore>, { temporal: StoreApi }>>` — A zustand `useStore` hook bound to the new isolated store.

## history

### `useTemporalStore`
Access the temporal (undo/redo) store attached to the editor store.
```ts
useTemporalStore<T>(selector: (state: TemporalState<TrackedState>) => T): T
```
**Parameters:**
- `selector: (state: TemporalState<TrackedState>) => T` — Selector function to pick values from the temporal state.
**Returns:** `T` — The selected value from the temporal store.

### `useCanUndo`
Whether there are past states to undo to.
```ts
useCanUndo(): boolean
```
**Returns:** `boolean`

### `useCanRedo`
Whether there are future states to redo to.
```ts
useCanRedo(): boolean
```
**Returns:** `boolean`

### `useUndo`
Returns the undo function from the temporal store.
```ts
useUndo(): () => void
```
**Returns:** `() => void`

### `useRedo`
Returns the redo function from the temporal store.
```ts
useRedo(): () => void
```
**Returns:** `() => void`

## ExpressionBuilder

### `ExpressionBuilder`
```ts
ExpressionBuilder(__namedParameters: ExpressionBuilderProps): Element
```
**Parameters:**
- `__namedParameters: ExpressionBuilderProps`
**Returns:** `Element`

## useAutoSave

### `useAutoSave`
Returns a debounced callback that auto-saves the latest value after
`delay` milliseconds of inactivity. Flushes on unmount.
```ts
useAutoSave<T>(onCommit: (value: T) => void, delay: number): (value: T) => void
```
**Parameters:**
- `onCommit: (value: T) => void` — Callback invoked with the latest value on commit.
- `delay: number` — default: `500` — Debounce delay in milliseconds (default 500).
**Returns:** `(value: T) => void` — A debounced setter function.

## useExpressionAutocomplete

### `useExpressionAutocomplete`
```ts
useExpressionAutocomplete(availableTypes: TypeOption[], inputParams?: { name: string; typeName?: string }[]): UseExpressionAutocompleteResult
```
**Parameters:**
- `availableTypes: TypeOption[]`
- `inputParams: { name: string; typeName?: string }[]` (optional)
**Returns:** `UseExpressionAutocompleteResult`

## edit-validator

### `detectCircularInheritance`
Detect whether setting `childId extends parentId` would create a cycle.

Walks the inheritance chain from parentId upward; if it reaches childId,
a cycle exists.
```ts
detectCircularInheritance(childId: string, parentId: string, edges: TypeGraphEdge[]): boolean
```
**Parameters:**
- `childId: string`
- `parentId: string`
- `edges: TypeGraphEdge[]`
**Returns:** `boolean`

### `detectDuplicateName`
Check if a name already exists in the given namespace.

When `nodeId` is provided, checks for duplicate attribute names within
that node instead of type names.
```ts
detectDuplicateName(name: string, namespace: string, nodes: TypeGraphNode[], nodeId?: string): boolean
```
**Parameters:**
- `name: string`
- `namespace: string`
- `nodes: TypeGraphNode[]`
- `nodeId: string` (optional)
**Returns:** `boolean`

### `validateCardinality`
Validate a cardinality string.

Returns null if valid, or an error message string if invalid.
Accepts formats: "inf..sup", "(inf..sup)", "inf..*", "(inf..*)"
```ts
validateCardinality(input: string): string | null
```
**Parameters:**
- `input: string`
**Returns:** `string | null`

### `detectDuplicateEnumValue`
Check if an enum value name already exists within the specified enum node.
```ts
detectDuplicateEnumValue(valueName: string, nodeId: string, nodes: TypeGraphNode[]): boolean
```
**Parameters:**
- `valueName: string`
- `nodeId: string`
- `nodes: TypeGraphNode[]`
**Returns:** `boolean`

### `validateNotEmpty`
Validate that a name is non-empty after trimming whitespace.

Returns null if valid, or an error message string if invalid.
```ts
validateNotEmpty(name: string, context: string): string | null
```
**Parameters:**
- `name: string`
- `context: string` — default: `'Name'`
**Returns:** `string | null`

### `validateIdentifier`
Validate that a name conforms to Rune DSL identifier rules.

Returns null if valid, or an error message string if invalid.
```ts
validateIdentifier(name: string): string | null
```
**Parameters:**
- `name: string`
**Returns:** `string | null`

### `validateExpression`
Validate an expression string.

This is a lightweight client-side check. Full parsing validation
runs in the web worker parse pipeline. This function performs basic
structural checks (balanced parentheses, non-empty).
```ts
validateExpression(expression: string): ExpressionValidationResult
```
**Parameters:**
- `expression: string` — The expression text to validate.
**Returns:** `ExpressionValidationResult` — Validation result with error message if invalid.

### `validateGraph`
Run all validations on the current graph state and return errors.
```ts
validateGraph(nodes: TypeGraphNode[], edges: TypeGraphEdge[]): ValidationError[]
```
**Parameters:**
- `nodes: TypeGraphNode[]`
- `edges: TypeGraphEdge[]`
**Returns:** `ValidationError[]`
