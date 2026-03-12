# Data Model: UI Performance Optimization

## Entities

### FlatTreeRow (new)

Flattened representation of a namespace tree row for virtualization.

```typescript
type FlatTreeRow =
  | { kind: 'namespace'; namespace: string; typeCount: number; expanded: boolean }
  | { kind: 'type'; nodeId: string; name: string; typeKind: TypeNodeData['kind']; namespace: string; hidden: boolean };
```

**Used by**: `NamespaceExplorerPanel` virtualized rendering
**Derived from**: `NamespaceGroup[]` (output of `buildNamespaceTree()`)

### FlatDiagnosticRow (new)

Flattened representation of a diagnostic row for virtualization.

```typescript
type FlatDiagnosticRow =
  | { kind: 'file-header'; uri: string; count: number }
  | { kind: 'diagnostic'; uri: string; diagnostic: LspDiagnostic; index: number };
```

**Used by**: `DiagnosticsPanel` virtualized rendering

### WorkspaceLoadProgress (new)

Progress state for chunked file loading.

```typescript
interface WorkspaceLoadProgress {
  phase: 'reading' | 'syncing' | 'complete';
  loaded: number;
  total: number;
}
```

**Used by**: `FileLoader`, `workspace.ts`

## Existing Entities (unchanged)

### NamespaceGroup (existing, from namespace-tree.ts)
```typescript
interface NamespaceGroup {
  namespace: string;
  types: Array<{ nodeId: string; name: string; kind: TypeNodeData['kind'] }>;
}
```
**Status**: Unchanged — `flattenNamespaceTree()` converts this to `FlatTreeRow[]`

### TypeGraphNode (existing, from types.ts)
```typescript
interface TypeGraphNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: TypeNodeData;
}
```
**Status**: Unchanged

## State Transitions

### File Loading Lifecycle
```
idle → reading(0/N) → reading(k/N) → syncing(N/N) → complete
```
- `reading`: Files being read from File API in chunks
- `syncing`: All files read, being sent to LSP server
- `complete`: All files loaded and synced

## New Functions

### `flattenNamespaceTree(tree, expandedNamespaces, hiddenNodeIds, searchQuery?)`
- **Input**: `NamespaceGroup[]`, `Set<string>`, `Set<string>`, `string?`
- **Output**: `FlatTreeRow[]`
- **Location**: `packages/visual-editor/src/utils/namespace-tree.ts`

### `flattenDiagnostics(diagnosticsByFile)`
- **Input**: `Map<string, LspDiagnostic[]>`
- **Output**: `FlatDiagnosticRow[]`
- **Location**: `apps/studio/src/utils/flatten-diagnostics.ts` (new file)
