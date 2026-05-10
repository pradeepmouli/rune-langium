# @rune-langium/visual-editor

## 0.2.0

### Minor Changes

- [#106](https://github.com/pradeepmouli/rune-langium/pull/106) [`e199ec7`](https://github.com/pradeepmouli/rune-langium/commit/e199ec7dcd462c8396dd74bcab3aefc585ac7e69) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - Migrate visual-editor forms (DataType, Choice, Function, Enum, TypeAlias) to
  `@zod-to-form` primitives.

  **Schema canonicalisation (R1, R11, FR-008)** — every form now drives
  `useZodForm()` with the langium-generated AST schemas
  (`DataSchema`, `ChoiceSchema`, `RosettaEnumerationSchema`,
  `RosettaFunctionSchema`, `RosettaTypeAliasSchema`) directly. The graph
  node passes through as `defaultValues` via `identityProjection<S>(node)`
  (no transformation layer). The hand-authored projection schemas in
  `src/schemas/form-schemas.ts` have been **deleted** along with their tests
  and every `toFormValues`/`toDefaults` helper across the editors directory.

  **New upstream-primitive adoptions** (require `@zod-to-form/{core,react}@^0.8.0`):

  - `useExternalSync(form, data, identityProjection, { keepDirty: true })` —
    replaces the deleted `ExternalDataSync.tsx` component
  - `arrayConfig.before` ghost-row primitive — renders inherited attribute
    rows above local rows in `DataTypeForm` (replaces the `effectiveAttributes`
    discriminating loop)
  - `arrayConfig.reorder: true` — declarative reorder enabled on
    `DataTypeForm`'s `attributes[]`; the existing `AttributeRow` native-DnD
    handlers continue to provide the gesture surface
  - `formRegistry: z.registry<FormMeta>()` with `FormMeta.render` registrations
    for `AttributeRow`, `ChoiceOptionRow`, `EnumValueRow`, and the new
    extracted `FunctionInputRow` against their AST item schemas

  **New section dispatch (R2, US5)** — `AnnotationSection`, `ConditionSection`,
  `MetadataSection` are now resolved declaratively via the `section:` config
  in `z2f.config.ts` and a new `EditorActionsContext` that bridges the
  declarative dispatch to the existing `EditorFormActions` contract.

  **Other deletions**:

  - `packages/visual-editor/src/components/forms/ExternalDataSync.tsx` (65 LOC)
  - `packages/visual-editor/src/components/forms/MapFormRegistry.ts` (~50 LOC)
  - `packages/visual-editor/src/schemas/form-schemas.ts` (147 LOC)
  - `packages/visual-editor/test/schemas/form-schemas.test.ts` (~280 LOC)

  **Other additions**:

  - `packages/visual-editor/src/components/editors/identity-projection.ts`
  - `packages/visual-editor/src/components/editors/FunctionInputRow.tsx`
  - `packages/visual-editor/src/components/forms/sections/{EditorActionsContext,index}.tsx`
  - `packages/visual-editor/src/components/forms/rows/{index,RowDispatchContext}.tsx`

  **Contract preserved**: `EditorFormActions` byte-identical (FR-002 — zero
  graph-action contract changes). 651 of 651 visual-editor tests passing.
  Workspace `pnpm run type-check` clean.

  **Spec status**:

  - ✅ FR-002 (action contract preserved)
  - ✅ FR-003 (reorder works via z2f primitive)
  - ✅ FR-004 (inherited rows via ghost-row primitive)
  - ✅ FR-005 (sections declarative via section: config)
  - ✅ FR-006 (row renderers via FormMeta.render)
  - ✅ FR-007 (external-data sync via useExternalSync; no manual reset wiring)
  - ✅ FR-008 (single canonical schema source — AST schemas; projections deleted)
  - ✅ FR-009 (no remaining hand-rolled `<Controller>` cascades for fields the
    form host renders)
  - ✅ FR-010 (bespoke editor UX preserved: type-link nav, type-creator,
    cardinality picker, expression-builder slot)
  - ✅ FR-012 (end-user behaviour unchanged; 651/651 tests still pass)
  - ❌ FR-011 / SC-001 (LOC reduction ≥25%): NOT met. Net change is +184 LOC
    (+3%). See `specs/013-z2f-editor-migration/loc-report.md` for the
    per-file analysis and a follow-up sketch.
