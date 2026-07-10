# Import Options Schema + Merge Strategy — Design

**Created**: 2026-07-10
**Status**: Draft (pending self-review + user review)
**Relates to**: `docs/superpowers/specs/2026-07-06-explorer-import-dialog-design.md` (the Explorer Import Dialog this extends; merged as PR #380) and `specs/021-codegen-inbound/spec.md` (the four readers this adds options to).

## Context

The Import Dialog (shipped PR #380) calls `importModel(source, { from, namespace })` with no way to influence *how* each reader converts its source, and always resolves a namespace collision by silently skipping the incoming declaration (`mergeImportedText`'s only behavior). Both are real, if minor, product gaps:

- Each reader (`json-schema-reader.ts`, `openapi-reader.ts`, `sql-reader.ts`, `xsd-reader.ts`) already accepts a small options object internally (`JsonSchemaImportOptions`, `OpenApiImportOptions`, `SqlImportOptions`, `XsdImportOptions` — plain TS interfaces today), but the dialog has no UI to set anything beyond `namespace`.
- The merge collision rule (`mergeImportedText` in `apps/studio/src/shell/import-merge.ts`) is hard-coded to "keep existing, skip incoming" — there is no way to instead overwrite the existing declaration or keep both under different names.

Separately: **the "merging only checks open files" gap raised alongside this does not exist.** `ExplorePerspective.tsx`'s `namespaceToFile` (line ~922) is built from `resolvedModelFiles`, which comes from the studio's `files`/`models` state — populated by `parseWorkspaceFiles`, whose own docstring is "Parse all files in the workspace and return models." There is no tab-open filtering anywhere in this path; every workspace file is parsed and namespace-indexed regardless of whether it has an editor tab open. The original design doc's "Explicitly Out of Scope" bullet describing this as deferred was inaccurate relative to the shipped implementation — corrected in this doc's [Corrections](#corrections-to-the-original-design-doc) section below.

## Goal

1. Give each reader a real, user-configurable options object — authored as a Zod schema (not a plain interface) so it can be rendered as a form in the dialog via the existing `?z2f` Vite-plugin mechanism, mirroring the already-shipped `ExcelOptionsSchema`/`ExcelOptionsFormAdapter` pattern used for Export.
2. Make the merge collision strategy configurable (skip / overwrite / rename), instead of the current hard-coded skip-only behavior.
3. Correct the stale "closed files aren't checked" claim in the original design doc.

## Reader Options — New Zod Schemas

New files in `packages/codegen/src/options/`, one per reader, each exporting `{Format}ImportOptionsSchema = z.object({...})` and `type {Format}ImportOptions = z.infer<typeof {Format}ImportOptionsSchema>` — exactly the `ExcelOptionsSchema` recipe. These **replace** the current hand-written interfaces in each reader's own source file (the reader imports its options type from the new schema module instead of declaring it locally) — single source of truth, no duplication.

Every proposed field's *default* preserves the reader's exact current behavior — enabling the new options changes nothing until a user actively opts in.

### `json-schema-import-options.ts`

```ts
export const JsonSchemaImportOptionsSchema = z.object({
  skipConditions: z.boolean().optional().default(false)
    .describe('Structural import only — never populate constraints arrays.'),
  includeUnreferencedDefs: z.boolean().optional().default(true)
    .describe('Import every $defs/definitions entry (current behavior). Turn off to only import defs transitively referenced from the root schema.')
});
```

Grounded in `readJsonSchema` (`json-schema-reader.ts:132-169`): today it unconditionally imports every `$defs`/`definitions` entry with no reachability check — `includeUnreferencedDefs: true` is that exact behavior, made explicit and toggleable.

### `openapi-import-options.ts`

```ts
export const OpenApiImportOptionsSchema = JsonSchemaImportOptionsSchema.extend({
  includeOperations: z.boolean().optional().default(true)
    .describe('Convert OpenAPI paths into Rune functions (current behavior). Turn off to import types/enums only.')
});
```

Grounded in `readOpenApi` (`openapi-reader.ts:96-137`): it delegates schema conversion to `readJsonSchema` after normalizing `components.schemas`, then separately always calls `readOperations` on `document.paths`. Note: `readOpenApi` does **not** extract inline (non-`components.schemas`) request/response schemas as named types today — there is no existing "inline schema" capability to expose a toggle for, so no such field is proposed (an earlier draft of this design assumed one existed; verified against the source and dropped).

### `sql-import-options.ts`

```ts
export const SqlImportOptionsSchema = z.object({
  dialect: z.enum(['postgres', 'sqlserver']).optional().default('postgres'),
  skipConditions: z.boolean().optional().default(false)
});
```

No node-kind filter proposed. SQL DDL is already flat — one declaration per `CREATE TABLE` — there is no other top-level construct kind `readSql` distinguishes today. (`wasmSource` stays out of the schema/form entirely — it is an internal browser-loading override, not a user-facing setting.)

### `xsd-import-options.ts`

```ts
export const XsdImportOptionsSchema = z.object({
  skipConditions: z.boolean().optional().default(false),
  importTopLevelElements: z.boolean().optional().default(false)
    .describe('Also import top-level xs:element declarations as standalone types. Off by default (current behavior): top-level elements are only used for ref= resolution and diagnostics, never emitted as their own declaration.')
});
```

Grounded in `readXsd` (`xsd-reader.ts:814-937`): `types` is built only from top-level `xs:complexType` (line 904); `topLevelElementList` (line 896-899) is used solely for `ref=` lookups and abstract/substitutionGroup diagnostics (lines 916-931) — never converted into its own `SourceType`. `importTopLevelElements: false` is that exact current behavior.

`namespace` is **not** part of any of these schemas — it stays exactly where it is today, its own dedicated `Input` field in the dialog, independent of the options form.

## Merge Options — New, Studio-Local (not a codegen package concern)

Collision strategy is a property of *merging into an existing file*, not of any reader — the reader has already finished by the time a collision is even detected. This is a studio-only concept, not exported from `@rune-langium/codegen`.

**New**: `apps/studio/src/shell/import-merge-options.ts`

```ts
export const MergeOptionsSchema = z.object({
  onCollision: z.enum(['skip', 'overwrite', 'rename']).optional().default('skip')
    .describe('skip: keep the existing declaration, drop the incoming one (current, only behavior). overwrite: replace the existing declaration with the incoming one. rename: keep both, renaming the incoming declaration.')
});
export type MergeOptions = z.infer<typeof MergeOptionsSchema>;
```

`mergeImportedText(existingText, importedText, options?: MergeOptions)` gains a third, optional parameter (defaulting to `{ onCollision: 'skip' }` — today's exact behavior is preserved when the caller passes nothing).

- **`skip`** (current, unchanged): keep the existing element's span, drop the incoming one, report it in `skipped`.
- **`overwrite`**: drop the *existing* element's span instead, splice the incoming element's span in its place (same end position in the target file, not appended at the end) — reported separately from `skipped`, e.g. a new `overwritten: string[]` field on `MergeResult`.
- **`rename`**: keep both. The incoming element's declaration-name token is rewritten to avoid the collision (a numeric suffix, matching `uniqueFilePath`'s existing `-2`/`-3` convention applied to a *name* instead of a *path*) before its span is appended. This is a deliberate, narrow exception to the original design's "never rewrites an existing declaration's body" invariant — it rewrites the *incoming* declaration's own name token only (never the existing file's content, never anything inside either declaration's body).

## Dialog UI

- One z2f-generated options form per format, swapped when the format `Select` changes — same `{value, onChange}` adapter contract as `ExcelOptionsFormAdapter`.
- **Isolation constraint (carried over from the Excel precedent):** `ImportDialog.tsx` must **not** import any `?z2f`-suffixed module directly — `ImportDialog.test.tsx` runs under plain vitest, which does not apply the Vite plugin transform, exactly the constraint documented in `ExcelOptionsFormAdapter.tsx`'s own header comment ("MUST NOT be imported from the modal or from any test that exercises the modal in isolation"). Concretely: `ImportDialog` receives a prop mapping format → adapter component (e.g. `optionsFormsByFormat: Record<ImportFormat, React.ComponentType<{ value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }>>`), and `ExplorePerspective.tsx` (the existing mount site, already the "wiring site" pattern used for `DownloadConfigDialog`/`CodePreviewPanel`) is the one place that statically imports all 4 `?z2f` adapters and passes the map down. This keeps every `?z2f` import out of `ImportDialog.tsx`'s own module graph, so its test file is unaffected.
- One always-visible "On collision" `Select` (skip / overwrite / rename) next to the format/namespace row, defaulting to `skip`.
- `handlePreview` threads the format's current options object into `importModel(sourceText, { from: format, namespace, ...formatOptions })`. `mergeImportedText` receives the collision-strategy value from the always-visible selector.

## Testing

- `packages/codegen/test/options/{format}-import-options.test.ts` (×4, new) — schema parses defaults correctly; each default matches the reader's pre-existing behavior (round-trip test: default options produce byte-identical output to calling the reader with no options object at all, for each existing reader fixture).
- `packages/codegen/test/import/{format}-reader.test.ts` (existing, extended) — one new case per new option per reader, exercising the non-default value (e.g. `includeUnreferencedDefs: false` actually narrows the def set; `importTopLevelElements: true` actually produces a new type).
- `apps/studio/test/shell/import-merge.test.ts` (existing, extended) — `overwrite` and `rename` cases per collision scenario (single collision, all-collide), asserting `MergeResult`'s new `overwritten`/renamed-name shape.
- `apps/studio/test/components/ImportDialog.test.tsx` (existing, extended) — the options-forms prop is supplied as a plain mock component map (no `?z2f` involved), collision-strategy selector wiring, options object correctly threaded into the mocked `importModel`/`mergeImportedText` calls.
- No dedicated test for the 4 `?z2f` re-export `.schema.ts` files, matching `excel-options.schema.ts`'s precedent (thin re-exports, no logic).

## Corrections to the Original Design Doc

`docs/superpowers/specs/2026-07-06-explorer-import-dialog-design.md`'s "Explicitly Out of Scope (v1)" section states: *"Merging into a file that ISN'T currently open in the workspace ... deferred; scanning every closed file's namespace on each keystroke is unnecessary complexity for a first cut."* This is incorrect relative to what shipped: `namespaceToFile` is built from the studio's full workspace file list (every file is parsed regardless of tab state — see `parseWorkspaceFiles`'s docstring, "Parse all files in the workspace and return models"), not filtered to open tabs. This bullet will be struck from that doc as part of this change, with a one-line note pointing here.

## Explicitly Out of Scope (this increment)

- A dynamic "pick which items to import from what's found in the source" flow — considered and rejected in favor of static, content-independent classification options (per-your-choice), consistent with the dialog's existing single-shot Preview flow.
- Per-format options beyond the 4 fields above (e.g. XSD namespace-prefix handling, JSON Schema `$ref` resolution depth) — not requested, and each would need its own grounding pass against the reader's actual behavior before being proposed.
- Any change to `mergeImportedText`'s span-splice mechanics for the `skip` path — unchanged.
