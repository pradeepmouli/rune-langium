# Tasks: Adopt generated form surfaces and zod-form runtime

**Input**: Design documents from `/specs/006-adopt-zod-to-form/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

## Constitution Check

- [x] CC-001 Conformance artifact (`zod-schemas.conformance.ts`) serves as built-in schema/model parity check — verified by `tsc --noEmit` (T013–T014)
- [x] CC-002 Validation parity preserved: `ExternalDataSync` with `keepDirtyValues` replicates `useNodeForm` external-update semantics exactly (T031); cross-ref factory `.refine()` preserves reference validation
- [ ] CC-003 No parser changes in this feature — benchmark tasks not required
- [x] CC-004 Backward-compatible migration: `EnumFormProps` interface unchanged (T033); hand-authored forms coexist until full migration (T029); `./components` and `./styles.css` exports are strictly additive

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete-task dependencies)
- **[Story]**: User story label [US1]–[US4]
- Exact file paths required in all task descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Package dependency updates and directory scaffolding required before any feature work begins

- [ ] T001 Add `"@zod-to-form/react": "*"` to `dependencies` in `packages/visual-editor/package.json`
- [ ] T002 Confirm `"@zod-to-form/cli": "*"` is present in `devDependencies` in `packages/visual-editor/package.json`; run `pnpm install` from repo root and verify both `@zod-to-form/react` and `@zod-to-form/cli` resolve without errors
- [ ] T003 [P] Create `packages/visual-editor/src/generated/` directory; add `.gitkeep` so it is tracked before generation runs
- [ ] T004 [P] Create `packages/visual-editor/src/components/forms/generated/` directory; add `.gitkeep` so it is tracked before scaffolding runs
- [ ] T005 [P] Create `packages/visual-editor/src/components/forms/` directory to hold shared utilities (`MapFormRegistry`, `ExternalDataSync`)

**Checkpoint**: All target directories exist; `pnpm install` resolves `@zod-to-form/react` and `@zod-to-form/cli`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Confirm actual Rune grammar field names before authoring any config — every downstream phase depends on correct field names

**⚠️ CRITICAL**: Grammar field name verification must complete before `form-surfaces.json` or `component-config.ts` can be correctly authored

- [ ] T006 Read `packages/core/src/grammar/rune.langium` (or equivalent `.langium` file) and record the exact property names for: `RosettaEnumeration` (e.g. `name`, `superEnum`, `enumValues`), `Data` (e.g. `name`, `superType`, `description`, `attributes`), `Attribute` (e.g. `name`, `typeCall`, `card`), `RosettaFunction` (e.g. `name`, `outputType`, `parameters`), `ChoiceType` (e.g. `name`, `superType`, `options`) — note confirmed names as a comment block in `packages/visual-editor/form-surfaces.json` once created
- [ ] T007 Read `packages/core/src/generated/ast.ts` and cross-reference TypeScript property names for each grammar type against the names recorded in T006; note any discrepancies that would affect `form-surfaces.json` or `component-config.ts` field paths

**Checkpoint**: Grammar field names confirmed and documented — config authoring can now begin

---

## Phase 3: User Story 1 — Generate form-surface schemas from DSL sources (Priority: P1) 🎯 MVP

**Goal**: `pnpm generate:schemas` produces `src/generated/zod-schemas.ts` (projected form-surface schemas with `create*Schema(refs)` cross-ref factories) and `src/generated/zod-schemas.conformance.ts` (compile-time drift detection) from the Rune DSL grammar.

**Independent Test**: Run `pnpm generate:schemas` with the projection config; verify generated schemas include only projected fields (no Langium internals), include cross-ref factory variants; run `tsc --noEmit` on the workspace — conformance checks pass for unchanged grammar and fail when an intentional schema/model mismatch is introduced.

### Tests for User Story 1

- [ ] T008 [US1] Before running generation, document the expected shape of `zod-schemas.conformance.ts` as inline comments at the top of `packages/visual-editor/form-surfaces.json`: list which grammar types should have conformance assertions and which fields should appear — acts as a pre-generation specification to compare against actual output

### Implementation for User Story 1

- [ ] T009 [US1] Create `packages/visual-editor/form-surfaces.json`: set `defaults.strip` to `["$container", "$document", "$cstNode", "$containerProperty", "$containerIndex"]`; add `types` entries for `RosettaEnumeration`, `Data`, `Attribute`, `RosettaFunction`, `ChoiceType` using confirmed field names from T006
- [ ] T010 [US1] Add `"generate:schemas"` script to `packages/visual-editor/package.json`: `langium-zod generate --out src/generated/zod-schemas.ts --projection form-surfaces.json --cross-ref-validation --conformance --ast-types src/generated/ast.ts`
- [ ] T011 [US1] Run `pnpm --filter @rune-langium/visual-editor generate:schemas` and verify: (a) `packages/visual-editor/src/generated/zod-schemas.ts` is created, (b) `packages/visual-editor/src/generated/zod-schemas.conformance.ts` is created, (c) Langium internal fields (`$container`, `$cstNode`, `$document`, `$containerProperty`, `$containerIndex`) are absent from every generated schema
- [ ] T012 [US1] Inspect `packages/visual-editor/src/generated/zod-schemas.ts` and verify: `createRosettaEnumerationSchema(refs?)` function is exported, `RosettaEnumerationSchemaRefs` interface is exported, equivalent factory and refs interface exist for each grammar type that has cross-reference fields
- [ ] T013 [US1] Run `pnpm --filter @rune-langium/visual-editor type-check` and confirm `src/generated/zod-schemas.conformance.ts` compiles without TypeScript errors (SC-003 baseline)
- [ ] T014 [US1] Verify conformance drift detection: temporarily add a non-existent field name to one `types` entry in `form-surfaces.json`, re-run `generate:schemas`, confirm `tsc --noEmit` reports a type error in the conformance file; revert the field name and confirm type-check passes again (SC-003 fail/pass cycle)

**Checkpoint**: `pnpm generate:schemas` runs cleanly; generated schemas contain only projected fields with cross-ref factories; `tsc --noEmit` passes on conformance artifact; drift detection verified

---

## Phase 4: User Story 2 — Configure reusable form widgets (Priority: P1)

**Goal**: `@rune-langium/visual-editor/components` subpath resolves at both type and runtime levels; `component-config.ts` maps `cross-ref` → `TypeSelector` and `cardinality` → `CardinalityPicker`; invalid widget names produce TypeScript compile errors.

**Independent Test**: Resolve the `./components` subpath from a TypeScript import and at runtime after build; add a valid widget name to `component-config.ts` and confirm compile passes; add an invalid widget name and confirm compile fails (FR-008).

### Tests for User Story 2

- [ ] T015 [US2] Write a vitest test in `packages/visual-editor/test/components-subpath.test.ts` that imports `{ TypeSelector, CardinalityPicker }` from `@rune-langium/visual-editor/components` and asserts both are non-null functions — write before implementation (will fail until subpath is wired and built)

### Implementation for User Story 2

- [ ] T016 [P] [US2] Create `packages/visual-editor/src/components.ts`: add `export { TypeSelector } from './components/editors/TypeSelector.js'` and `export { CardinalityPicker } from './components/editors/CardinalityPicker.js'` — this is the `./components` subpath entry module
- [ ] T017 [P] [US2] Add `"./components"` entry to `exports` map in `packages/visual-editor/package.json`: `{ "types": "./dist/components.d.ts", "default": "./dist/components.js" }`; confirm existing `.` and `"./styles.css"` entries are unchanged
- [ ] T018 [US2] Run `pnpm --filter @rune-langium/visual-editor build` and confirm `dist/components.js` and `dist/components.d.ts` are produced in `packages/visual-editor/dist/`; confirm existing `dist/index.js` is unchanged
- [ ] T019 [US2] Create `packages/visual-editor/component-config.ts`: import `ZodToFormComponentConfig` type from `@zod-to-form/cli`; define `type VisualModule = typeof import('@rune-langium/visual-editor/components')`; map `fieldTypes: { 'cross-ref': { component: 'TypeSelector' }, 'cardinality': { component: 'CardinalityPicker' } }`; add `fields` entries using confirmed grammar field path names (e.g. `enumForm.superEnum`, `attributeForm.typeCall`, etc.) from T006; export as `satisfies ZodToFormComponentConfig<VisualModule>`
- [ ] T020 [US2] Run `pnpm --filter @rune-langium/visual-editor type-check` and confirm `component-config.ts` compiles without errors
- [ ] T021 [US2] Verify compile-time widget name rejection: temporarily change one `component:` value in `component-config.ts` to `'BadWidget'`; confirm `tsc --noEmit` reports a type error; revert and confirm it passes (FR-008 verification)
- [ ] T022 [US2] Run `pnpm --filter @rune-langium/visual-editor test` and confirm T015 (`components-subpath.test.ts`) passes after T018 build

**Checkpoint**: `./components` subpath resolves at type and runtime; `component-config.ts` compiles; invalid widget names are caught at compile time

---

## Phase 5: User Story 3 — Generate auto-save form components (Priority: P1)

**Goal**: `pnpm scaffold:forms` produces committed form components in `src/components/forms/generated/` with auto-save `onValueChange` prop, `TypeSelector`/`CardinalityPicker` imports for mapped fields, and no submit button.

**Independent Test**: Run `pnpm scaffold:forms`; verify generated files contain `onValueChange` prop, import custom widgets for mapped fields, omit submit button, and use default `<input>` for unmapped fields; generated files compile without TypeScript errors.

**Prerequisite**: US1 (schemas) and US2 (component config + subpath) must be complete.

### Tests for User Story 3

- [ ] T023 [US3] Write a vitest test in `packages/visual-editor/test/generated-forms.test.tsx` that renders the generated `RosettaEnumerationForm` component in jsdom with a mock `onValueChange` prop and asserts it renders without errors — write before scaffold runs (will fail until T025 produces the file)

### Implementation for User Story 3

- [ ] T024 [US3] Replace the existing `scaffold:forms` script in `packages/visual-editor/package.json` with: `"scaffold:forms": "pnpm scaffold:enumForm && pnpm scaffold:dataTypeForm"`; add `"scaffold:enumForm"`: `"zod-to-form generate --schema src/generated/zod-schemas.ts --export RosettaEnumerationSchema --out src/components/forms/generated --mode auto-save --component-config component-config.ts"`; add `"scaffold:dataTypeForm"`: `"zod-to-form generate --schema src/generated/zod-schemas.ts --export DataSchema --out src/components/forms/generated --mode auto-save --component-config component-config.ts"`
- [ ] T025 [US3] Run `pnpm --filter @rune-langium/visual-editor scaffold:forms` and verify: no errors; `packages/visual-editor/src/components/forms/generated/RosettaEnumerationForm.tsx` is produced; `packages/visual-editor/src/components/forms/generated/DataForm.tsx` is produced
- [ ] T026 [US3] Inspect `packages/visual-editor/src/components/forms/generated/RosettaEnumerationForm.tsx` and verify: `onValueChange` prop is present in the component's props interface; `TypeSelector` is imported from `@rune-langium/visual-editor/components` for the cross-ref parent field; `CardinalityPicker` is imported for any cardinality fields; no submit button pattern (`<button type="submit">` or `onSubmit=`) exists in the output; unmapped fields use standard `<input>` elements (SC-001, FR-010, FR-011)
- [ ] T027 [US3] Run `pnpm --filter @rune-langium/visual-editor type-check` and confirm generated form components in `src/components/forms/generated/` compile without TypeScript errors; run T023 test and confirm it passes

**Checkpoint**: `pnpm scaffold:forms` produces valid auto-save form components with correct widget imports; components compile cleanly; T023 passes

---

## Phase 6: User Story 4 — Migrate one existing form safely (Priority: P2)

**Goal**: `EnumForm` uses `ZodForm` internally while preserving all existing behavior; `EnumFormProps` interface is unchanged; hand-authored forms (`ChoiceForm`, `DataTypeForm`, `FunctionForm`) continue to function.

**Independent Test**: Verify name/parent auto-save with 500ms debounce; verify external data changes (undo/redo) update pristine fields without overwriting dirty ones; verify list-style member editing works; verify non-migrated forms show no regressions.

**Prerequisite**: US1 must be complete (`createRosettaEnumerationSchema` factory required for narrowed schema).

### Tests for User Story 4

- [ ] T028 [P] [US4] Write vitest test in `packages/visual-editor/test/EnumForm.test.tsx`: (a) render `EnumForm` with a mock `data` prop; (b) simulate name input change; (c) verify `actions.renameType` is NOT called immediately (debounce active); (d) advance fake timers by 500ms; (e) verify `actions.renameType` IS called with trimmed name; (f) change `data` prop reference with a new value while name field is dirty; (g) verify dirty name field value is NOT overwritten (FR-014, FR-016) — write before migration (will fail until T032)
- [ ] T029 [P] [US4] Write vitest smoke test in `packages/visual-editor/test/non-migrated-forms.test.tsx`: render `ChoiceForm`, `DataTypeForm`, and `FunctionForm` with minimal mock props; assert each renders without throwing; assert they accept their original prop shapes — write before migration (should pass already; used as regression guard for FR-017)

### Implementation for User Story 4

- [ ] T030 [US4] Create `packages/visual-editor/src/components/forms/MapFormRegistry.ts`: implement `ZodFormRegistry` interface from `@zod-to-form/core` using a `Map<ZodType, FormMeta>`; add `add(schema, meta): this`, `get(schema): FormMeta | undefined`, and `has(schema): boolean` methods
- [ ] T031 [US4] Create `packages/visual-editor/src/components/forms/ExternalDataSync.tsx`: generic `ExternalDataSync<T extends FieldValues>` component that accepts `{ data: unknown; toValues: () => T }` props; uses `useFormContext<T>()` to call `form.reset(toValues(), { keepDirtyValues: true })` only when the `data` reference changes via `useEffect` with ref-equality check; renders `null`
- [ ] T032 [US4] Migrate `packages/visual-editor/src/components/editors/EnumForm.tsx`: (a) remove `useNodeForm`, `FormProvider`, and `Controller` imports; (b) add `ZodForm` from `@zod-to-form/react`; (c) compute `enumCoreSchema` via `useMemo(() => createRosettaEnumerationSchema({ RosettaEnumeration: validParentNames }).pick({ name: true, superEnum: true }), [validParentNames])`; (d) instantiate `MapFormRegistry` and register `TypeSelector` render override for the `superEnum`/parent schema field; (e) replace `<FormProvider {...form}>` with `<ZodForm schema={enumCoreSchema} defaultValues={...} onValueChange={handleNameParentCommit} mode="onChange" formRegistry={formRegistry}>`; (f) add `<ExternalDataSync data={data} toValues={() => ({ name: data.name, superEnum: data.superEnum })} />` as a child; (g) keep `useFieldArray` for `enumValues` via `useFormContext()` from ZodForm's FormProvider; (h) keep all store-action callbacks, annotation callbacks, metadata callbacks, and all child section components unchanged
- [ ] T033 [US4] Verify `EnumFormProps` interface is unchanged: confirm exported type in `packages/visual-editor/src/components/editors/EnumForm.tsx` still has exactly `{ nodeId: string; data: TypeNodeData<'enum'>; availableTypes: TypeOption[]; actions: EditorFormActions<'enum'>; inheritedGroups?: InheritedGroup[] }` — no added, removed, or changed props (FR-013)
- [ ] T034 [US4] Run `pnpm --filter @rune-langium/visual-editor type-check` and confirm migrated `EnumForm.tsx`, `MapFormRegistry.ts`, and `ExternalDataSync.tsx` all compile without TypeScript errors
- [ ] T035 [US4] Run `pnpm --filter @rune-langium/visual-editor test` and verify T028 (`EnumForm.test.tsx`) and T029 (`non-migrated-forms.test.tsx`) both pass (SC-005, SC-006, SC-007)
- [ ] T036 [US4] Manual smoke verification in the studio app: open the editor with an enum node; confirm `EnumForm` renders; edit the name field and wait 500ms to confirm auto-save fires; select a parent enum via `TypeSelector` and confirm it commits immediately; add and remove an enum value and confirm list editing works; open a non-migrated form and confirm it still functions

**Checkpoint**: `EnumForm` migrated to `ZodForm`; T028 and T029 pass; `EnumFormProps` unchanged; non-migrated forms unaffected

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: CI enforcement, build hygiene, and final end-to-end validation

- [ ] T037 Add `check-generated` job to `.github/workflows/ci.yml`: steps — (1) `actions/checkout@v4`, (2) `pnpm/action-setup@v4`, (3) `pnpm install --frozen-lockfile`, (4) `pnpm --filter @rune-langium/visual-editor generate:schemas`, (5) `pnpm --filter @rune-langium/visual-editor scaffold:forms`, (6) `git diff --exit-code` — job fails if any committed generated file differs from freshly-regenerated output (FR-018, SC-008)
- [ ] T038 [P] Remove `.gitkeep` files from `packages/visual-editor/src/generated/` and `packages/visual-editor/src/components/forms/generated/` now that real generated files occupy those directories
- [ ] T039 [P] Run `pnpm lint` across the full monorepo and fix any lint errors introduced by new source files (`components.ts`, `component-config.ts`, `MapFormRegistry.ts`, `ExternalDataSync.tsx`)
- [ ] T040 [P] Verify `packages/visual-editor/package.json` `"files"` array includes paths needed to publish `dist/components.js`, `dist/components.d.ts`, and any generated source files that consumers may need
- [ ] T041 Full end-to-end regeneration smoke test: run `pnpm --filter @rune-langium/core generate` → `pnpm --filter @rune-langium/visual-editor generate:schemas` → `pnpm --filter @rune-langium/visual-editor scaffold:forms` → assert `git diff --exit-code` exits 0 on a clean committed state (local mirror of SC-008 CI check)
- [ ] T042 [P] Run `pnpm --filter @rune-langium/visual-editor build` end-to-end and confirm the full package builds cleanly; verify `dist/` contains `index.js`, `index.d.ts`, `components.js`, `components.d.ts`, and `styles.css`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories**
- **US1 (Phase 3)**: Depends on Foundational — generates schemas consumed by US3 and US4
- **US2 (Phase 4)**: Depends on Foundational — can run **in parallel with US1**
- **US3 (Phase 5)**: Depends on **both US1 and US2** (needs generated schemas + component config)
- **US4 (Phase 6)**: Depends on US1 (`createRosettaEnumerationSchema` factory required); soft dependency on US2 (TypeSelector wiring)
- **Polish (Phase 7)**: Depends on all user stories complete

### User Story Dependencies

| Story | Depends On | Notes |
|---|---|---|
| US1 | Foundational | Independent of US2 |
| US2 | Foundational | Independent of US1 — run in parallel |
| US3 | US1 + US2 | Needs schemas (US1) and component config (US2) |
| US4 | US1 (required), US2 (soft) | Needs `createRosettaEnumerationSchema`; TypeSelector wiring needs `./components` build |

### Within Each User Story

- Document/verify inputs before authoring configs (T006–T007 before T009)
- Config authoring before running generation (T009 before T010–T011)
- Generation runs before output inspection (T011 before T012–T014)
- Type-check passes before migration proceeds (T020 before T032)
- Tests written before implementation tasks that satisfy them (TDD per constitution)

---

## Parallel Opportunities

### Phase 1 (T003, T004, T005 simultaneously)
```
T003: Create src/generated/           [independent]
T004: Create forms/generated/         [independent]
T005: Create forms/ shared utilities  [independent]
```

### US1 + US2 simultaneously (after Phase 2)
```
Stream A (US1): T008 → T009 → T010 → T011 → T012 → T013 → T014
Stream B (US2): T015 → T016, T017 → T018 → T019 → T020 → T021 → T022
```

### Phase 6 tests (T028, T029 simultaneously)
```
T028: EnumForm behavior test        [different file]
T029: Non-migrated forms regression [different file]
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T005)
2. Complete Phase 2: Foundational — field name verification (T006–T007)
3. Complete Phase 3: US1 — Schema generation pipeline (T008–T014)
4. **STOP and VALIDATE**: `pnpm generate:schemas` runs clean; conformance passes; cross-ref factories present
5. Schemas are now available as foundation for US3 and US4

### Incremental Delivery

1. Setup + Foundational → Dependencies resolved, field names confirmed
2. US1 + US2 in parallel → Schemas generated, component widget surface wired
3. US3 → Auto-save form scaffolding complete end-to-end
4. US4 → `EnumForm` migrated with full behavior parity
5. Polish → CI enforcement, lint, build verification, end-to-end smoke

### Parallel Team Strategy (two developers, post-Foundational)

```
Developer A: US1 (T008–T014) — schema generation pipeline
Developer B: US2 (T015–T022) — component subpath + component config

→ Both complete → merge →

Either developer: US3 (T023–T027) — form scaffolding
Then:            US4 (T028–T036) — EnumForm migration
Then:            Polish (T037–T042)
```

---

## Notes

- **[P]** tasks operate on different files with no cross-dependencies — safe to parallelize
- **[Story]** labels map each task to the user story it satisfies for traceability
- Grammar field names (T006–T007) are the most critical blocking research — wrong names cascade into all configs
- The `langium-zod` local-link risk: if CI cannot resolve the local file path, the `check-generated` job (T037) may need to be scoped to `scaffold:forms` only until `langium-zod` is published to npm
- Commit after each phase checkpoint to minimize risk of context loss
- Do not delete `src/schemas/form-schemas.ts` — it remains active for non-migrated forms
