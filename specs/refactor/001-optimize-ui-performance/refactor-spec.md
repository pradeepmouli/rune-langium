# Refactor Spec: Optimize UI Performance for Large Folders

**Refactor ID**: refactor-001
**Branch**: `refactor/001-optimize-ui-performance`
**Created**: 2026-03-11
**Type**: [x] Performance | [ ] Maintainability | [ ] Security | [x] Architecture | [ ] Tech Debt
**Impact**: [ ] High Risk | [x] Medium Risk | [ ] Low Risk
**Status**: [x] Planning | [ ] Baseline Captured | [ ] In Progress | [ ] Validation | [ ] Complete

## Input
User description: "optimize UI performance when loading large folders, use workspaces with LSPServer (vs individual documents), virtualize node explorer"

## Motivation

### Current State Problems
**Code Smell(s)**:
- [x] Tight Coupling
- [x] Other: No virtualization for large lists; all-at-once document loading pattern

**Concrete Examples**:
- `apps/studio/src/services/workspace.ts`: `readFileList()` loads ALL files into memory at once with no streaming/chunking — CDM corpus is 142+ files
- `apps/studio/src/services/lsp-client.ts`: `syncWorkspaceFiles()` sends individual `didOpen`/`didChange` notifications per file — N round trips instead of workspace-based batch
- `packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx`: Renders all namespace tree nodes to DOM without virtualization (uses `ScrollArea` only) — CDM has 10,000+ types across 100+ namespaces
- `apps/studio/src/components/DiagnosticsPanel.tsx`: Renders all diagnostics as DOM elements without virtualization

### Business/Technical Justification
- [x] Blocking new features
- [x] Performance degradation
- [x] Developer velocity impact

**Why now**: The CDM corpus (142 .rosetta files, 10,000+ types) is the primary real-world test case. Studio must handle production-scale Rune DSL projects without UI freezing or jank. Current architecture works for small demos but degrades noticeably at CDM scale.

## Proposed Improvement

### Refactoring Pattern/Technique
**Primary Technique**: Introduce Virtualization + Workspace-Based Document Management

**High-Level Approach**:
Three independent improvements, each deliverable incrementally:
1. **Virtualize large lists** — Replace ScrollArea with `@tanstack/react-virtual` for the namespace explorer tree and DiagnosticsPanel, rendering only visible rows
2. **Batch LSP document loading** — Replace N individual `didOpen`/`didClose` calls with a single batched workspace notification; client still drives file content delivery (browser has no FS for Langium to discover from)
3. **Optimize file loading pipeline** — Add progress indication, chunked reading, and deferred parsing for large folders

**Files Affected**:
- **Modified**:
  - `packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx` — virtualize tree
  - `packages/visual-editor/src/utils/namespace-tree.ts` — flatten tree for virtual scrolling
  - `apps/studio/src/services/lsp-client.ts` — workspace-based sync
  - `apps/studio/src/services/workspace.ts` — chunked loading with progress
  - `apps/studio/src/components/FileLoader.tsx` — progress indication
  - `packages/lsp-server/src/rune-dsl-server.ts` — workspace folder capability
  - `packages/lsp-server/src/connection-adapter.ts` — workspace notifications
  - `apps/studio/src/components/DiagnosticsPanel.tsx` — virtualize diagnostics list
- **Created**:
  - `packages/visual-editor/src/hooks/useVirtualTree.ts` — virtual scrolling hook
- **Deleted**: None
- **Moved**: None

### Design Improvements
**Before**:
```
FileLoader → readFileList(ALL at once) → parseWorkspaceFiles(ALL) → syncWorkspaceFiles(individual didOpen x N)
Explorer: ScrollArea → render ALL namespace nodes to DOM (10K+ elements)
```

**After**:
```
FileLoader → readFileList(chunked, with progress) → single batched workspace notification
LSPServer: receives batch of file contents from client (client-driven, not Langium-discovered)
Explorer: @tanstack/react-virtual → render VISIBLE rows only (~30-50 visible at a time)
```

> **Clarification**: The browser has no file system, so Langium cannot discover files via workspace folders. Instead, the client batches file contents into a single workspace-level notification (vs N individual didOpen calls). Langium's document manager receives the batch but file discovery remains client-driven.

## Phase 0: Testing Gap Assessment
*CRITICAL: Complete BEFORE capturing baseline metrics - see testing-gaps.md*

### Pre-Baseline Testing Requirement
- [ ] **Testing gaps assessment completed** (see `testing-gaps.md`)
- [ ] **Critical gaps identified and addressed**
- [ ] **All affected functionality has adequate test coverage**
- [ ] **Ready to capture baseline metrics**

### Testing Coverage Status
**Affected Code Areas**:
- `NamespaceExplorerPanel.tsx`: No dedicated test file — Needs Tests
- `namespace-tree.ts (buildNamespaceTree, filterNamespaceTree)`: No dedicated test file — Needs Tests
- `lsp-client.ts syncWorkspaceFiles()`: No dedicated test file — Needs Tests
- `workspace.ts readFileList()`: Has `apps/studio/test/services/workspace.test.ts` — Needs assessment
- `connection-adapter.ts`: Has basic tests — Needs assessment for workspace folder support
- `rune-dsl-server.ts`: Has `packages/lsp-server/test/cli-transport.test.ts` — Adequate for handshake

**Action Taken**:
- [ ] No gaps found - proceeded to baseline
- [ ] Gaps found - added [N] tests before baseline
- [ ] Gaps documented but deferred (with justification)

---

## Baseline Metrics
*Captured AFTER testing gaps are addressed - see metrics-before.md*

### Code Complexity
- **Lines of Code**: TBD
- **Function Length (avg/max)**: TBD

### Test Coverage
- **Overall Coverage**: ~35%

### Performance
- **Build Time**: TBD (see metrics-before.md)
- **Runtime — Explorer render (10K types)**: TBD
- **Runtime — File loading (142 files)**: TBD
- **Runtime — LSP workspace sync**: TBD

## Target Metrics

### Performance Goals
- **Explorer render with 10K types**: < 100ms initial render (windowed)
- **File loading for 142 files**: < 3s with progress indication, no UI freeze
- **LSP workspace sync**: Single workspace notification vs N individual didOpen calls
- **Memory Usage**: Reduce peak during large folder load

### Success Threshold
**Minimum acceptable improvement**: Explorer virtualizes at 500+ types (only visible rows rendered), workspace loading shows progress without UI freeze, LSP uses workspace-based document management. All existing tests pass unchanged.

## Behavior Preservation Guarantee

### External Contracts Unchanged
- [x] Function signatures unchanged (or properly deprecated)
- [x] Component props unchanged
- [x] CLI arguments unchanged

### Test Suite Validation
- [x] **All existing tests MUST pass WITHOUT modification**
- [x] If test needs changing, verify it was testing implementation detail, not behavior
- [x] Do NOT weaken assertions to make tests pass

### Behavioral Snapshot
**Key behaviors to preserve** (see behavioral-snapshot.md):
1. Loading a folder of .rosetta files produces identical parsed AST and diagnostics
2. Explorer shows all namespaces and types, grouped and sorted alphabetically
3. Search/filter in explorer produces identical filtered results
4. Clicking a type in explorer navigates to it in the graph
5. LSP diagnostics (errors, warnings) identical for the same input files
6. Source editor <-> graph bidirectional sync works identically

## Risk Assessment

### Risk Level Justification
**Why Medium Risk**: Changes touch UI rendering (explorer) and document management (LSP client/server). Explorer virtualization is a well-understood pattern with low risk. LSP workspace changes affect document loading order but not parsing/validation logic. File loading changes are UI-only (progress). No changes to grammar, parser, scope provider, or validator.

### Potential Issues
- **Risk 1**: Virtualized explorer may break keyboard navigation
  - **Mitigation**: @tanstack/react-virtual handles keyboard and a11y; test with keyboard
  - **Rollback**: Revert to ScrollArea (single commit)

- **Risk 2**: Workspace-based LSP loading may change diagnostic ordering
  - **Mitigation**: CDM conformance test validates 0 errors/warnings — run before and after
  - **Rollback**: Revert to individual document sync

- **Risk 3**: Chunked file loading may cause state inconsistency
  - **Mitigation**: Clear loading states, queue-based approach
  - **Rollback**: Revert to batch loading

### Safety Measures
- [x] Incremental commits (can revert partially)
- [x] Peer review required
- [ ] Feature flag available for gradual rollout

## Rollback Plan

### How to Undo
1. `git revert` the relevant commits
2. No manual cleanup needed — changes are code-only
3. Run full test suite to verify

### Rollback Triggers
- [x] Test suite failure
- [x] Performance regression > 10%
- [x] Explorer fails to show types visible before
- [x] CDM conformance test fails (diagnostics differ)

### Recovery Time Objective
**RTO**: < 5 minutes (single git revert + push)

## Implementation Plan

### Phase 0: Testing Gap Assessment
1. Add tests for `buildNamespaceTree()` and `filterNamespaceTree()`
2. Add tests for NamespaceExplorerPanel rendering (render, expand, search)
3. Add tests for `lsp-client.ts` syncWorkspaceFiles lifecycle
4. Verify workspace.ts coverage adequate
5. All new tests passing

### Phase 1: Baseline
1. Capture performance metrics with CDM corpus
2. Document: explorer render time, file loading time, LSP sync time
3. `git tag pre-refactor-001`

### Phase 2: Refactoring (Incremental)
1. Add `@tanstack/react-virtual` dependency
2. Flatten namespace tree for virtual scrolling
3. Virtualize NamespaceExplorerPanel
4. Virtualize DiagnosticsPanel
5. Add workspace folder capability to LSP server
6. Switch lsp-client to batched workspace sync
7. Add progress indication + chunked file loading

### Phase 3: Validation
1. Full test suite (MUST pass 100%)
2. CDM conformance test (MUST show 0 errors, 0 warnings)
3. Re-measure performance metrics
4. Compare behavioral snapshot
5. Manual testing with CDM corpus in studio

## Verification Checklist

### Phase 0: Testing Gap Assessment
- [ ] Testing gaps assessment completed (testing-gaps.md)
- [ ] Tests added for critical gaps
- [ ] All new tests passing

### Pre-Refactoring (Phase 1)
- [ ] Baseline metrics captured
- [ ] All tests passing
- [ ] Git tag created

### During Refactoring
- [ ] Incremental commits (each compiles and tests pass)
- [ ] External behavior unchanged

### Post-Refactoring
- [ ] All tests still passing
- [ ] CDM conformance: 0 errors, 0 warnings
- [ ] Performance targets met
- [ ] Code review approved

## Related Work

### Blocks
- Large project support (CDM-scale workspaces) in production studio
- Real-time collaboration features (need efficient document sync)

### Enables
- Incremental parsing (only re-parse changed files)
- File watching (detect external edits)
- Multi-root workspace support

### Dependencies
- None — can proceed independently

## Clarifications

### Session 2026-03-11
- Q: How should LSP workspace folder support work given browser has no file system? → A: Client-driven batch delivery — client sends file contents in a single workspace notification; Langium receives but does not discover files.
- Q: Is DiagnosticsPanel virtualization in scope? → A: Yes — virtualize alongside NamespaceExplorerPanel using the same @tanstack/react-virtual pattern.

---
*Refactor spec created using `/refactor` workflow - See .specify/extensions/workflows/refactor/*
