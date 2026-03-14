# Contract: Model Loader API

**Scope**: Public API for loading Rune DSL models from git repositories.

## Functions

### `loadModel(source: ModelSource, options?: LoadOptions): AsyncGenerator<LoadProgress, LoadedModel>`

Loads a Rune DSL model from a git repository. Yields progress events during loading. Returns the fully parsed model.

**Parameters**:
- `source` — ModelSource with repoUrl, ref, and file discovery paths
- `options.signal` — AbortSignal for cancellation
- `options.useCache` — Whether to check IndexedDB cache first (default: true)

**Yields**: `LoadProgress` events with `{ phase: 'fetching' | 'discovering' | 'parsing', current: number, total: number }`

**Returns**: `LoadedModel` with parsed workspace files (read-only) and metadata.

**Errors**:
- `ModelLoadError('NETWORK')` — Repository unreachable
- `ModelLoadError('NOT_FOUND')` — Repository or ref does not exist
- `ModelLoadError('NO_FILES')` — No .rosetta files found
- `ModelLoadError('CANCELLED')` — User cancelled via AbortSignal

### `getCachedModel(sourceId: string): Promise<CachedModel | null>`

Retrieves a cached model from IndexedDB by source ID.

### `clearCache(sourceId?: string): Promise<void>`

Clears cached model(s). If sourceId omitted, clears all cached models.

### `getModelRegistry(): ModelSource[]`

Returns the curated list of well-known models (CDM, FpML, etc.).

## React Hook

### `useModelLoader()`

```typescript
{
  loadModel: (source: ModelSource) => void
  cancel: () => void
  progress: LoadProgress | null
  model: LoadedModel | null
  error: ModelLoadError | null
  isLoading: boolean
}
```

Zustand-backed hook for UI integration. Manages loading state, progress, and caching.
