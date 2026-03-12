# Tasks: Optimize UI Performance for Large Folders

**Input**: Design documents from `/specs/refactor/001-optimize-ui-performance/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Not explicitly requested — test tasks included only where existing tests must be verified or new utility functions need coverage.

**Organization**: Tasks are grouped by refactoring concern (mapped as user stories) to enable independent implementation and testing. Each concern is independently deliverable and reversible.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which refactoring concern this task belongs to (US1=Explorer, US2=Diagnostics, US3=LSP, US4=FileLoading)
- Exact file paths included in descriptions

## Path Conventions

- **Monorepo**: `packages/visual-editor/src/`, `apps/studio/src/`, `packages/lsp-server/src/`, `packages/core/`

---

## Constitution Check

**Relevant Principles**:

| Principle | Applicability | Compliance |
|-----------|--------------|------------|
| I. DSL Fidelity & Typed AST | Not directly affected — no grammar/parser changes | ✅ N/A |
| II. Deterministic Fixtures | CDM conformance test validates behavior preservation | ✅ T024, T032 |
| III. Validation Parity | No validation rule changes — diagnostics output unchanged | ✅ T036 behavioral snapshot |
| IV. Performance & Workers | Directly targeted — virtualization + batch sync improve latency | ✅ T033/T034 metrics comparison |
| V. Reversibility & Compatibility | Each phase independently revertable via git revert | ✅ Incremental commits |

**Refactor Quality Gates** (from constitution §Workflow & Quality Gates → Refactor):
- [x] Baseline metrics MUST be captured before changes → T0B2 captures baseline
- [x] Tests MUST pass after every incremental change → Checkpoint at each phase
- [x] Behavior preservation MUST be guaranteed → T036 verifies behavioral snapshot
- [x] Target metrics MUST show improvement → T033/T034 compare before/after

---

## Phase 0: Testing Gap Assessment & Baseline

**Purpose**: Ensure adequate test coverage for affected code before refactoring, then capture baseline metrics

**CRITICAL**: Must complete BEFORE any code changes — constitution requires baseline metrics and test coverage

- [x] T0A1 Assess test coverage for `NamespaceExplorerPanel.tsx` — verify existing 14 tests cover render, expand/collapse, search, hide/show behaviors in `packages/visual-editor/test/components/NamespaceExplorerPanel.test.tsx`
- [x] T0A2 Assess test coverage for `namespace-tree.ts` (`buildNamespaceTree`, `filterNamespaceTree`) — verify existing tests in `packages/visual-editor/test/utils/namespace-tree.test.ts`
- [x] T0A3 Assess test coverage for `lsp-client.ts` `syncWorkspaceFiles()` — verify existing 18 tests in `apps/studio/test/services/lsp-client.test.ts` cover the workspace sync lifecycle
- [x] T0A4 Assess test coverage for `workspace.ts` `readFileList()` — verify existing 11 tests in `apps/studio/test/services/workspace.test.ts`
- [x] T0A5 [P] Add missing tests for any critical gaps identified in T0A1–T0A4
- [x] T0B1 Run full test suite: `pnpm -r run test` — all 923+ tests must pass before baseline
- [x] T0B2 Run `measure-metrics.sh --before` to capture pre-refactor baseline in `specs/refactor/001-optimize-ui-performance/metrics-before.md`

**Checkpoint**: Testing gaps assessed, critical gaps filled, baseline metrics captured, ready to begin refactoring

---

## Phase 1: Setup

**Purpose**: Add new dependency and establish shared infrastructure

- [x] T001 Add `@tanstack/react-virtual` dependency to `packages/visual-editor/package.json`
- [x] T001b Add `@tanstack/react-virtual` dependency to `apps/studio/package.json` (needed for DiagnosticsPanel virtualization in US2)
- [x] T002 Run `pnpm install` and verify build succeeds across all packages
- [x] T003 [P] Add `FlatTreeRow` type to `packages/visual-editor/src/utils/namespace-tree.ts`
- [x] T005 [P] Add `WorkspaceLoadProgress` interface to `apps/studio/src/services/workspace.ts`

**Checkpoint**: Dependencies installed, new types defined, all existing tests still pass

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement the `flattenNamespaceTree()` utility that US1 depends on, and verify existing test coverage

**CRITICAL**: US1 (Explorer virtualization) cannot begin until flatten utility is complete and tested

- [x] T006 Implement `flattenNamespaceTree(tree, expandedNamespaces, hiddenNodeIds, searchQuery?)` in `packages/visual-editor/src/utils/namespace-tree.ts`
- [x] T007 Add tests for `flattenNamespaceTree()` in `packages/visual-editor/test/utils/namespace-tree.test.ts` — cover: all expanded, all collapsed, partial expand, search filter, hidden nodes
- [x] T008 Run full visual-editor test suite (554+ tests must pass)

**Checkpoint**: Foundation ready — flattening utility tested and working, user story implementation can begin

---

## Phase 3: US1 — Virtualize Namespace Explorer (Priority: P1) MVP

**Goal**: Replace ScrollArea with `@tanstack/react-virtual` for the namespace explorer tree. Only visible rows (~30-50) render to DOM instead of 10K+ elements.

**Independent Test**: Load CDM corpus (142 files, 10K+ types), open explorer — tree renders instantly, scrolling is smooth, expand/collapse/search all work. All 14 existing NamespaceExplorerPanel tests pass.

### Implementation for US1

- [x] T009 [US1] Create `useVirtualTree` hook in `packages/visual-editor/src/hooks/useVirtualTree.ts` — wraps `useVirtualizer` with tree-specific config (estimateSize: namespace=36px, type=28px), accepts `FlatTreeRow[]` and scroll container ref
- [x] T010 [US1] Replace nested namespace/type `.map()` loops in `NamespaceExplorerPanel.tsx` (`packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx`) with a single flat list rendered by `useVirtualTree` over `flattenNamespaceTree()` output; preserve all `data-testid` attributes, click handlers, and aria attributes
- [x] T011 [US1] Update namespace header row rendering in `NamespaceExplorerPanel.tsx` — render with `position: absolute` + `translateY` from virtualizer; preserve expand/collapse toggle, hide/show button, type count badge
- [x] T012 [US1] Update type item row rendering in `NamespaceExplorerPanel.tsx` — render with `position: absolute` + `translateY`; preserve show/hide eye icon, type kind icon, click-to-navigate, tooltip
- [x] T013 [US1] Verify keyboard navigation works in virtualized explorer — tab order, arrow keys for tree traversal, Enter to select
- [x] T014 [US1] Run existing NamespaceExplorerPanel tests in `packages/visual-editor/test/components/NamespaceExplorerPanel.test.tsx` (14 tests) — fix any that test DOM structure implementation details (e.g., nested containers) while preserving behavioral assertions
- [x] T015 [US1] Run full visual-editor test suite (554+ tests must pass)

**Checkpoint**: Explorer virtualizes 10K+ types, renders <100ms, all existing tests pass

---

## Phase 4: US2 — Virtualize DiagnosticsPanel (Priority: P2)

**Goal**: Apply same `@tanstack/react-virtual` pattern to the diagnostics list. Only visible diagnostic rows render.

**Independent Test**: Load CDM corpus with linking errors, open Problems panel — diagnostics render instantly, scrolling smooth, click-to-navigate works. All 8 existing DiagnosticsPanel tests pass.

### Implementation for US2

- [x] T015b [P] [US2] Add `FlatDiagnosticRow` type to `apps/studio/src/utils/flatten-diagnostics.ts` (new file) — defines row types for virtualized diagnostics list
- [x] T016 [P] [US2] Implement `flattenDiagnostics(diagnosticsByFile)` in `apps/studio/src/utils/flatten-diagnostics.ts` — converts `Map<string, Diagnostic[]>` to `FlatDiagnosticRow[]` with file headers and diagnostic items
- [x] T017 [P] [US2] Add tests for `flattenDiagnostics()` in `apps/studio/test/utils/flatten-diagnostics.test.ts` (new file) — cover: empty map, single file, multiple files, sorting
- [x] T018 [US2] Refactor `DiagnosticsPanel.tsx` in `apps/studio/src/components/DiagnosticsPanel.tsx` — replace `.map()` rendering with `useVirtualizer` + `flattenDiagnostics()`; preserve file header grouping, click-to-navigate, severity icons, `data-testid` attributes
- [x] T019 [US2] Run existing DiagnosticsPanel tests in `apps/studio/test/components/DiagnosticsPanel.test.tsx` (8 tests) — fix any implementation-detail tests while preserving behavioral assertions
- [x] T020 [US2] Run full studio test suite (153+ tests must pass)

**Checkpoint**: DiagnosticsPanel virtualizes large diagnostic lists, all existing tests pass

---

## Phase 5: US3 — Optimize LSP Batch Sync (Priority: P3)

**Goal**: Reduce redundant `didChange` notifications during batch file loading. The refresh loop that sends `didChange` to ALL unchanged files should be debounced into a single batch.

**Scope**: Client-side (`apps/studio/src/services/lsp-client.ts`) AND server-side (`packages/lsp-server/src/rune-dsl-server.ts`, `packages/lsp-server/src/connection-adapter.ts`). Client debounces redundant `didChange` notifications; server adds workspace folder capability to receive batched file content from the client.

**Independent Test**: Load CDM corpus — LSP client sends `didOpen` for each file but only ONE batch revalidation trigger (not N individual `didChange` to unchanged files). CDM conformance: 0 errors, 0 warnings.

### Implementation for US3

- [x] T020b [US3] Add workspace folder capability to `packages/lsp-server/src/rune-dsl-server.ts` — register `workspace/didChangeWorkspaceFolders` handler and advertise `workspaceFolders` server capability
- [x] T020c [US3] Update `packages/lsp-server/src/connection-adapter.ts` to support batched workspace notifications — accept a batch of file contents from the client in a single message instead of requiring N individual `didOpen` calls
- [x] T021 [US3] Optimize `syncWorkspaceFiles()` refresh loop in `apps/studio/src/services/lsp-client.ts` — replace the per-file `didChange` notifications sent after all `didOpen` calls (the loop that re-sends content for every previously-opened file) with a debounced single revalidation using `requestIdleCallback` or `setTimeout(0)` after all `didOpen` calls complete
- [x] T022 [US3] Add `_pendingRefresh` coalescing logic to `lsp-client.ts` — if a refresh is already scheduled, skip duplicate requests; clear pending refresh on disconnect
- [x] T023 [US3] Run existing lsp-client tests in `apps/studio/test/services/lsp-client.test.ts` (18 tests) and lsp-server tests — verify all pass, especially the workspace sync lifecycle tests
- [x] T024 [US3] Run CDM conformance test via `cd packages/core && npx vitest run cdm-deep-diag` — must show 0 errors, 0 warnings (validates cross-file resolution still works with batched workspace sync)
- [x] T025 [US3] Run full studio test suite (153+ tests must pass) and lsp-server test suite

**Checkpoint**: LSP batch sync optimized, CDM conformance passes, all existing tests pass

---

## Phase 6: US4 — Chunked File Loading with Progress (Priority: P4)

**Goal**: Add progress indication when loading large folders. Files read in chunks of 10 with progress callback. UI shows "Loading 42/142 files..." progress bar.

**Independent Test**: Load CDM corpus (142 files) — progress bar appears showing file count, UI remains responsive during loading, no freeze.

### Implementation for US4

- [x] T026 [US4] Add `onProgress` callback parameter to `readFileList()` in `apps/studio/src/services/workspace.ts` — chunk file reading into batches of 10, call `onProgress({ phase: 'reading', loaded, total })` between chunks
- [x] T027 [US4] Add `WorkspaceLoadProgress` state management to `apps/studio/src/components/FileLoader.tsx` — track loading phase and progress, pass callback to `readFileList()`
- [x] T028 [US4] Add progress bar UI to `FileLoader.tsx` — show determinate progress bar with "Loading N/M files..." text during `reading` phase, "Syncing with language server..." during `syncing` phase
- [x] T029 [US4] Run existing workspace tests in `apps/studio/test/services/workspace.test.ts` (11 tests) — verify backward compatibility (no progress callback = existing behavior)
- [x] T030 [US4] Run full studio test suite (153+ tests must pass)

**Checkpoint**: File loading shows progress, UI stays responsive for 142+ files, all existing tests pass

---

## Phase 7: Validation & Polish

**Purpose**: Full cross-cutting validation after all refactoring concerns complete

- [x] T031 Run full test suite across ALL packages: `pnpm -r run test` (923+ tests must pass) — 936 tests pass (169+47+561+159)
- [x] T032 Run CDM conformance test: `cd packages/core && npx vitest run cdm-deep-diag` (0 errors, 0 warnings)
- [x] T033 Run `measure-metrics.sh --after` to capture post-refactor metrics in `specs/refactor/001-optimize-ui-performance/metrics-after.md`
- [x] T034 Compare `metrics-before.md` vs `metrics-after.md` — document improvements: +13 tests, -1s build time, -0.1M bundle size, all tests pass
- [X] T035 Manual testing: load full CDM corpus in studio, verify explorer scrolls smoothly, diagnostics panel responsive, file loading shows progress
- [x] T036 Verify behavioral snapshot from `specs/refactor/001-optimize-ui-performance/behavioral-snapshot.md` — all 6 behaviors preserved
- [x] T037 [P] Clean up any temporary debug logging or console.log statements — no debug logging found
- [x] T038 Type-check all packages: `pnpm -r run type-check` — all 6 packages clean

**Checkpoint**: All metrics improved, all tests pass, behavior preserved, ready for review

---

## Dependencies & Execution Order

### Phase Dependencies

- **Testing Gaps & Baseline (Phase 0)**: No dependencies — start immediately, MUST complete before any code changes
- **Setup (Phase 1)**: Depends on Phase 0 (baseline captured)
- **Foundational (Phase 2)**: Depends on Phase 1 (T001/T002 for dependency) — BLOCKS US1
- **US1 Explorer (Phase 3)**: Depends on Phase 2 (`flattenNamespaceTree`)
- **US2 Diagnostics (Phase 4)**: Depends on Phase 1 only — can run in PARALLEL with US1
- **US3 LSP Sync (Phase 5)**: Depends on Phase 1 only — can run in PARALLEL with US1/US2
- **US4 File Loading (Phase 6)**: Depends on Phase 1 only — can run in PARALLEL with US1/US2/US3
- **Validation (Phase 7)**: Depends on ALL user stories complete

### User Story Independence

- **US1 (Explorer)**: Depends on `flattenNamespaceTree` (Phase 2). Fully independent of US2/US3/US4.
- **US2 (Diagnostics)**: Fully independent. Can start after Phase 1.
- **US3 (LSP Sync)**: Fully independent. Can start after Phase 1.
- **US4 (File Loading)**: Fully independent. Can start after Phase 1.

### Within Each User Story

- Utilities/types before component refactoring
- Component refactoring before test verification
- Test verification before declaring checkpoint

### Parallel Opportunities

- T003, T005 can run in parallel (different files)
- US2, US3, US4 can all start in parallel after Phase 1
- T015b, T016, and T017 can run in parallel within US2
- T020b and T020c can run in parallel within US3 (different packages)
- T037 can run in parallel with T038

---

## Parallel Example: After Phase 1 Completes

```
# Three concerns can proceed simultaneously:

Stream A (Explorer — highest impact):
  T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015

Stream B (Diagnostics):
  T015b + T016 + T017 (parallel) → T018 → T019 → T020

Stream C (LSP Sync — client + server):
  T020b + T020c (parallel, different packages) → T021 → T022 → T023 → T024 → T025

Stream D (File Loading):
  T026 → T027 → T028 → T029 → T030
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 0: Testing Gaps & Baseline (T0A1-T0B2)
2. Complete Phase 1: Setup (T001-T005)
3. Complete Phase 2: Foundational (T006-T008)
4. Complete Phase 3: US1 Explorer Virtualization (T009-T015)
5. **STOP and VALIDATE**: Explorer renders 10K+ types smoothly
6. This alone delivers the highest-impact improvement

### Incremental Delivery

1. Phase 0 → Testing gaps assessed, baseline captured
2. Setup + Foundational → Dependencies and utilities ready
3. US1 Explorer → Test independently → Commit (MVP!)
4. US2 Diagnostics → Test independently → Commit
5. US3 LSP Sync → Test independently → Commit
6. US4 File Loading → Test independently → Commit
7. Phase 7 Validation → Full cross-cutting verification

### Recommended Order (Sequential)

Phase 0 → Phase 1 → Phase 2 → US1 → US2 → US3 → US4 → Phase 7

Phase 0 first (constitution requirement), US1 first of user stories (highest user-visible impact), US2 next (same pattern, fastest), US3 (medium risk), US4 (lowest risk).

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific refactoring concern for traceability
- Each user story is independently completable, testable, and reversible via `git revert`
- Commit after each completed phase
- All 923+ existing tests must pass after every phase — no exceptions
- CDM conformance (0 errors, 0 warnings) verified at US3 and Phase 7
