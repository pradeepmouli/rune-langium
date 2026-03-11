# Implementation Plan: Adopt generated form surfaces and zod-form runtime

**Branch**: `006-adopt-zod-to-form` | **Date**: 2026-02-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-adopt-zod-to-form/spec.md`

## Summary

Adopt `langium-zod` form-surface generation and `@zod-to-form` APIs in `@rune-langium/visual-editor`. The feature wires a five-stage pipeline: (1) generate form-surface Zod schemas from the Rune DSL grammar via `langium-zod` with a JSON projection config; (2) expose a `./components` subpath export for reusable form widgets; (3) create a TypeScript component config mapping domain field types to widgets; (4) scaffold auto-save form components via `@zod-to-form/cli`; (5) migrate `EnumForm` from `useNodeForm`/`FormProvider`/`Controller` to `ZodForm` while preserving all existing behavior. CI enforces artifact freshness via `git diff --exit-code`.

## Technical Context

**Language/Version**: TypeScript 5.9+ (strict mode, ESM)
**Primary Dependencies**:
- `langium-zod` — locally linked devDep in `packages/core`; generates form-surface schemas from DSL grammar
- `@zod-to-form/cli` — devDep (`*`) in `packages/visual-editor`; scaffold CLI for React form generation
- `@zod-to-form/react` — to be added as runtime dep; provides `ZodForm` component
- `@zod-to-form/core` — transitive; provides `ZodFormRegistry`, `FormMeta` types
- `react-hook-form` v7 + `@hookform/resolvers` — existing form engine (preserved in non-migrated forms)
- `zod` v4 — schema validation
- `@rune-langium/core` (workspace) — provides grammar, ast.ts, and `langium-zod generate` script
- `@rune-langium/design-system` (workspace) — UI primitives

**Storage**: N/A
**Testing**: vitest (jsdom environment, `@testing-library/react`)
**Target Platform**: Browser-only (File System Access API, no backend)
**Project Type**: pnpm monorepo — primary changes in `packages/visual-editor`; minor in `packages/core`
**Performance Goals**: 500ms auto-save debounce preserved; generation pipeline completes in a single terminal command
**Constraints**:
- Generated artifacts are committed (deterministic, regenerated on input change)
- `@zod-to-form/cli` wildcard version — must resolve a compatible release when installed
- Projection config is JSON (`form-surfaces.json`) for `langium-zod --projection`; TypeScript for `component-config.ts`
- Browser-only runtime: no Node.js modules in generated form components

**Scale/Scope**: Single package change focus (`packages/visual-editor`); one form migrated (`EnumForm`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. DSL Fidelity & Typed AST ✅
Schema generation is grammar-driven via `langium-zod`. Conformance checks (`--conformance --ast-types`) enforce typed contract between generated schemas and `ast.ts`. Cross-references remain typed via generated `create*Schema(refs)` factories. No grammar or AST changes in this feature.

### II. Deterministic Fixtures ✅
Generated schemas (`zod-schemas.ts`) and form components are committed artifacts regenerated deterministically from grammar + projection config (`form-surfaces.json`) + component config (`component-config.ts`). CI enforces freshness via `git diff --exit-code` (FR-018). No network access required at generation time. Existing CDM/rune-dsl fixture tests are unaffected.

### III. Validation Parity ✅
Conformance artifact (`zod-schemas.conformance.ts`) provides bidirectional assignability checks against `ast.ts`. Cross-ref validation factories prevent invalid reference values from passing `ZodForm`'s `safeParse`. `ExternalDataSync` replicates `keepDirtyValues` semantics of `useNodeForm`, preserving existing validation behavior. Scope is parity-only with existing `EnumForm` behavior.

### IV. Performance & Workers ✅
Feature touches browser UI (React forms), not the Langium parser or web worker. 500ms debounce auto-save is explicitly preserved (FR-014). No parser changes; no performance regression risk. Schema generation runs offline (build time), not in the browser.

### V. Reversibility & Compatibility ✅
Incremental migration: only `EnumForm` is migrated in this feature (FR-013). `EnumFormProps` public interface is unchanged. Hand-authored forms coexist without modification (FR-017). Existing `form-schemas.ts` is retained until full migration. `./components` and `./styles.css` exports are additive; existing `.` export is unchanged.

**Gate result: PASS** — No constitution violations. No Complexity Tracking required.

## Project Structure

### Documentation (this feature)

```text
specs/006-adopt-zod-to-form/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── contracts/
    └── typescript-interfaces.md  # Phase 1 output
```

### Source Code (repository root)

```text
packages/
├── core/
│   └── package.json                             # MODIFIED: add generate:schemas script
│
└── visual-editor/
    ├── package.json                              # MODIFIED: exports, deps, scripts
    ├── form-surfaces.json                        # NEW: langium-zod projection config (JSON)
    ├── component-config.ts                       # NEW: @zod-to-form widget mapping (TypeScript)
    └── src/
        ├── components.ts                         # NEW: ./components subpath entry point
        ├── generated/                            # NEW dir (generated, committed)
        │   ├── zod-schemas.ts                    # GENERATED by langium-zod
        │   └── zod-schemas.conformance.ts        # GENERATED by langium-zod --conformance
        ├── components/
        │   ├── editors/
        │   │   └── EnumForm.tsx                  # MODIFIED: internal migration to ZodForm
        │   └── forms/
        │       ├── generated/                    # NEW dir (generated, committed)
        │       │   ├── RosettaEnumerationForm.tsx # GENERATED by zod-to-form
        │       │   └── DataForm.tsx              # GENERATED by zod-to-form
        │       ├── ExternalDataSync.tsx          # NEW: shared keepDirtyValues utility
        │       └── MapFormRegistry.ts            # NEW: ZodFormRegistry implementation
        └── schemas/
            └── form-schemas.ts                   # KEPT: existing hand-authored (not deleted)

.github/
└── workflows/
    └── ci.yml                                    # MODIFIED: add check-generated job (FR-018)
```

**Structure Decision**: Monorepo with targeted package changes. Generated artifacts go in `src/generated/` (schemas) and `src/components/forms/generated/` (form components). Shared runtime utilities go in `src/components/forms/`. The existing `src/schemas/form-schemas.ts` is preserved for non-migrated forms.

## Implementation Phases

### Phase 1: Foundation — Subpath, Config, and Schema Generation

**Goal**: Wire the toolchain so `pnpm generate:schemas` produces valid form-surface schemas.

#### 1.1 Add `./components` subpath export

**Files**: `packages/visual-editor/package.json`, `packages/visual-editor/src/components.ts`

- Add `"./components"` entry to `exports` map in `package.json`
- Create `src/components.ts` re-exporting `TypeSelector` and `CardinalityPicker`

**Acceptance**: `typeof import('@rune-langium/visual-editor/components')` resolves both widgets.

#### 1.2 Create `form-surfaces.json` projection config

**File**: `packages/visual-editor/form-surfaces.json`

- Define `defaults.strip` for Langium internal fields
- Define `types` for `RosettaEnumeration`, `Data`, `Attribute`, `RosettaFunction`, `ChoiceType`
- Field names must match actual Rune grammar identifiers

**Acceptance**: Valid JSON; passes `langium-zod generate` without error.

#### 1.3 Add `generate:schemas` script

**File**: `packages/visual-editor/package.json`

```json
"generate:schemas": "langium-zod generate --out src/generated/zod-schemas.ts --projection form-surfaces.json --cross-ref-validation --conformance --ast-types src/generated/ast.ts"
```

**Acceptance**: `pnpm generate:schemas` runs without error; produces `src/generated/zod-schemas.ts` and `src/generated/zod-schemas.conformance.ts`.

#### 1.4 Create `component-config.ts`

**File**: `packages/visual-editor/component-config.ts`

- `VisualModule` type alias for compile-time widget name checking
- Maps `cross-ref` → `TypeSelector`, `cardinality` → `CardinalityPicker`
- Field paths adjusted to match generated schema variable names
- Typed via `satisfies ZodToFormComponentConfig<VisualModule>`

**Acceptance**: `tsc --noEmit` passes; invalid widget name produces compile error (FR-008).

#### 1.5 Install `@zod-to-form/react` runtime dependency

**File**: `packages/visual-editor/package.json`

- Add `"@zod-to-form/react": "*"` to `dependencies`

**Acceptance**: Both `@zod-to-form/cli` and `@zod-to-form/react` resolve after `pnpm install`.

---

### Phase 2: Scaffold — Generate Form Components

**Goal**: `pnpm scaffold:forms` produces committed form components with auto-save and custom widgets.

#### 2.1 Update `scaffold:forms` script

**File**: `packages/visual-editor/package.json`

Per-schema invocations with `--mode auto-save --component-config component-config.ts`.

**Acceptance**: `pnpm scaffold:forms` succeeds; generated files include `onValueChange` prop, custom widget imports, no submit button (FR-009–FR-011).

#### 2.2 Verify generated output quality

Inspect `src/components/forms/generated/` for required patterns.

---

### Phase 3: Migration — EnumForm to ZodForm

**Goal**: `EnumForm` uses `ZodForm` internally while preserving all existing behavior.

#### 3.1 Create `MapFormRegistry`

**File**: `packages/visual-editor/src/components/forms/MapFormRegistry.ts`

#### 3.2 Create `ExternalDataSync`

**File**: `packages/visual-editor/src/components/forms/ExternalDataSync.tsx`

Detects reference change in `data` prop; calls `form.reset(toValues(), { keepDirtyValues: true })` (FR-016).

#### 3.3 Migrate `EnumForm`

**File**: `packages/visual-editor/src/components/editors/EnumForm.tsx`

- Replace `useNodeForm` + `FormProvider` + `Controller` with `ZodForm`
- Schema narrowed to `{ name, superEnum }` (auto-save fields only)
- `enumValues` array managed via direct store callbacks (not in schema)
- All existing store-action callbacks, list editing, annotations, metadata: unchanged
- `EnumFormProps` interface: unchanged

**Acceptance**: All SC-005, SC-006, SC-007 scenarios pass; FR-013–FR-017 verified.

---

### Phase 4: CI Enforcement

**Goal**: Stale generated artifacts fail CI (FR-018, SC-008).

#### 4.1 Add `check-generated` CI job

**File**: `.github/workflows/ci.yml`

Runs `generate:schemas` + `scaffold:forms` then asserts `git diff --exit-code`.

---

## Constitution Check (Post-Design Re-evaluation)

All five principles remain satisfied. **Gate result: PASS.**

## Complexity Tracking

*No constitution violations — table not required.*

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| `langium-zod` locally linked — not available in CI | High | Defer `check-generated` schema generation to a post-publish CI step; keep `scaffold:forms` check separate |
| Grammar field names differ from projection config assumptions | Medium | Run `pnpm generate:schemas` first; inspect output and adjust `form-surfaces.json`/`component-config.ts` |
| `@zod-to-form` wildcard resolves incompatible API | Medium | Pin to confirmed compatible version before committing `pnpm-lock.yaml` |
| Generated `EnumForm` scaffold needs layout tuning | Low | Phase 3 migration replaces scaffold output with hand-tuned `ZodForm` wiring |

## Open Questions for Implementation

1. **`langium-zod` CI availability**: Locally linked; confirm whether CI has path access or defer schema-generation CI step.
2. **Grammar field names**: Confirm `superEnum`, `superType`, `typeCall`, `card` against actual grammar before finalizing configs.
3. **`@zod-to-form` version**: Pin concrete version for `@zod-to-form/cli` and `@zod-to-form/react`.
