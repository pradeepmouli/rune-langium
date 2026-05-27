# Types & Enums

## types

### `FormPreviewKind`
```ts
"data" | "typeAlias" | "choice" | "function"
```

### `FormPreviewSchema`
**Properties:**
- `schemaVersion: 1`
- `targetId: string`
- `title: string`
- `kind: FormPreviewKind` (optional)
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
- `binary: Uint8Array<ArrayBufferLike>` (optional) — Optional binary payload (018 Task 0.1). When present, `content` may
be empty and consumers should prefer `binary` for I/O — e.g. the
Excel target emits a single `.xlsx` workbook as raw bytes, not text.
- `mimeType: string` (optional) — Optional MIME type hint for the output (018 Task 0.1). Used by
download UIs and file writers to set Content-Type correctly. The
three text targets ('zod', 'typescript', 'json-schema') omit this
and rely on file-extension inference upstream.

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
Supported generator targets.
- `zod`         — FR-002–FR-014 (US1, per-namespace)
- `json-schema` — FR-019 (per-namespace)
- `typescript`  — FR-020 (per-namespace; includes `func` emission)
- `sql`         — 018 Phase 2 (per-namespace DDL emitter)
- `markdown`    — 018 Phase 2 (per-namespace docs emitter)
- `excel`       — 018 Phase 1 (whole-model binary emitter, .xlsx)
- `graphql`     — 018 Phase 3 (whole-model SDL emitter)

The authoritative contract for each target is `TARGET_DESCRIPTORS[target].contract`;
Copilot review on PR #165 caught that this header comment originally listed
sql/markdown as whole-model, which contradicted the registry.

Each target dispatches through one of two emitter contracts:
  - NamespaceEmitter (current): one output file per namespace.
  - WholeModelEmitter (018 Task 0.2): one output for the whole model.

Task 0.4 wires the dispatch.
```ts
"zod" | "json-schema" | "typescript" | "sql" | "markdown" | "excel" | "graphql"
```

### `TargetDescriptor`
Static descriptor for a generator target. Single source of truth used
by UI surfaces (the studio targets table — 018 Task 0.7) to render
labels + decide between Preview / Download affordances. The runtime
`contract` mirrors which emitter interface the target implements
(`NamespaceEmitter` vs `WholeModelEmitter` — see Task 0.2).

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

### `RuneTypeAlias`
**Properties:**
- `name: string`
- `namespace: string`
- `targetTypeName: string`
- `targetKind: "alias" | "enum" | "data" | "primitive"`
- `conditions: Condition[]`
- `parameters: TypeParam[]`
- `definition: string` (optional)

### `Condition`
**Properties:**
- `name: string` (optional)
- `expression: unknown` (optional)

### `TypeParam`
**Properties:**
- `name: string`
- `typeName: string`

### `RuneRule`
**Properties:**
- `name: string`
- `namespace: string`
- `isEligibility: boolean`
- `inputTypeName: string` (optional)
- `exprNode: unknown`
- `identifier: string` (optional)
- `definition: string` (optional)

### `RuneReport`
**Properties:**
- `name: string`
- `namespace: string`
- `inputTypeName: string`
- `reportTypeName: string`
- `eligibilityRuleNames: string[]`
- `timing: string`
- `regulatoryBody: string` (optional)

### `RuneAnnotationDecl`
**Properties:**
- `name: string`
- `namespace: string`
- `prefix: string` (optional)
- `attributes: AnnotationAttribute[]`
- `definition: string` (optional)

### `AnnotationAttribute`
**Properties:**
- `name: string`
- `typeName: string`
- `isList: boolean`
- `isOptional: boolean`

### `RuneLibraryFunc`
**Properties:**
- `name: string`
- `namespace: string`
- `parameters: LibraryFuncParam[]`
- `returnTypeName: string`
- `definition: string` (optional)

### `LibraryFuncParam`
**Properties:**
- `name: string`
- `typeName: string`
- `isArray: boolean`

## emit

### `WholeModelEmitter`
Emitter contract for targets that consume the **entire model** as a
single input (rather than one namespace at a time). Used by targets
that need cross-namespace state — e.g. Excel produces one workbook
for the whole model with cross-sheet hyperlinks, GraphQL SDL
produces one schema file with the full type graph. SQL and Markdown
are per-namespace targets (see TARGET_DESCRIPTORS) — Copilot review
on PR #165 caught an earlier draft of this comment listing SQL as
whole-model.

Returns one or more GeneratorOutput entries. Most whole-model
emitters return a single entry (the single artifact); the array
return type leaves room for emitters that want to split into
multiple files (e.g. an Excel emitter that produces both the
workbook AND a sidecar manifest).

Async because binary emitters (ExcelJS) use stream APIs internally.
The Task 0.4 dispatch in `generator.ts` awaits this method.

### `WholeModelEmitterConstructor`

### `NamespaceEmitter`

### `NamespaceEmitterConstructor`

### `LanguageProfile`
Declarative target-level metadata for packaging (019 spec §3.2).

A `LanguageProfile<T>` tells `GenericModelEmitter` how to assemble
whole-model artifacts for target `T`: how to render the barrel /
index file, how to concatenate per-namespace outputs into a single
file, what shared sidecar artifacts (runtime helpers, manifests,
READMEs) ride alongside the core outputs, and what size limits
apply to the `single-file` layout.

**Profiles exist independently of `NamespaceEmitter`.** Targets that
have no per-namespace mode (Excel, GraphQL — both `WholeModelEmitter`)
still ship a `LanguageProfile` so their hand-rolled emitters can
delegate sidecar generation to a uniform mechanism.

Phase 0.5.1 ships only the interface; concrete Profile instances
land in 0.5.2 (Zod), 0.5.3 (TypeScript), 0.5.4 (JSON Schema), and
Phases 1-3 (Excel, SQL, Markdown, GraphQL).
**Properties:**
- `target: T`
- `basicTypeMap: Readonly<Record<string, BuiltinMapping>>` — Declarative mapping of builtin basic type names → target representation.
Covers: boolean, number, string, time, pattern.
- `recordTypeMap: Readonly<Record<string, BuiltinMapping>>` — Declarative mapping of builtin record type names → target representation.
Covers: date, dateTime, zonedDateTime.
- `typeAliasMap: Readonly<Record<string, BuiltinMapping>>` — Declarative mapping of builtin type alias names → target representation.
Covers: int, productType, eventType, calculation.
- `libraryFuncMap: Readonly<Record<string, LibraryFuncMapping>>` — Declarative mapping of builtin library function names → host binding.
null = intentionally not emitted.
- `extension: string` — Output extension for this target's primary files. Mirrors the
value in `TARGET_DESCRIPTORS[target].extension` — duplicated here
so emitter implementations don't need a back-reference to the
registry.
- `singleFileLimits: { maxNamespaces?: number; maxBytes?: number }` (optional) — Per-target guardrails for `single-file` layout (019 spec §10.2).

When `concatenate()` is about to emit and either limit is exceeded,
`GenericModelEmitter` returns a single `GeneratorOutput` carrying
a fatal `severity: 'error'`, `code: 'single-file-too-large'`
diagnostic instead of the concatenated content. Strict-mode
callers (CLI, /api/codegen) see a `GeneratorError`; non-strict
callers see the diagnostic in the returned output.

Defaults: Zod/TS profiles set `{ maxNamespaces: 50, maxBytes: 1_048_576 }`.
JSON Schema / SQL profiles omit limits since single-file is their
canonical shape and bytes are reasonable for typical models.

`undefined` = no limits.

### `NamespaceManifest`
**Properties:**
- `namespace: string`
- `exportedDataNames: Set<string>`
- `exportedEnumNames: Set<string>`
- `exportedFuncNames: Set<string>`
- `exportedRuleNames: Set<string>`
- `exportedTypeAliasNames: Set<string>`
- `exportedAnnotationNames: Set<string>`
- `exportedLibraryFuncNames: Set<string>`
- `relativePath: string`

### `NamespaceRegistry`
**Properties:**
- `namespaces: Map<string, NamespaceManifest>`

## options

### `ExcelSheetToggles`
Which sheets to emit. Resolves the per-sheet defaults when absent.
```ts
ExcelOptions["sheets"]
```
