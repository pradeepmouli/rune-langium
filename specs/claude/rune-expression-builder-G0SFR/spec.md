# Feature Specification: Rune Expression Builder

**Feature Branch**: `007-expression-builder`
**Created**: 2026-03-04
**Status**: Draft
**Input**: User description: "Visual block-based expression builder for constructing Rune function expressions (operations, conditions, shortcuts, post-conditions) as an alternative to raw text editing"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Function Expression as Visual Blocks (Priority: P1)

A domain expert (e.g., financial analyst) opens a Rune function in the visual editor and sees its expressions rendered as a tree of nested, color-coded blocks rather than raw DSL text. Each block represents an operation (arithmetic, comparison, feature call, etc.) and shows its operands as child blocks. The user can read and understand the expression structure without knowing Rune syntax.

**Why this priority**: This is the foundational capability — without visual rendering of expressions, no other builder features are possible. It also delivers immediate read-only value for comprehension.

**Independent Test**: Can be fully tested by loading any Rune function with expressions and verifying blocks render correctly. Delivers value by making function logic visually accessible.

**Acceptance Scenarios**:

1. **Given** a Rune function with a `set` operation containing `a + b * c`, **When** the user opens the function in builder mode, **Then** they see a nested block tree: an addition block with `a` on the left and a multiplication block (`b * c`) on the right, respecting operator precedence.
2. **Given** a function with a `filter` expression using a closure (`trades filter [item -> notional > 100]`), **When** the user views it, **Then** the filter block displays the closure parameter (`item`), the feature call (`-> notional`), and the comparison (`> 100`) as distinct, nested visual elements.
3. **Given** a function with shortcuts (aliases), conditions, operations, and post-conditions, **When** the user views it, **Then** each section is visually separated with labeled headers and all expression bodies render as blocks.
4. **Given** an expression referencing an input parameter, **When** the user views the reference block, **Then** it shows the parameter name, its type, and a visual indicator that it is an input reference.

---

### User Story 2 - Build Expressions by Clicking and Selecting (Priority: P1)

A domain expert constructs a new expression by clicking on placeholder slots and selecting operators/operands from a categorized palette. They do not type any Rune syntax. The builder guides them through valid choices based on the expression context.

**Why this priority**: Interactive editing is the core value proposition — enabling non-DSL-literate users to author business rules. Without this, the builder is only a viewer.

**Independent Test**: Can be tested by creating a new function operation from scratch using only click interactions and verifying the generated DSL text is syntactically valid.

**Acceptance Scenarios**:

1. **Given** an empty operation slot (`set result:`), **When** the user clicks the placeholder, **Then** a categorized palette appears showing available expression types (arithmetic, comparison, logic, navigation, collection, control).
2. **Given** the user selects a binary operator (e.g., `+`), **When** the operator is inserted, **Then** a binary block appears with two placeholder slots (left operand, right operand) and the operator displayed between them.
3. **Given** a placeholder in a binary block's left slot, **When** the user clicks it and selects a reference, **Then** a dropdown shows all in-scope variables (function inputs, aliases, output) with their types and cardinalities.
4. **Given** the user has built a complete expression (no remaining placeholders), **When** the expression is committed, **Then** the builder serializes it to valid Rune DSL text that parses without errors.
5. **Given** a partially-built expression with empty placeholder slots, **When** the user views the function, **Then** placeholder slots are clearly distinguished (e.g., dashed borders) and indicate they need to be filled.

---

### User Story 3 - Toggle Between Builder and Text Modes (Priority: P2)

A user switches between the visual builder and a raw text editor for the same expression. Changes in one mode are reflected in the other. Power users can use text mode for speed while domain experts use builder mode for clarity.

**Why this priority**: Enables a smooth workflow for mixed teams where some members prefer text and others prefer visual editing. Also serves as a safety valve if the builder doesn't yet support a particular expression pattern.

**Independent Test**: Can be tested by building an expression visually, switching to text mode, verifying the DSL text is correct, editing it in text mode, switching back, and verifying the blocks update.

**Acceptance Scenarios**:

1. **Given** an expression built in builder mode, **When** the user clicks the "Text" toggle, **Then** they see the corresponding Rune DSL text representation of the expression.
2. **Given** a valid expression in text mode, **When** the user switches to builder mode, **Then** the expression is parsed and rendered as visual blocks.
3. **Given** the user modifies an expression in text mode that introduces a syntax error, **When** they switch to builder mode, **Then** an error message is shown indicating the expression cannot be parsed, and the text mode remains available for correction.
4. **Given** a complex expression edited in text mode, **When** switching to builder mode, **Then** the visual blocks faithfully represent the full expression tree including nested sub-expressions.

---

### User Story 4 - Context-Aware Operator Filtering (Priority: P2)

When a user clicks a placeholder slot, the palette only shows operators and references that are valid for that position based on the expression's type context. For example, numeric aggregation operators (`sum`) are only offered when the expression context is a numeric collection.

**Why this priority**: Prevents users from constructing invalid expressions, dramatically reducing errors and the learning curve for domain experts unfamiliar with Rune's type system.

**Independent Test**: Can be tested by clicking placeholders in various type contexts and verifying the palette shows only type-compatible options.

**Acceptance Scenarios**:

1. **Given** a placeholder expecting a numeric expression, **When** the palette opens, **Then** it shows numeric-compatible operators (`+`, `-`, `*`, `/`, `sum`) and numeric references, but not string-only or boolean-only operators.
2. **Given** a placeholder in a filter closure body (which must return boolean), **When** the palette opens, **Then** it prioritizes comparison operators (`=`, `<>`, `>`, `<`, `>=`, `<=`) and logical operators (`and`, `or`), and shows `exists` / `is absent`.
3. **Given** a reference to a collection-typed attribute, **When** the user clicks it, **Then** postfix collection operators (`filter`, `extract`, `sum`, `count`, `distinct`, `first`, `last`, `flatten`) are available.
4. **Given** a reference to a single-valued attribute, **When** the user clicks it, **Then** collection-only operators like `sum`, `filter`, `extract` are not shown.

---

### User Story 5 - Restructure Expressions via Drag and Drop (Priority: P3)

A user restructures an existing expression by dragging blocks to new positions. For example, they can swap the left and right operands of a binary operation, or move a sub-expression from one slot to another.

**Why this priority**: Drag-and-drop restructuring is a convenience feature that improves editing speed but is not required for basic expression construction (users can delete and rebuild).

**Independent Test**: Can be tested by dragging a sub-expression block from one slot to another and verifying the resulting expression is valid and the DSL text updates correctly.

**Acceptance Scenarios**:

1. **Given** a binary operation `a + b`, **When** the user drags `b` to the left slot and `a` to the right slot, **Then** the expression becomes `b + a` and the DSL preview updates.
2. **Given** a sub-expression block, **When** the user drags it onto a placeholder slot in a different part of the tree, **Then** the block moves to the new position and the original position becomes a placeholder.
3. **Given** a block being dragged over an invalid drop target (e.g., wrong type), **When** the user hovers, **Then** the drop target indicates it cannot accept the block (e.g., red highlight or "not allowed" cursor).

---

### User Story 6 - Copy, Paste, and Undo Expression Sub-Trees (Priority: P3)

A user copies a sub-expression to reuse it elsewhere in the same function or undoes recent changes to restore a previous expression state.

**Why this priority**: These are productivity features that improve the editing experience but are not essential for basic expression construction.

**Independent Test**: Can be tested by copying a sub-expression block, pasting it into another placeholder, and verifying both instances render correctly. Undo can be tested by making a change and reverting it.

**Acceptance Scenarios**:

1. **Given** a selected sub-expression block, **When** the user copies it, **Then** the block is stored in a local clipboard.
2. **Given** a copied block and an empty placeholder, **When** the user pastes, **Then** a copy of the block is inserted at the placeholder position.
3. **Given** the user has made several edits to an expression, **When** they press undo, **Then** the most recent edit is reverted and the expression returns to its previous state.
4. **Given** the user has undone an edit, **When** they press redo, **Then** the edit is re-applied.

---

### Edge Cases

- What happens when a function has no expressions yet (empty operations)? The builder should show a single placeholder slot inviting the user to start building.
- How does the builder handle expressions that use syntax not yet supported by the builder? Unsupported sub-expressions render as inline text blocks within the visual tree; surrounding supported nodes remain as visual blocks. The text block is visually distinct and editable in text mode.
- What happens when an expression references a type or function that doesn't exist (broken reference)? The reference block should show a warning indicator with the unresolved name displayed.
- How does the builder handle very deeply nested expressions (e.g., 10+ levels)? The UI should remain scrollable and usable; blocks should be collapsible at user discretion to manage visual complexity.
- What happens if the user deletes an input parameter that is referenced in an expression? The reference blocks should display a "broken reference" warning, and the generated DSL should include the original name so the user can identify what to fix.
- How does the builder handle `switch` expressions with many cases (e.g., 20+ enum values)? The switch block should be scrollable with an "add case" action, and should not force the user to define all cases upfront.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render Rune function expressions as nested visual blocks, with one block type per expression kind (binary, unary, feature call, conditional, switch, lambda, constructor, literal, reference).
- **FR-002**: System MUST provide placeholder slots that represent empty expression positions, visually distinct from filled blocks.
- **FR-003**: System MUST provide a categorized operator palette that appears when a user activates a placeholder slot, organized by category (arithmetic, comparison, logic, navigation, collection, control).
- **FR-004**: System MUST support inline editing of literal values (numbers, strings, booleans, dates) directly within their blocks.
- **FR-005**: System MUST provide a reference picker that shows all in-scope variables (function inputs, aliases, output) with type and cardinality information when a reference slot is activated.
- **FR-006**: System MUST serialize the visual expression tree to valid Rune DSL text that can be parsed by the Rune parser without errors.
- **FR-007**: System MUST parse Rune DSL text into visual blocks when switching from text mode to builder mode.
- **FR-008**: System MUST support toggling between builder mode and text mode for any expression, preserving the expression content across switches.
- **FR-009**: System MUST display the generated Rune DSL text as a live preview alongside the visual blocks.
- **FR-010**: System MUST render all function sections (inputs, output, shortcuts/aliases, conditions, operations, post-conditions) with labeled headers in the builder view. Inputs, output, and section structure are read-only in the builder; structural editing of the function is handled by the existing function form.
- **FR-011**: System MUST support all core expression types: binary operations (+, -, *, /, and, or, =, <>, >, <, >=, <=, contains, disjoint, default, join), unary/postfix operations (exists, is absent, count, flatten, distinct, first, last, sum, reverse, only-element, type conversions), feature calls (-> and ->>), conditionals (if/then/else), switch expressions, lambda operations (filter, extract, sort, min, max, reduce), constructor expressions, and list literals.
- **FR-012**: System MUST support undo and redo of expression edits within the builder.
- **FR-013**: System MUST visually indicate broken references (e.g., references to deleted inputs or unresolved types) with a warning indicator.
- **FR-014**: System MUST allow users to collapse deeply nested sub-expression blocks to manage visual complexity.
- **FR-015**: System MUST integrate with the existing function editing form in the visual editor, using the existing expression editor slot mechanism.
- **FR-016**: System MUST allow users to remove any expression block, replacing it with an empty placeholder slot while preserving the surrounding tree structure.
- **FR-017**: System MUST render unsupported expression sub-trees as inline text blocks within the visual tree, allowing surrounding supported nodes to remain as visual blocks. The inline text block MUST be visually distinct from visual blocks.
- **FR-018**: System MUST support keyboard navigation: Tab/arrow keys to move between blocks and slots, Enter to open the operator palette, Escape to cancel the current action, and Delete to replace the selected block with a placeholder.

### Key Entities

- **ExpressionNode**: A discriminated union representing any node in the expression tree. Each variant corresponds to a grammar-level expression kind (literal, reference, binary operation, unary operation, feature call, conditional, switch, lambda, constructor, list, placeholder). Contains child nodes and metadata needed for rendering and serialization.
- **FunctionScope**: The set of names and types available within a function body — includes input parameters, shortcuts (aliases), the output attribute, and callable functions. Used to populate reference pickers and validate references.
- **OperatorCategory**: A grouping of operators by domain (arithmetic, comparison, logic, navigation, collection, control) used to organize the palette and filter available operations by context.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Domain experts with no prior Rune DSL knowledge can correctly read and interpret the purpose of a function expression presented in builder mode within 30 seconds, for expressions of moderate complexity (up to 5 operators).
- **SC-002**: Users can construct a complete, valid expression (e.g., `a + b * c`) from an empty placeholder using only click interactions in under 60 seconds.
- **SC-003**: 100% of expressions that can be authored in the builder serialize to syntactically valid Rune DSL text that parses without errors.
- **SC-004**: Round-trip fidelity: any expression authored in builder mode, switched to text mode, and switched back to builder mode, produces an identical visual block tree.
- **SC-005**: The builder supports all operator types used in the Rune function grammar (binary, unary, feature call, conditional, switch, lambda, constructor, list literal) — covering at least 95% of expressions found in real-world Rune function definitions.
- **SC-006**: Users report the builder as "easy to use" or "very easy to use" in usability testing, with a task completion rate of 85% or higher for first-time users constructing a 3-operator expression.

## Clarifications

### Session 2026-03-04

- Q: Does the builder edit only expression bodies, or also function structure (inputs, outputs, adding operations)? → A: Expression bodies only. Function structure editing (add/remove inputs, output, operations, conditions, shortcuts) remains the responsibility of the existing function form. The builder is scoped to editing the expression content within existing slots.
- Q: How does a user remove an existing expression block? → A: Replace with placeholder. Removing a block replaces it with an empty placeholder slot, preserving the surrounding tree structure. This keeps the expression tree structurally valid at all times.
- Q: When an expression contains a mix of supported and unsupported nodes, what is the fallback granularity? → A: Sub-tree fallback. Only the unsupported sub-expression renders as an inline text block; surrounding supported nodes remain as visual blocks.
- Q: What level of keyboard support should the builder provide? → A: Keyboard-navigable. Tab/arrow keys move between blocks and slots; Enter opens the palette; Escape cancels; Delete replaces a block with a placeholder.

## Assumptions

- The expression builder is Rune-specific, not a generic Langium expression builder. The operator set, type system, and scope resolution are all Rune concepts.
- The builder uses text as the source of truth: expressions serialize to Rune DSL text which the parser validates, rather than constructing Langium AST nodes directly from the UI.
- The builder integrates into the existing visual editor package and plugs into the function form via the existing expression editor slot mechanism.
- The builder targets browser-only execution, consistent with the project's architecture (no backend required).
- The operator palette categories and visual styling follow the design language established in the existing visual editor (dark theme, monospace code fonts, color-coded by category).
- Placeholder nodes represent incomplete expression positions — the builder does not require expressions to be complete at all times, supporting incremental construction.
- Lambda/closure expressions use implicit parameter binding (e.g., `item` in `filter [item -> notional > 100]`) consistent with Rune DSL conventions.
- Performance target: expressions with up to 50 nodes should render and respond to edits without perceptible delay (standard web application expectations).
