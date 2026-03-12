# Metrics Captured Before Refactoring

**Timestamp**: Wed Mar 11 19:53:56 EDT 2026
**Git Commit**: 1e5d017
**Branch**: refactor/001-optimize-ui-performance

---

## Code Complexity

### Lines of Code (Source)
```
packages/core/src: 3714 lines
packages/visual-editor/src: 13792 lines
packages/lsp-server/src: 622 lines
packages/cli/src: 213 lines
packages/design-system/src: 1125 lines
apps/studio/src: 3729 lines
```

### Affected Files (Largest)
```
     380 packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx
      94 packages/visual-editor/src/utils/namespace-tree.ts
     225 apps/studio/src/services/lsp-client.ts
     254 apps/studio/src/services/workspace.ts
     104 apps/studio/src/components/FileLoader.tsx
     108 packages/lsp-server/src/rune-dsl-server.ts
     421 packages/lsp-server/src/connection-adapter.ts
```

## Test Suite

### Test Counts Per Package
```
core:
   Test Files  15 passed (15)
        Tests  169 passed (169)
visual-editor:
   Test Files  53 passed (53)
        Tests  554 passed (554)
studio:
   Test Files  16 passed (16)
        Tests  153 passed (153)
lsp-server:
   Test Files  4 passed (4)
        Tests  47 passed (47)
```

### Test File Counts
- **packages/core/test**: 15 test files
- **packages/visual-editor/test**: 53 test files
- **packages/lsp-server/test**: 4 test files
- **packages/cli/test**: 2 test files
- **apps/studio/test**: 16 test files
- **Total**: 90 test files

## Performance

### Build Time
- **Full Build (pnpm -r run build)**: 5s

### Bundle Size (studio)
- **Studio dist**: 2.9M

## Dependencies

- **@rune-langium/core**: 2 deps, 4 devDeps
- **@rune-langium/visual-editor**: 12 deps, 10 devDeps
- **@rune-langium/lsp-server**: 6 deps, 4 devDeps
- **@rune-langium/studio**: 16 deps, 13 devDeps

## Git Statistics

- **Commits ahead of master**: 308
- **Current commit**: 1e5d017

## Summary

Metrics captured before refactoring at Wed Mar 11 19:54:24 EDT 2026.

---
*Metrics captured using measure-metrics.sh*
