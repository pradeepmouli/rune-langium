# Quickstart: Core Editor Features

**Branch**: `008-core-editor-features` | **Date**: 2026-03-12

## Prerequisites

- Node.js 20+, pnpm 9+
- Java 17+ (for code generation only)
- Existing rune-langium dev environment (`pnpm install` complete)

## Development Order

Work proceeds in 3 phases with clear dependencies:

### Phase 1: Foundation (Stories 1-2)

**1a. Git Model Loading** — `apps/studio/`, `packages/core/`

```bash
# Add isomorphic-git + idb to studio
pnpm --filter @rune-langium/studio add isomorphic-git idb

# Key files to create/modify:
# apps/studio/src/services/model-loader.ts     — git fetch + file discovery
# apps/studio/src/services/model-cache.ts       — IndexedDB caching
# apps/studio/src/services/model-registry.ts    — curated model list
# apps/studio/src/components/ModelLoader.tsx     — UI component
# apps/studio/src/store/model-store.ts           — zustand state
```

**1b. zod-to-form Migration** — `packages/visual-editor/`

```bash
# Migrate remaining forms (follow EnumForm pattern):
# packages/visual-editor/src/components/editors/ChoiceForm.tsx
# packages/visual-editor/src/components/editors/DataTypeForm.tsx
# packages/visual-editor/src/components/editors/FunctionForm.tsx

# Each migration:
# 1. Replace useNodeForm → useZodForm
# 2. Add ExternalDataSync wrapper
# 3. Wire zodResolver with generated schema
# 4. Test round-trip with existing fixtures
```

### Phase 2: Editor Features (Stories 3-4)

**2a. Conditions UI** — `packages/visual-editor/`

```bash
# Key files to create/modify:
# packages/visual-editor/src/components/editors/ConditionSection.tsx  — new
# packages/visual-editor/src/components/editors/FunctionForm.tsx      — add conditions sections

# The expression builder is already complete — just wire it into condition editing
```

**2b. Expression Builder Validation** — `packages/visual-editor/`

```bash
# Expression builder is feature-complete (51/51 types).
# This phase is validation + testing:
npx vitest run  # Existing tests
# Add CDM corpus round-trip test
# Verify zero UnsupportedBlock occurrences across CDM
```

### Phase 3: Export (Story 5)

**3a. CLI Generate Command** — `packages/cli/`

```bash
# Add generate command:
# packages/cli/src/generate.ts — new command
# Invokes rosetta-code-generators via subprocess

# Test:
rune-dsl generate --language java --input .resources/cdm/ --output /tmp/codegen
```

**3b. Studio Export UI** — `apps/studio/`

```bash
# Extend existing export infrastructure:
# apps/studio/src/components/ExportDialog.tsx    — language selector + preview
# apps/studio/src/services/codegen-service.ts   — HTTP call to codegen service
```

## Running Tests

```bash
# Core tests (must always pass)
cd packages/core && npx vitest run

# CDM corpus (zero errors/warnings)
cd packages/core && npx vitest run cdm-deep-diag

# Visual editor tests
cd packages/visual-editor && npx vitest run

# Full suite
pnpm -r run test
```

## Regenerating Schemas

```bash
# After grammar changes:
cd packages/core && echo "no" | pnpm langium generate && pnpm langium-zod generate

# Regenerate visual-editor schemas:
pnpm --filter @rune-langium/visual-editor generate:schemas
```
