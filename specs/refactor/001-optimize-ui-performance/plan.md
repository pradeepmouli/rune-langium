# Implementation Plan: Optimize UI Performance for Large Folders

**Branch**: `refactor/001-optimize-ui-performance` | **Date**: 2026-03-11 | **Spec**: [refactor-spec.md](./refactor-spec.md)
**Input**: Refactor specification from `specs/refactor/001-optimize-ui-performance/spec.md`

## Summary

Optimize Studio UI performance for CDM-scale projects (142+ files, 10K+ types) through three independent improvements: (1) virtualize the namespace explorer tree and diagnostics panel using `@tanstack/react-virtual`, (2) optimize LSP document sync by debouncing the post-batch refresh, and (3) add chunked file loading with progress indication.

## Technical Context

**Language/Version**: TypeScript 5.9+ (strict mode, ESM)
**Primary Dependencies**: React 19, @xyflow/react 12, zustand 5, @tanstack/react-virtual (new), @radix-ui/*, Tailwind CSS 4
**Storage**: N/A (browser-only, File System Access API)
**Testing**: Vitest with happy-dom (component tests), conformance tests against CDM corpus
**Target Platform**: Browser (Chrome/Firefox/Safari)
**Project Type**: Monorepo — `packages/visual-editor`, `packages/lsp-server`, `apps/studio`, `packages/core`
**Performance Goals**: Explorer render <100ms for 10K types (windowed), file loading <3s with progress for 142 files
**Constraints**: Browser-only (no Node FS), must preserve all 923 existing tests, CDM conformance 0 errors
**Scale/Scope**: CDM corpus: 142 files, 10K+ types, 100+ namespaces

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. DSL Fidelity & Typed AST | PASS | No grammar/AST changes |
| II. Deterministic Fixtures | PASS | CDM conformance test unchanged |
| III. Validation Parity | PASS | No validator changes |
| IV. Performance & Workers | PASS | This refactor improves performance; no parsing changes |
| V. Reversibility & Compatibility | PASS | Component props unchanged; incremental commits; rollback plan documented |

**Refactor-specific gates**:
| Gate | Status | Notes |
|------|--------|-------|
| Baseline metrics captured before changes | PASS | metrics-before.md captured (923 tests, 5s build) |
| Tests pass after every incremental change | ENFORCED | Each phase ends with full test run |
| Behavior preservation guaranteed | ENFORCED | Behavioral snapshot + existing tests unchanged |
| Target metrics show improvement | MEASURED | metrics-after.md will be compared |

## Project Structure

### Documentation (this feature)

```text
specs/refactor/001-optimize-ui-performance/
├── plan.md              # This file
├── research.md          # Phase 0: technology decisions
├── data-model.md        # Phase 1: new types and functions
├── quickstart.md        # Phase 1: dev loop reference
├── refactor-spec.md     # Refactor specification
├── testing-gaps.md      # Pre-baseline testing assessment
├── behavioral-snapshot.md # Behaviors to preserve
├── metrics-before.md    # Baseline metrics
├── metrics-after.md     # Post-refactor metrics (TBD)
└── tasks.md             # Phase 2: task breakdown (via /speckit.tasks)
```

### Source Code (repository root)

```text
packages/visual-editor/
├── src/
│   ├── components/panels/NamespaceExplorerPanel.tsx  # MODIFY: virtualize
│   ├── utils/namespace-tree.ts                       # MODIFY: add flattenNamespaceTree()
│   └── hooks/useVirtualTree.ts                       # CREATE: virtual scrolling hook
└── test/
    ├── components/NamespaceExplorerPanel.test.tsx     # EXISTS: 14 tests
    └── utils/namespace-tree.test.ts                   # EXISTS: comprehensive

apps/studio/
├── src/
│   ├── components/
│   │   ├── DiagnosticsPanel.tsx                       # MODIFY: virtualize
│   │   └── FileLoader.tsx                             # MODIFY: progress bar
│   └── services/
│       ├── lsp-client.ts                              # MODIFY: optimize refresh
│       └── workspace.ts                               # MODIFY: chunked loading
└── test/
    └── services/lsp-client.test.ts                    # EXISTS: 18 tests (incl. sync)
```

**Structure Decision**: Existing monorepo structure preserved. One new file (`useVirtualTree.ts`) added to visual-editor hooks. No new packages or structural changes.

## Implementation Phases

### Phase 1: Virtualize Namespace Explorer (lowest risk, highest impact)

**Goal**: Replace ScrollArea with `@tanstack/react-virtual` for the type tree.

**Steps**:
1. Add `@tanstack/react-virtual` dependency to `packages/visual-editor`
2. Add `flattenNamespaceTree()` to `namespace-tree.ts` — converts `NamespaceGroup[]` to `FlatTreeRow[]`
3. Add tests for `flattenNamespaceTree()` in existing test file
4. Create `useVirtualTree.ts` hook — wraps `useVirtualizer` with tree-specific config
5. Refactor `NamespaceExplorerPanel.tsx` to use flat rows + virtualizer
6. Verify all 14 existing component tests still pass (may need minor DOM selector updates if testing implementation detail)
7. Run full visual-editor test suite (554 tests)

**Key Design**:
- `flattenNamespaceTree(tree, expanded, hidden, search)` produces a flat `FlatTreeRow[]`
- `useVirtualizer({ count: rows.length, estimateSize: (i) => rows[i].kind === 'namespace' ? 36 : 28 })`
- Namespace headers and type items rendered with `position: absolute` + `translateY`
- `data-testid` attributes preserved for existing tests

### Phase 2: Virtualize DiagnosticsPanel (same pattern, lower complexity)

**Goal**: Apply same virtualization to the diagnostics list.

**Steps**:
1. Add `flattenDiagnostics()` utility
2. Refactor `DiagnosticsPanel.tsx` to use `useVirtualizer`
3. Verify all 8 existing DiagnosticsPanel tests pass
4. Run full studio test suite (153 tests)

### Phase 3: Optimize LSP Batch Sync (medium risk)

**Goal**: Reduce redundant `didChange` notifications during batch file loading.

**Steps**:
1. Optimize `syncWorkspaceFiles()` refresh loop — debounce or coalesce the post-batch revalidation
2. Instead of sending `didChange` to every unchanged file immediately, use `requestIdleCallback` or `setTimeout(0)` to defer the refresh
3. Add tests for the optimized refresh behavior
4. Verify all 18 lsp-client tests pass
5. Run CDM conformance test (0 errors, 0 warnings)

**Key Design**:
- Current code sends N `didChange` notifications to unchanged files when new files are added (lines 179-189)
- Optimization: debounce into a single batch after all opens complete
- Alternative: skip refresh entirely and rely on Langium's built-in cross-file revalidation (test with CDM to verify)

### Phase 4: Chunked File Loading with Progress (lowest risk)

**Goal**: Add progress indication when loading large folders.

**Steps**:
1. Modify `readFileList()` in `workspace.ts` to accept a progress callback
2. Chunk file reading (e.g., 10 files at a time) with `yield` between chunks
3. Add `WorkspaceLoadProgress` state to FileLoader
4. Add progress bar UI in FileLoader component
5. Test with CDM corpus (142 files)

### Phase 5: Validation

**Goal**: Verify all behavior preserved and performance improved.

**Steps**:
1. Run full test suite across all packages (923+ tests)
2. Run CDM conformance test (0 errors, 0 warnings)
3. Run `measure-metrics.sh --after` to capture post-refactor metrics
4. Compare metrics-before.md vs metrics-after.md
5. Manual testing with CDM corpus in studio

## Complexity Tracking

No constitution violations to justify. All changes follow existing patterns:
- Virtualization is additive (new dependency, new utility, modified rendering)
- LSP optimization is a refinement of existing code
- File loading progress is additive UI

## Dependencies Between Phases

```
Phase 1 ──┐
           ├── Phase 5 (Validation)
Phase 2 ──┤
           │
Phase 3 ──┤
           │
Phase 4 ──┘
```

Phases 1-4 are **independent** and can be implemented in any order. Phase 5 (validation) runs after all others complete. Recommended order: 1 → 2 → 3 → 4 → 5 (virtualization first since it has the highest user-visible impact).
