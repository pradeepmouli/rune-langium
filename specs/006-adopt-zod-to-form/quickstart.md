# Developer Quickstart: Form Surface Generation & EnumForm Migration

**Feature**: 006-adopt-zod-to-form
**Date**: 2026-02-28

---

## Prerequisites

Ensure the workspace is set up with all dependencies installed:

```bash
pnpm install
```

The following packages must resolve:
- `langium-zod` — linked from `packages/core/devDependencies`
- `@zod-to-form/cli` — devDependency of `packages/visual-editor` (install after merging this feature)
- `@zod-to-form/react` — runtime dependency of `packages/visual-editor`

---

## Step 1: Generate Form-Surface Schemas

Run from the repo root (or from `packages/visual-editor`):

```bash
# From repo root
pnpm --filter @rune-langium/visual-editor generate:schemas

# Or from packages/visual-editor directly
pnpm generate:schemas
```

This runs:
```bash
langium-zod generate \
  --out src/generated/zod-schemas.ts \
  --projection form-surfaces.json \
  --cross-ref-validation \
  --conformance \
  --ast-types src/generated/ast.ts
```

**Outputs** (committed to source control):
- `packages/visual-editor/src/generated/zod-schemas.ts`
- `packages/visual-editor/src/generated/zod-schemas.conformance.ts`

**When to regenerate**: Whenever the Rune grammar (`packages/core/src/grammar/`) or `form-surfaces.json` changes.

---

## Step 2: Scaffold Form Components

```bash
# From repo root
pnpm --filter @rune-langium/visual-editor scaffold:forms

# Or from packages/visual-editor
pnpm scaffold:forms
```

This runs each form scaffold command:
```bash
# EnumForm
zodform generate \
  --schema src/generated/zod-schemas.ts \
  --export RosettaEnumerationSchema \
  --out src/components/forms/generated

# DataTypeForm
zodform generate \
  --schema src/generated/zod-schemas.ts \
  --export DataSchema \
  --out src/components/forms/generated
```

**Outputs** (committed to source control):
- `packages/visual-editor/src/components/forms/generated/RosettaEnumerationForm.tsx`
- `packages/visual-editor/src/components/forms/generated/DataForm.tsx`

**When to regenerate**: When `zod-schemas.ts` or `component-config.ts` changes.

---

## Step 3: Full Regeneration (Grammar → Forms)

Run all generation steps in sequence:

```bash
# 1. Regenerate grammar + DSL schemas (packages/core)
pnpm --filter @rune-langium/core generate

# 2. Regenerate form-surface schemas + conformance (packages/visual-editor)
pnpm --filter @rune-langium/visual-editor generate:schemas

# 3. Scaffold form components (packages/visual-editor)
pnpm --filter @rune-langium/visual-editor scaffold:forms
```

Or use the combined script (once added to root `package.json`):
```bash
pnpm generate:forms
```

---

## Step 4: Verify Generated Outputs (CI Check)

To verify committed artifacts are up to date (mirrors the CI check):

```bash
cd packages/visual-editor
pnpm generate:schemas && pnpm scaffold:forms
git diff --exit-code
```

**Exit code 0**: Generated files match committed versions (clean).
**Non-zero exit**: Files were regenerated with differences — commit the updated outputs.

---

## Step 5: Type-Check Conformance

Verify schema/model alignment passes:

```bash
pnpm --filter @rune-langium/visual-editor type-check
```

This compiles `src/generated/zod-schemas.conformance.ts` which contains bidirectional assignability checks. Any schema/model drift fails here with a TypeScript error.

---

## Step 6: Run Tests

```bash
# Visual editor tests (jsdom environment)
pnpm --filter @rune-langium/visual-editor test

# All packages
pnpm test
```

---

## How the `./components` Subpath Works

The `@rune-langium/visual-editor/components` subpath is available after build:

```typescript
// Type-level usage (in component-config.ts)
type VisualModule = typeof import('@rune-langium/visual-editor/components');

// Runtime usage (in generated forms)
import { TypeSelector } from '@rune-langium/visual-editor/components';
```

**Development**: Uses `dist/components.js` (built output). Run `pnpm build` once before consuming the subpath in other packages.

---

## Editing the Projection Config

To change which fields appear in generated form schemas, edit `packages/visual-editor/form-surfaces.json`:

```json
{
  "defaults": {
    "strip": ["$container", "$document", "$cstNode", "$containerProperty", "$containerIndex"]
  },
  "types": {
    "RosettaEnumeration": {
      "fields": ["name", "superEnum", "enumValues"]
    }
  }
}
```

After editing, regenerate: `pnpm generate:schemas`.

---

## Editing the Component Config

To add or change widget mappings, edit `packages/visual-editor/component-config.ts`. TypeScript will catch invalid widget names at compile time (widgets must be exported from `src/components.ts`).

After editing, re-scaffold: `pnpm scaffold:forms`.

---

## EnumForm Migration — Internal Design

The migrated `EnumForm` uses `ZodForm` internally but keeps its existing `EnumFormProps` interface unchanged:

```tsx
// Internal shape (simplified)
<ZodForm
  schema={enumCoreSchema}          // createRosettaEnumerationSchema(...).pick({ name, superEnum })
  defaultValues={{ name, superEnum }}
  onValueChange={handleCommit}     // debounced 500ms auto-save
  mode="onChange"
  formRegistry={formRegistry}      // TypeSelector for superEnum field
>
  <ExternalDataSync data={data} toValues={...} />   {/* keepDirtyValues reset */}
  <EnumValuesList nodeId={nodeId} actions={actions} /> {/* direct store callbacks */}
  <InheritedMembersSection ... />
  <AnnotationSection ... />
  <MetadataSection ... />
</ZodForm>
```

**Key invariants**:
- `name` and `superEnum` only: tracked in form state for auto-save
- `enumValues`, annotations, metadata: direct store dispatch, not in form schema
- 500ms debounce preserved for name auto-save
- Parent select: immediate store dispatch + form state update
- External refresh (undo/redo): `ExternalDataSync` with `keepDirtyValues: true`
