---

description: "Task list for Studio Form Preview implementation"
---

# Tasks: Studio Form Preview

**Input**: Design documents from `/specs/016-studio-form-preview/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md
**Propagated**: 2026-04-28 — Updated from spec.md refinement
**Reviewed**: 2026-04-28 — Tightened coverage for identity, keyboard flow, accessibility announcements, privacy, and success-criteria verification

**Tests**: Automated coverage is required by the specification (`FR-025`) and quickstart, so each user story includes test tasks before implementation tasks.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unresolved dependencies)
- **[Story]**: Which user story this task belongs to (`[US1]` ... `[US5]`)
- Each task includes exact file paths

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the feature scaffolding and shared fixtures the rest of the work depends on.

- [X] T001 Create shared form-preview fixture coverage, including exported-subschema mapping cases, in `packages/codegen/test/fixtures/form-preview/expected.zod.ts` and `apps/studio/test/helpers/fixture-loader.ts`
- [X] T002 [P] Scaffold preview modules in `packages/codegen/src/preview-schema.ts`, `apps/studio/src/store/preview-store.ts`, `apps/studio/src/components/FormPreviewPanel.tsx`, and `apps/studio/src/shell/panels/FormPreviewPanel.tsx`
- [X] T003 [P] Export preview entry points from `packages/codegen/src/index.ts` and `apps/studio/src/components/codegen-ui.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the shared preview-schema pipeline and Studio plumbing that all user stories depend on.

**⚠️ CRITICAL**: No user story work should start until this phase is complete.

- [X] T004 Add preview-schema contract coverage for z2f-derived schema snapshots, exported-subschema mappings, unsupported features, and recursive-depth guards in `packages/codegen/test/preview-schema.test.ts`
- [X] T004a [P] Add worker-message coverage for `preview:setFiles`, `preview:generate`, `preview:result`, `preview:stale`, and unavailable fallbacks in `apps/studio/test/services/codegen-service.test.ts` and `apps/studio/test/workers/codegen-worker.test.ts`
- [X] T004b [P] Add fully-qualified preview-target identity coverage for duplicate display names plus rename/delete resolution in `apps/studio/test/store/preview-store.test.ts` and `apps/studio/test/pages/EditorPage.test.tsx`
- [X] T004c [P] Add layout registration coverage for Form/Code/Model Tree labels and Preview/Visualize separation in `apps/studio/test/shell/dockview-bridge.test.ts` and `apps/studio/test/shell/layout-factory.test.ts`
- [X] T005 Implement `FormPreviewSchema` serialization and z2f exported-subschema mapping support in `packages/codegen/src/preview-schema.ts`, `packages/codegen/src/generator.ts`, and `packages/codegen/src/types.ts`
- [X] T005a Implement unsupported-feature reporting and recursive-depth guards in `packages/codegen/src/preview-schema.ts`, `packages/codegen/src/generator.ts`, and `packages/codegen/src/types.ts`
- [X] T006 Add `preview:setFiles`, `preview:generate`, `preview:result`, and `preview:stale` worker plumbing in `apps/studio/src/workers/codegen-worker.ts` and `apps/studio/src/services/codegen-service.ts`
- [X] T007 Wire in-memory preview target and snapshot state into `apps/studio/src/store/preview-store.ts`, `apps/studio/src/store/model-store.ts`, and `apps/studio/src/store/codegen-store.ts`
- [X] T008 Register the Form preview surface in `apps/studio/src/shell/layout-types.ts`, `apps/studio/src/shell/layout-factory.ts`, and `apps/studio/src/shell/dockview-bridge.ts`

**Checkpoint**: Preview-schema generation and Studio message flow are ready for story work.

---

## Phase 3: User Story 1 - Preview a generated form for the selected model type (Priority: P1)

**Goal**: Render a live form preview for the currently selected model type using the latest successful z2f-derived schema snapshot.

**Independent Test**: Open a workspace with a type containing scalar, optional, array, enum, and nested fields; select that type and confirm Preview → Form renders one matching form plus a no-selection empty state when nothing is selected.

### Tests for User Story 1

- [X] T009 [P] [US1] Add component coverage for no-selection, unsupported, nested-field rendering, and exported-subschema mapping in `apps/studio/test/components/FormPreviewPanel.test.tsx`
- [X] T010 [P] [US1] Add end-to-end selection-to-preview coverage, including z2f subschema defaults and fully-qualified duplicate-name targeting, in `apps/studio/test/e2e/form-preview.spec.ts`

### Implementation for User Story 1

- [X] T011 [US1] Implement no-selection, waiting, unavailable, and unsupported panel states in `apps/studio/src/components/FormPreviewPanel.tsx`
- [X] T012 [US1] Render scalar, enum, array, nested-object controls, and z2f exported-subschema component mappings from preview snapshots in `apps/studio/src/components/FormPreviewPanel.tsx`
- [X] T013 [US1] Integrate the Form preview panel into Studio target selection flow using fully-qualified model identity in `apps/studio/src/shell/panels/FormPreviewPanel.tsx`, `apps/studio/src/pages/EditorPage.tsx`, and `apps/studio/src/components/TargetSwitcher.tsx`
- [X] T014 [US1] Surface unsupported preview features and source-backed field metadata in `apps/studio/src/components/FormPreviewPanel.tsx` and `apps/studio/src/store/preview-store.ts`

**Checkpoint**: Selecting a model type shows a schema-derived form preview that is independently usable.

---

## Phase 4: User Story 2 - Validate sample input against the generated schema (Priority: P1)

**Goal**: Let modellers enter sample values, see field-level validation, and understand whether the preview sample is valid against z2f-derived schema semantics.

**Independent Test**: Select a type with required fields and bounded arrays, trigger invalid states, then enter valid values and confirm the preview reports a valid sample with cleared errors.

### Tests for User Story 2

- [X] T015 [P] [US2] Add component coverage for validation errors, reset behavior, summary-status visibility, and subschema-mapped nested validation in `apps/studio/test/components/FormPreviewPanel.test.tsx`
- [X] T016 [P] [US2] Add end-to-end validation flow coverage for z2f-derived preview schemas in `apps/studio/test/e2e/form-preview.spec.ts`

### Implementation for User Story 2

- [X] T017 [US2] Implement sample value editing and z2f-parity validation, including exported-subschema defaults, in `apps/studio/src/components/FormPreviewPanel.tsx` and `apps/studio/src/store/preview-store.ts`
- [X] T018 [US2] Add reset behavior and preview status transitions for valid and invalid samples in `apps/studio/src/components/FormPreviewPanel.tsx` and `apps/studio/src/store/preview-store.ts`
- [X] T019 [US2] Add keyboard focus flow, field-error announcements, and stale/unavailable sample-status live regions in `apps/studio/src/components/FormPreviewPanel.tsx`

**Checkpoint**: The form preview validates sample input with accessible field-level and summary feedback.

---

## Phase 5: User Story 3 - Keep preview current as the model changes (Priority: P2)

**Goal**: Refresh preview content after successful model changes while preserving the last successful preview as stale when generation temporarily fails.

**Independent Test**: Add a field to a selected type and confirm the preview refreshes; then introduce a syntax error and confirm the previous preview remains visible with a stale indicator until the model is fixed.

### Tests for User Story 3

- [X] T020 [P] [US3] Add stale-state store and service coverage for z2f preview regeneration in `apps/studio/test/store/preview-store.test.ts` and `apps/studio/test/services/codegen-service.test.ts`
- [X] T021 [P] [US3] Extend `apps/studio/test/e2e/form-preview.spec.ts` with refresh, duplicate-name identity, rename, deletion, and stale-preview regressions

### Implementation for User Story 3

- [X] T022 [US3] Preserve the last successful preview snapshot and stale reasons in `apps/studio/src/store/preview-store.ts` and `apps/studio/src/store/codegen-store.ts`
- [X] T023 [US3] Emit `preview:result` and `preview:stale` worker outcomes for parse and z2f generation failures in `apps/studio/src/workers/codegen-worker.ts` and `apps/studio/src/services/codegen-service.ts`
- [X] T024 [US3] Re-resolve selected preview targets across edits, renames, and deletions in `apps/studio/src/pages/EditorPage.tsx`, `apps/studio/src/store/model-store.ts`, and `apps/studio/src/services/model-registry.ts`

**Checkpoint**: Preview refreshes on valid edits and preserves a stale last-known-good form on invalid intermediate states.

---

## Phase 6: User Story 4 - Use grouped Studio modes that give preview enough space (Priority: P2)

**Goal**: Reorganize Studio into Navigate, Edit, Visualize, Preview, and Utilities so Form and Code preview are discoverable and usable on common desktop widths.

**Independent Test**: Start with a fresh workspace or Reset Layout at 1440x900 and 1280x800, then confirm the grouped mode arrangement, renamed Visualize surface, Preview → Form/Code pairing, and bottom utility tray behavior.

### Tests for User Story 4

- [X] T025 [P] [US4] Add default/reset layout regression coverage for Files + Model Tree under Navigate, Form + Code under Preview, and compact-width reachability in `apps/studio/test/shell/layout-factory.test.ts`, `apps/studio/test/shell/layout-migrations.test.ts`, and `apps/studio/test/shell/viewport.test.tsx`
- [X] T026 [P] [US4] Add Playwright layout, keyboard-only Preview workflow, and accessibility coverage for grouped modes in `apps/studio/test/e2e/dock-chrome.spec.ts`, `apps/studio/test/e2e/a11y.spec.ts`, and `apps/studio/test/e2e/form-preview.spec.ts`

### Implementation for User Story 4

- [X] T027 [US4] Rework default mode groups and user-facing labels so Navigate contains Files + Model Tree, Edit contains Source + Structure, and Preview contains Form + Code in `apps/studio/src/shell/layout-factory.ts`, `apps/studio/src/shell/layout-types.ts`, and `apps/studio/src/shell/DockShell.tsx`
- [X] T028 [US4] Move Form and Code into Preview and rename the graph experience to Visualize in `apps/studio/src/shell/panels/CodePreviewPanel.tsx`, `apps/studio/src/shell/panels/VisualPreviewPanel.tsx`, and `apps/studio/src/shell/ActivityBar.tsx`
- [X] T029 [US4] Implement collapsible bottom utility behavior for Problems and Messages in `apps/studio/src/shell/panels/ProblemsPanel.tsx`, `apps/studio/src/shell/panels/OutputPanel.tsx`, and `apps/studio/src/shell/DockShell.tsx`
- [X] T030 [US4] Improve generated code readability and compact-view source usability in `apps/studio/src/components/CodePreviewPanel.tsx`, `apps/studio/src/components/SourceEditor.tsx`, and `apps/studio/src/services/debounced-reparse.ts`

**Checkpoint**: Fresh and reset layouts expose stable grouped modes and keep Preview/Form/Code usable on desktop widths.

---

## Phase 7: User Story 5 - Inspect generated sample data from the preview (Priority: P3)

**Goal**: Show the current preview sample as structured data and let the user copy it as a downstream fixture.

**Independent Test**: Fill a valid preview sample, open the sample-data view, confirm it mirrors the current form values, and copy it into a plain text editor.

### Tests for User Story 5

- [X] T031 [P] [US5] Add component coverage for sample-data view, readable structured output, and keyboard copy interactions in `apps/studio/test/components/FormPreviewPanel.test.tsx`
- [X] T032 [P] [US5] Extend `apps/studio/test/e2e/form-preview.spec.ts` with sample-data copy coverage

### Implementation for User Story 5

- [X] T033 [US5] Add structured sample-data preview and copy action UI in `apps/studio/src/components/FormPreviewPanel.tsx`
- [X] T034 [US5] Keep serialized sample data synchronized with live form values in `apps/studio/src/store/preview-store.ts` and `apps/studio/src/components/FormPreviewPanel.tsx`

**Checkpoint**: Users can inspect and copy the preview sample without persisting it into the model.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final parity, performance, and verification work that spans multiple stories.

- [X] T035 [P] Add cross-story regression coverage for z2f parity, exported-subschema mapping, unsupported/recursive cases, and stale/unavailable accessibility announcements in `packages/codegen/test/preview-schema.test.ts`, `apps/studio/test/components/FormPreviewPanel.test.tsx`, and `apps/studio/test/services/nfr-verification.test.tsx`
- [X] T036 [P] Add privacy verification that preview sample data stays in-memory only and emits no network requests during preview/edit/reset/validate flows in `apps/studio/test/services/nfr-verification.test.tsx` and `apps/studio/test/e2e/form-preview.spec.ts`
- [X] T037 [P] Add success-criteria verification for preview latency, supported field-kind parity, and visible valid/invalid summary status in `apps/studio/test/services/nfr-verification.test.tsx`, `apps/studio/test/e2e/form-preview.spec.ts`, and `packages/codegen/test/preview-schema.test.ts`
- [X] T038 Validate the manual and automated flows in `specs/016-studio-form-preview/quickstart.md` and update any mismatched verification steps in that file

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies
- **Phase 2 (Foundational)**: Depends on Phase 1 and blocks all user stories
- **Phase 3 (US1)**: Depends on Phase 2
- **Phase 4 (US2)**: Depends on Phase 3 because validation builds on the working form preview surface
- **Phase 5 (US3)**: Depends on Phase 3 and shares preview state pipeline from US1
- **Phase 6 (US4)**: Depends on Phase 2 and should land before final polish so the preview surfaces are in their intended layout
- **Phase 7 (US5)**: Depends on Phase 4 because sample-data inspection builds on live validated form state
- **Phase 8 (Polish)**: Depends on all selected user stories being complete

### User Story Dependencies

- **US1 (P1)**: First deliverable; establishes z2f-derived preview rendering
- **US2 (P1)**: Extends US1 with z2f-parity validation and accessibility feedback
- **US3 (P2)**: Extends the same preview pipeline with stale-state and refresh behavior
- **US4 (P2)**: Reorganizes the shell around Preview/Visualize and can proceed after foundational plumbing
- **US5 (P3)**: Depends on validated live sample state from US2

### Within Each User Story

- Write tests first and confirm they fail before implementation
- Finish z2f preview-schema or state plumbing before UI wiring in the same story
- Commit the green state after each completed task or tightly coupled RED/GREEN slice
- Complete the story checkpoint before moving to the next dependent story

### Parallel Opportunities

- `T002` and `T003` can run together after `T001`
- Test tasks marked `[P]` within each story can run together
- `T025` and `T026` can run together for layout coverage
- After Phase 2, US4 can proceed in parallel with US1/US3 if staffing allows

---

## Parallel Example: User Story 1

```bash
# Launch the User Story 1 tests together:
Task: "T009 [US1] Add component coverage for no-selection, unsupported, and nested-field rendering in apps/studio/test/components/FormPreviewPanel.test.tsx"
Task: "T010 [US1] Add end-to-end selection-to-preview coverage in apps/studio/test/e2e/form-preview.spec.ts"
```

## Parallel Example: User Story 4

```bash
# Launch the grouped-layout coverage tasks together:
Task: "T025 [US4] Add default/reset layout regression coverage in apps/studio/test/shell/layout-factory.test.ts, apps/studio/test/shell/layout-migrations.test.ts, and apps/studio/test/shell/viewport.test.tsx"
Task: "T026 [US4] Add Playwright layout and accessibility coverage for grouped modes in apps/studio/test/e2e/dock-chrome.spec.ts and apps/studio/test/e2e/a11y.spec.ts"
```

---

## Implementation Strategy

### Recommended MVP

Deliver **US1 + US2** first. Both are P1, and together they provide the minimum useful feature: a rendered preview plus schema-parity validation feedback.

### Incremental Delivery

1. Complete Setup + Foundational to establish the preview-schema pipeline
2. Deliver US1 (rendered preview)
3. Deliver US2 (validation and accessibility feedback)
4. Deliver US3 (stale-state refresh behavior)
5. Deliver US4 (grouped mode layout and code readability)
6. Deliver US5 (sample-data inspection and copy)

### Parallel Team Strategy

1. One developer completes Phases 1-2
2. After Phase 2:
   - Developer A: US1 → US2
   - Developer B: US4 layout work
   - Developer C: US3 stale-state plumbing once US1 preview flow exists
3. Finish with US5 and Polish once the core preview flow is stable

---

## Notes

- All tasks use explicit file paths so they are directly executable
- `[P]` markers are only used where tasks do not share files or unresolved dependencies
- Preview sample state remains in-memory only; no persistence or network transmission work should be added
- Studio preview work must reuse z2f schema behavior, including exported-subschema defaults, instead of inventing a parallel schema-mapping path
- Generated source execution via `eval` or dynamic module loading is explicitly out of scope
