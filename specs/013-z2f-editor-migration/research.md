# Phase 0 Research: Migrate Visual Editor Forms to zod-to-form

**Branch**: `013-z2f-editor-migration` | **Date**: 2026-04-25
**Input**: [`spec.md`](./spec.md), [`plan.md`](./plan.md), upstream
[`zod-to-form/specs/010-editor-primitives/spec.md`](../../../zod-to-form/specs/010-editor-primitives/spec.md)

This document resolves the planning questions called out in the spec. Each entry
follows the **Decision / Rationale / Alternatives considered** shape. No
NEEDS CLARIFICATION items remain after Phase 0; sequencing constraints (R10) are
the only externally-gated items.

---

## R1 — Canonical schema source for the typed config

**Decision**: The langium-generated AST schemas in
`src/generated/zod-schemas.ts` (`DataSchema`, `ChoiceSchema`,
`RosettaEnumerationSchema`, `RosettaFunctionSchema`,
`RosettaTypeAliasSchema`) are the canonical schemas referenced by the
typed config (`z2f.config.ts`). AST-only fields (`$type` discriminators,
container metadata, references, labels, ruleReferences, postConditions,
enumSynonyms, etc.) are marked `hidden: true` in the config. The
`@zod-to-form` L1/L2 optimisers strip hidden fields from the schema-lite
produced at validation time, so RHF's resolver never sees them — they
remain in the AST schema's static shape but cost nothing at runtime.

The hand-authored projection schemas in
`src/schemas/form-schemas.ts` (`dataTypeFormSchema`, `enumFormSchema`,
`memberSchema`, etc.) are **slated for removal** as part of this
migration. They duplicate the AST shape, drift on grammar changes, and
exist only because the editors today use `useZodForm` as a zodResolver
shortcut. After Phase 3–7 lands, every editor calls
`useZodForm(DataSchema, …)` (etc.) against the AST schema directly;
`toFormValues(node)` becomes a thin pass-through (the graph node is
already AST-shaped). Deleting `form-schemas.ts` is the final
DRY-cleanup task in Phase 10 (`T076` below).

**Rationale**: The AST schemas regenerate from the Langium grammar in
CI (single source of truth — feature 012 Phase 7 wired this). Referencing
them directly means a grammar change propagates to the forms with one
schema regeneration step, no hand-edit. The original concern that AST
schemas "would require widespread `hidden: true` overrides" is real but
borne by the typed config, not by every editor — and the L1/L2 optimisers
ensure those hidden rules are runtime-free.

**Alternatives considered**:
- *Adopt `form-schemas.ts` as canonical and keep both*: Initial Phase 0
  plan. Rejected: duplicates the AST shape with hand-authored
  projections that drift on grammar changes, and L1/L2 optimisation
  makes the "AST schemas are too verbose at runtime" objection moot.
- *Adopt AST as canonical but keep projections as a transport layer*:
  Considered. Rejected on DRY grounds — once L1/L2 strips hidden fields
  at validation time, the only remaining role for projections is
  transporting graph→form values, and that's a one-line passthrough
  (the graph node is already AST-shaped) not a separate schema.
- *Generate form-surface schemas from the AST schemas*: Adds a code-gen
  layer that L1/L2 already does at validation time. Redundant.

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

---

## R11 — Editors consume the AST node directly (no projection layer)

**Decision**: Drop the `toFormValues(node): DataTypeFormValues`-style
projection helpers entirely. Editors pass the graph node straight into
`useZodForm(DataSchema, { defaultValues: node })`. The graph node IS
the AST shape — Langium emits it that way — so any field z2f's walker
needs is already on the node, and any field the UX doesn't want is
handled by `hidden: true` in `z2f.config.ts` (R1). Adopt the upstream
`useExternalSync(form, node, identityProjection)` with
`identityProjection = (n) => n` (or just omit if upstream allows
`toValues` to be optional and default to identity).

**Rationale**: Once R1 lands, projection schemas exist only because
projection helpers exist. Removing both in the same migration is
strictly DRY: one schema, one shape, one source of truth, one fewer
file to keep in sync with the grammar. The `defaultValues` typing is
satisfied because `output<DataSchema>` IS the AST shape that
`langium-zod` already produces; the graph node (whose runtime shape is
emitted by the same Langium pipeline) matches it structurally.

**Implementation notes**:
- Editor hosts read fields via `useFormContext().getValues('attributes.0.typeCall.type')` etc., or via `useWatch({ name: 'attributes' })` for the array — exactly the AST paths the typed config already references.
- `<Controller name="attributes.0.name">` inside the bespoke `AttributeRow` works without translation.
- For nodes that have *extra* graph-only fields not in the AST schema (e.g. layout coords, selection state), z2f silently ignores them — the walker only emits FormFields for keys it sees on the schema. No `hidden:` rule needed for graph-only fields.

**Alternatives considered**:
- *Keep `toFormValues` as a one-line passthrough wrapper*: Adds a layer
  for no benefit; the wrapper has nothing to do.
- *Define a narrower runtime type per editor (e.g. `Pick<output<DataSchema>, 'name' | 'attributes' | …>`)*: Same drift problem as the projection schemas — the narrowing is hand-authored and needs maintenance whenever the AST grows a field the UX wants to expose.

**Cascade into tasks**:
- Phase 3+ tasks that say "use `useZodForm(dataTypeFormSchema, …)`" should be
  read as "use `useZodForm(DataSchema, …)`" with `defaultValues: node`.
- T076 (Phase 10 cleanup) deletes `form-schemas.ts` AND the
  `toFormValues` helpers in the same task — they go together.
