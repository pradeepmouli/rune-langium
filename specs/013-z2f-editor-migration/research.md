# Phase 0 Research: Migrate Visual Editor Forms to zod-to-form

**Branch**: `013-z2f-editor-migration` | **Date**: 2026-04-25
**Input**: [`spec.md`](./spec.md), [`plan.md`](./plan.md), upstream
[`zod-to-form/specs/010-editor-primitives/spec.md`](../../../zod-to-form/specs/010-editor-primitives/spec.md)

This document resolves the planning questions called out in the spec. Each entry
follows the **Decision / Rationale / Alternatives considered** shape. No
NEEDS CLARIFICATION items remain after Phase 0; sequencing constraints (R10) are
the only externally-gated items.

---

## R1 — Single canonical form-surface schema source

**Decision**: Adopt `packages/visual-editor/src/schemas/form-schemas.ts` as the
single canonical source of form-surface Zod schemas. The typed config
(`z2f.config.ts`) is updated to reference these schemas. The
langium-zod-generated AST schemas in `src/generated/zod-schemas.ts`
(`DataSchema`, `ChoiceSchema`, `RosettaEnumerationSchema`,
`RosettaFunctionSchema`, `RosettaTypeAliasSchema`, …) remain a separate
post-form validation surface used by tests/conformance only — they are not
consumed by any form.

**Rationale**: The forms today already validate against the projection schemas
in `form-schemas.ts` (e.g. `dataTypeFormSchema`, `enumFormSchema`,
`memberSchema`); the projections are what UX is tied to (`name`, `parentName`,
`members[]`, `definition`, `comments`, `synonyms`). The AST schemas describe a
strict-shape Langium serialization that includes `$type` discriminators,
container metadata, and full reference shapes — the wrong surface to drive a UI
against. Referencing both surfaces in the typed config is the exact divergence
FR-008 is closing.

**Alternatives considered**:
- *Drive forms from the AST schemas directly*: Would require widespread
  `hidden: true` overrides, every reference field would need a custom adapter,
  and the form-surface error messages would lose their human-friendly wording
  (e.g. "Type name is required" vs the AST's structural errors).
- *Generate form-surface schemas from the AST schemas*: Adds a code-gen layer
  for what is already five small hand-curated schemas. Defers the work and
  doesn't actually resolve the FR-008 mismatch.

---

## R2 — Section migration mechanism (annotations, conditions, metadata)

**Decision**: Use z2f's `section:` configuration in `z2f.config.ts` plus the
`componentModule` lookup. Each section component (`AnnotationSection`,
`ConditionSection`, `MetadataSection`) reads its data via `useFormContext` (or
the upstream documented hooks once published) and the field paths declared by
the config. Sections are registered once on
`packages/visual-editor/src/components/zod-form-components.tsx` and referenced
by name from the typed config — never imported into the five form files.

**Rationale**: Each of the three section components is currently spliced into
all five forms identically. Lifting them into the typed config eliminates the
single largest block of duplicated wiring (~600 LOC across the three files
multiplied by five form sites) and meets FR-005 + SC-001. The current
implementations already use `useFormContext` (see `MetadataSection.tsx:55`), so
the renaming-to-section-component path is mechanical.

**Alternatives considered**:
- *Keep imperative inclusion in each form*: Defeats the migration's largest
  LOC win (SC-001 ≥25%) and leaves three more places to update whenever the
  section contract changes.
- *Build a parallel section runtime in this package*: Reinvents what the
  upstream is already shipping; adds a dependency on internal upstream
  surfaces; violates Constitution Principle V (Reversibility).

---

## R3 — Row migration mechanism (custom row renderers)

**Decision**: Register each inline row component (`AttributeRow`,
`ChoiceOptionRow`, `EnumValueRow`, function-input row) as a `FormMeta.render`
override against its corresponding item schema (e.g. `memberSchema` →
`<AttributeRow>` for the Data form's `members` array). The upstream worked
example from `010-editor-primitives` User Story 6 is treated as the contract.
Rows continue to read sibling values via `useFormContext`; the only change is
that the row renderer is invoked by the form host, not from a hand-written
`.map()` inside each form file.

**Rationale**: This is the documented upstream pattern (User Story 6,
P3 priority — "documentation plus a worked example, not new code"). It removes
the per-form `effectiveAttributes.map((entry) => …)` cascades and the
matched-set of imports while preserving every per-row affordance (drag handle,
TypeLink, TypeSelector, CardinalityPicker, debounced commit, override/revert).
FR-006 maps directly onto this mechanism.

**Alternatives considered**:
- *Render rows via z2f defaults and add affordances via slots*: The bespoke
  row layout (handle | name | type+link | cardinality | override badge |
  remove/revert) is too specific to express as a slot composition and would
  produce visual regressions against SC-004's pixel-equivalence target.
- *Lift the row into a component declared on a per-field basis (not item-schema-
  scoped)*: Loses the natural identity provided by item-schema registration
  and would require the form to repeat the row registration in five places.

---

## R4 — External-data sync replacement

**Decision**: Replace the local
`packages/visual-editor/src/components/forms/ExternalDataSync.tsx` (65 LOC)
with the upstream `useExternalSync(form, data, toValues)` hook from
`010-editor-primitives` User Story 2. Each form's body changes from a child
`<ExternalDataSync …/>` element to a single hook call at the top of the form
body. The hook fires `form.reset(toValuesRef.current(), { keepDirtyValues: true })`
on `data` reference change; identity-stable rerenders are a no-op, matching
today's behaviour exactly.

**Rationale**: The local component already implements the upstream hook's
contract verbatim (see `ExternalDataSync.tsx:44-65` — `prevDataRef`, identity
check, `keepDirtyValues: true`). Deleting the local file and adopting the hook
removes a duplicated upstream utility (FR-008 alignment with the 010 spec) and
satisfies SC-002 ("one line at the call site").

**Alternatives considered**:
- *Keep the local copy*: Violates the "no duplication of upstream
  functionality" intent of the migration and leaves a footgun for maintainers
  who fix a bug upstream and forget to mirror it here.
- *Inline the effect in each form*: Five copies of the same `useEffect` with
  the same identity-vs-deep-equality risk that User Story 2 of the upstream
  spec explicitly calls out as a footgun.

---

## R5 — Reorder primitive

**Decision**: Use the upstream `arrayConfig.reorder: true` configuration plus
the upstream `componentMap.ArrayReorderHandle` slot from
`010-editor-primitives` User Story 1. The drag library is *not* changed — the
existing native drag-and-drop wiring in `AttributeRow.tsx:131-147`
(`handleDragStart`, `handleDrop`, `handleDragOver`, `dataTransfer.setData`)
remains as the gesture provider; the upstream primitive only wires the
operation back into form state. Keyboard-reorder shortcuts (FR-003) continue to
fire `actions.reorderAttribute(nodeId, fromIndex, toIndex)` exactly as today.

**Rationale**: The upstream spec explicitly defers gesture ownership to the
adopter ("the library exposes the operation; the adopter wires the gesture",
010 Assumptions). The package's existing native-DnD implementation already
works and is owned UX; the migration is purely about routing the form-state
updates through the upstream hook.

**Alternatives considered**:
- *Adopt a third-party drag library (dnd-kit, react-dnd) as part of this
  migration*: Violates the spec's "no new third-party dependencies" assumption
  (Dependencies) and adds bundle weight for a non-goal.
- *Hand-roll a fresh reorder primitive in this package*: Duplicates the
  upstream primitive, the exact pattern this migration is closing.

---

## R6 — Inherited (ghost) row rendering

**Decision**: Use the upstream `arrayConfig.before` / `arrayConfig.after`
ghost-row slots from `010-editor-primitives` User Story 4 *once available*.
Until that primitive ships (it is P2 upstream, may land after this migration's
P1 slices), the **interim fallback** is to keep the current implementation in
each form: render `effectiveAttributes` through a single `.map()` that
discriminates `entry.source === 'local'` (real rows) versus `'inherited'`
(ghost rows) and renders `<AttributeRow>` or `<InheritedAttributeRow>`
accordingly (today's pattern, see `DataTypeForm.tsx:395-430`).

**Rationale**: The interim fallback is functionally correct and visually
identical (FR-004 + SC-004). It does not block User Stories 1–4 (P1), all of
which are the *spec's* P1 priorities here. The ghost-row migration becomes a
trivial swap once upstream P2 lands — replace the discriminating `.map()` with
the configured slot. This matches the spec's "later phases unblock as the
upstream P2 primitives land" sequencing.

**Alternatives considered**:
- *Block the entire migration on upstream P2*: Violates the spec's slice-
  shipping principle (Assumptions §5) and delays the LOC win indefinitely.
- *Render ghost rows in the section header* (one of the spec's example
  fallbacks): Visually awkward; would regress SC-004 pixel-equivalence even on
  the interim slices. The current inline rendering is correct as-is and the
  swap is local when P2 lands.

---

## R7 — Per-`$type` form switching

**Decision**: Keep the existing host-side `switch (data.$type)` in the editor
pane (`EditorFormPanel` or equivalent). Do not adopt the upstream
discriminator host (`010-editor-primitives` User Story 3) in this migration —
it is P2 upstream, the workaround is the spec's documented "five-line switch",
and the current host already does the right thing. Adoption of the
discriminator host is tracked as a follow-up.

**Rationale**: The discriminator host's value (010 SC-003: "replaces a five-arm
conditional rendering five different form components with a single host
element") is real but small relative to the per-form refactor work. Bundling
it into this migration adds risk — the discriminator host's clearing-of-
residual-state semantics (010 FR-006) interact non-trivially with the
auto-save debounce flush behaviour (Edge Cases §3 of the consumer spec). Keep
this migration scoped to the form *bodies*; the host stays.

**Alternatives considered**:
- *Adopt the discriminator host now*: Adds a second upstream dependency to
  this migration's critical path and risks delaying the Data-form slice.
- *Replace the switch with a registry-driven lookup in this package*: Would
  duplicate upstream functionality (see R4 rationale) once 010 P2 ships.

---

## R8 — Auto-save replacement strategy

**Decision**: Keep the existing per-field `useAutoSave(commitFn, 500)` pattern
verbatim through this migration. Each form continues to declare per-action
debounced commit callbacks (`commitName`, `commitDefinition`, `commitComments`,
attribute-row `commitName` via the row's `useAutoSave`) exactly as today.
A future refactor *may* funnel per-field commits through a top-level
`onValueChange` debouncer at the form host — that is **out of scope for this
migration** and tracked as a follow-up.

**Rationale**: SC-007 budgets ±50 ms of pre-migration timing and FR-002
requires "no observable change in the timing or the actions emitted". The
safest way to meet both is to leave the debounce wiring untouched while the
field rendering is refactored. Each `useAutoSave` site is a few lines and
survives the refactor — the cost of keeping it is negligible relative to the
risk of changing the debounce semantics during a UI refactor.

**Alternatives considered**:
- *Move to a single top-level `onValueChange` debouncer in this migration*:
  Larger blast radius for a behavior that must remain identical. Better as a
  separate, behaviour-preserving follow-up with its own SC-007 measurement.
- *Drop the debounce in favour of explicit Save buttons*: Out of scope per the
  spec; would be a UX change, not a UI refactor.

---

## R9 — Test strategy

**Decision**: Three layers, in order:

1. **Preserve all existing tests.** Every test in
   `packages/visual-editor/test/` continues to pass. No tests are deleted as
   part of the migration; tests that drive removed implementation details
   (`MapFormRegistry`, `ExternalDataSync`) are rewritten against the upstream
   hook/registry equivalents.
2. **Capture visual-regression baselines pre-migration.** Add Playwright
   screenshot baselines per form (Data, Choice, Enum, Function, TypeAlias)
   inside `apps/studio/` (Playwright is already configured there). Capture
   *before* any form is migrated; assert against the baseline after each
   slice. SC-004 pixel-equivalence is the measurement.
3. **Behavioural assertions per slice.** Each form-slice PR adds (or extends)
   tests covering: leaf-field rendering, debounced commit firing, switch-node
   external sync, reorder action emission, override/revert action emission.
   These exist today for some forms; the migration normalizes coverage across
   all five.

**Rationale**: Pre-migration baseline + per-slice assertions is the standard
behaviour-preservation pattern (Constitution V). One PR per form gives the
migration five independent revert points if a regression slips through.

**Alternatives considered**:
- *Single landing PR for all five forms*: Violates the spec's slice-shipping
  principle (Assumptions §5) and the constitution's reversibility principle.
- *Snapshot tests only, no behaviour tests*: Would miss debounce-timing
  regressions (SC-007) since snapshots don't measure timing.

---

## R10 — Sequencing (phases)

**Decision**:

| Phase | Scope | Upstream gate |
|-------|-------|--------------|
| **A. Config alignment** | Update `z2f.config.ts` to import from `form-schemas.ts`; delete unused references to AST schemas; verify type-check (FR-008). No runtime change yet. | None — can land immediately. |
| **B. DataTypeForm slice** | Migrate `DataTypeForm.tsx` to `<ZodForm>` + bespoke overrides. Delete `ExternalDataSync.tsx`; adopt upstream `useExternalSync`. Delete `MapFormRegistry.ts`; adopt `z.registry<FormMeta>()`. | Requires upstream `010` **P1**: array reorder slot + external-data sync hook. |
| **C. Sections refactor** | Register `AnnotationSection`, `ConditionSection`, `MetadataSection` on the components module; declare `section:` references in `z2f.config.ts`; remove imperative section JSX from each form. | None — can land in parallel with D. |
| **D. Other four forms** | Migrate `ChoiceForm`, `EnumForm`, `FunctionForm`, `TypeAliasForm`. Each is a separate PR. Order is independent; they can land in any order. | Phase B must have shipped (template). |
| **E. Row renderer migration** | Register `AttributeRow`, `ChoiceOptionRow`, `EnumValueRow`, function-input row as `FormMeta.render` against their item schemas. Replace `effectiveAttributes.map(…)` with the upstream slot once `arrayConfig.before/after` ships. | Requires upstream `010` **P2**: ghost-row support + custom row renderer worked example/docs. |

**Rationale**: Each phase is independently shippable. The Data form (B) is the
template all of D copies; sections (C) are orthogonal to forms and parallelize;
the row migration (E) is the lowest-priority slice and the only one gated on
upstream P2. This sequencing maps directly onto the spec's user-story
priorities (US1/US2/US3/US4 → P1; US5/US6 → P2; US7 → P3, achieved by Phase A).

**Alternatives considered**:
- *Big-bang single-PR migration*: Violates Assumptions §5; loses revert
  granularity; blocks the whole migration on the slowest dependency.
- *Section refactor first, then forms*: Possible, but the Data form is the
  template the other four copy; deferring it loses the template-first benefit
  of finding API issues once instead of five times.
