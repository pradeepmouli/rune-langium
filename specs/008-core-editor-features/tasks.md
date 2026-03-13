# Tasks: Core Editor Features

**Input**: Design documents from `/specs/008-core-editor-features/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Constitution Check

This task list aligns with the following constitutional principles:

| Principle | Compliance | Notes |
|-----------|-----------|-------|
| I. DSL Fidelity & Typed AST | ✅ | Expression nodes use typed AST; conditions use Expression references. No grammar changes. |
| II. Deterministic Fixtures | ✅ | CDM corpus tests use vendored fixtures. Git model loading is runtime, not test dependency. |
| III. Validation Parity | ✅ | No new validation rules. Condition validation follows Xtext parity. |
| IV. Performance & Workers | ✅ | Parsing in web worker. Model loading async with progress. Git fetch non-blocking. |
| V. Reversibility & Compatibility | ✅ | Form migration preserves backward-compatible props. Expression builder additive. Code gen additive. |
| Tooling: TypeScript + pnpm | ✅ | All new code TypeScript. No packages outside pnpm workspace. |
| Tooling: oxlint + vitest | ✅ | Tests for all new functionality. Lint rules unchanged. |
| Quality Gate: TDD | ⚠️ Justified | Tasks follow service-before-UI ordering per story. Verification tasks (T018, T019, T025, T028-T030, T042-T047) follow implementation. TDD is applied within each task (write test → implement → verify) rather than as separate preceding test tasks, because each service/component task is self-contained and testable in isolation. |

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add new dependencies and shared types needed by multiple user stories

- [x] T001 Add isomorphic-git and idb dependencies to apps/studio via `pnpm --filter @rune-langium/studio add isomorphic-git idb`
- [x] T002 [P] Create ModelSource, CachedModel, CachedFile, LoadProgress, LoadedModel, and ModelLoadError types in apps/studio/src/types/model-types.ts per data-model.md
- [x] T003 [P] Create CodeGenerationRequest, CodeGenerationResult, GeneratedFile, and GenerationError types in packages/cli/src/types/codegen-types.ts per data-model.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before user story implementation

**No foundational blocking tasks** — all infrastructure is story-specific. User stories US1 and US2 can begin immediately after setup. US3 depends on US2 (FunctionForm migration). US4 is independent. US5 depends on US1.

**Checkpoint**: Setup ready — user story implementation can begin

---

## Phase 3: User Story 1 - Load Model from Git Repository (Priority: P1) 🎯 MVP

**Goal**: Enable loading CDM/FpML models from public git repos with IndexedDB caching, progress reporting, and offline support. Multiple models can be loaded simultaneously with merged type systems.

**Independent Test**: Select CDM from the curated list, verify all namespaces appear in the editor, types are browsable and referenceable. Reload the page and verify cached model loads instantly. Load a second model (FpML) and verify merged type system.

### Implementation for User Story 1

- [x] T004 [US1] Create model registry with curated CDM/FpML/Rune entries (URLs, default refs, .rosetta file paths) in apps/studio/src/services/model-registry.ts
- [x] T005 [US1] Implement IndexedDB cache layer with version tracking (store/retrieve/clear cached models, compare cached ref with requested ref) in apps/studio/src/services/model-cache.ts
- [x] T006 [US1] Implement git model loader service using isomorphic-git (shallow clone, .rosetta file discovery, AsyncGenerator yielding LoadProgress, AbortSignal cancellation) in apps/studio/src/services/model-loader.ts per contracts/model-loader-api.md
- [x] T007 [US1] Create zustand model store managing loading state, progress, loaded models (multiple), errors, and cache integration in apps/studio/src/store/model-store.ts
- [x] T008 [US1] Integrate loaded model files as read-only WorkspaceFiles into existing workspace pipeline in apps/studio/src/services/workspace.ts (add mergeModelFiles function, mark files readOnly, support multiple simultaneous models)
- [x] T009 [US1] Create ModelLoader UI component with curated model dropdown, custom URL input with ref/tag field, progress bar with cancel button, and error display in apps/studio/src/components/ModelLoader.tsx
- [x] T010 [US1] Wire ModelLoader into the Studio app layout (toolbar or sidebar) and connect to model store in apps/studio/src/App.tsx or appropriate layout component
- [x] T011 [US1] Add offline fallback: on load attempt when offline, use cached model if available or show error requiring network for initial download in apps/studio/src/services/model-loader.ts
- [x] T012 [US1] Add namespace conflict detection: when multiple models define the same namespace/type, display a warning with the most recently loaded model taking precedence in apps/studio/src/store/model-store.ts

**Checkpoint**: User can load CDM/FpML from git, see namespace tree, reference types. Cached model persists across sessions. Multiple models merge correctly.

---

## Phase 4: User Story 2 - Complete zod-to-form Migration (Priority: P1)

**Goal**: Migrate all remaining hand-coded forms (Choice, Data, Function) to useZodForm pattern and create a new TypeAlias form. All form surfaces generated from Zod schemas with zero hand-coded field definitions.

**Independent Test**: Run `pnpm --filter @rune-langium/visual-editor generate:schemas`, then verify all forms (Enum, Choice, Data, Function, TypeAlias) render correctly with proper validation. Modify grammar, regenerate, and confirm forms update automatically.

### Implementation for User Story 2

- [x] T013 [P] [US2] Generate CLI scaffolds for Choice, Function, TypeAlias forms via `z2f generate` with updated z2f.config.ts field mappings (TypeSelector, CardinalitySelector, Textarea) — scaffolds in packages/visual-editor/src/components/forms/generated/
- [x] T014 [P] [US2] Update z2f.config.ts with all required field mappings: typeCall.type→TypeSelector, inputs[]/output card→CardinalitySelector, definition→Textarea; add overwrite:true; add scaffold scripts for all 5 form types to package.json
- [x] T015 [US2] Wire generated form scaffolds into EditorFormPanel.tsx — replace useNodeForm-based ChoiceForm, DataTypeForm, FunctionForm with generated versions, add TypeAliasForm case
- [x] T016 [US2] Adapt generated scaffolds to work with EditorFormPanel props pattern: add ExternalDataSync, auto-save callbacks, and action handlers to each generated form
- [ ] T017 [US2] Create component-config.ts for compile-time widget validation (register TypeSelector, CardinalitySelector with @zod-to-form/react FormMeta) in packages/visual-editor/src/components/forms/component-config.ts
- [x] T018 [US2] Verify all migrated forms render correctly with existing fixtures — test round-trip: load .rosetta file, open form, modify field, verify serialized output matches expected DSL
- [ ] T019 [US2] Complete EnumForm manual smoke test (T038 from spec 006): verify in studio app that auto-save works, undo/redo preserves dirty fields, no console errors

**Checkpoint**: All 5 form surfaces (Enum, Data, Choice, Function, TypeAlias) use useZodForm. Zero hand-coded field definitions remain.

---

## Phase 5a: Refactor — AstNodeModel Mapped Type (Priority: P1, Blocking)

**Goal**: Replace `TypeNodeData`, `MemberDisplay`, `ConditionDisplay`, `AnnotationDisplay`, and all `Synthetic*` types with a single recursive mapped type `AstNodeModel<T>` that plucks fields from the Langium AST type. Rename `astToGraph` → `astToModel`, `graphToAst` → `modelToAst`. Generated Zod schemas from `langium-zod` validate `AstNodeModel` shapes directly — zero transform layer.

**Rationale**: The current model has redundant kind strings, hand-written display types, and a separate synthetic type taxonomy. `AstNodeModel<T>` derives everything from the AST type, so the data flow is `AST ↔ AstNodeModel<T>` with graph metadata as a thin additive layer.

### Implementation

- [x] R001 Define `AstNodeModel<T>` mapped type in packages/visual-editor/src/types.ts — recursive `SerializeField<F>` with hardcoded exclusion set for Langium internals (`$container`, `$cstNode`, `$document`) and unused fields (`references`, `labels`, `ruleReferences`, `typeCallArgs`). `$type` derived from generic parameter. References, expressions, cardinalities pass through as structured objects (no flattening).
- [x] R002 Define `GraphNode<T>` type as `AstNodeModel<T> & GraphMetadata` (namespace, position, errors, isReadOnly, hasExternalRefs) in packages/visual-editor/src/types.ts
- [x] R003 Remove `MemberDisplay`, `ConditionDisplay`, `AnnotationDisplay`, `TypeNodeData`, `AstNodeKindMap`, `AstMemberKindMap` from packages/visual-editor/src/types.ts — all replaced by `AstNodeModel<T>` and `GraphNode<T>`
- [x] R004 Remove `SyntheticModel`, `SyntheticData`, `SyntheticFunction`, `SyntheticChoice`, `SyntheticEnum`, `SyntheticAttribute`, `SyntheticChoiceOption`, `SyntheticEnumValue` from packages/visual-editor/src/adapters/graph-to-ast.ts — replaced by `AstNodeModel<T>`
- [x] R005 Rename and refactor packages/visual-editor/src/adapters/ast-to-graph.ts → ast-to-model.ts — build functions return `GraphNode<Data>`, `GraphNode<RosettaFunction>`, etc. instead of `TypeGraphNode`
- [x] R006 Rename and refactor packages/visual-editor/src/adapters/graph-to-ast.ts → model-to-ast.ts — `graphToModels` becomes `modelsToAst`, reads `GraphNode<T>` fields directly (no Synthetic intermediary)
- [x] R007 Update all form components to use `AstNodeModel<T>` / `GraphNode<T>`: DataTypeForm, FunctionForm, TypeAliasForm, ChoiceForm, EnumForm, ConditionSection, AnnotationSection, MetadataSection, InheritedMembersSection in packages/visual-editor/src/components/editors/
- [x] R008 Update EditorFormPanel, editor action types, and form action interfaces to use `AstNodeModel<T>` / `GraphNode<T>` in packages/visual-editor/src/types.ts and packages/visual-editor/src/components/editors/EditorFormPanel.tsx
- [x] R009 Update all consumers of old types: hooks (useNodeForm, useAutoSave, useExpressionAutocomplete, useInheritedMembers), validation (edit-validator), schemas (form-schemas) in packages/visual-editor/src/
- [x] R010 Remove packages/visual-editor/src/adapters/extract-conditions.ts — conditions are now first-class fields on `AstNodeModel<Data>`, `AstNodeModel<RosettaFunction>`, `AstNodeModel<RosettaTypeAlias>`, populated directly by astToModel
- [x] R011 Verify generated Zod schemas from langium-zod validate `AstNodeModel<T>` shapes directly — confirm no transform layer needed between schema and model
- [x] R012 Run full test suite (`pnpm -r run test`) and fix any regressions from the refactor

**Checkpoint**: Single `AstNodeModel<T>` type replaces all display/synthetic types. `astToModel`/`modelToAst` are the only adapters. Generated Zod schemas validate model shapes directly.

---

## Phase 5b: User Story 3 - Add Conditions to Function Editor (Priority: P2)

**Goal**: Add pre-conditions and post-conditions UI to the function editor with expression builder integration. Users can add, edit, name, reorder, and remove conditions.

**Independent Test**: Open a CDM function that has conditions, verify they display correctly. Add a new condition with name and expression, verify generated DSL includes the condition block. Test round-trip: parse → edit → serialize → re-parse.

**Dependencies**: Phase 5a (AstNodeModel refactor — conditions are first-class fields on AstNodeModel)

### Implementation for User Story 3

- [x] T020 [US3] Create ConditionSection component with add/remove condition entries, optional name and description fields, and expression builder slot for condition body in packages/visual-editor/src/components/editors/ConditionSection.tsx
- [x] T021 [US3] Update FunctionForm, DataTypeForm, and TypeAliasForm to include ConditionSection — FunctionForm has separate pre/post-condition sections; all three forms use extractConditions helper from adapters/extract-conditions.ts and shared CST utilities from adapters/cst-utils.ts
- [x] T022 [US3] Wire function scope (inputs, output, shortcuts, aliases) into expression builder when editing condition expressions — ensure FunctionScope is passed to ConditionSection in packages/visual-editor/src/components/editors/FunctionForm.tsx
- [x] T023 [US3] Implement condition serialization: conditions on AstNodeModel → DSL text round-trip (condition name, description, expression body) via modelToAst in packages/visual-editor/src/adapters/model-to-ast.ts
- [x] T024 [US3] Add condition reordering support (drag-and-drop or move up/down buttons) within ConditionSection in packages/visual-editor/src/components/editors/ConditionSection.tsx
- [x] T025 [US3] Verify with CDM corpus: load functions that have existing conditions, confirm all conditions display with names, descriptions, and expression bodies intact

**Checkpoint**: Function editor shows conditions/post-conditions. Users can add, edit, reorder, remove conditions with expression builder. DSL round-trip works.

---

## Phase 6: User Story 4 - Expression Builder Debugging & Validation (Priority: P2)

**Goal**: Debug and fix the expression builder so it renders interactive visual blocks (not just source text), then validate completeness against the CDM corpus. The adapter code (ast-to-expression-node, expression-node-to-dsl) handles 51/51 expression types, but the UI is not rendering interactive blocks — users see only the raw source text of expressions.

**Independent Test**: Open a CDM function in the visual editor, verify expressions render as interactive blocks (not source text). Edit an expression via the block UI, verify DSL updates. Run the CDM corpus round-trip test suite for 100% fidelity.

### Implementation for User Story 4

- [x] T026 [US4] Diagnose why expression builder renders source text instead of interactive blocks: trace the data flow from FunctionForm → expression display component, identify where ExpressionNode conversion is skipped or block rendering falls back to text in packages/visual-editor/src/components/editors/
- [x] T027 [US4] Fix expression builder rendering: ensure ast-to-expression-node output is passed to block components and rendered interactively (not as source text fallback) in packages/visual-editor/src/components/editors/expression-builder/
- [x] T028 [US4] Verify expression builder displays interactive blocks for common expression types (binary ops, function calls, conditionals, list operations) using CDM function fixtures
- [x] T029 [P] [US4] Create CDM corpus expression round-trip test: parse all CDM functions, extract expressions, convert each to ExpressionNode via ast-to-expression-node, serialize back via expression-node-to-dsl, re-parse, and compare AST in packages/visual-editor/test/conformance/expression-roundtrip.test.ts
- [x] T030 [P] [US4] Create UnsupportedBlock audit test: parse entire CDM corpus through ast-to-expression-node, assert zero expressions fall through to UnsupportedNode type in packages/visual-editor/test/conformance/expression-coverage.test.ts
- [x] T031 [US4] Fix any edge cases discovered during corpus testing (update ast-to-expression-node.ts or expression-node-to-dsl.ts as needed) in packages/visual-editor/src/adapters/
- [x] T032 [US4] Document intentionally excluded expression types (RosettaMapTestExistsExpression, RosettaMapTestAbsentExpression, RosettaMapTestEqualityOperation, RosettaAttributeReference) with rationale in packages/visual-editor/src/adapters/ast-to-expression-node.ts as JSDoc

**Checkpoint**: Expression builder renders interactive blocks (not source text). CDM corpus round-trip test passes with 100% coverage. Zero UnsupportedBlock occurrences confirmed.

---

## Phase 7: User Story 5 - Export via Rune-DSL Code Generators (Priority: P3)

**Goal**: Enable code generation export via rosetta-code-generators. CLI command for Node.js usage and Studio UI for browser-based export. Only user-authored files are exported; reference models serve as compilation context.

**Independent Test**: Run `rune-dsl generate --language java --input user-model.rosetta --output /tmp/codegen`, verify Java files are generated. In Studio, click Export, select Java, verify preview shows generated code and download works.

**Dependencies**: US1 (model loading provides compilation context for code generation)

### Implementation for User Story 5

- [ ] T033 [US5] Research rosetta-code-generators CLI interface: determine available generators, input format expected, invocation method (subprocess, Docker, or API) — document findings in specs/008-core-editor-features/research.md (append)
- [ ] T034 [US5] Create generate command in packages/cli/src/generate.ts: parse input .rosetta files using existing parse API, invoke rosetta-code-generators, capture output files and errors per contracts/codegen-api.md CLI section
- [ ] T035 [US5] Add --list-languages flag to enumerate available code generators in packages/cli/src/generate.ts
- [ ] T036 [US5] Register generate command in CLI entry point in packages/cli/src/index.ts
- [ ] T037 [US5] Add user-file vs reference-file distinction: ensure generate command only exports user-authored files, passing reference model files as compilation context in packages/cli/src/generate.ts
- [ ] T038 [US5] Create codegen service client for Studio (HTTP client to code generation service endpoint) in apps/studio/src/services/codegen-service.ts per contracts/codegen-api.md service section
- [ ] T039 [US5] Create ExportDialog component with language selector, progress indicator, generated code preview, and download as zip in apps/studio/src/components/ExportDialog.tsx
- [ ] T040 [US5] Integrate ExportDialog into Studio toolbar/menu, wire to codegen service and existing export.ts download helpers in apps/studio/src/App.tsx or layout component
- [ ] T041 [US5] Add pre-export validation: validate DSL model before code generation, warn user of errors that may affect output quality in apps/studio/src/components/ExportDialog.tsx

**Checkpoint**: CLI `rune-dsl generate` works end-to-end. Studio Export dialog shows language options, preview, and download.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T042 Verify SC-001: time model load end-to-end (CDM from git to editable) and confirm <60s on standard connection
- [x] T043 Verify SC-003: audit all form components and confirm zero hand-coded field definitions remain
- [x] T044 Verify SC-005: run expression round-trip test suite and confirm zero data loss across CDM corpus
- [x] T045 [P] Run full test suite (`pnpm -r run test`) and fix any regressions
- [x] T046 [P] Run oxlint across all modified files and fix any lint violations
- [ ] T047 Run quickstart.md validation: follow quickstart steps on a clean environment and verify all commands work

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **US1 Git Model Loading (Phase 3)**: Depends on Setup (T001, T002)
- **US2 zod-to-form Migration (Phase 4)**: Depends on Setup only — can run in parallel with US1
- **US3 Conditions (Phase 5)**: Depends on US2 (T015 — FunctionForm migration)
- **US4 Expression Builder Fix & Validation (Phase 6)**: No story dependencies — can run in parallel with US1/US2/US3
- **US5 Code Gen Export (Phase 7)**: Depends on US1 (model loading for compilation context)
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

```
Setup (Phase 1)
  ├── US1 (Phase 3) ──────────────┐
  │                                ├── US5 (Phase 7) ── Polish (Phase 8)
  ├── US2 (Phase 4) ── US3 (Phase 5) ──────────────────┘
  │
  └── US4 (Phase 6) ──────────────────────────────────────┘
```

### Within Each User Story

- Services/data layers before UI components
- Core implementation before integration
- Verification after implementation

### Parallel Opportunities

- **Phase 1**: T002 and T003 can run in parallel (different packages)
- **Phase 3 + Phase 4**: US1 and US2 can run in parallel (different packages)
- **Phase 4**: T013, T014, and T016 can run in parallel (different form files)
- **Phase 6**: T029 and T030 can run in parallel (different test files)
- **Phase 6**: US4 can run in parallel with any other story (independent validation)
- **Phase 8**: T045 and T046 can run in parallel

---

## Parallel Example: User Story 1 + User Story 2

```bash
# These can run simultaneously since they touch different packages:

# Developer A: US1 (apps/studio)
Task: T004 "Create model registry in apps/studio/src/services/model-registry.ts"
Task: T005 "Implement IndexedDB cache in apps/studio/src/services/model-cache.ts"
Task: T006 "Implement git model loader in apps/studio/src/services/model-loader.ts"

# Developer B: US2 (packages/visual-editor)
Task: T013 "Migrate ChoiceForm in packages/visual-editor/src/components/editors/ChoiceForm.tsx"
Task: T014 "Migrate DataTypeForm in packages/visual-editor/src/components/editors/DataTypeForm.tsx"
Task: T015 "Migrate FunctionForm in packages/visual-editor/src/components/editors/FunctionForm.tsx"
Task: T016 "Create TypeAliasForm in packages/visual-editor/src/components/editors/TypeAliasForm.tsx"
```

## Parallel Example: User Story 4 (independent)

```bash
# US4 can run at any time after Setup, in parallel with any other story:
Task: T026 "Diagnose expression builder rendering issue"
Task: T027 "Fix expression builder rendering"
Task: T028 "Verify interactive blocks work"
Task: T029 "CDM corpus expression round-trip test"  # T029 and T030 parallel
Task: T030 "UnsupportedBlock audit test"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup
2. Complete Phase 3: US1 (Git Model Loading) — can demo loading CDM
3. Complete Phase 4: US2 (zod-to-form) — can demo schema-driven forms
4. **STOP and VALIDATE**: Both P1 stories functional and testable
5. Demo: Load CDM model, edit types with generated forms

### Incremental Delivery

1. Setup → Foundation ready
2. US1 + US2 (parallel) → Load models + schema-driven forms (MVP!)
3. US3 → Conditions in function editor → Demo
4. US4 → Expression builder fix & validation → Confidence in production readiness
5. US5 → Code generation export → Full pipeline demo
6. Polish → Performance verification + regression testing

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup together
2. Once Setup is done:
   - Developer A: US1 (Git Model Loading — apps/studio)
   - Developer B: US2 (zod-to-form — packages/visual-editor)
   - Developer C: US4 (Expression Builder Fix & Validation — packages/visual-editor)
3. After US2 completes: Developer B → US3 (Conditions)
4. After US1 completes: Developer A → US5 (Code Gen Export)
5. All converge for Polish phase

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- US4 (Expression Builder) requires debugging the UI rendering (blocks show as source text) then corpus validation. Adapter code handles 51/51 types but UI is not wired correctly.
- US2 form migrations follow proven EnumForm pattern (useNodeForm → useZodForm + ExternalDataSync)
- Multiple models (FR-006 clarification) requires model-store to manage an array of loaded models
