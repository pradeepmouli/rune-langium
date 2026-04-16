# Variables & Constants

## RuneTypeGraph

### `RuneTypeGraph`
```ts
const RuneTypeGraph: ForwardRefExoticComponent<RuneTypeGraphProps & RefAttributes<RuneTypeGraphRef>>
```

## EditorFormPanel

### `EditorFormPanel`
```ts
const EditorFormPanel: NamedExoticComponent<EditorFormPanelProps>
```

## NamespaceExplorerPanel

### `NamespaceExplorerPanel`
```ts
const NamespaceExplorerPanel: NamedExoticComponent<NamespaceExplorerPanelProps>
```

## TypeCreator

### `TypeCreator`
```ts
const TypeCreator: NamedExoticComponent<TypeCreatorProps>
```

## AttributeEditor

### `AttributeEditor`
```ts
const AttributeEditor: NamedExoticComponent<AttributeEditorProps>
```

## CardinalityEditor

### `CardinalityEditor`
```ts
const CardinalityEditor: NamedExoticComponent<CardinalityEditorProps>
```

## types

### `BUILTIN_TYPES`
Built-in primitive types available in the Rune DSL.
```ts
const BUILTIN_TYPES: readonly ["string", "int", "number", "boolean", "date", "time", "dateTime", "zonedDateTime"]
```

## model-helpers

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

## editor-store

### `useEditorStore`
Default store instance for use with RuneTypeGraph.
```ts
const useEditorStore: UseBoundStore<Write<StoreApi<EditorStore>, { temporal: StoreApi }>>
```
