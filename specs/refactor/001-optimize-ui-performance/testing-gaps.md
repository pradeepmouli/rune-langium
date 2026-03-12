# Testing Gaps Assessment

**Purpose**: Identify and address test coverage gaps BEFORE establishing baseline metrics.

**Status**: [x] Assessment Complete | [x] Gaps Identified | [x] Tests Added | [x] Ready for Baseline

---

## Why Test Gaps Matter for Refactoring

Refactoring requires **behavior preservation validation**. If the code being refactored lacks adequate test coverage, we cannot verify that behavior is preserved after the refactoring.

**Critical Rule**: All functionality impacted by this refactoring MUST have adequate test coverage BEFORE the baseline is captured.

---

## Phase 0: Pre-Baseline Testing Gap Analysis

### Step 1: Identify Affected Functionality

**Code areas that will be modified during refactoring**:

- [ ] File: `packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx`
  - Component: `NamespaceExplorerPanel` — renders tree of namespaces/types
  - Interactions: expand/collapse namespaces, search/filter, toggle visibility, click to navigate

- [ ] File: `packages/visual-editor/src/utils/namespace-tree.ts`
  - Functions: `buildNamespaceTree()`, `filterNamespaceTree()`
  - Purpose: Build tree structure from graph nodes, filter by search query

- [ ] File: `apps/studio/src/services/lsp-client.ts`
  - Functions: `syncWorkspaceFiles()`, `connect()`, `disconnect()`
  - Purpose: Sync workspace files to LSP server via didOpen/didChange/didClose

- [ ] File: `apps/studio/src/services/workspace.ts`
  - Functions: `readFileList()`, `parseWorkspaceFiles()`
  - Purpose: Read files from File API, batch parse via worker

- [ ] File: `apps/studio/src/components/FileLoader.tsx`
  - Component: `FileLoader` — drag-drop + file picker UI
  - Purpose: Entry point for loading files into workspace

- [ ] File: `packages/lsp-server/src/rune-dsl-server.ts`
  - Function: `createRuneDslServer()`
  - Purpose: LSP server creation with capabilities

- [ ] File: `packages/lsp-server/src/connection-adapter.ts`
  - Class: `ConnectionAdapter`
  - Purpose: Bridge LSPServer to vscode-languageserver Connection API

**Downstream dependencies** (code that calls the above):
- `apps/studio/src/pages/EditorPage.tsx` → orchestrates workspace + LSP + editor
- `packages/visual-editor/src/components/RuneTypeGraph.tsx` → consumes explorer selections

### Step 2: Assess Current Test Coverage

#### Coverage Area 1: `NamespaceExplorerPanel`
**Location**: `packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx`

**Current Test Coverage**:
- Test file: ✅ `packages/visual-editor/test/components/NamespaceExplorerPanel.test.tsx`
- Coverage: ✅ 14 tests covering all critical functionality
- Test types: [x] Unit [x] Component

**Coverage Assessment**:
- [x] ✅ Adequate — all critical interactions tested

**Tests Added**:
1. ✅ Renders explorer container
2. ✅ Renders all namespaces
3. ✅ Shows total type count in header badge
4. ✅ Shows types within expanded namespaces
5. ✅ Shows empty state when no nodes
6. ✅ Calls onExpandAll/onCollapseAll when buttons clicked
7. ✅ Calls onToggleNode when type visibility toggled
8. ✅ Calls onSelectNode when type name clicked
9. ✅ Filters types when search query entered
10. ✅ Shows "No matching namespaces" message
11. ✅ Highlights selected node
12. ✅ Shows reduced visible count when namespaces/nodes hidden

#### Coverage Area 2: `buildNamespaceTree` / `filterNamespaceTree`
**Location**: `packages/visual-editor/src/utils/namespace-tree.ts`

**Current Test Coverage**:
- Test file: ✅ `packages/visual-editor/test/utils/namespace-tree.test.ts` (already existed)
- Coverage: ✅ Comprehensive tests already present
- Test types: [x] Unit

**Coverage Assessment**:
- [x] ✅ Adequate — already had comprehensive tests (initial assessment was incorrect)

**Existing Tests Cover**:
1. ✅ `buildNamespaceTree()`: Groups nodes by namespace
2. ✅ `buildNamespaceTree()`: Sorts namespaces and types alphabetically
3. ✅ `buildNamespaceTree()`: Counts per kind
4. ✅ `filterNamespaceTree()`: Regex matching on type names
5. ✅ `filterNamespaceTree()`: Empty query returns all
6. ✅ Edge case: Empty input array

#### Coverage Area 3: `lsp-client.ts syncWorkspaceFiles`
**Location**: `apps/studio/src/services/lsp-client.ts`

**Current Test Coverage**:
- Test file: ✅ `apps/studio/test/services/lsp-client.test.ts` (extended with 8 new sync tests)
- Coverage: ✅ Full sync lifecycle tested
- Test types: [x] Unit

**Coverage Assessment**:
- [x] ✅ Adequate — all critical sync behaviors tested

**Tests Added**:
1. ✅ Sends didOpen for new files
2. ✅ Sends didChange for modified files
3. ✅ Sends didClose for removed files
4. ✅ Increments version numbers on subsequent changes
5. ✅ Handles batch of multiple new files
6. ✅ Does not send notifications when not connected
7. ✅ Refreshes unchanged files when new files are added
8. ✅ Does not change anything when files are identical

#### Coverage Area 4: `workspace.ts readFileList / parseWorkspaceFiles`
**Location**: `apps/studio/src/services/workspace.ts`

**Current Test Coverage**:
- Test file: `apps/studio/test/services/workspace.test.ts` ✅ Exists
- Coverage: Partial
- Test types: [x] Unit

**Coverage Assessment**:
- [x] ⚠️ Partial - has tests but missing large folder edge cases

**Specific Gaps Identified**:
1. ⚠️ Large folder (100+ files): behavior under load — NOT TESTED
2. ⚠️ Progress reporting during load — NOT TESTED (doesn't exist yet)

#### Coverage Area 5: `connection-adapter.ts`
**Location**: `packages/lsp-server/src/connection-adapter.ts`

**Current Test Coverage**:
- Test file: Has basic integration tests via cli-transport.test.ts
- Coverage: Partial for core handshake
- Test types: [x] Integration

**Coverage Assessment**:
- [x] ⚠️ Partial - basic handshake tested, workspace folders not tested

#### Coverage Area 6: `rune-dsl-server.ts`
**Location**: `packages/lsp-server/src/rune-dsl-server.ts`

**Current Test Coverage**:
- Test file: `packages/lsp-server/test/cli-transport.test.ts`
- Coverage: Initialize handshake tested
- Test types: [x] Integration

**Coverage Assessment**:
- [x] ✅ Adequate for current functionality (workspace folder support doesn't exist yet)

---

## Testing Gaps Summary

### Critical Gaps (MUST fix before baseline) — ALL RESOLVED

1. **Gap 1**: `buildNamespaceTree()` and `filterNamespaceTree()` — ✅ ALREADY HAD TESTS
   - Tests existed in `packages/visual-editor/test/utils/namespace-tree.test.ts`
   - Initial assessment was incorrect; comprehensive coverage already present

2. **Gap 2**: `NamespaceExplorerPanel` — ✅ RESOLVED (14 tests added)
   - Test file: `packages/visual-editor/test/components/NamespaceExplorerPanel.test.tsx`
   - Covers: rendering, interactions, search, visibility, selection

3. **Gap 3**: `lsp-client.ts syncWorkspaceFiles()` — ✅ RESOLVED (8 tests added)
   - Extended: `apps/studio/test/services/lsp-client.test.ts`
   - Covers: didOpen, didChange, didClose, versioning, batch, refresh

### Important Gaps (SHOULD fix before baseline)

1. **Gap 4**: `workspace.ts` missing large folder edge cases
   - **Impact**: Lower confidence in chunked loading behavior
   - **Priority**: :yellow_circle: Important
   - **Estimated effort**: 1 hour

### Nice-to-Have Gaps (CAN be deferred)

1. **Gap 5**: `connection-adapter.ts` workspace folder handling
   - **Impact**: Workspace folder support doesn't exist yet — will be tested as new code
   - **Priority**: :green_circle: Nice-to-have (test new code as it's written)
   - **Can be deferred**: Yes

---

## Test Addition Plan

### Tests to Add Before Baseline

**Total Estimated Effort**: ~8 hours

#### Test Suite 1: `packages/visual-editor/test/utils/namespace-tree.test.ts`
**Purpose**: Cover tree building and filtering logic

**New Test Cases**:
1. `buildNamespaceTree()` groups nodes by namespace
2. `buildNamespaceTree()` sorts namespaces alphabetically
3. `buildNamespaceTree()` sorts types within namespace alphabetically
4. `buildNamespaceTree()` counts per kind (data, choice, enum, func)
5. `buildNamespaceTree()` handles empty input
6. `filterNamespaceTree()` returns all for empty query
7. `filterNamespaceTree()` filters by regex match on type name
8. `filterNamespaceTree()` excludes namespaces with no matching types

#### Test Suite 2: `packages/visual-editor/test/components/NamespaceExplorerPanel.test.tsx`
**Purpose**: Cover component rendering and interactions

**New Test Cases**:
1. Renders namespace tree with type counts
2. Expand/collapse namespace toggle works
3. Search input filters visible types
4. Type visibility toggle fires callback
5. Click on type fires navigation callback

#### Test Suite 3: `apps/studio/test/services/lsp-client-sync.test.ts`
**Purpose**: Cover LSP document sync lifecycle

**New Test Cases**:
1. `syncWorkspaceFiles()` sends didOpen for new files
2. `syncWorkspaceFiles()` sends didChange for modified files
3. `syncWorkspaceFiles()` sends didClose for removed files
4. `syncWorkspaceFiles()` increments version numbers
5. `syncWorkspaceFiles()` handles batch of multiple new files

---

## Test Implementation Checklist

### Pre-Work
- [ ] Review vitest setup in visual-editor and studio packages
- [ ] Identify test patterns used in existing tests
- [ ] Set up test environment for component tests (jsdom/happy-dom)

### Test Writing
- [x] Write tests for namespace-tree.ts (Gap 1) — already existed
- [x] Write tests for NamespaceExplorerPanel (Gap 2) — 14 tests added
- [x] Write tests for lsp-client syncWorkspaceFiles (Gap 3) — 8 tests added
- [x] Ensure all new tests pass
- [x] Verify tests test behavior (not implementation)

### Validation
- [x] Run full test suite — all tests pass (studio: 153, visual-editor: 554)
- [ ] Commit tests separately from refactoring

### Ready for Baseline
- [x] All critical gaps addressed
- [x] All new tests passing
- [x] Behavioral snapshot can now be validated

---

## Decision: Proceed or Delay Refactoring?

### If Critical Gaps Found
- [x] **STOP**: Do NOT proceed with refactoring until tests are added
- [x] Add tests first, THEN return to refactor workflow

### If No Critical Gaps or All Gaps Addressed
- [x] **PROCEED**: Ready to capture baseline metrics

---

## Notes

**Date Assessed**: 2026-03-11
**Assessed By**: Claude (AI Agent)
**Test Framework**: Vitest
**Coverage Tool**: @vitest/coverage-v8

**Additional Context**:
- The CDM corpus conformance test (`cdm-deep-diag.test.ts`) serves as an end-to-end validation that parsing/linking/diagnostics work correctly — this test is already comprehensive and MUST pass before and after refactoring.
- The `namespace-tree.ts` utility functions are pure functions, making them easy to test.
- Component tests for `NamespaceExplorerPanel` require a test environment with React/DOM (already configured via happy-dom in visual-editor).

---

*This testing gaps assessment is part of the enhanced refactor workflow. Complete this BEFORE running `measure-metrics.sh --before`.*
