# Types & Enums

## types

### `FormPreviewSchema`
**Properties:**
- `schemaVersion: 1`
- `targetId: string`
- `title: string`
- `status: "ready" | "unsupported"`
- `fields: PreviewField[]`
- `unsupportedFeatures: string[]` (optional)
- `sourceMap: PreviewSourceMapEntry[]` (optional)

### `GeneratorOutput`
One emitted output file from the generator.
FR-001 (output structure).
**Properties:**
- `relativePath: string` — Relative path of the emitted file (e.g. 'cdm/base/math.zod.ts').
- `content: string` — Full text content of the emitted file.
- `sourceMap: SourceMapEntry[]` — Source-map entries for this file.
- `diagnostics: GeneratorDiagnostic[]` — Diagnostics produced during generation of this file.
- `funcs: GeneratedFunc[]` — Emitted function declarations for this namespace.
Non-empty only when target === 'typescript' (FR-028, FR-031).
Empty array for 'zod' and 'json-schema' targets — funcs are silently
skipped (FR-031).

### `GeneratorDiagnostic`
A generator-time diagnostic (not a Langium validation diagnostic).
FR-025 (diagnostics).
**Properties:**
- `severity: "error" | "warning" | "info"` — Severity of the diagnostic.
- `message: string` — Human-readable message describing the issue.
- `code: string` — Short diagnostic code (e.g. 'unresolved-ref', 'unknown-attribute').
- `sourceUri: string` (optional) — Source URI where the issue was detected, if known.
- `line: number` (optional) — Source line (one-based), if known.
- `char: number` (optional) — Source character offset (one-based), if known.

### `PreviewField`
```ts
PreviewScalarField | PreviewEnumField | PreviewObjectField | PreviewArrayField | PreviewUnknownField
```

### `PreviewFieldKind`
```ts
"string" | "number" | "boolean" | "enum" | "object" | "array" | "unknown"
```

### `PreviewSourceMapEntry`
**Properties:**
- `fieldPath: string`
- `sourceUri: string`
- `sourceLine: number`
- `sourceChar: number`

### `SourceMapEntry`
One source-map entry: maps an output line back to a source location.
FR-024 (source maps).
**Properties:**
- `outputLine: number` — Output line number (zero-based).
- `sourceUri: string` — URI of the source Rune document.
- `sourceLine: number` — Source line number (one-based).
- `sourceChar: number` — Source character offset (one-based).

### `Target`
The three supported generator targets.
FR-019 (json-schema), FR-020 (typescript), FR-002–FR-014 (zod).
```ts
"zod" | "json-schema" | "typescript"
```

### `GeneratedFunc`
Metadata for a single emitted Rune `func` (TypeScript target only).
FR-028–FR-032 (function declarations, US6).
**Properties:**
- `name: string` — The func's identifier as declared in the Rune model.
- `relativePath: string` — The relative output path of the module file containing this func
(same as the enclosing GeneratorOutput.relativePath).
- `fileContents: string` — The full text of just the emitted function declaration (subset of
GeneratorOutput.content). Useful for unit-testing the emitter in
isolation without parsing the full file.
- `sourceMap: SourceMapEntry[]` — Source-map entries scoped to this function's output lines.
A subset of the enclosing GeneratorOutput.sourceMap.
