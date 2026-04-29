# Feature Specification: Studio Form Preview

**Feature Branch**: `016-studio-form-preview`
**Created**: 2026-04-28
**Status**: Refined
**Refined**: 2026-04-28 — Require Studio form preview to use generated preview-schema snapshots from the codegen worker
**Input**: User description: "implement form preview in studio using generated zod schema + minor layout cleanup in studio (default arrangement of panels may need work to support form preview)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preview a generated form for the selected model type (Priority: P1)

A modeller selects a type in Studio and sees a live form preview for that selected type. The preview is derived from the latest generated preview-schema snapshot for the current model, so the rendered fields, required/optional state, list controls, enums, nested objects, and validation messages stay aligned with the generated preview metadata Studio can safely consume in-browser.

**Why this priority**: The form preview is the core user value. It lets a modeller check whether the model they are authoring will produce an understandable data-entry surface without leaving Studio or writing a separate application.

**Independent Test**: Open a workspace with a model containing a data type with scalar, optional, array, enum, and nested fields. Select that type in Studio and confirm the preview shows one form whose structure and validation behavior match the generated schema for that type.

**Acceptance Scenarios**:

1. **Given** a valid workspace and a selected model type, **When** the form preview panel is visible, **Then** the panel renders a data-entry form for the selected type using the latest successful generated preview schema.
2. **Given** the selected type contains required, optional, and repeating fields, **When** the preview renders, **Then** each field communicates its entry requirement and list affordances accurately.
3. **Given** the selected type references an enumeration, **When** the preview renders, **Then** the enum field is shown as a bounded choice list using the generated enum values and labels.
4. **Given** the selected type contains nested model references, **When** the preview renders, **Then** nested sections are visible and navigable without losing the parent form context.
5. **Given** the generated preview schema contains nested unsupported features, **When** the preview renders, **Then** it keeps all supported fields interactive and lists unsupported features without silently hiding them.
6. **Given** no type is selected, **When** the preview panel is visible, **Then** the panel shows an empty state that invites the user to select a type from the graph, file tree, or source editor.

---

### User Story 2 - Validate sample input against the generated schema (Priority: P1)

A modeller enters sample data into the form preview and immediately sees whether the values satisfy the generated preview schema. Validation feedback appears at the relevant fields and a compact summary indicates whether the sample instance is valid.

**Why this priority**: A form preview without validation can only check layout. The feature must help modellers catch schema and cardinality mistakes while they are still editing the model.

**Independent Test**: Select a type with one required field and one bounded array field. Submit the empty preview, confirm required-field errors appear, then enter valid values and confirm the preview reports a valid sample.

**Acceptance Scenarios**:

1. **Given** a selected type with missing required values, **When** the user validates or blurs the relevant fields, **Then** the preview shows field-level errors matching the generated schema.
2. **Given** a field with minimum or maximum list bounds, **When** the user adds too few or too many items, **Then** the preview shows the bound violation and prevents the sample from being marked valid.
3. **Given** all required values are present and every field satisfies the schema, **When** validation runs, **Then** the preview reports the sample as valid and clears stale error messages.
4. **Given** the user edits a field after a validation error, **When** the new value satisfies that field, **Then** the field-level error clears without requiring a full workspace reload.

---

### User Story 3 - Keep preview current as the model changes (Priority: P2)

A modeller edits the source or visual graph and the form preview updates after the next successful model analysis and schema generation. If the model is temporarily invalid, the preview preserves the last successful form and clearly marks it as stale until the model is fixed.

**Why this priority**: Studio is an authoring environment. The preview must support iterative modelling without turning every syntax error into a blank panel.

**Independent Test**: Select a type, add a new required field in the source, and confirm the preview adds the field after the model is valid. Then introduce a syntax error and confirm the previous preview remains visible with a stale status.

**Acceptance Scenarios**:

1. **Given** a valid selected type, **When** the user adds a new field and the model becomes valid again, **Then** the preview updates to include the new field without changing the user's selected type.
2. **Given** the current model has parse or validation errors, **When** the preview cannot regenerate, **Then** the panel keeps the last successful preview and displays a stale status that points the user to the model errors.
3. **Given** the selected type is renamed, **When** the model becomes valid again, **Then** the preview follows the renamed type if it can be resolved unambiguously.
4. **Given** the selected type is deleted, **When** the model becomes valid again, **Then** the preview returns to the no-selection empty state.

---

### User Story 4 - Use grouped Studio modes that give preview enough space (Priority: P2)

A modeller opens Studio or resets the layout and sees a mode-based workspace: Navigate on the full left side, Edit in the middle, Preview on the full right side, Visualize as its own graph-focused mode, and Problems/Messages as bottom utility trays. The form preview is paired with generated code under Preview, not hidden behind unrelated diagnostics or graph tabs.

**Why this priority**: The feature is only useful if users can find and compare it while modelling. Adding a preview panel without layout cleanup would bury the workflow in an already crowded shell.

**Independent Test**: Start with a fresh workspace at 1440x900 and 1280x800, then use Reset Layout. Confirm the default arrangement exposes Navigate, Edit, Visualize, and Preview modes; keeps Source and Structure together in Edit; places Form and Code together in Preview; and keeps Problems/Messages available without occupying permanent editing space.

**Acceptance Scenarios**:

1. **Given** a fresh desktop workspace, **When** Studio loads its default layout, **Then** Navigate owns the full left side, Edit owns the middle, and Preview owns the full right side.
2. **Given** the user chooses Reset Layout, **When** the layout resets, **Then** Source and Structure appear under Edit, while Form and Code appear under Preview.
3. **Given** the user switches to Visualize, **When** the graph view opens, **Then** it is presented as a graph-focused mode rather than as a generated preview.
4. **Given** the viewport is 1280px wide or narrower, **When** Studio chooses compact defaults, **Then** Preview remains reachable without making Source or Structure unusable.
5. **Given** Problems or Messages contain actionable content, **When** Studio surfaces that content, **Then** the bottom utility tray can expand without permanently reducing the primary Navigate/Edit/Preview columns.

---

### User Story 5 - Inspect generated sample data from the preview (Priority: P3)

A modeller can view the sample data represented by the form preview, copy it, and use it as a quick fixture for downstream validation, tests, or documentation.

**Why this priority**: This turns the preview from a visual check into a practical modelling aid, but it depends on the core preview and validation flows.

**Independent Test**: Fill a valid preview for a selected type, open the sample data view, and confirm the displayed data matches the current form values and can be copied.

**Acceptance Scenarios**:

1. **Given** a valid preview sample, **When** the user opens the sample data view, **Then** the shown data exactly matches the current form values.
2. **Given** the user changes a form value, **When** the sample data view is open, **Then** the shown data updates to match the new value.
3. **Given** the user copies the sample data, **When** they paste it into a plain text editor, **Then** it is formatted as readable structured data.

### Edge Cases

- A preview schema cannot be produced for the selected type because the model has errors: keep the last successful preview if available and mark it stale; otherwise show a clear unavailable state.
- The selected type has unsupported schema features: render all supported fields, list unsupported features in the preview status, and avoid presenting the sample as fully valid.
- The selected type has recursive references: prevent infinite rendering and provide a controlled way to add nested items up to a reasonable depth.
- The model contains multiple types with the same display name in different namespaces: identify the preview target by its fully-qualified model identity, not by display name alone.
- The selected type or one of its nested fields uses unsupported preview metadata: keep supported fields interactive, mark the preview as limited, and list unsupported features instead of flattening or silently discarding them.
- A workspace has no generated schemas yet: show a waiting state during generation, then either render the preview or show a specific generation failure.
- A previous browser session has an older saved layout: the feature may reset that workspace to the new defaults; preserving old customized layouts is out of scope.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Studio MUST provide a form preview panel that renders a data-entry form for the currently selected model type.
- **FR-002**: The form preview MUST be derived from the latest successful generated preview schema snapshot for the current workspace, not from a separate hand-authored form definition.
- **FR-003**: The preview MUST represent required fields, optional fields, repeated fields, bounded lists, enum choices, nested objects, and readable field labels from the generated schema.
- **FR-003a**: When preview generation encounters unsupported nested-schema features, the preview MUST keep supported fields interactive and surface the unsupported features explicitly.
- **FR-004**: The preview MUST validate sample input against the same generated schema used to render the preview and MUST show field-level validation messages.
- **FR-005**: The preview MUST show an overall sample status with at least these states: waiting for generation, valid, invalid, stale, and unavailable.
- **FR-006**: When the model changes and schema generation succeeds, the preview MUST update to match the latest generated schema while preserving the selected type when it can be resolved.
- **FR-007**: When model errors prevent generation, the preview MUST preserve the last successful preview for the selected type when one exists and mark it stale.
- **FR-008**: When no type is selected, the preview MUST show a no-selection empty state that explains the next user action without exposing implementation details.
- **FR-009**: The preview MUST allow users to reset the sample values for the selected type without changing the model.
- **FR-010**: The preview MUST provide a structured sample data view for the current form values and a copy action for that sample.
- **FR-011**: Studio MUST organize primary workspace surfaces into user-facing modes: Navigate, Edit, Visualize, and Preview.
- **FR-012**: Navigate MUST include Files and Model Tree surfaces and occupy the full left side in the default desktop arrangement.
- **FR-013**: Edit MUST include Source and Structure surfaces and occupy the primary middle editing area in the default desktop arrangement.
- **FR-014**: Preview MUST include Form and Code generated-artifact surfaces and occupy the full right side in the default desktop arrangement.
- **FR-015**: Visualize MUST be a separate graph-focused mode, not a generated preview surface.
- **FR-016**: Problems and Messages MUST be available as bottom utility surfaces that can auto-hide or collapse when not actionable.
- **FR-017**: Reset Layout MUST restore the Navigate/Edit/Visualize/Preview arrangement at common desktop sizes.
- **FR-018**: The compact layout for narrower desktop viewports MUST avoid horizontal overflow and MUST keep Source and Structure usable when Preview is opened.
- **FR-019**: The current graph surface MUST NOT be labelled as "Preview"; user-facing labels MUST distinguish Visualize from generated Form/Code preview.
- **FR-020**: The generated Code preview MUST be visually readable in the same Preview group as Form and MUST support long generated source without corrupting the surrounding layout.
- **FR-021**: The form preview MUST be keyboard navigable, including field focus order, validation feedback, panel focus, and copy/reset actions.
- **FR-022**: Validation errors and stale/unavailable states MUST be announced to assistive technology in a way that does not require the user to inspect visual styling.
- **FR-023**: The form preview MUST not write sample data into the user's model unless the user explicitly uses a separate save/import action introduced by a future feature.
- **FR-024**: The form preview MUST not send sample data outside the user's browser workspace as part of this feature.
- **FR-025**: Automated coverage MUST verify preview rendering, validation behavior, stale-state behavior, grouped layout defaults, utility tray behavior, and label clarity.

### Key Entities

- **Form preview target**: The currently selected model type, identified by namespace and type identity, for which Studio renders a preview form.
- **Generated preview schema snapshot**: The latest successful serializable preview-schema set for the workspace, including enough metadata to locate the schema for a selected type.
- **Unsupported preview metadata**: Generated nested-schema features the current preview renderer cannot expand and must therefore report to the user.
- **Preview sample**: The in-memory values entered into the form preview for the selected target. It is separate from the authored model.
- **Preview status**: The panel state that communicates whether the preview is waiting, valid, invalid, stale, or unavailable.
- **Studio mode layout**: The default workspace arrangement that maps Navigate to the left, Edit to the middle, Preview to the right, Visualize to graph exploration, and Problems/Messages to bottom utilities.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A modeller can select a valid model type and see its form preview in under 2 seconds after schema generation completes, in at least 95% of local Studio sessions.
- **SC-002**: At least 95% of supported generated-schema field kinds render with matching form controls and validation behavior in the preview.
- **SC-003**: A user can identify whether the current sample is valid or invalid within 5 seconds of entering sample data.
- **SC-004**: On model syntax or validation errors, the preview keeps the last successful form visible with a stale indicator in 100% of covered regression cases.
- **SC-005**: Fresh and reset layouts at 1440x900 and 1280x800 expose Navigate, Edit, Visualize, and Preview modes without horizontal page overflow.
- **SC-006**: Fresh and reset layouts pair Form and Code under Preview while keeping Source and Structure usable under Edit in 100% of covered layout fixtures.
- **SC-007**: Keyboard-only users can reach the form preview panel, fill fields, validate, reset, and copy sample data without using a pointer.
- **SC-008**: The preview feature introduces no sample-data persistence or network transmission unless the user explicitly copies the sample.

## Assumptions

- The code generation work can emit serializable preview-schema snapshots from the same Rune model analysis already used for Studio code generation.
- The form preview should consume those preview-schema snapshots rather than executing generated source in the browser.
- The form preview is scoped to the selected model type, not to generating a complete multi-page application.
- This feature previews and validates sample data only; importing sample data back into the model is out of scope.
- The default layout uses a grouped mode model: Navigate, Edit, Visualize, and Preview.
- Generated code preview and generated form preview are sibling surfaces under Preview.
- Persisted layout migration is out of scope; users with older saved layouts may reset to the new defaults.
