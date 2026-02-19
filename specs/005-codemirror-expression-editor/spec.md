# Feature Specification: Embedded Expression Editor for Rune Functions

**Feature Branch**: `005-codemirror-expression-editor`
**Created**: 2026-02-19
**Status**: Draft
**Depends On**: `004-editor-forms` (provides the structured form scaffolding that hosts expression editor instances)
**Input**: User description: "Embedded CodeMirror 6 expression editor component for Rune function editing within editor forms — with syntax highlighting, context-aware autocomplete, inline validation, and a snippet palette for discoverability"

## Overview

A reusable expression editor component that embeds within the editor forms (spec 004) to provide rich, syntax-aware editing of Rune expressions. Each expression slot in a function editor form — shortcuts/aliases, operation bodies, conditions, and post-conditions — receives a dedicated editor instance with syntax highlighting, context-aware autocomplete, and inline validation.

This component replaces the plain text input that would otherwise be used for expression editing in spec 004's function editor form (User Story 4, FR-013). It elevates the expression editing experience from raw text entry to a guided, IDE-like surface that helps users discover Rune's expression constructs, navigate type references, and catch errors before they propagate.

### Design Decision: Embedded Text Editor over Intermediary Language

An intermediary expression language (CEL, FEEL, JSONata) was evaluated and rejected because:

- ~52% of Rune's 62+ expression constructs are domain-specific (feature calls, cardinality modifiers, type conversions, choice operations) and would require heavy extension in any intermediary language
- A bidirectional transpiler (intermediary <-> Rune) introduces round-trip fidelity risk — any Rune construct that doesn't map cleanly creates a lossy zone
- Users would learn a syntax different from what appears in the source editor, creating cognitive split
- The existing Langium parser already provides the type system, scope graph, and validation infrastructure — an intermediary language would duplicate this work

Instead, the expression editor uses Rune's native syntax with rich editing support (autocomplete, highlighting, snippets) to make the syntax discoverable and approachable, rather than hiding it behind a translation layer.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Write an Expression with Autocomplete (Priority: P1)

As a **modeler editing a Rune function**, I want to type an expression in a dedicated editor field and receive contextual suggestions — available attributes, operations, and type names — so that I can build valid expressions without memorizing the full Rune syntax.

**Why this priority**: Autocomplete is the primary mechanism that makes Rune expressions approachable. Without it, users must know every attribute name, operation keyword, and type reference by heart. This is the single highest-value capability.

**Independent Test**: Open a function editor form for a function with defined inputs. Click into the operation body expression field. Begin typing an input attribute name and verify autocomplete suggests matching attributes. Select one, type `->`, and verify autocomplete suggests the attribute's type's fields.

**Acceptance Scenarios**:

1. **Given** a function with input `trade Trade (1..1)` and `Trade` has attribute `tradeDate date (1..1)`, **When** the user focuses the operation body editor and types `tra`, **Then** autocomplete suggests `trade` as a completion
2. **Given** the user has typed `trade ->` in the expression editor, **When** the autocomplete triggers, **Then** it lists the attributes of the `Trade` type (e.g., `tradeDate`, `product`, `quantity`)
3. **Given** the user has typed `trade -> tradeDate`, **When** the user types a space, **Then** autocomplete suggests postfix operations valid for the `date` type (e.g., `to-string`, `exists`, `is absent`)
4. **Given** the user is typing in a condition expression field, **When** autocomplete triggers for a comparison operator position, **Then** it suggests comparison operators (`=`, `<>`, `>`, `<`, `>=`, `<=`) and cardinality modifiers (`all`, `any`)
5. **Given** the user types `to-`, **When** autocomplete triggers, **Then** it lists all type conversion operations (`to-string`, `to-number`, `to-int`, `to-date`, `to-date-time`, `to-zoned-date-time`, `to-time`, `to-enum`)

---

### User Story 2 - See Syntax Highlighting (Priority: P1)

As a **modeler reading or editing a Rune expression**, I want different parts of the expression — keywords, operators, literals, references, and errors — to be visually distinguished through color and weight so that I can quickly parse the expression structure.

**Why this priority**: Syntax highlighting is foundational for readability and is a prerequisite for users to understand what they're editing. It requires the expression grammar to be tokenized, which also enables autocomplete (User Story 1).

**Independent Test**: Enter the expression `trade -> quantity * price + fee` into an expression editor field. Verify that keywords, operators, attribute references, and structure are visually distinguished.

**Acceptance Scenarios**:

1. **Given** an expression `if quantity > 0 then quantity * price else 0`, **When** rendered in the editor, **Then** `if`, `then`, `else` are highlighted as keywords; `>`, `*` are highlighted as operators; `0` is highlighted as a numeric literal; `quantity`, `price` are highlighted as references
2. **Given** an expression containing `filter`, `extract`, `reduce`, `sort`, `exists`, `count`, `flatten`, `distinct`, **When** rendered, **Then** each is highlighted as a Rune operation keyword
3. **Given** an expression with a string literal `"hello"`, **When** rendered, **Then** the string is highlighted distinctly from references and keywords
4. **Given** an expression containing `True`, `False`, `empty`, **When** rendered, **Then** each is highlighted as a literal/constant value

---

### User Story 3 - See Inline Validation Errors (Priority: P1)

As a **modeler writing a Rune expression**, I want the expression editor to show me validation errors inline — underlined or marked with a gutter indicator — so that I can fix problems immediately without switching to the source editor or waiting for a separate error panel.

**Why this priority**: Inline validation prevents invalid expressions from being committed to the model. Combined with autocomplete, it forms the core "guided editing" experience. Without it, users won't know their expression is wrong until they see a parse failure elsewhere.

**Independent Test**: Enter an invalid expression (e.g., `trade -> nonExistentField`) into the expression editor. Verify an inline error marker appears indicating the field doesn't exist on the type.

**Acceptance Scenarios**:

1. **Given** a function with input `trade Trade (1..1)` and `Trade` has no attribute `foo`, **When** the user types `trade -> foo`, **Then** an inline error marker appears on `foo` with a message indicating the attribute doesn't exist on `Trade`
2. **Given** the user types an expression with a syntax error (e.g., `quantity + * price`), **When** the expression is parsed, **Then** an inline error marker appears at the error location with a descriptive parse error message
3. **Given** the user types a valid expression that was previously marked with errors, **When** the expression becomes valid, **Then** all error markers are removed
4. **Given** multiple errors exist in a single expression, **When** displayed, **Then** each error is marked independently at its correct position
5. **Given** an expression with a type mismatch (e.g., comparing a string to a number), **When** the expression is validated, **Then** an inline warning or error indicates the type incompatibility

---

### User Story 4 - Use Snippet Palette for Expression Patterns (Priority: P2)

As a **modeler who is unfamiliar with Rune's expression constructs**, I want a palette of common expression patterns — filter, extract, reduce, conditionals, type conversions — that I can insert into the editor with placeholders so that I can discover and use Rune operations without consulting documentation.

**Why this priority**: Discoverability is the main barrier to adoption. The snippet palette bridges the gap between "I know what I want to do" (filter a list, convert a type) and "I don't know Rune's syntax for it." It depends on the editor being functional (P1 stories) first.

**Independent Test**: Open an expression editor field. Trigger the snippet palette. Select "Filter a list" and verify a template expression is inserted with placeholders for the list reference and filter condition.

**Acceptance Scenarios**:

1. **Given** the user opens the snippet palette in an expression editor, **When** they browse the available snippets, **Then** they see categories including Collection Operations (filter, extract, reduce, sort, min, max), Existence Checks (exists, is absent, only exists), Type Conversions (to-string, to-number, to-date, etc.), Conditionals (if/then/else, switch), and Navigation (feature call, deep feature call)
2. **Given** the user selects the "Filter a list" snippet, **When** the snippet is inserted, **Then** the editor shows a template with placeholders for the list and condition, with the first placeholder selected and Tab advancing to the next
3. **Given** the user selects the "Reduce" snippet, **When** inserted, **Then** the editor shows a reduce template with tabstop navigation between accumulator, element, and body placeholders
4. **Given** the user selects the "If/Then/Else" snippet, **When** inserted, **Then** the editor shows `if ... then ... else ...` with tabstop placeholders
5. **Given** the user types a partial keyword like `filt` in the expression editor, **When** autocomplete triggers, **Then** the snippet for `filter` appears alongside regular completions, distinguished visually as a snippet

---

### User Story 5 - Auto-Growing Expression Fields (Priority: P2)

As a **modeler editing expressions of varying complexity**, I want expression editor fields to start compact (single line for simple expressions) and grow vertically as the expression gets longer so that short expressions don't waste space and long expressions remain fully visible.

**Why this priority**: The expression editor embeds within a form alongside other fields. Fixed-height editors either waste space (too tall for `a + b`) or truncate content (too short for multi-line filter/reduce chains). Auto-growth balances both needs.

**Independent Test**: Type a short expression `a + b` and verify the editor is single-line height. Then type a long expression spanning multiple lines and verify the editor grows to accommodate it.

**Acceptance Scenarios**:

1. **Given** an empty expression editor field, **When** it is displayed, **Then** it renders at a single-line height
2. **Given** a single-line expression like `quantity * price`, **When** displayed, **Then** the editor remains at single-line height
3. **Given** the user enters a multi-line expression (e.g., a long filter/extract chain), **When** the expression wraps or spans multiple lines, **Then** the editor height grows to show all content without internal scrollbars
4. **Given** an auto-grown editor, **When** the user deletes content reducing it back to a single line, **Then** the editor shrinks back to single-line height
5. **Given** an expression editor within the form, **When** the editor grows, **Then** the surrounding form layout adjusts to accommodate the taller editor without overlapping other fields

---

### User Story 6 - Debounced Model Synchronization (Priority: P1)

As a **modeler making changes in an expression editor**, I want my edits to automatically apply to the underlying model after a short idle pause so that I don't need to click a save button, and so that the visual graph and source editor stay in sync with my expression changes.

**Why this priority**: Seamless sync is essential for the expression editor to integrate into the debounced auto-save pattern established by spec 004. Without it, expression changes would be isolated from the rest of the editing experience.

**Independent Test**: Edit an expression in the function editor form. Wait for the debounce period. Verify the source editor shows the updated expression and the model reflects the change.

**Acceptance Scenarios**:

1. **Given** the user edits an expression in the operation body field, **When** the user stops typing for the debounce period, **Then** the underlying model updates with the new expression
2. **Given** the model has been updated from an expression edit, **When** the source editor is visible, **Then** the `.rosetta` source reflects the expression change
3. **Given** the user is actively typing, **When** keystrokes continue within the debounce window, **Then** the model does NOT update until typing pauses (no intermediate partial updates)
4. **Given** the user types an invalid expression, **When** the debounce period passes, **Then** the model is NOT updated with the invalid expression — the previous valid expression is preserved
5. **Given** a change is made in the source editor to a function's expression, **When** the source is re-parsed, **Then** the expression editor field updates to reflect the source change

---

### Edge Cases

- What happens when the expression editor field is focused but contains no text? The editor shows a placeholder hint (e.g., "Enter expression...") and autocomplete offers top-level constructs (attribute references, literals, keywords).
- What happens when an expression references a type that is renamed elsewhere while the expression editor is open? The expression updates to reflect the renamed type (consistent with spec 004's cascading rename behavior, FR-017).
- What happens when the user pastes a multi-line expression from the source editor into a single-line expression field? The editor accepts the paste and auto-grows to accommodate the content.
- What happens when the user types a very long expression (500+ characters) on a single line? The editor soft-wraps the expression rather than requiring horizontal scrolling.
- What happens when two expression editor instances on the same form both trigger debounced saves simultaneously? Each field's debounce is independent, and both changes merge into a single model update.
- What happens when the Langium parser is busy processing a previous change when a new expression edit arrives? The new edit queues and is processed after the current parse completes — no edits are silently dropped.
- What happens when the user triggers autocomplete in an empty expression field? The autocomplete lists all available starting constructs: function input attributes, shortcut aliases defined above this field, literal values, and keywords like `if`, `empty`, `True`, `False`.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a reusable expression editor component that can be embedded in any expression slot within the editor forms (operation bodies, conditions, post-conditions, shortcuts/aliases)
- **FR-002**: The expression editor MUST provide syntax highlighting for all Rune expression constructs — keywords, operators, literals (boolean, numeric, string, empty), references, and structural tokens (parentheses, brackets, braces, arrows)
- **FR-003**: The expression editor MUST provide context-aware autocomplete that suggests attributes in scope (function inputs, shortcuts defined above the current field, referenced type fields), postfix operations valid for the current expression's type, type names, and enum values
- **FR-004**: Autocomplete suggestions MUST be filtered and ranked based on the cursor position's syntactic context — e.g., after `->`, suggest attributes of the receiver type; after a list expression, suggest collection operations
- **FR-005**: The expression editor MUST display inline validation errors from the Langium parser as visual markers (underlines, gutter indicators, or tooltips) positioned at the error's location within the expression
- **FR-006**: The expression editor MUST support all 62+ Rune expression constructs as defined in the grammar (lines 288-452 of `rune-dsl.langium`), including: literals, symbol references, binary operators (+, -, *, /, =, <>, >, <, >=, <=, and, or, contains, disjoint, default, join), feature calls (-> and ->>), unary postfix operations (exists, is absent, count, flatten, distinct, reverse, first, last, sum, only-element, one-of), functional operations (filter, extract, reduce, sort, min, max with inline functions), type conversions (to-string, to-number, to-int, to-date, to-date-time, to-zoned-date-time, to-time, to-enum), conditionals (if/then/else), switch/cases, choice operations, constructor expressions, list literals, cardinality modifiers (all, any), as-key, with-meta, and then chaining
- **FR-007**: The expression editor MUST provide a snippet/template palette offering common expression patterns with tabstop placeholders, covering at minimum: filter, extract, reduce, sort, if/then/else, switch, feature call chain, existence checks, and type conversions
- **FR-008**: The expression editor MUST auto-grow vertically from a single-line default height to accommodate multi-line expressions, and shrink back when content is reduced
- **FR-009**: The expression editor MUST synchronize changes to the underlying model via the same debounced auto-save mechanism used by the editor forms (spec 004, FR-016), with no explicit save action required
- **FR-010**: The expression editor MUST NOT commit invalid expressions to the model — only syntactically and semantically valid expressions are applied; the previous valid expression is preserved until the error is resolved
- **FR-011**: The expression editor MUST update its displayed content when the underlying model changes from an external source (e.g., source editor edits, undo/redo)
- **FR-012**: The expression editor MUST be keyboard-accessible — supporting standard text editing shortcuts, Tab for snippet placeholder navigation, Escape to dismiss autocomplete, and a keyboard shortcut to manually trigger autocomplete
- **FR-013**: The expression editor MUST soft-wrap long expressions rather than requiring horizontal scrolling
- **FR-014**: Autocomplete MUST include function input attributes, shortcut aliases defined prior to the current expression slot in the function, and the implicit `item` variable when inside an inline function body (filter, extract, reduce, sort, min, max)
- **FR-015**: The expression editor MUST display a placeholder hint when empty and unfocused, guiding the user on what can be entered

### Constitution Alignment

- **CA-001**: The expression editor operates on fully typed AST expression nodes produced by the Langium parser. Expressions are never stored or transmitted as opaque strings — autocomplete and validation both depend on the typed AST and scope graph. (Principle I: DSL Fidelity & Typed AST)
- **CA-002**: Tests for the expression editor will use vendored `.rosetta` fixture files from the CDM corpus and rune-dsl sources. Autocomplete and validation behavior will be verified against deterministic fixture models. (Principle II: Deterministic Fixtures)
- **CA-003**: Validation errors shown in the expression editor are the same diagnostics produced by the Langium validator — no additional rules beyond parity scope. Error messages, severity levels, and positions match what the source editor would show. (Principle III: Validation Parity)
- **CA-004**: Expression parsing and validation run in a web worker (consistent with the existing architecture). Autocomplete suggestions must appear within 200ms of triggering. Syntax highlighting must not introduce perceptible lag during typing. (Principle IV: Performance & Workers)
- **CA-005**: The expression editor component exposes a stable public API for embedding within editor forms. It does not replace the existing source editor's expression handling — both paths consume the same Langium parser output. The component follows semantic versioning. (Principle V: Reversibility & Compatibility)

### Key Entities

- **Expression Editor Instance**: A single embedded editor component bound to one expression slot in a function editor form. Each function form may contain multiple instances (one per operation body, condition, post-condition, and shortcut).
- **Completion Source**: The provider of autocomplete suggestions. It inspects the cursor position's syntactic context and the Langium scope graph to produce ranked, filtered suggestions (attributes, operations, types, enum values, keywords).
- **Snippet Template**: A predefined expression pattern with named tabstop placeholders (e.g., list filter [condition]). Snippets are categorized by operation type and appear in both the palette and inline autocomplete.
- **Validation Marker**: A visual indicator (underline, gutter icon, tooltip) positioned at a specific range within an expression, representing a diagnostic from the Langium parser (error, warning, or info severity).
- **Expression Slot**: A location within a function definition where an expression is expected — operation body (set/add), condition body, post-condition body, or shortcut body (alias). Each slot has its own scope context affecting available completions.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can write a filter-and-count expression (`items filter [item -> amount > 0] count`) using autocomplete in under 20 seconds without consulting documentation
- **SC-002**: Autocomplete suggestions appear within 200ms of the trigger keystroke for models with up to 400+ types
- **SC-003**: 100% of validation errors visible in the source editor for expression-level issues are also shown inline in the expression editor component
- **SC-004**: Users can discover and insert a snippet for any of the 9 core expression patterns (filter, extract, reduce, sort, if/then/else, switch, feature call, exists check, type conversion) via the snippet palette in under 10 seconds
- **SC-005**: Expression editors auto-grow correctly for expressions from 1 to 20+ lines without layout overlap or internal scrollbars
- **SC-006**: 100% of edits made through the expression editor produce valid `.rosetta` source when synchronized to the model (no syntax errors introduced by the editor component)
- **SC-007**: Round-trip fidelity: editing an expression in the expression editor, then viewing it in the source editor, then re-opening it in the expression editor preserves the expression exactly (no formatting drift or content loss)

---

## Assumptions

- The Langium parser's scope resolution and type inference are sufficient to power context-aware autocomplete (attribute types, available fields, valid operations). No additional type inference engine is needed.
- The existing 500ms debounce interval used by the source editor and editor forms (spec 004) is appropriate for expression editor synchronization. The same debounce mechanism is reused.
- The expression grammar subset needed for syntax highlighting covers lines 288-452 of `rune-dsl.langium` (~35 grammar rules). This is a well-defined, stable portion of the grammar.
- Snippet templates are a curated, static set covering the most common expression patterns. Users cannot define custom snippets in this initial version.
- The expression editor component is designed for embedding within the editor forms (spec 004) but exposes a general-purpose API that could be reused in other contexts (e.g., inline editing in graph nodes) in future features.
- Undo/redo for expression edits is handled by the existing Zundo-backed store — expression changes that flow through the debounced model update are automatically covered by the undo stack.

---

## Out of Scope

- Visual/block-based expression building (drag-and-drop nodes, Blockly-style blocks) — the expression editor is text-based with IDE-like assistance
- Expression debugging or step-through evaluation
- Custom user-defined snippet templates
- Expression editor outside of the function editor form context (e.g., standalone expression playground)
- Support for editing non-expression function components (inputs, output, name) — these are handled by spec 004's form fields
- Translating expressions to/from an intermediary language (CEL, FEEL, JSONata)
