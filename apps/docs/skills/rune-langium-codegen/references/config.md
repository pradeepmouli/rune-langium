# Configuration

## GeneratePreviewSchemaOptions

Options for `generatePreviewSchemas()`.

`targetId` narrows generation to a single data type / form target. When
omitted, schemas are generated for every data target in the document set;
targets that cannot produce a preview schema are marked as unsupported.

### Properties

#### targetId

Generate only the schema for this fully-qualified target id.

**Type:** `string`

#### maxDepth

Maximum recursion depth to follow when expanding nested object fields.

**Type:** `number`

## GeneratorOptions

Options for a generation run.
FR-001 (target selection), FR-022 (strict mode).

### Properties

#### target

Selects the emitter pipeline. Defaults to 'zod'.

**Type:** `Target`

#### strict

If true, any GeneratorDiagnostic with severity 'error' causes
generate() to throw a GeneratorError instead of returning a partial result.
FR-022.

**Type:** `boolean`

#### headerComment

Optional string prepended to each emitted file's header comment.
Do NOT set when requiring byte-identical output (SC-007).

**Type:** `string`

#### namespaces

Optional namespace allowlist (019 spec §5.1/§5.3). When present, only
these namespaces are emitted; everything else in the parsed workspace
is dropped before registry-build + walk. When absent, all namespaces
are emitted (existing behavior — CLI / direct callers see no change).

The caller is responsible for passing a dependency-closed set — the
studio's Download modal computes the transitive closure (§5.2) so
emitted code never references a dropped namespace. A non-closed set
passed directly may produce output with unresolved imports.

**Type:** `readonly string[]`

#### zod

**Type:** `ZodOptions`

#### typescript

**Type:** `TypescriptOptions`

#### json-schema

**Type:** `JsonSchemaOptions`

#### sql

**Type:** `SqlOptions`

#### markdown

**Type:** `MarkdownOptions`

#### excel

**Type:** `{ sheets: { types: boolean; enums: boolean; typeAliases: boolean; conditions: boolean } }`

## NamespaceEmitterOptions

Options passed to a `NamespaceEmitter` constructor.

Extends `GeneratorOptions` with one Phase-0.5 knob: `suppressBoilerplate`.
When true, the emitter must NOT inline shared runtime helpers (e.g.,
Zod's `runeCheckOneOf`, `runeCount`, `runeAttrExists`) in each per-
namespace output — the wrapping `GenericModelEmitter` emits them once
via the Profile's runtime sidecar instead. Default false; today's
behavior is preserved when this flag is unset.

Emitters that have no runtime helpers (TypeScript, JSON Schema) may
ignore the flag — accepting it is enough to satisfy the contract.

019 spec §3.2.

### Properties

#### suppressBoilerplate

**Type:** `boolean`

#### target

Selects the emitter pipeline. Defaults to 'zod'.

**Type:** `Target`

#### strict

If true, any GeneratorDiagnostic with severity 'error' causes
generate() to throw a GeneratorError instead of returning a partial result.
FR-022.

**Type:** `boolean`

#### headerComment

Optional string prepended to each emitted file's header comment.
Do NOT set when requiring byte-identical output (SC-007).

**Type:** `string`

#### namespaces

Optional namespace allowlist (019 spec §5.1/§5.3). When present, only
these namespaces are emitted; everything else in the parsed workspace
is dropped before registry-build + walk. When absent, all namespaces
are emitted (existing behavior — CLI / direct callers see no change).

The caller is responsible for passing a dependency-closed set — the
studio's Download modal computes the transitive closure (§5.2) so
emitted code never references a dropped namespace. A non-closed set
passed directly may produce output with unresolved imports.

**Type:** `readonly string[]`

#### zod

**Type:** `ZodOptions`

#### typescript

**Type:** `TypescriptOptions`

#### json-schema

**Type:** `JsonSchemaOptions`

#### sql

**Type:** `SqlOptions`

#### markdown

**Type:** `MarkdownOptions`

#### excel

**Type:** `{ sheets: { types: boolean; enums: boolean; typeAliases: boolean; conditions: boolean } }`

## ZodOptions

Per-target option blocks (019 spec §3.1). Each block carries
target-specific knobs — `layout` selects per-namespace vs whole-model
emission; per-target enums like SQL `dialect` and `inheritance`
stay nested under their own block.

### Properties

#### layout

Library default: `'per-namespace'` (preserves today's CLI behavior).
The studio's `/api/codegen` Pages Function sends `'barrel'` explicitly
to provide the opinionated bundled download. 019 spec §10.1.

**Type:** `"per-namespace" | "barrel" | "single-file"`

## TypescriptOptions

### Properties

#### layout

Same library/server default split as `ZodOptions.layout`.

**Type:** `"per-namespace" | "barrel" | "single-file"`

## JsonSchemaOptions

### Properties

#### layout

Library default: `'per-namespace'` (today's CLI behavior — no
surprise file-count flip for existing scripts). The studio's
`/api/codegen` Pages Function sends `'single-file'` explicitly so
a Download produces one bundled document with all types in `$defs`
keyed by `<namespace>.<TypeName>`. 019 spec §10.1.

No `'barrel'` value — JSON has no module system, so the bundle IS
single-file.

**Type:** `"per-namespace" | "single-file"`

## SqlOptions

### Properties

#### dialect

**Type:** `"postgres" | "sqlserver"`

#### inheritance

**Type:** `"single-table" | "table-per-type"`

#### enumStrategy

**Type:** `"check" | "table"`

#### layout

Library default: `'per-namespace'`. `/api/codegen` sends
`'single-file'` explicitly so downloaded DDL is one cross-table-FK-
ordered script. 019 spec §10.1 (Phase 2 will land the SQL emitter
+ profile).

**Type:** `"per-namespace" | "single-file"`

## MarkdownOptions

### Properties

#### layout

Library default: `'per-namespace'`. `/api/codegen` sends `'barrel'`
explicitly so a downloaded docs bundle includes the `index.md` TOC.
019 spec §10.1 (Phase 2 will land the Markdown emitter + profile).

**Type:** `"per-namespace" | "barrel"`

## ExcelOptions