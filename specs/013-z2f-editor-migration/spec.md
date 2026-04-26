# Feature Specification: Migrate Visual Editor Forms to zod-to-form

**Feature Branch**: `013-z2f-editor-migration`
**Created**: 2026-04-25
**Status**: Draft
**Input**: User description: "Migrate visual-editor forms (DataType, Choice, Function, Enum, TypeAlias) from hand-written field plumbing to zod-to-form-driven rendering, retaining bespoke UX (drag reorder, inherited rows, type navigation, expression builder)"

## Background

The visual-editor package currently ships five hand-written editor forms — DataType, Choice, Function, Enum, and TypeAlias — totalling roughly 4,400 lines across the editor components and ~600 more across three shared sections (annotations, conditions, metadata). Each form re-implements the same plumbing: label/field/error scaffolding, controller wiring, section grouping, and external-data sync.

A typed-config surface for zod-to-form (z2f) already exists in the package and references these schemas, but no form actually consumes it. The forms call the schema-driven form hook only as a validator shortcut, then render every field by hand.

This migration replaces the boilerplate with z2f-driven rendering while keeping the genuinely product-specific UX intact: drag-handle reorder of rows, inherited members rendered alongside local rows, override/revert affordances, type-link navigation, the type-creator dropdown, the cardinality picker with its mini-DSL, and the expression-builder slot. Those pieces are not boilerplate; they are the editor's identity.

This spec is paired with a separate spec in the upstream library repo (`zod-to-form/specs/010-editor-primitives`) that adds the primitives this migration depends on. The migration here can begin once the upstream P1 primitives (array reorder slot, external-data sync hook) ship; later phases unblock as the upstream P2 primitives land.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Editing a Data type with z2f-rendered fields (Priority: P1)

A modeller selects a Data type node in the graph. The editor pane shows the type's name, parent type, attributes list, and metadata exactly as today, but the leaf fields (name, parent reference, definition, comments) are rendered by the form host instead of by hand-rolled markup. Behaviour matches today's editor: edits auto-save with the same debounce, validation errors surface in the same places, and tabbing order is preserved.

**Why this priority**: Data is the most common type in any model and the form most users interact with first. Migrating it proves the pattern, removes the largest block of duplicated plumbing, and produces the template all four other migrations follow. Without this, the migration produces no measurable benefit.

**Independent Test**: Open a model with a Data type, click the node, and confirm the form renders identically to the pre-migration version. Edit each leaf field and confirm auto-save fires with the same debounce. Trigger a validation error (empty name) and confirm the error message appears in the same place with the same wording.

**Acceptance Scenarios**:

1. **Given** a Data node selected, **When** the editor pane renders, **Then** the layout, labels, error placement, and tab order match the pre-migration baseline.
2. **Given** a Data node with an in-progress unsaved name edit, **When** the user clicks a different Data node, **Then** the form repopulates with the new node's values without manual reset wiring.
3. **Given** a Data node, **When** the user edits the name and waits for the debounce, **Then** a single rename action is committed to the graph.
4. **Given** a Data node with an invalid name (empty), **When** the user blurs the field, **Then** a validation error renders in the same position and with equivalent wording to today.

---

### User Story 2 - Reordering attributes by drag handle (Priority: P1)

A modeller drags an attribute row by its handle and drops it above another row. The order updates in the form, the graph receives the reorder action, and the persisted model reflects the new order on save. The drag handle, hover styling, and keyboard reorder shortcuts behave the same as today.

**Why this priority**: Reorder is a core authoring affordance in this editor. Today it lives in a hand-rolled array section. Moving it onto the upstream primitive is the migration's highest-leverage simplification — and without reorder, attributes-list editors regress.

**Independent Test**: Drag the third attribute above the first; confirm the rendered list reorders, the graph action `reorderAttribute(2, 0)` fires, and the persisted model reflects the new order.

**Acceptance Scenarios**:

1. **Given** a Data node with three attributes, **When** the user drags the third attribute above the first, **Then** the form, the graph, and the persisted model all reflect order [3, 1, 2].
2. **Given** a Data node, **When** keyboard reorder shortcuts are used (the same ones that work today), **Then** the same reorder semantics apply.
3. **Given** a Data node where attributes can be added or removed during a session, **When** the user reorders rows in between an add and a remove, **Then** all three operations replay correctly against the graph in the order they occurred.

---

### User Story 3 - Migrating Choice, Enum, Function, TypeAlias (Priority: P1)

A modeller working with any of the four other top-level type kinds sees forms that match their pre-migration appearance and behaviour, but built on the same z2f-driven approach as the Data form.

**Why this priority**: The migration is incomplete and the dual-rendering surface is a maintenance hazard until all five types use the same plumbing. Each of the four can ship as its own deployable slice once the Data form is in place.

**Independent Test**: For each of Choice, Enum, Function, TypeAlias: open a node of that type, confirm the form renders, exercise its specific affordances (Choice: option type-only rows; Enum: name + display rows; Function: separate inputs and output sections; TypeAlias: wrapped type reference), and confirm a representative edit round-trips through to the persisted model.

**Acceptance Scenarios**:

1. **Given** a Choice node, **When** the user adds a choice option and selects its type, **Then** the choice's `attributes` array is updated with a new entry whose name is hidden but typeCall.type is set.
2. **Given** an Enum node, **When** the user adds an enum value and gives it a display name, **Then** the form supports both name and display fields with the same row component.
3. **Given** a Function node, **When** the user edits an input row and the output row independently, **Then** the inputs array and the single-output section update without crosstalk.
4. **Given** a TypeAlias node, **When** the user picks a wrapped type, **Then** the `typeCall.type` is set and `typeCall.arguments` remains hidden.

---

### User Story 4 - Inherited attribute rows still render and work (Priority: P1)

A modeller working on a Data type that extends a parent sees the inherited members rendered in the same list as local members, with an "inherit indicator" and an override button. Clicking override promotes the inherited row to a local row that participates in form state. The behaviour matches today.

**Why this priority**: Inheritance is a defining feature of this editor; without it, the migration is a regression. The migration must not silently drop ghost rows.

**Independent Test**: Open a child Data type that has a parent with three attributes and one local override. Confirm the editor shows three rows (one local override, two inherited). Click override on one inherited row; confirm it becomes a local row with the same name/type/cardinality and is recorded as an `addAttribute` action.

**Acceptance Scenarios**:

1. **Given** a Data type with N local attributes and M inherited attributes, **When** the form renders, **Then** all N+M rows appear in the configured order (local first or interleaved per the existing convention).
2. **Given** an inherited row, **When** the user clicks override, **Then** a new local row appears with the inherited values pre-filled and a corresponding graph action fires.
3. **Given** an overridden row, **When** the user clicks revert, **Then** the local row disappears, the inherited row reappears, and the corresponding graph action fires.

---

### User Story 5 - Section components (annotations, conditions, metadata) become declarative (Priority: P2)

A modeller's view of annotations, conditions, and metadata sections is unchanged, but those sections are declared in the typed config (a `section` flag on the relevant fields) rather than imperatively spliced into each form. Each section component is registered once and reused across all five forms.

**Why this priority**: This is where the largest single LOC reduction lives (≈ 600 lines). It's P2 because the user-facing behavior doesn't change — this is a purely internal cleanup that pays off in maintenance cost and in newly-added forms not having to re-import three components.

**Independent Test**: Compare the pre- and post-migration screenshots for a node that has annotations, conditions, and metadata; confirm pixel-equivalence within a tolerance. Confirm the section components are referenced from a single registration point rather than imported into each form.

**Acceptance Scenarios**:

1. **Given** any of the five forms, **When** the form renders, **Then** annotations, conditions, and metadata sections appear in the same place with the same content as today.
2. **Given** the form configuration, **When** inspected, **Then** each section is declared once via the typed config and the corresponding section component is registered once on the components module.

---

### User Story 6 - Custom row renderers for inline rows (Priority: P2)

A modeller's experience of the attribute row, choice option row, enum value row, and function input row is unchanged. Internally, each row is a custom renderer registered against its item schema; the form host invokes the renderer and threads it the right form context. The row keeps its current affordances: type selector, cardinality picker, debounced name commit, drag handle, override/revert.

**Why this priority**: P2 because it depends on the upstream documentation and worked example landing first. Once it does, the row component implementations can drop their per-form copy of `useFormContext` plumbing and adopt the documented pattern.

**Independent Test**: Edit any attribute row; confirm name auto-save still debounces, type selection still navigates correctly, and validation errors still appear inline in the same place.

**Acceptance Scenarios**:

1. **Given** any of the five forms with an array section, **When** the user interacts with a row, **Then** all per-row affordances behave identically to today.
2. **Given** the row component, **When** inspected, **Then** it reads form context via the documented pattern and does not re-implement context plumbing.

---

### User Story 7 - Source-of-truth alignment between config and forms (Priority: P3)

A developer reading the typed config can trust that every schema referenced there is actually consumed by a form. Today, the typed config references generated AST schemas while the forms validate against a separate set of projection schemas in `src/schemas/form-schemas.ts`. After this work, there is exactly one set of form-surface schemas, and the typed config points at them.

**Why this priority**: P3 because it's a developer-experience cleanup with no end-user visibility. The dual-schema surface is, however, a footgun for anyone reading the code; aligning it makes the migration's outcome legible.

**Independent Test**: Read the typed config and the form-surface schema file together; confirm every schema imported by the config is consumed by a form, and every form's schema is imported by the config.

**Acceptance Scenarios**:

1. **Given** the post-migration repository, **When** a developer reads the typed config, **Then** each schema name in the config corresponds to a form-surface schema actually used by a form.
2. **Given** the post-migration repository, **When** a developer searches for "form-schemas" imports, **Then** every form imports from the same canonical file.

---

### Edge Cases

- What happens when a Data type's parent is changed mid-session, replacing the inherited rows? The new parent's inherited rows render; previously-inherited rows that are no longer applicable disappear unless they were overridden, in which case they remain as local rows.
- What happens when reorder is attempted on a list with one item? The drag affordance is suppressed (matches today).
- What happens when a row's name is being debounced when the user switches nodes? The pending commit is flushed against the original node; the new node's form repopulates with the new node's values.
- What happens when the typed config's schema and the actually-consumed schema disagree (during the migration's intermediate state)? A type-level error surfaces at build time so the divergence cannot ship.
- What happens when a section component is referenced in the config but not registered on the components module? The form host emits a developer warning and renders nothing for that section.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All five top-level editor forms (Data, Choice, Enum, Function, TypeAlias) MUST render their leaf fields via the form host with the same labels, error placement, and tab order as the pre-migration baseline.
- **FR-002**: All five forms MUST commit edits to the graph using the same auto-save debounce semantics as today, with no observable change in the timing or the actions emitted.
- **FR-003**: Reorder of rows in attribute, enum-value, choice-option, and function-input lists MUST work via drag handle and keyboard, with the same affordances as today and a single graph action fired per reorder.
- **FR-004**: Inherited rows MUST render alongside local rows in Data forms with their existing visual treatment, and the override/revert affordances MUST emit the same graph actions as today.
- **FR-005**: Annotations, conditions, and metadata sections MUST render in the same place in each form, but be declared via configuration rather than spliced into each form's body.
- **FR-006**: Each inline row component (attribute, choice option, enum value, function input) MUST be registered once as a custom renderer against its item schema, and MUST keep all current per-row affordances.
- **FR-007**: When the user switches between graph nodes, the form MUST repopulate with the new node's values without manual reset wiring in the form bodies.
- **FR-008**: There MUST be exactly one set of form-driving Zod schemas — the langium-generated AST schemas in `src/generated/zod-schemas.ts`. The hand-authored projection schemas in `src/schemas/form-schemas.ts` MUST be deleted by the end of the migration. AST-only fields are marked `hidden: true` in the typed config; the L1/L2 optimisers strip them from the validation surface at runtime.
- **FR-009**: After the migration, no editor form file MUST contain hand-written `<Controller>` calls for fields that the form host can render (the bespoke fields list is documented per form).
- **FR-010**: All bespoke editor UX features that exist today (type-link navigation, type-creator dropdown, cardinality picker, expression-builder slot) MUST continue to work without regression.
- **FR-011**: Total lines of code in the editor forms folder MUST decrease by at least 25% after the migration completes.
- **FR-012**: The end-user-visible behaviour of all five forms MUST be unchanged; visual regressions MUST be caught by snapshot or screenshot tests against the pre-migration baseline.

### Key Entities

- **Form-surface schema**: The Zod schema each form validates against. Today there are two parallel sets (generated AST and hand-written projections); after the migration, exactly one set remains.
- **Inline row component**: A custom row renderer for an array item — attribute row, choice-option row, enum-value row, function-input row. Each holds the editor's bespoke affordances.
- **Section component**: A reusable component for annotations, conditions, or metadata that today is imperatively included in each form and after the migration is registered once and referenced declaratively.
- **Editor form action**: A semantic operation on the graph (rename, addAttribute, reorderAttribute, addAnnotation, …) that the form fires in response to user edits. The set is fixed by today's contract; the migration must not change it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The combined size of `packages/visual-editor/src/components/editors/` plus the three section components decreases by at least 25% from the pre-migration baseline (approximately 1,200 lines removed of ~5,000).
- **SC-002**: A developer reading any of the five form files can locate the leaf-field rendering in under thirty seconds: it is a single `<ZodForm>`-or-equivalent element with a config block, not a 100-line `<Controller>` cascade.
- **SC-003**: A behavioural test suite covering all five forms passes with no regressions against the pre-migration baseline (every existing test still passes; new tests are added only where needed to cover the new wiring).
- **SC-004**: A visual diff (snapshot or screenshot) for each of the five forms shows pixel-equivalent rendering against the pre-migration baseline, within a tolerance documented per form.
- **SC-005**: A new form for a hypothetical sixth type kind can be added in under one hour by copying the configuration of the closest existing form and modifying the differences.
- **SC-006**: The typed config surface (`z2f.config.ts`) and the form-surface schemas resolve to the same set of Zod schemas, with no orphan references on either side.
- **SC-007**: Auto-save commit timing for any leaf field is within ±50 milliseconds of the pre-migration baseline, measured with the same debounce configuration.

## Assumptions

- The upstream form library has shipped (or will ship before the relevant migration phase begins) the array reorder primitive and the external-data sync hook. The Data-form migration cannot start until those are available.
- The upstream library's documentation for the custom row renderer pattern is sufficient for adopters; the migration does not require new upstream API for row rendering.
- The bespoke UX components owned by this package — `TypeSelector`, `CardinalityPicker`, `TypeLink`, `TypeCreator`, expression-builder slot — are kept as-is and registered as controlled overrides. They are not part of the migration's deletion budget.
- The current auto-save debounce of 500 ms remains the default. Per-field tuning, if any, is preserved verbatim.
- The migration ships in slices: each form is one or more pull requests, and each can deploy independently. The branch does not need to land all five forms at once.

## Deferred-context reconciliation

This feature absorbs the scope previously sketched in
`specs/_deferred/inspector-z2f-migration.md`. Two carry-over items
from feature 012 Phase 7 belong here, not there:

- **Roundtrip parity test** (was T102 in 012): a failing-then-passing
  test that asserts pre- and post-migration forms render the same
  fields, in the same order, with equivalent validation, against a
  pinned set of AST fixtures.
- **HMR end-to-end** (was T107 in 012): a Playwright test verifying
  that editing a Zod schema field updates the live editor via Vite
  HMR within 2s, with no full reload (SC-011 from feature 012).

The deferred doc's core proposal — drive forms from the langium-
generated AST schemas via the `?z2f` pipeline, with hand-author
overrides only where the AST is too generic — is **adopted** by this
spec. R1 elects the AST schemas as canonical; the L1/L2 optimisers
strip hidden fields from the validation surface at runtime, neutralising
the "AST schemas are too verbose for forms" concern that initially
favoured projection schemas. The hand-authored projections in
`src/schemas/form-schemas.ts` are scheduled for deletion (T076).

## Dependencies

- Upstream library primitives (zod-to-form): array reorder slot (P1 dependency for User Story 2), external-data sync hook (P1 dependency for User Story 1), discriminator host (optional dependency for the form router used in the editor pane), ghost-row support (P1 dependency for User Story 4), custom row renderer documentation (P1 dependency for User Story 6).
- Existing graph action contract (`EditorFormActions`): unchanged.
- Existing design system primitives (`Field`, `FieldSet`, `FieldLegend`, `Input`, `Badge`, etc.): unchanged.

## Out of Scope

- Changing the graph action contract or the persisted model shape: out of scope; the migration is a UI refactor only.
- Changing any user-visible behaviour: out of scope. End users should not be able to detect that the migration shipped except through performance changes (if any) and through subsequently easier feature delivery.
- Migrating sub-editors that live below the five top-level forms (e.g. expression-builder internals): out of scope. Those keep their current implementations.
- Deleting the bespoke UX components (`TypeSelector`, `CardinalityPicker`, etc.): out of scope. They are controlled overrides, not migration targets.
- Replacing the langium-zod schema generation pipeline: out of scope. The generated AST schemas remain a separate validation surface; this migration only consolidates the *form-surface* schemas.
- Changes to the studio app's vite plugin wiring: out of scope; the upstream plugin is already mounted.
- Performance optimisation beyond preserving today's behaviour: out of scope. If the migration unlocks future performance gains, those are tracked separately.
