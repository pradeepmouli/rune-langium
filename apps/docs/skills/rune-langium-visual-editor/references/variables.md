# Variables & Constants

## components

### `RuneTypeGraph`
```ts
const RuneTypeGraph: ForwardRefExoticComponent<RuneTypeGraphProps & RefAttributes<RuneTypeGraphRef>>
```

## components/panels

### `EditorFormPanel`
```ts
const EditorFormPanel: MemoExoticComponent<(__namedParameters: EditorFormPanelProps) => Element>
```

### `NamespaceExplorerPanel`
```ts
const NamespaceExplorerPanel: MemoExoticComponent<(__namedParameters: NamespaceExplorerPanelProps) => Element>
```

## components/editors

### `TypeCreator`
```ts
const TypeCreator: MemoExoticComponent<(__namedParameters: TypeCreatorProps) => Element>
```

### `AttributeEditor`
```ts
const AttributeEditor: MemoExoticComponent<(__namedParameters: AttributeEditorProps) => Element>
```

### `CardinalityEditor`
```ts
const CardinalityEditor: MemoExoticComponent<(__namedParameters: CardinalityEditorProps) => Element>
```

## types

### `BUILTIN_TYPES`
Built-in primitive types available in the Rune DSL.
```ts
const BUILTIN_TYPES: readonly ["string", "int", "number", "boolean", "date", "time", "dateTime", "zonedDateTime"]
```

## adapters

### `AST_TYPE_TO_NODE_TYPE`
Kind-to-ReactFlow-type mapping. Used to set `Node.type` for
component selection, and for display badges.
```ts
const AST_TYPE_TO_NODE_TYPE: Record<string, string>
```

### `NODE_TYPE_TO_AST_TYPE`
```ts
const NODE_TYPE_TO_AST_TYPE: Record<string, string>
```

## store

### `useEditorStore`
Default store instance for use with RuneTypeGraph.
```ts
const useEditorStore: UseBoundStore<Write<StoreApi<EditorStore>, { temporal: StoreApi }>>
```
