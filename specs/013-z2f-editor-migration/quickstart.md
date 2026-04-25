# Quickstart: Visual Editor Forms Migration Verification

**Branch**: `013-z2f-editor-migration` | **Phase**: 1 (design)
**Audience**: anyone verifying a migration slice (per phase A → E)

This document is the runnable verification sequence for each phase. It assumes
the studio app starts cleanly with `pnpm --filter @rune-langium/studio dev` and
that Playwright is configured (it is — see `apps/studio/playwright.config.ts`).

---

## 0. Prerequisites

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium
pnpm install
pnpm --filter @rune-langium/visual-editor build
pnpm --filter @rune-langium/studio dev      # studio at http://localhost:5173/
```

Open a model that exercises all five top-level type kinds. The CDM corpus in
`fixtures/` is the canonical choice; any model with at least one Data, one
Choice, one Enum, one Function, and one TypeAlias node works.

---

## 1. Pre-migration baseline (BEFORE any phase ships)

Capture pre-migration screenshots and behavioural baselines.

```bash
# From apps/studio/
pnpm playwright test test/visual/forms.spec.ts --update-snapshots
```

For each of the five forms:

1. Navigate to a node of that kind.
2. Confirm Playwright snapshots are written under
   `apps/studio/test/visual/__screenshots__/forms.spec.ts/` named
   `data-baseline.png`, `choice-baseline.png`, `enum-baseline.png`,
   `function-baseline.png`, `type-alias-baseline.png`.
3. Record the auto-save debounce timing per form (one leaf-field test each)
   in `apps/studio/test/perf/auto-save-baseline.json`. The instrumentation
   measures `(time of action call) − (time of input event)` and emits the
   median over 10 runs.

These artifacts are the reference for SC-004 (visual diff) and SC-007 (timing).

---

## 2. After Phase A (config alignment)

No runtime change. Verify:

```bash
pnpm --filter @rune-langium/visual-editor type-check
pnpm --filter @rune-langium/visual-editor test
```

- TypeScript compiles cleanly with the typed config now pointing at
  `form-schemas.ts`.
- All existing tests pass; no schema-name divergences remain (FR-008, SC-006).
- Searching the repo for `from '../../generated/zod-schemas'` inside
  `packages/visual-editor/src/components/editors/` returns zero matches (the
  forms no longer reference AST schemas).

---

## 3. After Phase B (DataTypeForm slice)

Verify the Data form renders identically and behaves identically.

```bash
# From apps/studio/
pnpm playwright test test/visual/forms.spec.ts --grep "data"
pnpm playwright test test/perf/auto-save.spec.ts --grep "data"
```

Manual sanity checks:

1. Open a Data type node. The header (name + "Data" badge), Extends section,
   Attributes list, Conditions, Annotations, and Metadata are in the same
   positions and have the same styling as the baseline.
2. Click another Data node. The form repopulates with the new node's values
   without flicker — the `useExternalSync` hook fires once.
3. Edit the type name; wait 500 ms; confirm exactly one
   `actions.renameType(...)` call fired.
4. Drag the third attribute above the first; confirm
   `actions.reorderAttribute(nodeId, 2, 0)` fires once and the form reflects
   `[3, 1, 2]`.
5. Override an inherited row; the overridden row appears with the same
   pre-filled values; `actions.addAttribute(...)` fires once. Click Revert;
   `actions.removeAttribute(...)` fires once and the inherited row reappears.
6. Visual diff is below tolerance (default ±0.1% pixel difference).
7. Auto-save median timing is within ±50 ms of the baseline.

---

## 4. After Phase C (sections refactor)

Verify annotations / conditions / metadata sections render in the same place
across all five forms, even though four of the five forms otherwise haven't
been migrated yet.

For each of the five forms:

```bash
pnpm playwright test test/visual/forms.spec.ts --grep "<form-name>"
```

- The Annotation section still renders above the Metadata section in each form
  (matches today's order).
- The Conditions section still renders above the Annotations section in the
  Data and Function forms (the kinds that have it).
- Searching `packages/visual-editor/src/components/editors/` for
  `from './AnnotationSection'` / `'./ConditionSection'` / `'./MetadataSection'`
  returns zero matches inside form files. The single import path is the
  components module.

---

## 5. After Phase D (other four forms)

Each of `ChoiceForm`, `EnumForm`, `FunctionForm`, `TypeAliasForm` ships in its
own PR. For each:

```bash
pnpm playwright test test/visual/forms.spec.ts --grep "<form-name>"
pnpm playwright test test/perf/auto-save.spec.ts --grep "<form-name>"
pnpm --filter @rune-langium/visual-editor test
```

- Visual diff per form is below tolerance.
- Auto-save median timing per form is within ±50 ms of the baseline.
- All form-specific affordances continue to work:
  - **Choice**: Adding a choice option creates an `attributes` entry whose
    `name` is hidden but `typeCall.type` is set.
  - **Enum**: Adding an enum value supports both `name` and `displayName`
    fields with the same row component.
  - **Function**: Editing an input row and the output row are independent
    (no crosstalk); `inputs[]` array and `output` section fire their own
    actions.
  - **TypeAlias**: Picking a wrapped type sets `typeCall.type` and
    `typeCall.arguments` stays hidden.

---

## 6. After Phase E (row renderer migration)

Verify row interactions (drag reorder, debounced rename, override/revert) work
without regression in every form that has an array.

```bash
pnpm playwright test test/visual/forms.spec.ts
pnpm playwright test test/integration/row-interactions.spec.ts
```

- Drag a row to a new position in each form's array; the corresponding
  reorder action fires once with the right `(from, to)` indices.
- Rename a row's name; observe debounced commit at 500 ms; observe the
  corresponding update action fires once.
- Override an inherited Data attribute via the upstream
  `arrayConfig.before/after` slot (if upstream P2 has shipped); confirm the
  override action fires and the row state matches today's behaviour.
- Searching `packages/visual-editor/src/components/editors/` for the names
  `AttributeRow`, `ChoiceOptionRow`, `EnumValueRow` inside form `*.tsx`
  files (excluding the row files themselves) returns only the registration
  index file — not the form bodies (FR-009).

---

## 7. Final acceptance (after all five forms migrated)

Run the full test suite from the repo root:

```bash
pnpm test
pnpm run type-check
pnpm run lint
```

- All pre-existing tests pass.
- Visual baselines for all five forms still match within tolerance.
- LOC count in `packages/visual-editor/src/components/editors/` plus the three
  section components is ≥25% smaller than the pre-migration baseline (SC-001).

If any check fails, the slice is not done. Each PR is independently revertible
per the migration's slice-shipping principle.
