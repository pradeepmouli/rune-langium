# Contract — Package Rename: `codegen` → `codegen-legacy`

**Spec hooks**: FR-026, FR-027, Q1/B.

This contract defines what changes for every downstream consumer of
`@rune-langium/codegen` (the legacy JVM-bridge package) when that
package is renamed to `@rune-langium/codegen-legacy` and the
canonical `@rune-langium/codegen` name is taken by the new
Langium-native generator.

---

## What changes

### Package identity

| Item | Before | After |
|------|--------|-------|
| Directory | `packages/codegen/` | `packages/codegen-legacy/` |
| Package name | `@rune-langium/codegen` | `@rune-langium/codegen-legacy` |
| Deprecated field | (absent) | `"This package bridges the legacy JVM/Rosetta codegen. Use @rune-langium/codegen for the Langium-native generator."` |
| Version | `0.1.0` | `0.1.0` (unchanged; no semver bump; rename is breaking but scoped to this monorepo) |
| License | MIT | MIT (unchanged) |
| `exports` field | unchanged | unchanged |
| All source files | unchanged | unchanged (only `package.json` changes inside the package) |

### Exports field (unchanged — for reference)

```jsonc
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "default": "./dist/index.js"
  },
  "./node": {
    "types": "./dist/node.d.ts",
    "default": "./dist/node.js"
  },
  "./serve": {
    "default": "./dist/serve.js"
  }
}
```

All three subpath exports (`"."`, `"./node"`, `"./serve"`) are
preserved verbatim. Consumers that used `@rune-langium/codegen/node`
now use `@rune-langium/codegen-legacy/node`.

---

## Exhaustive consumer checklist

Every file listed here MUST be updated in Phase 1 of the
implementation. After the update, `pnpm install && pnpm -r run
type-check` MUST pass cleanly.

### `apps/codegen-container/`

| File | Change |
|------|--------|
| `apps/codegen-container/package.json` | `dependencies["@rune-langium/codegen"]` → `"@rune-langium/codegen-legacy": "workspace:*"` |
| `apps/codegen-container/src/server.ts:L1` | `import type { CodeGenerationRequest, CodeGenerationResult } from '@rune-langium/codegen'` → `'@rune-langium/codegen-legacy'` |
| `apps/codegen-container/src/server.ts:L2` | `import { CodegenServiceProxy } from '@rune-langium/codegen/node'` → `'@rune-langium/codegen-legacy/node'` |
| `apps/codegen-container/test/server.test.ts` | `import type { CodeGenerationRequest, CodeGenerationResult } from '@rune-langium/codegen'` → `'@rune-langium/codegen-legacy'` |
| `apps/codegen-container/test/container-parity.test.ts` | Comment `@rune-langium/codegen-container` → unchanged (refers to the app package, not the codegen package) |

### `packages/cli/`

| File | Change |
|------|--------|
| `packages/cli/package.json` | `dependencies["@rune-langium/codegen"]` → `"@rune-langium/codegen-legacy": "workspace:*"` |
| `packages/cli/src/generate.ts` | `import { CodegenServiceProxy, KNOWN_GENERATORS } from '@rune-langium/codegen/node'` → `'@rune-langium/codegen-legacy/node'` |
| `packages/cli/src/generate.ts` | `import type { CodeGenerationResult } from '@rune-langium/codegen'` → `'@rune-langium/codegen-legacy'` |
| `packages/cli/src/types/codegen-types.ts` | All imports from `'@rune-langium/codegen'` → `'@rune-langium/codegen-legacy'` |

### `apps/studio/`

| File | Change |
|------|--------|
| `apps/studio/package.json` | `dependencies["@rune-langium/codegen"]` → `"@rune-langium/codegen-legacy": "workspace:*"` |
| `apps/studio/src/services/codegen-service.ts` | `import { KNOWN_GENERATORS } from '@rune-langium/codegen'` → `'@rune-langium/codegen-legacy'` |
| `apps/studio/src/services/codegen-service.ts` | All type imports → `'@rune-langium/codegen-legacy'` |
| `apps/studio/src/components/ExportDialog.tsx` | `import { KNOWN_GENERATORS } from '@rune-langium/codegen'` → `'@rune-langium/codegen-legacy'` |
| `apps/studio/src/components/ExportDialog.tsx` | All type imports → `'@rune-langium/codegen-legacy'` |

### `package.json` (workspace root)

The root `package.json` references `@rune-langium/codegen-worker`
and `@rune-langium/codegen-container` in script names — those are
app package names, not the library package name. No change needed.

---

## What does NOT change

- `apps/codegen-worker/`: the CF Worker does not import
  `@rune-langium/codegen` or `@rune-langium/codegen-legacy` directly.
  It acts as an HTTP proxy to the codegen-container. No import
  changes needed.
- The `.specify/sync/drift-report.json` references: these are
  diagnostic tool outputs, not source code.
- `packages/codegen-legacy/` internal source: no source file within
  the renamed package changes. Only `package.json` changes.
- The workspace root `pnpm-workspace.yaml` glob `packages/*`: the
  renamed directory `packages/codegen-legacy` still matches.

---

## Migration order

The rename MUST be performed atomically in a single PR (Phase 1):

```
1. Rename directory:
   mv packages/codegen packages/codegen-legacy

2. Update packages/codegen-legacy/package.json:
   - name: @rune-langium/codegen-legacy
   - Add deprecated field

3. Update all consumer files (checklist above):
   - apps/codegen-container/package.json + src/
   - packages/cli/package.json + src/
   - apps/studio/package.json + src/

4. pnpm install
   (pnpm workspace symlinks update automatically)

5. pnpm -r run type-check
   MUST pass before Phase 2 begins.

6. Create packages/codegen/ (empty, new)
   with new package.json (name: @rune-langium/codegen, MIT)
   — Phase 2 populates the source.
```

---

## Post-rename verification

```sh
# All type-checks must pass
pnpm -r run type-check

# No remaining imports of the old package name
grep -r '"@rune-langium/codegen"' \
  apps/ packages/ \
  --include="*.ts" --include="*.tsx" --include="*.json" \
  | grep -v "codegen-legacy" \
  | grep -v "codegen-worker" \
  | grep -v "codegen-container"
# Expected: no output

# Confirm codegen-legacy package resolves
pnpm --filter @rune-langium/codegen-container exec \
  node -e "import('@rune-langium/codegen-legacy').then(m => console.log('OK', Object.keys(m)))"
# Expected: OK [ 'CodeGenerationRequest', ... ] (type exports)

# Confirm the legacy package still builds
pnpm --filter @rune-langium/codegen-legacy run build
# Expected: exit 0
```

---

## Deprecation and removal (out of scope for this feature)

Removal of `packages/codegen-legacy` is tracked separately. The
deprecation lifecycle per Constitution §V:
1. **Phase 1 (this feature)**: rename + migration guide + downstream re-wire.
2. **Phase 2 (future feature)**: add deprecation warnings to legacy package exports.
3. **Phase 3 (future feature)**: removal, after all consumers migrate.

The Studio's JVM-bridge export dialog (`ExportDialog.tsx`) continues
to work through `@rune-langium/codegen-legacy` after the rename.
The new Langium-native generator (`@rune-langium/codegen`) is an
additional offering; the legacy JVM path is not removed here.
