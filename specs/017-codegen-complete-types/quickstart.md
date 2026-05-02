# Quickstart: 017-codegen-complete-types

**Date**: 2026-05-01

## Build & Test

```bash
pnpm install
pnpm -r build
pnpm -r test
```

## Key Files to Modify

### Codegen Package (`packages/codegen/`)

| File | Change |
|------|--------|
| `src/types/` | Add `type-alias.ts`, `rule.ts`, `report.ts`, `annotation.ts`, `library-func.ts` |
| `src/types.ts` | Export new types, extend `FormPreviewSchema` with `kind` discriminator |
| `src/emit/zod-emitter.ts` | Extend `buildEmissionContext()`, add `emitTypeAlias()`, `emitRuleValidator()`, annotation `.meta()` |
| `src/emit/ts-emitter.ts` | Extend `buildEmissionContext()`, add `emitTypeAlias()`, `emitRule()`, `emitReport()`, `emitLibraryFunc()`, `emitAnnotationDecorator()`, resolve cross-namespace imports |
| `src/emit/json-schema-emitter.ts` | Extend `buildEmissionContext()`, add type alias support |
| `src/emit/namespace-registry.ts` | New — `NamespaceRegistry` and `NamespaceManifest` |
| `src/generator.ts` | Build `NamespaceRegistry` in `runGenerate()` before per-namespace emission |
| `src/preview-schema.ts` | Extend to handle type aliases, choices, functions |
| `src/index.ts` | Export new types |

### Studio App (`apps/studio/`)

| File | Change |
|------|--------|
| `src/workers/codegen-worker.ts` | Add `preview:execute` message handler for function execution |
| `src/store/preview-store.ts` | Extend state for function execution results |
| `src/components/FormPreviewPanel.tsx` | Add function form UI (inputs, run button, output) |
| `src/services/codegen-service.ts` | Add message factories for function execution |

### Test Fixtures (`packages/codegen/test/`)

| Directory | Content |
|-----------|---------|
| `fixtures/type-aliases/` | `.rune` input + expected TS/Zod/JSON Schema output |
| `fixtures/rules/` | `.rune` input + expected TS/Zod output |
| `fixtures/reports/` | `.rune` input + expected TS output |
| `fixtures/library-funcs/` | `.rune` input + expected TS output |
| `fixtures/annotations/` | `.rune` input + expected TS/Zod output |
| `fixtures/cross-namespace/` | Multi-file `.rune` input + expected output with imports |

## Development Order

1. **Namespace registry** — foundation for cross-namespace resolution
2. **Type aliases** — simplest new construct, validates registry works
3. **Annotations** — decorators in TS, `.meta()` in Zod
4. **Rules** — reuses expression transpiler
5. **Reports** — compositional, references rules and types
6. **Library functions** — signatures only, straightforward
7. **Cross-namespace imports** — wire registry into emit phase
8. **Form preview expansion** — type aliases, choices in preview
9. **Function calculation form** — new message type, execution, UI
