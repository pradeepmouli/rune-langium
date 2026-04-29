# Contract: Form Preview Schema

## Purpose

Defines the data exchanged from Studio's codegen worker to the Form Preview UI. The contract is serializable and browser-safe; it must not require executing generated TypeScript source.

## Worker Messages

### `preview:setFiles`

Updates the worker's current workspace files. May reuse the same payload shape as `codegen:setFiles`.

```ts
interface PreviewSetFilesMessage {
  type: 'preview:setFiles';
  files: Array<{ uri: string; content: string }>;
}
```

### `preview:generate`

Requests a preview schema for the selected model type.

```ts
interface PreviewGenerateMessage {
  type: 'preview:generate';
  targetId: string;
}
```

### `preview:result`

Returned when a preview schema is available.

```ts
interface PreviewResultMessage {
  type: 'preview:result';
  targetId: string;
  schema: FormPreviewSchema;
}
```

### `preview:stale`

Returned when current files cannot produce a fresh schema, but the UI may keep a previous one.

```ts
interface PreviewStaleMessage {
  type: 'preview:stale';
  targetId?: string;
  reason: 'parse-error' | 'generation-error' | 'unsupported-target' | 'no-files';
  message: string;
}
```

## Schema Shape

```ts
interface FormPreviewSchema {
  schemaVersion: 1;
  targetId: string;
  title: string;
  status: 'ready' | 'unsupported' | 'unavailable';
  fields: PreviewField[];
  unsupportedFeatures?: string[];
  sourceMap?: PreviewSourceMapEntry[];
}

interface PreviewField {
  path: string;
  label: string;
  kind: 'string' | 'number' | 'boolean' | 'enum' | 'object' | 'array' | 'unknown';
  required: boolean;
  cardinality?: { min?: number; max?: number | 'unbounded' };
  enumValues?: Array<{ value: string; label: string }>;
  children?: PreviewField[];
  description?: string;
}

interface PreviewSourceMapEntry {
  fieldPath: string;
  sourceUri: string;
  sourceLine: number;
  sourceChar: number;
}
```

## Acceptance Contract

- The UI must treat `schemaVersion !== 1` as unavailable.
- Unknown or unsupported fields must render as unsupported rows, not editable controls.
- The UI must validate sample values according to `required`, `kind`, `enumValues`, and `cardinality`.
- Sample values are UI-only state and must not be written to workspace files by this contract.
