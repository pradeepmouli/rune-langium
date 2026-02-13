---

description: "Task list for feature implementation"

---

# Tasks: ReactFlow Visual Editor

**Input**: Design documents from `/specs/002-reactflow-visual-editor/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: INCLUDED (mandatory per spec.md “User Scenarios & Testing”).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Constitution Check

- [X] T001 Add deterministic fixture loader for visual-editor tests in packages/visual-editor/test/helpers/fixture-loader.ts
- [X] T002 Add conformance tests against vendored CDM corpus in packages/visual-editor/test/conformance/cdm-corpus-graph.test.ts
- [X] T003 Add round-trip conformance tests (edit → serialize → parse) in packages/visual-editor/test/conformance/roundtrip.test.ts
- [X] T004 Add validation parity coverage for S-01/S-02/S-04 in packages/visual-editor/test/validation/validation-parity.test.ts
- [X] T005 Add performance benchmarks for layout + render at 500 nodes in packages/visual-editor/test/benchmarks/perf.bench.ts
- [X] T006 Add compatibility/migration notes for visual-editor public API in packages/visual-editor/README.md
- [X] T096 Add parse latency benchmarks (<200ms single-file, <5s full corpus) in packages/core/test/benchmarks/parse-perf.bench.ts
- [X] T097 Add studio parser web worker (parse/parseWorkspace) in apps/studio/src/workers/parser-worker.ts
- [X] T098 Wire studio workspace parsing through worker (fallback to main thread) in apps/studio/src/services/workspace.ts

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T007 Update pnpm workspaces to include apps/* in pnpm-workspace.yaml
- [X] T008 [P] Create package skeleton for component library in packages/visual-editor/package.json
- [X] T009 [P] Create TypeScript config for component library in packages/visual-editor/tsconfig.json
- [X] T010 [P] Add visual-editor entrypoints in packages/visual-editor/src/index.ts
- [X] T011 [P] Add base styles export in packages/visual-editor/src/styles.css
- [X] T012 [P] Add visual-editor README scaffolding in packages/visual-editor/README.md
- [X] T013 [P] Create app skeleton for studio in apps/studio/package.json
- [X] T014 [P] Create Vite + React setup in apps/studio/vite.config.ts
- [X] T015 [P] Add studio TS config in apps/studio/tsconfig.json
- [X] T016 [P] Add studio HTML entry in apps/studio/index.html
- [X] T017 [P] Add studio main entry in apps/studio/src/main.tsx
- [X] T018 [P] Add studio app shell in apps/studio/src/App.tsx
- [X] T019 Add root scripts/filters for new workspaces in package.json (build/test/dev/lint as needed)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T020 Add shared editor types aligned to contracts in packages/visual-editor/src/types.ts
- [X] T021 [P] Add node/edge type registries in packages/visual-editor/src/components/nodes/index.ts
- [X] T022 [P] Add edge type registries in packages/visual-editor/src/components/edges/index.ts
- [X] T023 Add AST→graph adapter skeleton in packages/visual-editor/src/adapters/ast-to-graph.ts
- [X] T024 Add layout engine interface + dagre implementation skeleton in packages/visual-editor/src/layout/dagre-layout.ts
- [X] T025 [P] Add layout worker scaffold in packages/visual-editor/src/layout/layout-worker.ts
- [X] T026 Add minimal RuneTypeGraph scaffold (ReactFlow canvas + props) in packages/visual-editor/src/components/RuneTypeGraph.tsx
- [X] T027 [P] Add editor zustand store scaffold in packages/visual-editor/src/store/editor-store.ts
- [X] T028 [P] Add undo/redo middleware setup with zundo in packages/visual-editor/src/store/history.ts
- [X] T029 [P] Add test harness setup for React components in packages/visual-editor/test/setup.ts
- [X] T030 [P] Add Vitest config (if package-local needed) in packages/visual-editor/vitest.config.ts

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 - View Type Graph (Priority: P1) 🎯 MVP

**Goal**: Render Data/Choice/Enum types and their relationships as an auto-laid-out ReactFlow graph from parsed Rune DSL models.

**Independent Test**: In a Vitest test, parse a small `.rosetta` source via `@rune-langium/core`, render `RuneTypeGraph`, and verify nodes/edges for extends + attribute refs + choice options + enum values.

### Tests for User Story 1 (mandatory)

- [X] T031 [P] [US1] Add AST→graph adapter unit tests in packages/visual-editor/test/adapters/ast-to-graph.test.ts
- [X] T032 [P] [US1] Add dagre layout unit tests in packages/visual-editor/test/layout/dagre-layout.test.ts
- [X] T033 [P] [US1] Add RuneTypeGraph render smoke test in packages/visual-editor/test/components/RuneTypeGraph.test.tsx

### Implementation for User Story 1

- [X] T034 [US1] Implement AST→graph mapping for Data/Choice/Enum in packages/visual-editor/src/adapters/ast-to-graph.ts
- [X] T035 [P] [US1] Implement Data node UI in packages/visual-editor/src/components/nodes/DataNode.tsx
- [X] T036 [P] [US1] Implement Choice node UI in packages/visual-editor/src/components/nodes/ChoiceNode.tsx
- [X] T037 [P] [US1] Implement Enum node UI in packages/visual-editor/src/components/nodes/EnumNode.tsx
- [X] T038 [P] [US1] Implement Inheritance edge UI in packages/visual-editor/src/components/edges/InheritanceEdge.tsx
- [X] T039 [P] [US1] Implement Reference edge UI in packages/visual-editor/src/components/edges/ReferenceEdge.tsx
- [X] T040 [US1] Implement dagre computeLayout and apply positions in packages/visual-editor/src/layout/dagre-layout.ts
- [X] T041 [US1] Wire nodeTypes/edgeTypes + layout into RuneTypeGraph in packages/visual-editor/src/components/RuneTypeGraph.tsx
- [X] T042 [US1] Export RuneTypeGraph + helper APIs from packages/visual-editor/src/index.ts

**Checkpoint**: US1 delivers a read-only, correctly laid-out graph for a single model input

---

## Phase 4: User Story 2 - Navigate & Explore the Graph (Priority: P1)

**Goal**: Add pan/zoom, fit-view, search, selection, detail panel, and filtering for large models.

**Independent Test**: Load CDM fixtures in a test, search for “Trade”, focus it, and verify selection + detail panel contents reflect the AST.

### Tests for User Story 2 (mandatory)

- [X] T043 [P] [US2] Add store selection/search tests in packages/visual-editor/test/store/editor-store.test.ts
- [X] T044 [P] [US2] Add detail panel rendering tests in packages/visual-editor/test/components/DetailPanel.test.tsx

### Implementation for User Story 2

- [X] T045 [P] [US2] Implement detail panel UI in packages/visual-editor/src/components/panels/DetailPanel.tsx
- [X] T046 [P] [US2] Implement search panel UI in packages/visual-editor/src/components/panels/SearchPanel.tsx
- [X] T047 [P] [US2] Implement toolbar panel UI (fit view, relayout) in packages/visual-editor/src/components/panels/ToolbarPanel.tsx
- [X] T048 [US2] Implement selection + detail panel state in packages/visual-editor/src/store/editor-store.ts
- [X] T049 [US2] Implement search + highlight behavior in packages/visual-editor/src/store/editor-store.ts
- [X] T050 [US2] Implement filters (namespace/kind/namePattern/hideOrphans) in packages/visual-editor/src/store/editor-store.ts
- [X] T051 [US2] Wire panels into RuneTypeGraph layout in packages/visual-editor/src/components/RuneTypeGraph.tsx

**Checkpoint**: US2 makes CDM-scale graphs usable via search, filters, and inspectable details

---

## Phase 5: User Story 3 - Embeddable Component Library (Priority: P1)

**Goal**: Provide a stable, documented public API contract (props, callbacks, ref) usable in any React app.

**Independent Test**: In a minimal consumer test (within this repo), import the library, render the component, call `ref.fitView()`, and verify callbacks fire on selection.

### Tests for User Story 3 (mandatory)

- [X] T052 [P] [US3] Add public API/ref behavior tests in packages/visual-editor/test/public-api/ref-api.test.tsx

### Implementation for User Story 3

- [X] T053 [US3] Implement config merging and defaults in packages/visual-editor/src/components/RuneTypeGraph.tsx
- [X] T054 [US3] Implement callbacks wiring (onNodeSelect/onEdgeSelect/etc.) in packages/visual-editor/src/components/RuneTypeGraph.tsx
- [X] T055 [US3] Implement imperative ref API (fitView/focusNode/search/filters/relayout/export) in packages/visual-editor/src/components/RuneTypeGraph.tsx
- [X] T056 [US3] Align exported types with contracts in packages/visual-editor/src/types.ts
- [X] T057 [US3] Document usage + configuration in packages/visual-editor/README.md
- [X] T058 [US3] Add usage example snippet to docs/EXAMPLES.md

**Checkpoint**: US3 makes the visual editor consumable as a library with a clear, tested API

---

## Phase 6: User Story 4 - Visual Model Editing (Priority: P2)

**Goal**: Support create/rename/delete types, add/modify/delete attributes, set inheritance, and undo/redo with valid `.rosetta` output.

**Independent Test**: Start from a parsed model, create a new Data type, add 2 attributes, set inheritance, export `.rosetta`, re-parse with `@rune-langium/core`, and verify the expected types/relationships exist.

### Tests for User Story 4 (mandatory)

- [X] T059 [P] [US4] Add edit command tests (create/rename/delete) in packages/visual-editor/test/editing/edit-commands.test.ts
- [X] T060 [P] [US4] Add round-trip tests for edits in packages/visual-editor/test/editing/roundtrip-edits.test.ts

### Implementation for User Story 4

- [X] T061 [US4] Implement AST→text serializer for types/attributes in packages/core/src/serializer/rosetta-serializer.ts
- [X] T062 [US4] Export serializer from core public API in packages/core/src/index.ts
- [X] T063 [US4] Implement graph→AST command adapter in packages/visual-editor/src/adapters/graph-to-ast.ts
- [X] T064 [US4] Implement editor commands (create/delete/rename type) in packages/visual-editor/src/store/editor-store.ts
- [X] T065 [US4] Implement attribute editing commands in packages/visual-editor/src/store/editor-store.ts
- [X] T066 [US4] Implement inheritance edge editing (set/clear extends) in packages/visual-editor/src/store/editor-store.ts
- [X] T067 [US4] Implement undo/redo wiring with zundo in packages/visual-editor/src/store/history.ts
- [X] T068 [P] [US4] Implement inline type creator UI in packages/visual-editor/src/components/editors/TypeCreator.tsx
- [X] T069 [P] [US4] Implement attribute editor UI in packages/visual-editor/src/components/editors/AttributeEditor.tsx
- [X] T070 [P] [US4] Implement cardinality editor UI in packages/visual-editor/src/components/editors/CardinalityEditor.tsx
- [X] T071 [US4] Wire editing UI + readOnly flag into RuneTypeGraph in packages/visual-editor/src/components/RuneTypeGraph.tsx
- [X] T072 [US4] Implement exportRosetta() via core serializer in packages/visual-editor/src/components/RuneTypeGraph.tsx

**Checkpoint**: US4 enables real model changes with undo/redo and parseable `.rosetta` output

---

## Phase 7: User Story 5 - Change Validation & Error Prevention (Priority: P2)

**Goal**: Validate edits with the same rules as core and block invalid operations with inline errors.

**Independent Test**: Attempt circular inheritance and invalid cardinality in tests; verify the editor rejects the operation and exposes validation errors.

### Tests for User Story 5 (mandatory)

- [X] T073 [P] [US5] Add circular inheritance prevention tests in packages/visual-editor/test/validation/circular-inheritance.test.ts
- [X] T074 [P] [US5] Add duplicate name prevention tests in packages/visual-editor/test/validation/duplicate-names.test.ts
- [X] T075 [P] [US5] Add invalid cardinality validation tests in packages/visual-editor/test/validation/cardinality.test.ts

### Implementation for User Story 5

- [X] T076 [US5] Implement edit-time validator wrapper around core validator in packages/visual-editor/src/validation/edit-validator.ts
- [X] T077 [US5] Integrate validation into edit commands (block/apply) in packages/visual-editor/src/store/editor-store.ts
- [X] T078 [US5] Attach validation errors to nodes/edges in packages/visual-editor/src/adapters/ast-to-graph.ts
- [X] T079 [US5] Display inline validation errors in node components in packages/visual-editor/src/components/nodes/DataNode.tsx
- [X] T080 [US5] Implement delete warning for referenced types in packages/visual-editor/src/store/editor-store.ts

**Checkpoint**: US5 prevents creating broken models and surfaces parity-aligned errors

---

## Phase 7b: AST Source Provenance (Post-MVP Enhancement)

**Goal**: Preserve rich Langium AST type information through the graph pipeline so that downstream consumers can access annotations, conditions, synonyms, type parameters, and other metadata without creating a separate type taxonomy.

- [X] T104 [US1] Add generic AST-aware types: `AstNodeKindMap`, `AstMemberKindMap`, `AstNodeType`, `AstMemberType` in packages/visual-editor/src/types.ts
- [X] T105 [US1] Make `TypeNodeData<K>` generic with `source?: AstNodeKindMap[K]` in packages/visual-editor/src/types.ts
- [X] T106 [US1] Make `MemberDisplay<M>` generic with `source?: M` in packages/visual-editor/src/types.ts
- [X] T107 [US1] Rewrite ast-to-graph.ts with real AST type guards (`isData`, `isChoice`, `isRosettaEnumeration`) and populate `source` refs in packages/visual-editor/src/adapters/ast-to-graph.ts
- [X] T108 [US4] Update graph-to-ast.ts Synthetic* interfaces with `source?` fields and pass-through in packages/visual-editor/src/adapters/graph-to-ast.ts
- [X] T109 [US3] Promote `@rune-langium/core` from devDependency to dependency in packages/visual-editor/package.json
- [X] T110 [US3] Export `AstNodeKindMap`, `AstMemberKindMap`, `AstNodeType`, `AstMemberType` from packages/visual-editor/src/index.ts
- [X] T111 [P] [US1] Add AST source provenance tests (13 tests) in packages/visual-editor/test/adapters/ast-source-provenance.test.ts

**Checkpoint**: AST source provenance — rich type information flows through the entire graph pipeline

---

## Phase 8: User Story 6 - Standalone Web Application (Priority: P3)

**Goal**: Provide a browser app to load files/folders, view/edit graph, export images, and download updated `.rosetta`.

**Independent Test**: Run the studio app locally, load a folder of `.rosetta` files, verify graph renders, make an edit, export `.rosetta`, and confirm the downloaded files re-parse.

### Tests for User Story 6 (mandatory)

- [X] T081 [P] [US6] Add workspace service unit tests in apps/studio/test/services/workspace.test.ts
- [X] T082 [P] [US6] Add Playwright E2E test for load → edit → export in apps/studio/test/e2e/load-edit-export.spec.ts

### Implementation for User Story 6

- [X] T083 [US6] Implement workspace service (load files, track dirty state) in apps/studio/src/services/workspace.ts
- [X] T084 [P] [US6] Implement file loader UI (drag/drop + picker) in apps/studio/src/components/FileLoader.tsx
- [X] T085 [P] [US6] Implement source view panel in apps/studio/src/components/SourceView.tsx
- [X] T086 [P] [US6] Implement export menu UI in apps/studio/src/components/ExportMenu.tsx
- [X] T087 [US6] Implement export service (image + rosetta + zip download) in apps/studio/src/services/export.ts
- [X] T088 [US6] Implement editor page layout embedding RuneTypeGraph in apps/studio/src/pages/EditorPage.tsx
- [X] T089 [US6] Wire load/save/export flows in apps/studio/src/App.tsx
- [X] T090 [US6] Add basic app styling + layout CSS in apps/studio/src/styles.css
- [X] T099 [P] [US6] Add directory selection support (File System Access API and/or <input webkitdirectory> fallback) in apps/studio/src/components/FileLoader.tsx
- [X] T100 [US6] Implement cross-file resolution via @rune-langium/core parseWorkspace() and verify edges connect across files in apps/studio/src/services/workspace.ts
- [X] T101 [P] [US6] Add multi-file workspace fixture test covering cross-file references in apps/studio/test/services/workspace.test.ts
- [X] T102 [US6] Detect external file changes + offer keep/reload choice in apps/studio/src/App.tsx + apps/studio/src/services/workspace.ts
- [X] T103 [P] [US6] Extend Playwright flow to cover directory selection + cross-file load in apps/studio/test/e2e/load-edit-export.spec.ts

**Checkpoint**: US6 provides a usable standalone application for non-developer users

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T091 [P] Add quickstart verification notes and update commands in specs/002-reactflow-visual-editor/quickstart.md
- [X] T092 [P] Add docs for new packages/apps in docs/WORKSPACE.md
- [X] T093 Add root-level Playwright config updates (if needed for apps/studio) in playwright.config.ts
- [X] T094 Run lint/format adjustments for new React/TSX code in oxlintrc.json (as needed)
- [X] T095 Add CI task updates for building/testing new workspaces in .github/workflows/ci.yml

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3+)**: Depend on Foundational phase completion
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies (recommended order)

- **US1 (P1)** → required base graph rendering
- **US2 (P1)** → depends on US1 (selection/search operate on rendered graph)
- **US3 (P1)** → depends on US1–US2 (public API wraps stable behavior)
- **US4 (P2)** → depends on US3 (editing ships on the component library)
- **US5 (P2)** → depends on US4 (validation blocks edit commands)
- **US6 (P3)** → depends on US3 (embed component) and ideally US4–US5 for full edit+export workflow

---

## Parallel Execution Examples (per User Story)

### US1

Example parallel split:

```text
Dev A: packages/visual-editor/src/components/nodes/DataNode.tsx
Dev B: packages/visual-editor/src/components/nodes/ChoiceNode.tsx
Dev C: packages/visual-editor/src/components/nodes/EnumNode.tsx
Dev D: packages/visual-editor/src/components/edges/InheritanceEdge.tsx + packages/visual-editor/src/components/edges/ReferenceEdge.tsx
```

### US2

Example parallel split:

```text
Dev A: packages/visual-editor/src/components/panels/SearchPanel.tsx
Dev B: packages/visual-editor/src/components/panels/DetailPanel.tsx
Dev C: packages/visual-editor/src/components/panels/ToolbarPanel.tsx
```

### US4

Example parallel split:

```text
Dev A: packages/visual-editor/src/components/editors/TypeCreator.tsx
Dev B: packages/visual-editor/src/components/editors/AttributeEditor.tsx
Dev C: packages/visual-editor/src/components/editors/CardinalityEditor.tsx
```

### US6

Example parallel split:

```text
Dev A: apps/studio/src/components/FileLoader.tsx
Dev B: apps/studio/src/components/SourceView.tsx
Dev C: apps/studio/src/components/ExportMenu.tsx
Dev D: apps/studio/src/services/workspace.ts + apps/studio/src/services/export.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (blocks all stories)
3. Complete Phase 3: US1
4. Validate US1 independently via its tests (T031–T033) and a small fixture parse/render

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → usable read-only graph
3. US2 → usable navigation for large models
4. US3 → stable embeddable library API
5. US4 + US5 → editing with validation + round-trip output
6. US6 → standalone app wrapping the component
