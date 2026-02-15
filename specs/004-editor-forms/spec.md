# Feature Specification: Editor Forms for Types, Enums, Choices, and Functions

**Feature Branch**: `004-editor-forms`
**Created**: 2026-02-14
**Status**: Draft
**Input**: User description: "add a type/enum/choice/function editor form to the studio/visual editor components. For an individual type, enum, function, It should support most operations that would otherwise be performed in the current source code editor - for types, changing the name, selecting another type to inherit/extend, adding, updating, removing and changing the type of attributes. For functions, editing (simple) functions (via an expression editor), for enums, setting values, display values etc. Cross domain functionalities such as adding synonyms, comments, descriptions, etc. Should be supported as well."

## Overview

Structured editor forms that allow users to edit Rune DSL elements (types, enumerations, choices, and functions) through dedicated form-based interfaces instead of raw source code. Each element kind gets a purpose-built editor panel with fields, controls, and sub-editors appropriate to that kind. The forms provide the same editing capabilities as the source code editor but through a guided, structured UI that reduces syntax errors and makes the model more accessible to non-technical users.

These forms are surfaced in the studio as a right-side panel that opens when a user selects a node in the visual graph or navigates to an element through the namespace explorer. The panel is collapsible and resizable, consistent with the existing pane layout. It evolves the unused `DetailPanel` component into a fully interactive editing surface.

## Clarifications

### Session 2026-02-15

- Q: Where should the editor form panel appear in the studio layout? → A: Right-side panel that opens when a node is selected (collapsible, resizable like existing panes). The existing `DetailPanel` component (currently not wired into the studio) serves as the starting point to be evolved into the editable form.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Edit a Data Type (Priority: P1)

As a **financial modeler working with Rune DSL models**, I want to select a Data type in the visual editor and edit its properties — name, parent type, and attributes — through a structured form so that I can modify the model without writing raw Rune DSL syntax.

**Why this priority**: Data types are the most common and most complex element in Rune models (CDM has 400+ types). They have the richest editing surface — name, inheritance, attributes with types and cardinalities — and enabling form-based editing for them covers the highest-value use case.

**Independent Test**: Load a `.rosetta` file containing a `type Trade extends Event` with attributes. Click on the "Trade" node in the graph. Verify the editor form appears with editable fields for the type name, parent type selector, and attribute list. Change the type name, add an attribute, remove an attribute, and change an attribute's type. Verify the underlying model updates correctly.

**Acceptance Scenarios**:

1. **Given** a Data type node is selected in the graph, **When** the user opens the editor form, **Then** the form displays the type's current name, parent type (if any), description, and a list of all attributes with their names, types, and cardinalities
2. **Given** the editor form for a Data type is open, **When** the user changes the type name to a new valid name, **Then** the model updates to reflect the new name and the graph node label changes accordingly
3. **Given** the editor form for a Data type is open, **When** the user selects a different parent type from a searchable dropdown, **Then** the model updates the `extends` relationship and the graph edge updates
4. **Given** the editor form for a Data type is open, **When** the user clicks "Add Attribute" and fills in a name, selects a type, and picks a cardinality, **Then** a new attribute is added to the type and appears in both the form and the graph node
5. **Given** the editor form shows an existing attribute, **When** the user changes the attribute's type via a searchable dropdown, **Then** the attribute's type reference updates in the model and the corresponding edge in the graph updates
6. **Given** the editor form shows an existing attribute, **When** the user clicks remove on that attribute and confirms, **Then** the attribute is removed from the type and the graph node and any associated reference edge is removed
7. **Given** the editor form shows an existing attribute, **When** the user changes its cardinality using preset buttons or a custom input, **Then** the cardinality updates in the model and in the graph node display

---

### User Story 2 - Edit an Enumeration (Priority: P1)

As a **modeler defining enumerations for a financial data model**, I want to select an enumeration in the visual editor and edit its values — including display names — through a structured form so that I can manage enum definitions without manually editing syntax.

**Why this priority**: Enumerations are heavily used in financial models (currency codes, day count conventions, etc.) and have a straightforward editing surface that delivers high value with moderate complexity.

**Independent Test**: Load a `.rosetta` file containing a `enum CurrencyEnum` with values. Select the enum node. Verify the form allows adding, removing, and reordering enum values, and setting display names for each value.

**Acceptance Scenarios**:

1. **Given** an Enumeration node is selected, **When** the user opens the editor form, **Then** the form displays the enum name, parent enum (if any), description, and a list of all enum values with their display names (if set)
2. **Given** the enum editor form is open, **When** the user adds a new enum value with a name and optional display name, **Then** the value appears in the enum value list and in the graph node
3. **Given** the enum editor form shows existing values, **When** the user edits a value's display name, **Then** the display name updates in the model
4. **Given** the enum editor form shows existing values, **When** the user removes a value and confirms, **Then** the value is removed from the enum definition
5. **Given** the enum editor form is open, **When** the user changes the enum name, **Then** the model and graph update to reflect the new name
6. **Given** the enum has a parent enum, **When** the user changes or clears the parent enum via a searchable dropdown, **Then** the inheritance relationship updates in the model and graph

---

### User Story 3 - Edit a Choice (Priority: P2)

As a **modeler working with union types in Rune**, I want to select a Choice in the visual editor and manage its options through a structured form so that I can add, remove, or change choice options without writing DSL syntax.

**Why this priority**: Choices are less common than types and enums but still essential. They have a simpler editing surface (primarily managing the list of option type references), making them a natural second-priority item.

**Independent Test**: Load a `.rosetta` file with a `choice PaymentType` having options. Select the choice node. Verify the form allows adding and removing options by selecting referenced types.

**Acceptance Scenarios**:

1. **Given** a Choice node is selected, **When** the user opens the editor form, **Then** the form displays the choice name, description, and a list of all options with their referenced type names
2. **Given** the choice editor form is open, **When** the user adds a new option by selecting a type from a searchable dropdown, **Then** the option appears in the choice's option list and a new edge appears in the graph
3. **Given** the choice editor form shows existing options, **When** the user removes an option and confirms, **Then** the option is removed from the choice and the corresponding graph edge is removed
4. **Given** the choice editor form is open, **When** the user changes the choice name, **Then** the model and graph update accordingly

---

### User Story 4 - Edit a Function (Priority: P2)

As a **modeler defining business logic in Rune**, I want to select a Function in the visual editor and edit its inputs, output, and simple expression logic through a structured form so that I can build function definitions without writing raw expressions.

**Why this priority**: Functions involve expression editing, which is inherently more complex than structural editing. Scoping this to simple expressions (arithmetic, comparisons, feature access, conditionals) keeps the effort manageable while covering common use cases.

**Independent Test**: Load a `.rosetta` file with a function definition. Select the function. Verify the form shows inputs, output, and expression body. Edit the expression and verify the model updates.

**Acceptance Scenarios**:

1. **Given** a Function is selected, **When** the user opens the editor form, **Then** the form displays the function name, description, input parameters (name and type), output type, and the expression body
2. **Given** the function editor form is open, **When** the user adds an input parameter with a name and type, **Then** the parameter appears in the input list
3. **Given** the function editor form is open, **When** the user changes the output type via a searchable type selector, **Then** the output type updates in the model
4. **Given** the function editor form is open, **When** the user edits the expression body via the expression editor, **Then** the expression updates in the model
5. **Given** the expression editor, **When** the user enters an expression using arithmetic, comparison, feature access, or conditional operations, **Then** the editor validates the expression syntax and shows errors for invalid expressions

---

### User Story 5 - Cross-Domain Metadata Editing (Priority: P1)

As a **modeler documenting the business meaning of DSL elements**, I want to add and edit metadata — descriptions, synonyms, and comments — on any type, enum, choice, or function through the editor form so that I can enrich the model without switching to the source editor.

**Why this priority**: Descriptions, synonyms, and comments are applicable to all element kinds and are critical for model documentation and business understanding. Supporting them as a shared editing capability across all forms delivers broad value.

**Independent Test**: Select any type in the visual editor. Verify the editor form has a metadata section where the user can edit the description text, add/remove synonyms, and add/remove comments.

**Acceptance Scenarios**:

1. **Given** any element's editor form is open, **When** the user edits the description field, **Then** the `definition` text updates in the model
2. **Given** any element's editor form is open, **When** the user adds a synonym via the synonyms editor, **Then** the synonym annotation is added to the element in the model
3. **Given** any element's editor form shows existing synonyms, **When** the user removes a synonym, **Then** the synonym annotation is removed from the model
4. **Given** any element's editor form is open, **When** the user edits a comment/annotation, **Then** the annotation updates in the model
5. **Given** any element's editor form is open and metadata has been edited, **When** the user views the source code, **Then** the source reflects the metadata changes (round-trip fidelity)

---

### User Story 6 - Source Synchronization (Priority: P2)

As a **modeler switching between visual and source editing**, I want changes made in the editor forms to immediately reflect in the source code editor and vice versa so that both views stay in sync.

**Why this priority**: Bidirectional sync is essential for a coherent editing experience but depends on all individual form editors working correctly first. It builds on the existing graph-to-AST adapter infrastructure.

**Independent Test**: Open a type in the editor form, make a change, and verify the source editor shows updated `.rosetta` code. Then edit the same type in the source editor and verify the form updates.

**Acceptance Scenarios**:

1. **Given** a change is made in an editor form, **When** the change is committed, **Then** the corresponding `.rosetta` source updates within 1 second and the source editor reflects the change
2. **Given** a change is made in the source editor to an element currently displayed in an editor form, **When** the source is re-parsed, **Then** the editor form updates to reflect the source change
3. **Given** the source editor has unsaved changes that conflict with a form edit, **When** the user attempts to edit via the form, **Then** the system warns the user about the conflict and allows them to choose which version to keep

---

### Edge Cases

- What happens when the user renames a type that is referenced by other types' attributes or choice options? The system must update or warn about broken references.
- What happens when the user attempts to set a parent type that would create a circular inheritance chain? The system must prevent this with a clear error message (existing validation already handles this).
- What happens when the user enters a duplicate type name within the same namespace? The system must prevent this with a clear error message (existing validation already handles this).
- What happens when the user removes all attributes from a type or all values from an enum? The system should allow it, as empty types and enums are valid in Rune DSL.
- What happens when the user edits a type that was loaded from a read-only or external source? The system should indicate that the element is read-only and disable editing controls.
- What happens when the form is open and another user or process changes the underlying model? The form should detect the change and refresh, preserving any unsaved edits with a notification.
- What happens when the user enters an invalid expression in the function expression editor? The system should show inline validation errors and prevent saving until the expression is valid.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display a structured editor form when a user selects a Data type, Enumeration, Choice, or Function node in the visual graph or namespace explorer
- **FR-002**: The Data type editor form MUST allow editing the type name, selecting/clearing a parent type, and managing attributes (add, remove, reorder, edit name/type/cardinality)
- **FR-003**: The Enumeration editor form MUST allow editing the enum name, selecting/clearing a parent enum, and managing enum values (add, remove, edit name and display name)
- **FR-004**: The Choice editor form MUST allow editing the choice name and managing options (add/remove option type references)
- **FR-005**: The Function editor form MUST allow editing the function name, managing input parameters (add, remove, edit name/type), setting the output type, and editing the expression body
- **FR-006**: All editor forms MUST include a metadata section for editing descriptions, synonyms, and comments/annotations
- **FR-007**: Type and parent type selectors MUST provide searchable dropdown lists populated with available types from the current workspace
- **FR-008**: Changes made in editor forms MUST update the underlying AST model and synchronize with the visual graph within 1 second
- **FR-009**: Changes made in editor forms MUST synchronize with the source code editor, producing valid `.rosetta` syntax
- **FR-010**: The system MUST validate all edits in real time — including duplicate names, circular inheritance, invalid cardinalities, and invalid expressions — and display inline error messages
- **FR-011**: The system MUST support undo/redo for all form-based edits
- **FR-012**: The system MUST prevent editing of read-only or externally-sourced elements and visually indicate their read-only status
- **FR-013**: The expression editor for functions MUST support arithmetic, comparison, feature access, conditional, and logical operations
- **FR-014**: Attribute type selectors MUST include both built-in types (`string`, `date`, `int`, `number`, `boolean`, `time`, `date-time`) and user-defined types from the workspace
- **FR-015**: The editor forms MUST be keyboard-accessible — Enter to submit inline edits, Escape to cancel, Tab to navigate between fields

### Constitution Alignment

- **CA-001**: Editor forms operate on the fully-typed Langium AST. All edits produce valid AST mutations that preserve type safety — no opaque string manipulation. Expression editing parses expressions into typed AST nodes, not raw text.
- **CA-002**: Editor form tests will use vendored `.rosetta` fixture files from the existing CDM corpus and rune-dsl sources. Tests will be deterministic and offline.
- **CA-003**: Validation in editor forms will enforce the same rules as the Xtext-parity validation layer — duplicate names, circular inheritance, cardinality bounds. No additional validation rules beyond parity scope.
- **CA-004**: Form interactions must remain responsive — field updates and validation feedback must complete within 200ms. Graph re-rendering after form edits must complete within the existing layout latency budget. All parsing continues to run in a web worker.
- **CA-005**: Editor forms extend the existing `EditorState` store and editing actions. They do not replace the existing inline editors (TypeCreator, AttributeEditor, CardinalityEditor) but provide a richer alternative. Both paths produce the same AST mutations, ensuring backward compatibility.

### Key Entities

- **Editor Form**: A structured panel displaying editable fields for a selected DSL element. One form variant per element kind (Data, Enumeration, Choice, Function).
- **Metadata Section**: A shared sub-component within all editor forms providing fields for description, synonyms (as annotations), and comments.
- **Type Selector**: A searchable dropdown component that lists available types (built-in and user-defined) from the current workspace, used for parent type selection and attribute type assignment.
- **Expression Editor**: A specialized sub-editor within the Function editor form that provides syntax-aware editing for Rune expressions with validation and autocompletion.
- **Attribute Row**: A single row in the Data type editor representing one attribute, with inline controls for name, type, cardinality, and removal.
- **Enum Value Row**: A single row in the Enumeration editor representing one enum value, with inline controls for name, display name, and removal.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete a type rename, add an attribute, and change a cardinality through the editor form in under 30 seconds without touching the source editor
- **SC-002**: Users can add 5 enum values to an enumeration through the editor form in under 60 seconds
- **SC-003**: 100% of edits made through editor forms produce valid `.rosetta` source when serialized (no syntax errors introduced by form editing)
- **SC-004**: All form-based edits appear in the visual graph and source editor within 1 second of the edit being committed
- **SC-005**: Users can discover and use the editor forms without external documentation — the forms are self-explanatory through labels, placeholders, and contextual hints
- **SC-006**: All editor form interactions are accessible via keyboard (Tab navigation, Enter to submit, Escape to cancel)
- **SC-007**: Editor forms handle models with 400+ types without perceptible lag when opening or switching between elements

## Assumptions

- The existing `graph-to-ast` adapter and serializer can produce valid `.rosetta` source from synthetic AST models, and this infrastructure will be extended rather than replaced.
- The existing Zustand editor store's editing actions (`renameType`, `addAttribute`, `removeAttribute`, `updateCardinality`, `setInheritance`) will serve as the mutation layer for form edits, with new actions added as needed.
- Function expression editing is scoped to simple expressions (arithmetic, comparison, feature access, conditionals). Complex multi-step operations, loops, or nested function calls are out of scope for this feature.
- The editor forms will be displayed in a collapsible, resizable right-side panel within the existing studio layout, evolving the currently unwired `DetailPanel` component. They are not modal dialogs.
- Undo/redo is already implemented via Zundo in the editor store and will automatically cover form-based edits that go through the store's mutation actions.
