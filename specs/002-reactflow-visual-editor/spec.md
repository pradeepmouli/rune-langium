# Feature Specification: ReactFlow Visual Editor

**Feature Branch**: `002-reactflow-visual-editor`
**Created**: 2026-02-11
**Status**: Draft
**Input**: User description: "implement reactflow-based visual editor"

## Overview

A visual editor for the Rune DSL that renders the type hierarchy (Data, Choice, Enumeration) as an interactive graph. Users can view type relationships, navigate the model visually, and perform full round-trip editing — adding, modifying, and deleting types directly on the graph, with all changes producing valid `.rosetta` source.

The editor is delivered as two packages:
- An embeddable component library for integration into any consuming application
- A standalone web application wrapping the component library for immediate use

This builds on the `@rune-langium/core` parser (feature 001), which produces the typed AST that the visual editor consumes.

## Clarifications

### Session 2026-02-11

**Q1**: What AST elements should the visual editor render?
**A**: Type hierarchy — Data, Choice, and Enumeration nodes with inheritance and composition edges (like a UML class diagram).

**Q2**: Should users be able to modify the model through the visual editor?
**A**: Yes, full visual editing — round-trip: parse `.rosetta` → display type graph → edit nodes/edges → generate updated `.rosetta` source.

**Q3**: How should the visual editor be packaged?
**A**: Both — an embeddable React component library (`@rune-langium/visual-editor`) and a standalone web application (`@rune-langium/studio`) that wraps it.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Type Graph (Priority: P1)

As a **financial modeler or developer working with Rune DSL models**, I want to see the type hierarchy rendered as an interactive graph so that I can visually understand the structure and relationships of my data model without reading through `.rosetta` source files line by line.

**Why this priority**: Visualization is the foundation that all other features build on. Without a working graph view, editing, navigation, and export are impossible. Even read-only visualization delivers immediate value for model understanding.

**Independent Test**: Load a `.rosetta` file containing Data types with inheritance and attributes. Verify the graph renders all types as nodes with correct edges for `extends` relationships, attribute type references, and choice options.

**Acceptance Scenarios**:

1. **Given** a `.rosetta` file with `type Trade extends Event` containing attributes `tradeDate date (1..1)` and `product Product (1..1)`, **When** loaded into the visual editor, **Then** the graph shows a "Trade" node, an "Event" node, a "Product" node, an inheritance edge from Trade to Event, and reference edges from Trade to the types of its attributes
2. **Given** a `.rosetta` file with a `choice PaymentType` having options `CashPayment` and `PhysicalSettlement`, **When** loaded, **Then** the graph shows a "PaymentType" choice node with edges to each option type
3. **Given** a `.rosetta` file with an `enum CurrencyEnum` containing values `USD`, `EUR`, `GBP`, **When** loaded, **Then** the graph shows a "CurrencyEnum" node with the enum values listed inside it
4. **Given** a model with 50+ types across multiple inheritance levels, **When** loaded, **Then** the graph auto-layouts all nodes in a readable hierarchical arrangement without manual positioning

---

### User Story 2 - Navigate & Explore the Graph (Priority: P1)

As a **developer exploring a large Rune model**, I want to pan, zoom, search for types by name, and click on nodes to see their details so that I can efficiently find and understand specific parts of the model.

**Why this priority**: Large models (like CDM with 400+ types) are unusable without navigation. Search and filtering are essential for practical use beyond small demos.

**Independent Test**: Load the CDM corpus into the visual editor. Search for "Trade", click on the result, and verify the graph centers on the Trade type with a detail panel showing its attributes and relationships.

**Acceptance Scenarios**:

1. **Given** a loaded type graph, **When** the user scrolls or pinch-zooms, **Then** the graph pans and zooms smoothly without lag
2. **Given** a graph with 100+ nodes, **When** the user types "Trade" into the search box, **Then** matching type nodes are highlighted and the first result is centered in the viewport
3. **Given** a selected node, **When** the user clicks on it, **Then** a detail panel shows the type's name, description (if annotated), attributes with types and cardinalities, parent type (if extends), and direct subtypes
4. **Given** a complex graph, **When** the user applies a filter (e.g., show only types in namespace `cdm.event`), **Then** only matching types and their direct relationships are displayed, with other nodes hidden
5. **Given** a type with cross-file references, **When** the user clicks on a referenced type in the detail panel, **Then** the graph navigates to and highlights that type

---

### User Story 3 - Embeddable Component Library (Priority: P1)

As a **developer building a tool on top of `@rune-langium/core`**, I want an embeddable visual editor component so that I can integrate the type graph view into my own application without building graph rendering from scratch.

**Why this priority**: The component library is the reusable foundation. The standalone app (P3) is built on top of it. Delivering the component first enables both internal and external consumers.

**Independent Test**: Import the visual editor component into a minimal React application. Pass a parsed AST from `@rune-langium/core`. Verify the graph renders correctly with default configuration.

**Acceptance Scenarios**:

1. **Given** a React application that imports the visual editor component, **When** the developer passes a parsed `RosettaModel` AST, **Then** the graph renders the type hierarchy with default layout and styling
2. **Given** the component with configuration options, **When** the developer customizes node colors, edge styles, or layout direction, **Then** the graph reflects the custom configuration
3. **Given** the component mounted in a container, **When** the container is resized, **Then** the graph adapts to the new dimensions responsively
4. **Given** the component API, **When** the developer registers event callbacks (node click, edge click, selection change), **Then** the callbacks fire with the corresponding AST node references

---

### User Story 4 - Visual Model Editing (Priority: P2)

As a **financial modeler**, I want to add, modify, and delete types directly on the visual graph so that I can evolve the data model without switching to a text editor, while knowing that my changes produce valid `.rosetta` source.

**Why this priority**: Full visual editing is the core differentiator that makes this an "editor" rather than a "viewer." It depends on P1 visualization being stable. Round-trip serialization is the most technically challenging aspect.

**Independent Test**: Open a `.rosetta` model, add a new Data type via the graph UI, add attributes to it, save, and verify the generated `.rosetta` source parses without errors and contains the new type.

**Acceptance Scenarios**:

1. **Given** a loaded type graph, **When** the user creates a new Data type via a context menu or toolbar, **Then** a new node appears on the graph with a default name and the user can immediately rename it
2. **Given** a Data type node, **When** the user adds an attribute (specifying name, type, and cardinality), **Then** the attribute appears in the node and a reference edge is drawn to the attribute's type
3. **Given** a Data type node, **When** the user sets its parent type by dragging an inheritance edge to another node, **Then** the `extends` relationship is created and reflected in the generated source
4. **Given** any edit operation, **When** the user triggers "undo," **Then** the previous state is restored; "redo" re-applies the undone change
5. **Given** multiple edits to a model, **When** the user exports the result, **Then** the generated `.rosetta` source is syntactically valid and parseable by `@rune-langium/core`
6. **Given** an existing attribute, **When** the user modifies its cardinality from `(1..1)` to `(0..*)`, **Then** the change is reflected both visually and in the generated source

---

### User Story 5 - Change Validation & Error Prevention (Priority: P2)

As a **modeler making changes visually**, I want the editor to validate my edits against Rune DSL rules and prevent invalid operations so that I cannot accidentally create a broken model.

**Why this priority**: Without validation, visual editing is dangerous — users could create circular inheritance, duplicate names, or invalid cardinalities that produce unparseable source. This must ship alongside editing (P2).

**Independent Test**: Attempt to create a circular inheritance chain (A extends B extends A) via the visual editor. Verify the editor prevents the operation and shows an error message.

**Acceptance Scenarios**:

1. **Given** type A that extends type B, **When** the user attempts to make B extend A (circular inheritance), **Then** the editor rejects the operation and displays an inline error on the graph
2. **Given** a namespace with a type named "Trade", **When** the user attempts to create another type named "Trade" in the same namespace, **Then** the editor prevents it and shows a duplicate name warning
3. **Given** an attribute being edited, **When** the user enters an invalid cardinality (e.g., `(5..2)` where min > max), **Then** the editor highlights the error and prevents saving until corrected
4. **Given** a type referenced by other types, **When** the user attempts to delete it, **Then** the editor warns about dependent types and requires confirmation before proceeding

---

### User Story 6 - Standalone Web Application (Priority: P3)

As a **user who wants to explore or edit Rune models without setting up a development environment**, I want a standalone web application where I can load `.rosetta` files, visualize the type graph, make edits, and save the results.

**Why this priority**: The standalone app is the full user experience but depends on the component library (P1) and editing capability (P2) being complete. It adds file management, workspace handling, and application chrome.

**Independent Test**: Open the standalone web app in a browser. Drag-and-drop a folder of `.rosetta` files. Verify the workspace loads, cross-file references resolve, the type graph renders, and edits can be saved back.

**Acceptance Scenarios**:

1. **Given** the standalone app is opened in a browser, **When** the user drags a `.rosetta` file or folder onto the window, **Then** the files are loaded and the type graph renders
2. **Given** a loaded multi-file workspace, **When** types in one file reference types in another, **Then** cross-file references resolve and edges connect across file boundaries
3. **Given** edits made to the model, **When** the user clicks "Save" or "Export," **Then** the modified `.rosetta` files are downloadable with all edits applied
4. **Given** the loaded graph, **When** the user clicks "Export as Image," **Then** an SVG or PNG of the current graph view is generated and downloadable
5. **Given** the standalone app with a loaded model, **When** the user toggles the source view panel, **Then** a side-by-side view shows the generated `.rosetta` source corresponding to the current graph state

---

### Edge Cases

- **Circular inheritance**: Type A extends B extends C extends A — must be detected and displayed as a validation error, not cause an infinite loop in layout
- **CDM-scale models**: 400+ types with deep inheritance trees — auto-layout must complete without blocking the UI
- **Partial workspace**: Only some files of a multi-file model are loaded — unresolved cross-file references should display as "external reference" placeholders, not errors
- **External file changes**: Source file changes outside the editor while edits are in progress — editor must detect conflicts and offer resolution options
- **Long attribute lists**: Types with 30+ attributes — node rendering must remain readable (collapsible sections or scrolling)
- **Orphaned types**: Types with no inheritance or reference relationships — must still appear in the graph, positioned sensibly
- **Empty models**: A `.rosetta` file with only namespace and version but no types — graph should show an empty state with guidance on how to add types
- **Round-trip whitespace**: Generated `.rosetta` source may differ in formatting from the original — semantic equivalence is required, not character-for-character identity

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST parse `.rosetta` files using `@rune-langium/core` and render Data, Choice, and Enumeration types as graph nodes
- **FR-002**: System MUST render inheritance (`extends`) relationships as directed edges between nodes
- **FR-003**: System MUST render attribute type references as edges connecting a type to the types of its attributes
- **FR-004**: System MUST render Choice option relationships as edges from the choice to each option type
- **FR-005**: System MUST display attributes within type nodes showing name, type, and cardinality
- **FR-006**: System MUST automatically layout nodes in a hierarchical arrangement based on inheritance and composition relationships
- **FR-007**: System MUST support pan, zoom, and viewport reset interactions
- **FR-008**: System MUST provide a search feature that filters and highlights nodes by type name
- **FR-009**: System MUST display a detail panel when a node is selected, showing all attributes, parent type, subtypes, and annotations
- **FR-010**: System MUST allow filtering the graph by namespace, type kind (Data/Choice/Enum), or custom criteria
- **FR-011**: System MUST allow users to create new Data, Choice, and Enumeration types via the visual interface
- **FR-012**: System MUST allow users to add, modify, and delete attributes on Data types including name, type reference, and cardinality
- **FR-013**: System MUST allow users to create and remove inheritance relationships between types
- **FR-014**: System MUST generate valid `.rosetta` source from all visual edits (round-trip serialization)
- **FR-015**: System MUST provide undo and redo for all edit operations
- **FR-016**: System MUST validate edits against Rune DSL rules before applying (circular inheritance, duplicate names, invalid cardinality)
- **FR-017**: System MUST display validation errors inline on the graph near the affected nodes
- **FR-018**: System MUST warn users before deleting types that are referenced by other types
- **FR-019**: System MUST be delivered as an embeddable component library with a documented public API
- **FR-020**: System MUST be delivered as a standalone web application that wraps the component library
- **FR-021**: The standalone app MUST support loading `.rosetta` files via drag-and-drop, file picker, or directory selection
- **FR-022**: The standalone app MUST resolve cross-file type references when multiple files are loaded
- **FR-023**: The standalone app MUST allow exporting the graph as an SVG or PNG image
- **FR-024**: The standalone app MUST provide a side-by-side source view showing generated `.rosetta` output

### Constitution Alignment

- **CA-001**: The visual editor consumes the fully typed AST from `@rune-langium/core`, preserving DSL fidelity. Round-trip serialization MUST produce `.rosetta` source that parses to a semantically equivalent AST (Principle I: DSL Fidelity & Typed AST)
- **CA-002**: Automated tests for graph rendering and round-trip serialization MUST use the vendored CDM corpus and rune-dsl fixtures for deterministic, reproducible results (Principle II: Deterministic Fixtures)
- **CA-003**: Edit validation MUST enforce the same rules as the core parser's validator — no additional rules beyond parity for initial releases (Principle III: Validation Parity)
- **CA-004**: Graph rendering and auto-layout MUST complete within acceptable latency for CDM-scale models (400+ types). Parsing operations MUST be delegatable to a background thread to avoid blocking the UI (Principle IV: Performance & Workers)
- **CA-005**: The component library API MUST follow semantic versioning. Breaking changes MUST include migration guides. The visual editor MUST adapt to parser API changes via an adapter layer (Principle V: Reversibility & Compatibility)

### Key Entities

- **Graph Node**: A visual element representing a single Rune type (Data, Choice, or Enumeration). Contains the type name, kind indicator, and inline attribute list. Maps 1:1 to an AST node.
- **Graph Edge**: A visual connection between two graph nodes. Represents one of: inheritance (`extends`), attribute type reference, or choice option. Includes a label and directional indicator.
- **Attribute Display**: An inline element within a graph node showing an attribute's name, referenced type, and cardinality notation. Attributes are the primary content of Data type nodes.
- **Edit Operation**: An atomic, undoable user action. Includes: create type, delete type, rename type, add attribute, modify attribute, delete attribute, create edge, delete edge, change cardinality. Each operation must be reversible.
- **Graph Layout**: The computed spatial arrangement of all nodes and edges. Determined by an auto-layout algorithm that respects inheritance hierarchy, minimizes edge crossings, and groups related types.
- **Workspace**: A collection of one or more `.rosetta` files loaded together, enabling cross-file reference resolution. Tracks loaded files, their parsed ASTs, and the unified type graph.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can view the complete type hierarchy of a Rune model within 3 seconds of loading a file
- **SC-002**: Users can add a new type with two attributes to the model in under 30 seconds using visual controls
- **SC-003**: 100% of visual edits produce valid `.rosetta` source that parses without errors when re-processed by `@rune-langium/core`
- **SC-004**: The graph handles 500+ type nodes with smooth pan and zoom (no visible frame drops during interaction)
- **SC-005**: 90% of users can locate a specific type using search in under 5 seconds on a model with 200+ types
- **SC-006**: The visual editor component can be integrated into any consuming application with under 5 lines of code
- **SC-007**: Round-trip fidelity — edit → serialize → re-parse produces a semantically equivalent AST for 100% of supported edit operations
- **SC-008**: The standalone application loads and renders a multi-file workspace (10+ files, 100+ types) within 5 seconds

---

## Assumptions

1. `@rune-langium/core` (feature 001) is stable and its public API (`parse`, `parseWorkspace`, AST types) will not undergo breaking changes during this feature's development
2. The visual editor targets modern browsers (ES2020+, same as the core parser)
3. Auto-layout for 500+ nodes is achievable with existing graph layout algorithms without custom layout engine development
4. Round-trip serialization requires semantic equivalence, not character-for-character formatting preservation
5. The CDM corpus (~400+ types) represents the upper bound of model size the editor must handle performantly
6. Users of the component library are comfortable with a React-based integration
7. The standalone app is a single-page application with no server-side backend required (all processing happens in the browser)

---

## Out of Scope

- Expression visualization (function bodies, conditions, operations as graph elements)
- Synonym, annotation, or regulatory reference editing
- Collaborative real-time multi-user editing
- Version control integration (git diff, merge, history)
- LSP server or VS Code extension integration
- Code generation beyond `.rosetta` source (no Java, Python, or other target generation)
- Mobile or tablet-optimized UI
- Offline-first or installable PWA features
