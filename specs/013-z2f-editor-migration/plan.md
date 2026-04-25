# Implementation Plan: Migrate Visual Editor Forms to zod-to-form

**Branch**: `013-z2f-editor-migration` | **Date**: 2026-04-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-z2f-editor-migration/spec.md`

## Summary

Replace the hand-written field plumbing in the five visual-editor forms (Data, Choice,
Enum, Function, TypeAlias) with `<ZodForm>`-driven rendering, while keeping the
package's bespoke UX (drag reorder, inherited rows, type navigation, type-creator,
cardinality picker, expression-builder slot) intact as registered overrides. The
work is gated on the upstream library's P1 primitives (array reorder slot,
external-data sync hook) landing in
`zod-to-form/specs/010-editor-primitives` first; the migration here ships in
slices — Data form first as the template, then the section refactor, then the
other four forms in parallel, then row renderers once the upstream worked example
publishes. No graph-action contract, persisted-model shape, or end-user behaviour
changes; this is a UI-layer refactor with a ≥25% LOC reduction target.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: React 19 (peer), React Hook Form 7+ (peer), Zod v4 (peer),
  `@zod-to-form/core`, `@zod-to-form/react`, `@zod-to-form/vite` (Vite codegen
  plugin already mounted in `apps/studio/vite.config.ts`), `@rune-langium/design-system`
**Storage**: N/A (in-memory editor state; persistence handled by the graph store
  outside this feature's surface)
**Testing**: vitest + `@testing-library/react` for component tests, Playwright (already
  configured in `apps/studio/`) for visual-regression baselines per form
**Target Platform**: Modern browsers (the studio is a Vite + React SPA)
**Project Type**: Monorepo package (`packages/visual-editor`) consumed by the
  studio app (`apps/studio`)
**Performance Goals**: Auto-save commit timing within ±50 ms of pre-migration
  baseline (SC-007); no observable input-latency regression on attribute rows
**Constraints**: No new third-party dependencies; no changes to `EditorFormActions`
  contract; no changes to the persisted model; no changes to studio Vite wiring;
  the Data-form slice cannot start until upstream P1 (array reorder + external sync
  hook) ships
**Scale/Scope**: Five top-level form files (~2,108 LOC) + three section components
  (~763 LOC) + two duplicated upstream utilities (~109 LOC) + one shared row
  (~348 LOC). Target reduction ≥25% across the editors folder (SC-001).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reference: `.specify/memory/constitution.md` (v1.1.1). This is a UI-layer refactor
inside `packages/visual-editor`; the parser, scoping, and validation layers are
untouched.

| Principle | Status | Notes |
|-----------|--------|-------|
| I. DSL Fidelity & Typed AST | PASS | No grammar/AST changes. Generated `zod-schemas.ts` (langium-zod output) remains untouched and continues to validate AST shapes. The migration only consolidates the *form-surface* projection schemas. |
| II. Deterministic Fixtures | PASS | No new fixtures. Existing visual-editor tests run against in-package fixtures and continue to do so. New visual-regression baselines are captured in-repo. |
| III. Validation Parity | PASS | Validation surface unchanged. Form-surface schemas already validate today (`form-schemas.ts`); the migration aligns the typed config to point at the same source rather than introduce a new one. |
| IV. Performance & Workers | PASS | No parser-path changes. UI-side performance budget (auto-save debounce ±50 ms, SC-007) is enforced by tests; reorder uses upstream primitive without per-row listener regression. |
| V. Reversibility & Compatibility | PASS | Migration ships in independently-deployable slices (one form per PR). `EditorFormActions` contract is unchanged — every existing graph action keeps the same signature. No deprecations introduced. |

**Initial gate**: PASS. No complexity-tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/013-z2f-editor-migration/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── form-host-integration.md
│   ├── section-component.md
│   └── row-renderer.md
├── spec.md              # Feature spec
└── tasks.md             # Phase 2 output (created by /speckit.tasks; NOT this command)
```

### Source Code (repository root)

The migration touches `packages/visual-editor` only. The studio app
(`apps/studio/vite.config.ts`) does not change.

```text
packages/visual-editor/
├── z2f.config.ts                       # MODIFY: point at form-surface schemas (form-schemas.ts);
│                                       #         add per-form `section:` declarations once upstream
│                                       #         section primitive lands; keep current field map.
├── src/
│   ├── schemas/
│   │   └── form-schemas.ts             # MODIFY: becomes the single canonical schema source
│   │                                   #         referenced by both the typed config and the forms.
│   ├── generated/
│   │   └── zod-schemas.ts              # UNCHANGED: AST schemas remain a separate post-form
│   │                                   #            validation surface; not used by forms.
│   ├── components/
│   │   ├── editors/
│   │   │   ├── DataTypeForm.tsx        # MODIFY: replace per-field <Controller> cascade with
│   │   │   │                           #         <ZodForm> + bespoke overrides; ~471 → ~target LOC.
│   │   │   ├── ChoiceForm.tsx          # MODIFY: same refactor, smaller variant.
│   │   │   ├── EnumForm.tsx            # MODIFY: same.
│   │   │   ├── FunctionForm.tsx        # MODIFY: same; preserves separate inputs/output sections.
│   │   │   ├── TypeAliasForm.tsx       # MODIFY: same.
│   │   │   ├── AttributeRow.tsx        # MODIFY: becomes a registered custom row renderer.
│   │   │   ├── ChoiceOptionRow.tsx     # MODIFY: same.
│   │   │   ├── EnumValueRow.tsx        # MODIFY: same.
│   │   │   ├── (Function input row)    # MODIFY: extract from FunctionForm if not already split,
│   │   │   │                           #         then register as a custom row renderer.
│   │   │   ├── AnnotationSection.tsx   # MODIFY: becomes a registered section component.
│   │   │   ├── ConditionSection.tsx    # MODIFY: same.
│   │   │   ├── MetadataSection.tsx     # MODIFY: same.
│   │   │   ├── TypeSelector.tsx        # UNCHANGED: bespoke, registered as fieldType.
│   │   │   ├── CardinalityPicker.tsx   # UNCHANGED: bespoke, registered as fieldType.
│   │   │   ├── TypeLink.tsx            # UNCHANGED: bespoke navigation primitive.
│   │   │   ├── TypeCreator.tsx         # UNCHANGED: bespoke type-creator dropdown.
│   │   │   ├── InheritedMembersSection.tsx  # UNCHANGED for now; revisit when ghost-row primitive
│   │   │   │                                # ships upstream (Phase E).
│   │   │   └── expression-builder/      # UNCHANGED: out of scope per spec.
│   │   ├── forms/
│   │   │   ├── ExternalDataSync.tsx    # DELETE: replaced by upstream `useExternalSync` hook.
│   │   │   ├── MapFormRegistry.ts      # DELETE: replaced by Zod's `z.registry<FormMeta>()`.
│   │   │   ├── component-config.ts     # MODIFY/KEEP: continues to map field→component aliases.
│   │   │   ├── sections/
│   │   │   │   └── index.ts            # ADD: registers Annotation/Condition/Metadata against
│   │   │   │                           #      the components module so the form host can resolve
│   │   │   │                           #      `section:` references in z2f.config.ts.
│   │   │   └── rows/
│   │   │       └── index.ts            # ADD: registers Attribute/ChoiceOption/EnumValue/
│   │   │                               #      FunctionInput rows as `FormMeta.render` per item
│   │   │                               #      schema (canonical pattern from upstream worked example).
│   │   └── zod-form-components.tsx     # MODIFY: re-export the registered sections + rows so
│   │                                   #         the typed config's `componentModule` lookup
│   │                                   #         resolves them.
│   ├── hooks/
│   │   ├── useAutoSave.ts              # UNCHANGED: per-field 500 ms debounce stays.
│   │   └── useInheritedMembers.ts      # UNCHANGED: drives ghost-row data; rendering changes.
│   └── types.ts                        # UNCHANGED: `EditorFormActions` contract is fixed.
└── test/
    └── visual/                          # ADD: Playwright snapshot baselines per form,
                                         #      captured pre-migration and asserted post-each-slice.
```

**Structure Decision**: Single-package refactor. The migration is contained in
`packages/visual-editor` and is consumed transparently by `apps/studio`. The
upstream Vite plugin (`z2fVite()`) is already mounted in
`apps/studio/vite.config.ts` and remains unchanged — the migration relies on
runtime z2f primitives, not on additional codegen wiring.

## Complexity Tracking

> No constitution violations. This section is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_ | _(n/a)_ | _(n/a)_ |
