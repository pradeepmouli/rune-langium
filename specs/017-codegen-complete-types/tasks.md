# Tasks: Complete Codegen for Missing Rune Types

**Input**: Design documents from `/specs/017-codegen-complete-types/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Byte-identical fixture tests are REQUIRED per FR-019 and the project constitution (Principle II). All new codegen output must have corresponding test fixtures.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US8)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Scaffolding and shared infrastructure for all new codegen constructs

- [x] T001 Create `RuneTypeAlias` type representation in packages/codegen/src/types/type-alias.ts
- [x] T002 [P] Create `RuneRule` type representation in packages/codegen/src/types/rule.ts
- [x] T003 [P] Create `RuneReport` type representation in packages/codegen/src/types/report.ts
- [x] T004 [P] Create `RuneAnnotationDecl` type representation in packages/codegen/src/types/annotation.ts
- [x] T005 [P] Create `RuneLibraryFunc` type representation in packages/codegen/src/types/library-func.ts
- [x] T006 Export all new types from packages/codegen/src/index.ts
- [x] T007 Add `kind` discriminator field (`'data' | 'typeAlias' | 'choice' | 'function'`) to `FormPreviewSchema` in packages/codegen/src/types.ts

---

## Phase 2: Foundational — Namespace Registry (Blocking)

**Purpose**: Cross-namespace import resolution foundation — MUST complete before user story phases

**CRITICAL**: No cross-namespace codegen can work without this phase

- [x] T008 Create `NamespaceRegistry` and `NamespaceManifest` types in packages/codegen/src/emit/namespace-registry.ts
- [x] T009 Implement `buildNamespaceRegistry()` that scans all grouped documents and builds per-namespace manifests (exported data/enum/func/rule/typeAlias/annotation names + relative output path) in packages/codegen/src/emit/namespace-registry.ts
- [x] T010 Implement `resolveImportPath(fromNamespace, toNamespace, registry)` utility in packages/codegen/src/emit/namespace-registry.ts
- [x] T011 Modify `runGenerate()` in packages/codegen/src/generator.ts to call `buildNamespaceRegistry()` after `groupByNamespace()` and pass registry to each per-namespace emitter call
- [x] T012 Add `registry: NamespaceRegistry` field to `EmissionContext` in packages/codegen/src/emit/zod-emitter.ts and accept it in `buildEmissionContext()`
- [x] T013 [P] Add `registry: NamespaceRegistry` field to `EmissionContext` in packages/codegen/src/emit/ts-emitter.ts and accept it in `buildEmissionContext()`
- [x] T014 [P] Add `registry: NamespaceRegistry` field to `EmissionContext` in packages/codegen/src/emit/json-schema-emitter.ts and accept it in `buildEmissionContext()`
- [x] T015 Extend `buildEmissionContext()` in all three emitters to collect `isRosettaTypeAlias()`, `isRosettaRule()`, `isRosettaReport()`, `isAnnotation()`, `isRosettaExternalFunction()` elements into new context maps (`typeAliasByName`, `rulesByName`, `reportsByName`, `annotationsByName`, `libraryFuncsByName`)

**Checkpoint**: Registry infrastructure ready. All emitters receive cross-namespace context. No output changes yet — existing tests must still pass.

---

## Phase 3: User Story 1 — Type Alias Codegen (Priority: P1) MVP

**Goal**: Emit TypeScript type alias declarations and Zod schemas for every `typeAlias` in the model.

**Independent Test**: Run codegen against a `.rune` file with `typeAlias Price: number` and verify both TS and Zod output.

### Fixtures for US1

- [x] T016 [P] [US1] Create fixture `packages/codegen/test/fixtures/type-aliases/primitive/input.rune` with primitive type alias (e.g., `typeAlias Price: number`)
- [x] T017 [P] [US1] Create fixture `packages/codegen/test/fixtures/type-aliases/data-ref/input.rune` with type alias referencing a data type
- [x] T018 [P] [US1] Create fixture `packages/codegen/test/fixtures/type-aliases/with-condition/input.rune` with type alias carrying a condition
- [x] T019 [P] [US1] Create fixture `packages/codegen/test/fixtures/type-aliases/chained/input.rune` with chained type aliases (alias → alias → underlying)
- [x] T020 [P] [US1] Create fixture `packages/codegen/test/fixtures/type-aliases/parameterized/input.rune` with parameterized type alias

### Implementation for US1

- [x] T021 [US1] Implement `emitTypeAlias()` in packages/codegen/src/emit/ts-emitter.ts — resolve aliased type, emit `export type Price = number;` for primitives, `export type Foo = BarShape;` for data refs
- [x] T022 [US1] Implement `emitTypeAlias()` in packages/codegen/src/emit/zod-emitter.ts — emit `export const PriceSchema = z.number()` with `.refine()` for conditions
- [x] T023 [US1] Implement type alias support in packages/codegen/src/emit/json-schema-emitter.ts
- [x] T024 [US1] Handle chained alias resolution (alias → alias → underlying) in both emitters
- [x] T025 [US1] Handle parameterized type aliases — TS generics, Zod inlines concrete types
- [x] T026 [US1] Wire type alias emission into `emitNamespace()` in all three emitters — emit after enums, before data types
- [x] T027 [US1] Write expected output files for all fixtures and create `us7-type-aliases.test.ts` in packages/codegen/test/

**Checkpoint**: Type alias codegen works for all three targets. Fixture tests pass byte-identical.

---

## Phase 4: User Story 2 — Rule Codegen (Priority: P1)

**Goal**: Emit TypeScript validation functions and Zod refinements for every `rule` declaration.

**Independent Test**: Run codegen against a `.rune` file with an eligibility rule and verify the TS output includes an executable validation function.

### Fixtures for US2

- [x] T028 [P] [US2] Create fixture `packages/codegen/test/fixtures/rules/eligibility/input.rune` with an eligibility rule
- [x] T029 [P] [US2] Create fixture `packages/codegen/test/fixtures/rules/reporting/input.rune` with a reporting rule
- [x] T030 [P] [US2] Create fixture `packages/codegen/test/fixtures/rules/complex-expr/input.rune` with a rule using complex expressions (navigation, filter, arithmetic)
- [x] T031 [P] [US2] Create fixture `packages/codegen/test/fixtures/rules/multi-rule/input.rune` with multiple rules targeting the same type

### Implementation for US2

- [x] T032 [US2] Implement `extractRules()` in packages/codegen/src/emit/ts-emitter.ts — walk AST `isRosettaRule()` elements, build `RuneRule` representations
- [x] T033 [US2] Implement `emitRule()` in packages/codegen/src/emit/ts-emitter.ts — emit `export function validateRuleName(input: InputType): boolean { return <transpiled expression>; }` for eligibility rules, return extracted value for reporting rules
- [x] T034 [US2] Implement `emitRuleValidator()` in packages/codegen/src/emit/zod-emitter.ts — emit standalone `export const RuleNameValidator = InputTypeSchema.refine(...)` for rules with a Zod-compatible expression
- [x] T035 [US2] Wire rule emission into `emitNamespace()` in both emitters — emit after types and type aliases
- [x] T036 [US2] Write expected output files for all fixtures and create `us8-rules.test.ts` in packages/codegen/test/

**Checkpoint**: Rule codegen works for TS and Zod. Eligibility and reporting rules both emit correctly.

---

## Phase 5: User Story 3 — Form Preview Expansion (Priority: P1)

**Goal**: All Zod-emitting types (data, choice, type alias, rules) appear in Studio form preview panel.

**Independent Test**: Open a workspace with type aliases in Studio, switch to form preview, and verify they render as interactive forms.

### Implementation for US3

- [x] T037 [US3] Extend `generatePreviewSchemas()` in packages/codegen/src/preview-schema.ts to iterate `isRosettaTypeAlias()` elements and produce `FormPreviewSchema` entries with `kind: 'typeAlias'`
- [x] T038 [US3] Extend `generatePreviewSchemas()` to handle `choice` types with `kind: 'choice'` — represent the one-of constraint as a selectable option with nested fields per option
- [x] T039 [US3] Extend `FormPreviewPanel` in apps/studio/src/components/FormPreviewPanel.tsx to render `kind: 'choice'` schemas with radio/select for the choice option
- [x] T040 [US3] Extend `FormPreviewPanel` to display inline validation errors from conditions/refinements on type aliases and choices
- [x] T041 [US3] Extend preview schema test fixtures in packages/codegen/test/ for type aliases and choices

**Checkpoint**: Form preview shows type aliases and choices with validation. Existing data type previews unaffected.

---

## Phase 6: User Story 8 — Cross-Namespace Import Resolution (Priority: P1)

**Goal**: Cross-namespace type references (inheritance, attributes, function params, rules) produce compilable output with correct imports.

**Independent Test**: Run codegen against a multi-namespace model where type A extends type B from another namespace and verify correct import statements.

### Fixtures for US8

- [x] T042 [P] [US8] Create multi-file fixture `packages/codegen/test/fixtures/cross-namespace/inheritance/` with type extending a type from another namespace
- [x] T043 [P] [US8] Create multi-file fixture `packages/codegen/test/fixtures/cross-namespace/attribute-ref/` with attribute referencing a type from another namespace
- [x] T044 [P] [US8] Create multi-file fixture `packages/codegen/test/fixtures/cross-namespace/func-params/` with function referencing types from another namespace
- [x] T045 [P] [US8] Create multi-file fixture `packages/codegen/test/fixtures/cross-namespace/circular/` with circular cross-namespace references (A→B, B→A)

### Implementation for US8

- [x] T046 [US8] Implement `collectCrossNamespaceImports(ctx)` in packages/codegen/src/emit/ts-emitter.ts — walk all type references (data, enum, func, rule, typeAlias) and collect import statements for cross-namespace refs using `resolveImportPath()`
- [x] T047 [US8] Replace `collectFuncCrossNamespaceImports()` stub at ts-emitter.ts:819 with the general `collectCrossNamespaceImports()` call
- [x] T048 [US8] Implement cross-namespace imports in packages/codegen/src/emit/zod-emitter.ts — collect and emit `import { FooSchema } from './path.js'` for cross-namespace schema refs
- [x] T049 [US8] Handle cross-namespace inheritance in TS emitter — emit correct `import` + `extends` clause for cross-namespace parent types
- [x] T050 [US8] Handle cross-namespace inheritance in Zod emitter — emit correct `import` + `.extend()` for cross-namespace parent schemas
- [x] T051 [US8] Handle circular cross-namespace references — detect cycles and use `z.lazy()` / forward declarations as needed
- [x] T052 [US8] Emit diagnostics for unresolvable cross-namespace references (FR-025) instead of silently producing broken output
- [x] T053 [US8] Write expected output files for all cross-namespace fixtures and create `us12-cross-namespace.test.ts` in packages/codegen/test/

**Checkpoint**: Multi-namespace models produce compilable output with correct imports. Circular references handled gracefully.

---

## Phase 7: User Story 4 — Function Calculation Form (Priority: P2)

**Goal**: Function declarations appear in form preview with input forms, "Run" button, and computed output display.

**Independent Test**: Open a workspace with a `func` declaration, fill inputs in form preview, run, and verify output.

### Implementation for US4

- [x] T054 [US4] Extend `generatePreviewSchemas()` in packages/codegen/src/preview-schema.ts to iterate `isRosettaFunction()` elements and produce `FormPreviewSchema` with `kind: 'function'`, input fields from function inputs, and pre/post-condition metadata
- [x] T055 [US4] Add `preview:execute` message type to apps/studio/src/workers/codegen-worker.ts — receive function name + input values, transpile and execute function body in worker scope, return output or error
- [x] T056 [US4] Add message factories for `preview:execute` in apps/studio/src/services/codegen-service.ts
- [x] T057 [US4] Add `executionResult`, `executionError`, and `executeFunction()` action to apps/studio/src/store/preview-store.ts
- [x] T058a [US4] Extend `FormPreviewPanel` in apps/studio/src/components/FormPreviewPanel.tsx — when `kind === 'function'`, render input fields matching function inputs and a "Run" button
- [x] T058b [US4] Wire "Run" button in `FormPreviewPanel` to dispatch `preview:execute` via codegen worker and display computed output below inputs in apps/studio/src/components/FormPreviewPanel.tsx
- [x] T058c [US4] Display pre-condition violations inline on input fields and post-condition violations alongside output in apps/studio/src/components/FormPreviewPanel.tsx
- [x] T059 [US4] Add worker test for `preview:execute` in apps/studio/test/workers/codegen-worker.test.ts
- [x] T060 [US4] Add preview schema test fixtures for function preview in packages/codegen/test/

**Checkpoint**: Functions appear in form preview. Execution works end-to-end in Studio.

---

## Phase 8: User Story 7 — Annotation Metadata (Priority: P2)

**Goal**: Annotation declarations emit as TypeScript decorator factories; annotation usages emit as decorator invocations on classes/fields. Zod schemas get `.meta()`.

**Independent Test**: Run codegen against a `.rune` file with annotated types and verify TS output includes typed decorators and Zod output includes `.meta()`.

### Fixtures for US7

- [x] T061 [P] [US7] Create fixture `packages/codegen/test/fixtures/annotations/declaration/input.rune` with annotation declaration
- [x] T062 [P] [US7] Create fixture `packages/codegen/test/fixtures/annotations/usage-type/input.rune` with annotation used on a data type
- [x] T063 [P] [US7] Create fixture `packages/codegen/test/fixtures/annotations/usage-attr/input.rune` with annotation used on an attribute
- [x] T064 [P] [US7] Create fixture `packages/codegen/test/fixtures/annotations/qualifiers/input.rune` with annotation using qualifier key-value pairs
- [x] T064b [P] [US7] Create fixture `packages/codegen/test/fixtures/annotations/enum-value/input.rune` with annotation on enum values

### Implementation for US7

- [x] T065 [US7] Implement `emitAnnotationDeclaration()` in packages/codegen/src/emit/ts-emitter.ts — emit typed decorator factory per annotation, parameter type derived from annotation's attributes
- [x] T066 [US7] Modify `emitClass()` in packages/codegen/src/emit/ts-emitter.ts to emit `@annotationName({ key: "value" })` for each `AnnotationRef` on a type
- [x] T067 [US7] Modify field emission in packages/codegen/src/emit/ts-emitter.ts to emit decorator invocations for annotated attributes
- [x] T068 [US7] Modify `emitTypeSchema()` in packages/codegen/src/emit/zod-emitter.ts to chain `.meta({ annotationName: { key: "value" } })` for annotated types
- [x] T069 [US7] Modify field-level Zod emission to chain `.describe()` for annotation definitions and `.meta()` for qualifier data
- [x] T069b [US7] Handle annotation emission on enum values — TS decorator on enum companion object entries, Zod `.meta()` on enum schema
- [x] T070 [US7] Wire annotation declaration emission into `emitNamespace()` — emit before types (decorators must be declared before use)
- [x] T071 [US7] Write expected output files for all fixtures and create `us11-annotations.test.ts` in packages/codegen/test/

**Checkpoint**: Annotations emit as TS decorators and Zod `.meta()`. Qualifier data preserved.

---

## Phase 9: User Story 5 — Report Codegen (Priority: P2)

**Goal**: Emit TypeScript typed structures for `report` declarations.

**Independent Test**: Run codegen against a `.rune` file with a report and verify TS output includes typed reporting structure.

### Fixtures for US5

- [x] T072 [P] [US5] Create fixture `packages/codegen/test/fixtures/reports/basic/input.rune` with a basic report referencing eligibility rules and a report type

### Implementation for US5

- [x] T073 [US5] Implement `emitReport()` in packages/codegen/src/emit/ts-emitter.ts — emit typed interface per report with inputType, reportType, eligibilityRules, timing
- [x] T074 [US5] Wire report emission into `emitNamespace()` in TS emitter — emit after rules (reports reference rules)
- [x] T074b [US5] Implement report metadata emission in packages/codegen/src/emit/zod-emitter.ts — chain `.meta({ report: { inputType, eligibilityRules, timing, regulatoryBody } })` on the report's associated output type schema
- [x] T074c [US5] Implement report metadata emission in packages/codegen/src/emit/json-schema-emitter.ts — emit `x-rune-report` extension properties on the report's output type schema
- [x] T075 [US5] Write expected output files for all three targets and create `us9-reports.test.ts` in packages/codegen/test/

**Checkpoint**: Report structures emit in TypeScript. Zod/JSON Schema correctly skip them.

---

## Phase 10: User Story 6 — Library Function Codegen (Priority: P3)

**Goal**: Emit type-safe function signatures (no body) for `library function` declarations.

**Independent Test**: Run codegen against a `.rune` file with a `library function` and verify TS output includes a typed function signature.

### Fixtures for US6

- [x] T076 [P] [US6] Create fixture `packages/codegen/test/fixtures/library-funcs/basic/input.rune` with library function declaration

### Implementation for US6

- [x] T077 [US6] Implement library function extraction in packages/codegen/src/emit/ts-emitter.ts — handle `isRosettaExternalFunction()` elements, emit `export type LibFuncName = (param1: Type1, param2: Type2) => ReturnType;`
- [x] T078 [US6] Wire library function emission into `emitNamespace()` — emit alongside regular functions. Zod: silently skip
- [x] T079 [US6] Write expected output files and create `us10-library-funcs.test.ts` in packages/codegen/test/

**Checkpoint**: Library function signatures emit in TypeScript.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Integration validation, regression, fixture completeness

- [x] T080 Run full codegen against CDM corpus fixtures — verify no regressions in existing output (SC-006)
- [x] T081 Verify all pre-existing fixture tests pass unchanged
- [x] T082 [P] Add cross-namespace fixtures using real CDM inheritance patterns
- [x] T083 [P] Verify Studio form preview renders all new types correctly end-to-end
- [x] T084 Verify function execution works end-to-end in Studio with a real function from fixtures
- [x] T085 Run quickstart.md validation — build, test, verify all targets

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 Type Aliases (Phase 3)**: Depends on Phase 2 — MVP
- **US2 Rules (Phase 4)**: Depends on Phase 2 — can run parallel with US1
- **US3 Form Preview (Phase 5)**: Depends on Phase 3 (needs type aliases for preview)
- **US8 Cross-Namespace (Phase 6)**: Depends on Phase 2 — can run parallel with US1/US2
- **US4 Function Form (Phase 7)**: Depends on Phase 2 — independent of other stories
- **US7 Annotations (Phase 8)**: Depends on Phase 2 — independent of other stories
- **US5 Reports (Phase 9)**: Depends on Phase 4 (reports reference rules)
- **US6 Library Funcs (Phase 10)**: Depends on Phase 2 — independent
- **Polish (Phase 11)**: Depends on all desired stories being complete

### User Story Dependencies

- **US1 (Type Aliases)**: Phase 2 only — fully independent
- **US2 (Rules)**: Phase 2 only — fully independent
- **US3 (Form Preview)**: Needs US1 complete (type aliases in preview)
- **US4 (Function Form)**: Phase 2 only — fully independent
- **US5 (Reports)**: Needs US2 complete (reports reference rules)
- **US6 (Library Funcs)**: Phase 2 only — fully independent
- **US7 (Annotations)**: Phase 2 only — fully independent
- **US8 (Cross-Namespace)**: Phase 2 only — fully independent

### Parallel Opportunities

- **After Phase 2**: US1, US2, US4, US6, US7, US8 can all start in parallel
- **After US1**: US3 can start
- **After US2**: US5 can start
- **Within each phase**: All [P] fixture creation tasks can run in parallel

---

## Parallel Example: After Phase 2

```
# These 6 user stories can start simultaneously after Foundational completes:
Agent A: US1 (Type Aliases) — T016–T027
Agent B: US2 (Rules) — T028–T036
Agent C: US8 (Cross-Namespace) — T042–T053
Agent D: US7 (Annotations) — T061–T071
Agent E: US4 (Function Form) — T054–T060
Agent F: US6 (Library Funcs) — T076–T079
```

---

## Implementation Strategy

### MVP First (US1 + US2 + US8)

1. Complete Phase 1: Setup (T001–T007)
2. Complete Phase 2: Foundational/Registry (T008–T015)
3. Complete US1: Type Aliases (T016–T027)
4. Complete US2: Rules (T028–T036)
5. Complete US8: Cross-Namespace (T042–T053)
6. **STOP and VALIDATE**: Core codegen complete, all P1 stories functional
7. Complete US3: Form Preview Expansion (T037–T041)

### Incremental Delivery

1. Setup + Foundational → Registry ready
2. US1 + US2 → Core new construct codegen (MVP)
3. US8 → Cross-namespace works → multi-namespace models compile
4. US3 → Form preview covers all types → Studio UX complete
5. US4 + US7 → Function forms + annotations → P2 complete
6. US5 + US6 → Reports + library funcs → P3 complete

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Byte-identical fixture tests are required for all codegen changes (FR-019)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
