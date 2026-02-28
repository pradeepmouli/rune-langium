# Research: Adopt generated form surfaces and zod-form runtime

**Feature**: 006-adopt-zod-to-form
**Date**: 2026-02-28
**Phase**: 0 — Unknowns resolved before design

---

## R-1: `langium-zod` availability and API

**Decision**: Use `langium-zod` (locally linked) via `langium-zod generate` CLI in `packages/core`.
**Status**: Already declared as `devDependency` in `packages/core/package.json` at `file:/Users/pmouli/GitHub.nosync/langium-zod/packages/langium-zod`. The `generate:zod` script exists. The `generate` script runs `langium generate && langium-zod generate`.

**Confirmed CLI flags available** (from `rune-langium-adopt.md`, upstream 005 spec):
```
langium-zod generate
  --out <path>               # output file path
  --projection <file>        # JSON file specifying fields per grammar type
  --strip-internals          # removes $container, $cstNode, $document, etc.
  --cross-ref-validation     # emits create*Schema(refs) factories and *SchemaRefs interfaces
  --conformance              # generates .conformance.ts with bidirectional assignability checks
  --ast-types <path>         # path to ast.ts for conformance checks
  --include <csv>            # filter grammar types to generate
  --exclude <csv>            # filter grammar types to exclude
```

**Rationale**: Grammar-driven generation keeps form schemas in sync with DSL evolution automatically.
**Alternatives considered**: Hand-authored schemas (current, existing `form-schemas.ts`) — rejected as they drift from grammar without enforcement.

---

## R-2: Projection config format — JSON vs TypeScript

**Decision**: `form-surfaces.json` (JSON) for the `langium-zod --projection` flag; `component-config.ts` (TypeScript) for `@zod-to-form/cli --component-config`.

**Context**: The Q4 clarification answer ("TypeScript config file") was resolved by examining the upstream toolchain. `langium-zod --projection` requires a JSON file by CLI design. The TypeScript constraint from Q4 is satisfied by `component-config.ts`, which IS the TypeScript projection/mapping config for the `@zod-to-form` side of the pipeline.

**Resolution**:
- `packages/visual-editor/form-surfaces.json` — JSON, input to `langium-zod generate --projection`
- `packages/visual-editor/component-config.ts` — TypeScript, input to `zod-to-form generate --component-config`

**Rationale**: Follows the prescribed tool interfaces from upstream specs; `component-config.ts` provides the compile-time type-checking (via `satisfies ZodToFormComponentConfig<VisualModule>`) that the Q4 TypeScript answer was seeking.
**Alternatives considered**: TypeScript wrapper that emits JSON — over-engineered; rejected.

---

## R-3: `@zod-to-form/cli` availability and API

**Decision**: Install `@zod-to-form/cli` (currently declared as `devDep` with `*` but not installed) and add `@zod-to-form/react` as a runtime dependency.

**CLI signature** (from `rune-langium-adopt.md`):
```bash
zod-to-form generate \
  --schema <path>           # path to schema file (generated zod-schemas.ts)
  --export <name>           # named ZodObject export from the schema file
  --out <path>              # output directory or .tsx file path
  --mode auto-save          # omits submit button; emits onValueChange wiring
  --component-config <path> # TypeScript or JSON component config
```

**Package split**:
- `@zod-to-form/cli` — devDep, provides scaffold CLI and `ZodToFormComponentConfig` type
- `@zod-to-form/react` — runtime dep, provides `ZodForm` component and `RuntimeComponentConfig` type
- `@zod-to-form/core` — likely a transitive dep providing `ZodFormRegistry`, `FormMeta` types

**Rationale**: CLI is only needed at build time (scaffold script); React component is needed at runtime.
**Alternatives considered**: Hand-authoring generated forms — defeated the purpose of the feature.

---

## R-4: `ZodForm` component API

**Decision**: Use `ZodForm` from `@zod-to-form/react` with the following props for `EnumForm` migration:

```typescript
type ZodFormProps<TSchema extends ZodObject> = {
  schema: TSchema;
  onValueChange?: (data: TSchema['_zod']['output']) => void;  // fires on valid, post-mount changes only
  mode?: 'onSubmit' | 'onChange' | 'onBlur';
  defaultValues?: Partial<TSchema['_zod']['output']>;
  formRegistry?: ZodFormRegistry;          // field-level render overrides
  componentConfig?: RuntimeComponentConfig; // resolves custom widgets at runtime
  className?: string;
  children?: ReactNode;                    // inside FormProvider; useFormContext() works
};
```

**Critical semantics** (from upstream spec): `onValueChange` fires only when:
1. `info?.name` is present (user-initiated, not on mount)
2. `schema.safeParse(values)` succeeds (valid state only)
Never fires at initial mount even with valid `defaultValues`.

**Rationale**: Exactly matches the EnumForm auto-save requirement (FR-014, FR-016).

---

## R-5: `ExternalDataSync` pattern

**Decision**: Implement `ExternalDataSync<T>` as a shared child component inside `ZodForm`'s `FormProvider` to replicate `useNodeForm`'s `keepDirtyValues` reset behavior.

```tsx
function ExternalDataSync<T extends FieldValues>({ data, toValues }: {
  data: unknown;
  toValues: () => T;
}) {
  const form = useFormContext<T>();
  const prevRef = useRef(data);
  useEffect(() => {
    if (prevRef.current !== data) {
      prevRef.current = data;
      form.reset(toValues(), { keepDirtyValues: true });  // preserves dirty fields
    }
  }, [data, form, toValues]);
  return null;
}
```

Placed in `packages/visual-editor/src/components/forms/ExternalDataSync.tsx`.

**Rationale**: Satisfies FR-016 (dirty fields never overwritten by external updates). Reusable across all form migrations.

---

## R-6: `MapFormRegistry` pattern

**Decision**: Implement `MapFormRegistry` as a shared utility for field-level render overrides.

```typescript
// packages/visual-editor/src/components/forms/MapFormRegistry.ts
import type { ZodFormRegistry, FormMeta } from '@zod-to-form/core';
import type { ZodType } from 'zod';

export class MapFormRegistry implements ZodFormRegistry {
  private map = new Map<ZodType, FormMeta>();
  add(schema: ZodType, meta: FormMeta): this { this.map.set(schema, meta); return this; }
  get(schema: ZodType): FormMeta | undefined { return this.map.get(schema); }
  has(schema: ZodType): boolean { return this.map.has(schema); }
}
```

Used by `EnumForm` (migrated) to wire `TypeSelector` for the `superEnum` parent field.

---

## R-7: `EnumForm` migration scope

**Decision**: Narrow `EnumForm` form state to `{ name, superEnum }` only (auto-save fields). The `enumValues` array is managed via direct store callbacks (not ZodForm schema) to avoid `ArrayBlock` rendering from ZodForm.

**Schema**:
```typescript
const enumCoreSchema = useMemo(
  () => createRosettaEnumerationSchema({ RosettaEnumeration: validParentNames })
          .pick({ name: true, superEnum: true }),
  [validParentNames]
);
```

**Preserved behaviors** (from existing `EnumForm.tsx`):
- 500ms debounce auto-save for `name` changes (FR-014)
- Immediate parent select commit via `onSelect` callback (bypasses debounce)
- `keepDirtyValues` on external data refresh (FR-016)
- List-style member editing via `useFieldArray` inside `useFormContext` (FR-015)
- All annotation, metadata, and synonym callbacks are unchanged (direct store dispatch)

**Props interface**: `EnumFormProps` remains unchanged — migration is internal only.

---

## R-8: CI stale-artifact enforcement

**Decision**: Add a CI step that runs `pnpm generate:schemas && pnpm scaffold:forms` in `packages/visual-editor`, then asserts `git diff --exit-code`. Fails if any generated file differs from committed version.

**Workflow file**: Add new job `check-generated` to `.github/workflows/ci.yml`.

**Rationale**: FR-018, SC-008. Catches drift before reviewers see it. Deterministic generation (CA-002) makes this reliable.
**Alternatives considered**: Timestamp-based check — unreliable across CI environments; rejected. No enforcement — violates CA-002; rejected.

---

## R-9: Source structure decisions

**Decision**: New files go into:
- `packages/visual-editor/src/generated/` — langium-zod generated outputs (committed)
- `packages/visual-editor/src/components/forms/generated/` — zod-to-form scaffold outputs (committed)
- `packages/visual-editor/src/components/forms/` — shared utilities (ExternalDataSync, MapFormRegistry)
- `packages/visual-editor/src/components.ts` — new `./components` subpath entry point

**Existing** `packages/visual-editor/src/schemas/form-schemas.ts` is **kept** during incremental migration. Once all forms are migrated, it can be removed in a follow-up feature.

---

## R-10: `./components` subpath surface

**Decision**: Expose `TypeSelector` and `CardinalityPicker` via a new `src/components.ts` barrel:

```typescript
// packages/visual-editor/src/components.ts
export { TypeSelector } from './components/editors/TypeSelector.js';
export { CardinalityPicker } from './components/editors/CardinalityPicker.js';
```

`package.json` exports map entry:
```json
"./components": {
  "types": "./dist/components.d.ts",
  "default": "./dist/components.js"
}
```

**Rationale**: `component-config.ts` uses `type VisualModule = typeof import('@rune-langium/visual-editor/components')` for compile-time widget name checking. Focused surface avoids exposing the full graph editor API to form consumers.
