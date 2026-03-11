# Behavioral Snapshot

**Purpose**: Document observable behavior before refactoring to verify it's preserved after.

## Key Behaviors to Preserve

### Behavior 1: File Loading
**Input**: User drops/selects a folder containing 142 CDM .rosetta files
**Expected Output**: All files loaded into workspace, parsed, and available in editor
**Actual Output** (before): All 142 files loaded, AST parsed, diagnostics computed
**Actual Output** (after): [Re-run after refactoring - must match]

**Verification**: `WorkspaceFile[]` array has same length and same file paths/content

### Behavior 2: Namespace Explorer Tree
**Input**: Parsed CDM corpus with 10,000+ types across 100+ namespaces
**Expected Output**: Tree shows all namespaces sorted alphabetically, each containing types sorted alphabetically, with correct counts per kind (data, choice, enum, func)
**Actual Output** (before): Tree renders all namespaces, expandable, with counts
**Actual Output** (after): [Re-run after refactoring - must match]

**Verification**: `buildNamespaceTree()` returns identical tree structure before and after

### Behavior 3: Explorer Search/Filter
**Input**: Search query "Trade" in explorer with CDM corpus loaded
**Expected Output**: Only namespaces containing types matching "Trade" (regex) are shown
**Actual Output** (before): `filterNamespaceTree(tree, "Trade")` returns filtered subset
**Actual Output** (after): [Re-run after refactoring - must match]

**Verification**: Same filtered tree structure and type counts

### Behavior 4: LSP Diagnostics
**Input**: 142 CDM .rosetta files + 2 built-in type files + 42 FpML files
**Expected Output**: 0 linking errors, 0 parse errors, 0 warnings
**Actual Output** (before): CDM conformance test passes — `Total linking errors: 0`, `Total diagnostics: 0`
**Actual Output** (after): [Re-run after refactoring - must match]

**Verification**: `npx vitest run cdm-deep-diag` produces identical diagnostic counts

### Behavior 5: Type Navigation
**Input**: User clicks a type (e.g., "Trade") in namespace explorer
**Expected Output**: Graph view navigates to and highlights the corresponding node
**Actual Output** (before): `onSelectNode(nodeId)` callback fires with correct node ID
**Actual Output** (after): [Re-run after refactoring - must match]

**Verification**: Same node ID passed to callback for same type click

### Behavior 6: Source Editor <-> Graph Sync
**Input**: Edit a data type in source editor (e.g., add an attribute)
**Expected Output**: Graph updates to reflect the new attribute; editing graph reflects back to source
**Actual Output** (before): Bidirectional sync works via LSP + workspace service
**Actual Output** (after): [Re-run after refactoring - must match]

**Verification**: Content changes propagate in both directions identically

## Test Commands
```bash
# Run CDM conformance test (verifies parsing, linking, diagnostics)
cd packages/core && npx vitest run cdm-deep-diag

# Run full core test suite (169 tests)
cd packages/core && npx vitest run

# Run studio tests (145 tests)
cd apps/studio && npx vitest run

# Run visual-editor tests
cd packages/visual-editor && npx vitest run

# Run ALL tests across all packages
pnpm -r run test
```

## Performance Baselines (to measure)

| Metric | Before | After | Pass? |
|--------|--------|-------|-------|
| Explorer render time (10K types) | TBD | TBD | No regression |
| File loading time (142 files) | TBD | TBD | No regression |
| LSP sync time (full workspace) | TBD | TBD | No regression |
| Memory peak (large folder load) | TBD | TBD | No regression |
| DOM node count (explorer expanded) | TBD | TBD | Significant reduction |

---
*Update this file with actual behaviors before starting refactoring*
