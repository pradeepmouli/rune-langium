# Feature Specification: Adopt zod-to-form in Visual Editor

**Feature Branch**: `001-adopt-zod-to-form`
**Created**: 2026-02-27
**Status**: Draft
**Input**: User description: "Adopt enhanced @zod-to-form APIs in @rune-langium/visual-editor, including component subpath exports, component config, scaffold updates, runtime dependency wiring, and initial EnumForm migration to ZodForm."

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.

  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - Configure reusable form widgets (Priority: P1)

As a visual editor maintainer, I want a dedicated component export surface and shared configuration for custom field widgets so generated forms can consistently render domain-specific inputs without manual wiring per form.

**Why this priority**: Without this, generated forms cannot reliably map domain field types to reusable widgets, making the adoption path non-viable.

**Independent Test**: Create a config that references supported widget names and generate a form from a schema that includes mapped fields; verify mapped fields render custom widgets and unmapped fields use default inputs.

**Acceptance Scenarios**:

1. **Given** the visual editor package is installed, **When** a consumer resolves the components subpath, **Then** the widget module is resolvable for type-checking and runtime loading.
2. **Given** a field mapping config references valid widget names, **When** forms are generated and rendered, **Then** mapped fields use the configured widgets and invalid widget names are rejected during type-checking.

---

### User Story 2 - Generate auto-save form components (Priority: P1)

As a visual editor maintainer, I want form scaffolding to generate auto-save form components from curated form schemas so generated forms are immediately usable in the editor workflow.

**Why this priority**: Generation output must align with the editor’s save model and form surface, otherwise generated components require significant manual rework.

**Independent Test**: Run the form scaffold command and verify generated outputs include auto-save behavior, no submit action requirement, and widget imports for mapped fields.

**Acceptance Scenarios**:

1. **Given** scaffold commands are configured with the component mapping, **When** generation is executed, **Then** generated forms are produced without errors in the expected output location.
2. **Given** generated forms are reviewed, **When** a mapped domain field is present, **Then** the output references the correct custom widget and does not render it as a plain text input.
3. **Given** generated forms are reviewed, **When** auto-save mode is enabled, **Then** form output supports value-change callbacks and omits submit-button-driven flows.

---

### User Story 3 - Migrate one existing form safely (Priority: P2)

As a product engineer, I want one existing hand-authored form migrated to the new form runtime while preserving behavior so the team can validate coexistence and de-risk broader migration.

**Why this priority**: A single production-like migration validates integration patterns before rolling out to additional forms.

**Independent Test**: Replace one target form’s internal form engine with the generated/runtime approach and verify behavior parity for editing, auto-save timing, external updates, and list editing.

**Acceptance Scenarios**:

1. **Given** the migrated form is opened for an existing model element, **When** users edit supported fields, **Then** changes are persisted with the same observable behavior as before.
2. **Given** a user performs undo/redo or an external model update occurs, **When** the form is visible, **Then** form values refresh correctly without losing in-progress dirty edits.
3. **Given** non-migrated forms still exist, **When** users operate across migrated and non-migrated forms, **Then** both continue to function without regressions.

---

### Edge Cases

- Configuration references a widget name that is not exported by the component module.
- Generated forms are stale because schema/config changed but scaffold was not re-run.
- External model changes (undo/redo or concurrent updates) occur while user has dirty form state.
- A field path expected to use a custom widget is omitted from field mappings.
- Runtime cannot resolve form runtime package at app build or execution time.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The visual editor package MUST expose a dedicated components module containing reusable form widgets required by generated forms.
- **FR-002**: The components module MUST be consumable for both runtime imports and compile-time module-shape checking.
- **FR-003**: The project MUST define a central component mapping configuration that links domain field types and specific schema field paths to widget names.
- **FR-004**: The mapping configuration MUST reject invalid widget names during compile-time validation.
- **FR-005**: Form scaffold commands MUST consume curated form schemas and the shared component mapping to generate form components.
- **FR-006**: Generated forms MUST support value-change-driven auto-save interaction and MUST NOT require submit-button interaction.
- **FR-007**: Generated output MUST render mapped domain fields with custom widgets and use default inputs for unmapped fields.
- **FR-008**: The visual editor package MUST include all runtime dependencies required by generated forms.
- **FR-009**: At least one existing hand-authored form MUST be migrated to the new runtime while preserving current user-visible behavior.
- **FR-010**: The migrated form MUST preserve debounced auto-save behavior for core editable fields.
- **FR-011**: The migrated form MUST continue supporting list-style member editing within the shared form context.
- **FR-012**: The migrated form MUST handle external data refresh events while preserving in-progress user edits when safe to do so.
- **FR-013**: Hand-authored non-migrated forms MUST continue to work unchanged during incremental rollout.

### Constitution Alignment

- **CA-001**: Adoption preserves typed model-editing behavior by constraining migrations to existing form surfaces and preserving current mutation semantics.
- **CA-002**: Scaffold outputs are deterministic artifacts regenerated from committed schema/config inputs to support repeatable verification.
- **CA-003**: Validation behavior remains consistent with existing form behavior for migrated fields during the coexistence phase.
- **CA-004**: Auto-save and interaction responsiveness remain aligned with current editor expectations, including debounced update behavior.
- **CA-005**: The rollout is incremental and backward-compatible: migrated and hand-authored forms coexist until full migration is complete.

### Key Entities *(include if feature involves data)*

- **Component Module Surface**: Named widget exports available to config and generated forms.
- **Component Mapping Configuration**: Declarative mapping of domain field types and schema field paths to widget names and optional widget props.
- **Generated Form Artifact**: Checked-in deterministic form component output produced from schema and mapping inputs.
- **Migrated Form Instance**: Existing editor form moved to the new runtime while retaining established behavior.
- **External Data Sync State**: Mechanism for reconciling upstream model changes with local form edits.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of configured custom widget field mappings resolve successfully during form generation and runtime loading in validation runs.
- **SC-002**: Running the scaffold command produces all targeted generated forms successfully in a single run with zero manual post-generation edits required.
- **SC-003**: In migrated-form verification scenarios, 100% of tested name/parent edits are persisted through auto-save within the existing debounce window.
- **SC-004**: In migrated-form verification scenarios, 100% of tested external update events (including undo/redo) reconcile without data loss for unaffected dirty fields.
- **SC-005**: No regressions are introduced in non-migrated forms during the migration release, as validated by existing form-focused test coverage and smoke checks.

## Assumptions

- The enhanced form-generation and runtime capabilities described in the upstream prerequisite are available and stable for consumption.
- Existing hand-authored forms remain in scope and are not replaced wholesale in this feature.
- Incremental migration starts with a single form target to establish a repeatable pattern before broader rollout.
- Generated form artifacts remain committed outputs and are regenerated whenever source schema or mapping inputs change.
