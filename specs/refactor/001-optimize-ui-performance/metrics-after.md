# Metrics Captured After Refactoring

**Timestamp**: Thu Mar 12 09:12:22 EDT 2026
**Git Commit**: 9ea6b25
**Branch**: refactor/001-optimize-ui-performance

---

## Code Complexity

### Lines of Code (Source)
```
packages/core/src: 3714 lines
packages/visual-editor/src: 13938 lines
packages/lsp-server/src: 630 lines
packages/cli/src: 213 lines
packages/design-system/src: 1125 lines
apps/studio/src: 3939 lines
```

### Affected Files (Largest)
```
     412 packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx
     142 packages/visual-editor/src/utils/namespace-tree.ts
     244 apps/studio/src/services/lsp-client.ts
     284 apps/studio/src/services/workspace.ts
     138 apps/studio/src/components/FileLoader.tsx
     114 packages/lsp-server/src/rune-dsl-server.ts
     423 packages/lsp-server/src/connection-adapter.ts
```

## Test Suite

### Test Counts Per Package
```
core:
   Test Files  15 passed (15)
        Tests  169 passed (169)
visual-editor:
   Test Files  53 passed (53)
        Tests  561 passed (561)
studio:
   Test Files  17 passed (17)
        Tests  159 passed (159)
lsp-server:
   Test Files  4 passed (4)
        Tests  47 passed (47)
```

### Test File Counts
- **packages/core/test**: 15 test files
- **packages/visual-editor/test**: 53 test files
- **packages/lsp-server/test**: 4 test files
- **packages/cli/test**: 2 test files
- **apps/studio/test**: 17 test files
- **Total**: 91 test files

## Performance

### Build Time
- **Full Build (pnpm -r run build)**: 4s

### Bundle Size (studio)
- **Studio dist**: 2.8M

## Dependencies

- **@rune-langium/core**: 2 deps, 4 devDeps
- **@rune-langium/visual-editor**: 13 deps, 10 devDeps
- **@rune-langium/lsp-server**: 6 deps, 4 devDeps
- **@rune-langium/studio**: 17 deps, 13 devDeps

## Git Statistics

- **Commits ahead of master**: 314
- **Current commit**: 9ea6b25

## Summary

Metrics captured after refactoring at Thu Mar 12 09:12:51 EDT 2026.

**Next Steps**:
1. Compare with metrics-before.md
2. Verify improvements achieved
3. Check no unexpected regressions
4. Document improvements in refactor-spec.md
---
*Metrics captured using measure-metrics.sh*
