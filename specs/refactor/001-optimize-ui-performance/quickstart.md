# Quickstart: UI Performance Optimization

## Prerequisites

- Node 20+, pnpm
- CDM corpus in `.resources/` (for conformance testing)

## Development Loop

```bash
# 1. Install new dependency
pnpm --filter @rune-langium/visual-editor add @tanstack/react-virtual

# 2. Run affected tests in watch mode
cd packages/visual-editor && npx vitest --watch test/utils/namespace-tree.test.ts test/components/NamespaceExplorerPanel.test.tsx

# 3. Run studio tests
cd apps/studio && npx vitest --watch

# 4. Full validation
pnpm -r run test

# 5. CDM conformance (must show 0 errors)
cd packages/core && npx vitest run cdm-deep-diag
```

## Key Files to Modify

| File | Change |
|------|--------|
| `packages/visual-editor/src/utils/namespace-tree.ts` | Add `flattenNamespaceTree()` |
| `packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx` | Replace ScrollArea with `useVirtualizer` |
| `apps/studio/src/components/DiagnosticsPanel.tsx` | Virtualize diagnostic list |
| `apps/studio/src/services/lsp-client.ts` | Optimize batch refresh logic |
| `apps/studio/src/services/workspace.ts` | Add chunked reading with progress |
| `apps/studio/src/components/FileLoader.tsx` | Add progress bar UI |

## Validation Checklist

- [ ] `packages/visual-editor`: all tests pass
- [ ] `apps/studio`: all tests pass
- [ ] `packages/core`: CDM conformance 0 errors, 0 warnings
- [ ] No prop/interface changes to existing components
- [ ] `measure-metrics.sh --after` shows improvement
