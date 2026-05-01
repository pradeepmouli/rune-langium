# Feature Specification: Complete Codegen for Missing Rune Types and Wire Form Previews

**Feature Branch**: `017-codegen-complete-types`
**Created**: 2026-05-01
**Status**: Draft
**Input**: User description: "complete codegen for missing types (typescript and zod where applicable) form previews for all generated zod types - additionally wire typescript calculations form into form preview (for functions)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate code for type aliases (Priority: P1)

A language designer has defined `typeAlias` constructs in their Rune model (e.g., `typeAlias Price: number`). Today the codegen silently drops these. The designer expects the TypeScript target to emit a type alias declaration (e.g., `export type Price = number`) and the Zod target to emit a corresponding schema (e.g., `export const PriceSchema = z.number()`). If the type alias carries conditions, those conditions appear as refinements in the Zod output and validation guards in the TypeScript output, consistent with how conditions already work on data types.

**Why this priority**: Type aliases are the most commonly authored construct that currently has zero codegen output. They affect downstream type resolution in both code and form previews.

**Independent Test**: Run the codegen CLI or studio code preview against a `.rune` file containing a `typeAlias` declaration and verify the emitted TypeScript and Zod output includes the alias.

**Acceptance Scenarios**:

1. **Given** a Rune model with `typeAlias Price: number`, **When** the TypeScript target generates code, **Then** the output contains `export type Price = number;`.
2. **Given** a Rune model with `typeAlias Price: number` and a condition, **When** the Zod target generates code, **Then** the output contains a schema with `.refine()` for the condition.
3. **Given** a Rune model with a `typeAlias` referencing a data type, **When** the TypeScript target generates code, **Then** the alias references the generated interface.
4. **Given** a Rune model with a `typeAlias` that has type parameters, **When** codegen runs, **Then** the parameters are represented in the emitted type (TypeScript generics or equivalent).

---

### User Story 2 - Generate code for rules (Priority: P1)

A language designer has defined business validation rules in their Rune model using the `rule` construct. Today codegen ignores rules entirely. The designer expects the TypeScript target to emit executable validation functions, and the Zod target to emit schema refinements or standalone validators, so that downstream consumers can programmatically enforce business logic.

**Why this priority**: Rules are central to the Rune language's purpose as a domain model standard. Without rule codegen, users must hand-write validation logic.

**Independent Test**: Run codegen against a `.rune` file containing a `rule` declaration and verify the TypeScript output includes an executable validation function.

**Acceptance Scenarios**:

1. **Given** a Rune model with a `rule` that validates a data type's attributes, **When** the TypeScript target generates code, **Then** the output contains a function that implements the rule's expression logic.
2. **Given** a Rune model with a `rule`, **When** the Zod target generates code, **Then** the rule is represented as a refinement on the associated type's schema, or as a standalone validation function.
3. **Given** a Rune model with multiple rules referencing the same type, **When** codegen runs, **Then** all rules are emitted and can be applied independently or composed.

---

### User Story 3 - Form preview for all Zod-emitting types (Priority: P1)

Today the form preview panel in Studio only generates interactive forms for `Data` types. The designer expects that any construct emitting a Zod schema, including type aliases, choices (with proper one-of semantics), and rule validators, also appears in the form preview. This lets them interactively test inputs against the generated validation logic without leaving Studio.

**Why this priority**: Form preview is a key Studio differentiator. Expanding coverage to all Zod-emitting types closes a visible gap and validates the newly generated schemas.

**Independent Test**: Open a workspace with type aliases and rules in Studio, switch to the form preview panel, and verify that all Zod-emitting types appear as interactive forms with validation feedback.

**Acceptance Scenarios**:

1. **Given** a Rune model with a `typeAlias` that maps to a Zod schema, **When** the user opens form preview, **Then** the type alias appears as a form with the appropriate field type and validation.
2. **Given** a Rune model with a `choice` type, **When** the user opens form preview, **Then** the form enforces the one-of constraint (exactly one option selectable).
3. **Given** a Rune model with a rule that has a Zod representation, **When** the user opens form preview, **Then** the rule's validation appears as a refinement on the relevant form, with clear error messaging when violated.
4. **Given** a form preview for any Zod-emitting type, **When** the user fills in values and submits, **Then** validation errors from conditions and refinements display inline.

---

### User Story 4 - Function calculation form in form preview (Priority: P2)

A language designer has defined `func` constructs with typed inputs and outputs. The designer expects to see a "calculations" form in the form preview panel: an interactive form for the function's input parameters, with a "Run" action that executes the generated TypeScript function logic and displays the computed output. This lets designers test function behavior directly in Studio without leaving the editor.

**Why this priority**: Functions are fully codegen'd for TypeScript but have no Studio interactivity today. Wiring them into form preview completes the feedback loop.

**Independent Test**: Open a workspace with a `func` declaration, switch to the form preview panel, fill in the function inputs, trigger execution, and verify the output matches the expected calculation.

**Acceptance Scenarios**:

1. **Given** a Rune model with a `func` declaration, **When** the user opens form preview, **Then** the function appears with input fields matching its declared `inputs`.
2. **Given** a function form with filled inputs, **When** the user triggers "Run", **Then** the generated TypeScript function executes and the computed output is displayed.
3. **Given** a function with pre-conditions, **When** the user provides input that violates a pre-condition, **Then** the form displays the pre-condition failure message before execution.
4. **Given** a function with post-conditions, **When** the computed output violates a post-condition, **Then** the form displays the post-condition failure alongside the output.

---

### User Story 5 - Generate code for reporting definitions (Priority: P2)

A language designer has defined `report` constructs in their Rune model. The designer expects the TypeScript target to emit type-safe reporting structures (column definitions, field mappings) so that downstream consumers can build reports from model data without consulting the raw Rune source.

**Why this priority**: Reporting is a significant value-add for regulatory domain models, but is less universally used than rules and type aliases.

**Independent Test**: Run codegen against a `.rune` file containing a `report` declaration and verify the TypeScript output includes typed reporting structures.

**Acceptance Scenarios**:

1. **Given** a Rune model with a `report` definition, **When** the TypeScript target generates code, **Then** the output contains typed column/field definitions.
2. **Given** a report referencing data types and rules, **When** codegen runs, **Then** the generated report types reference the generated data interfaces and rule functions.

---

### User Story 6 - Generate declarations for library functions (Priority: P3)

A language designer has declared `library function` constructs (external function signatures). The designer expects the TypeScript target to emit type-safe function signatures (without bodies) so that downstream consumers can implement the library and have their implementations type-checked against the declared contract.

**Why this priority**: Library functions are less commonly authored than regular functions, but their signatures provide an important integration contract.

**Independent Test**: Run codegen against a `.rune` file containing a `library function` declaration and verify the TypeScript output includes a typed function signature.

**Acceptance Scenarios**:

1. **Given** a Rune model with a `library function` declaration, **When** the TypeScript target generates code, **Then** the output contains an exported function type signature.
2. **Given** a library function with parameters and a return type, **When** codegen runs, **Then** the parameter types and return type are correctly mapped.

---

### Edge Cases

- What happens when a type alias references another type alias (chained aliases)? The system must resolve the chain to the underlying type.
- How does form preview handle recursive type aliases (e.g., `typeAlias Tree: Tree`)? The system should detect the cycle and display an "unsupported" marker, consistent with existing recursive data type handling.
- What happens when a rule references a type that failed codegen? The rule should emit with a diagnostic comment rather than silently failing.
- What happens when a function's input type is a type alias rather than a data type? The form preview should resolve the alias and render the appropriate field type.
- How does the form preview handle a function with no inputs (zero-parameter function)? The form should show an empty state with only a "Run" button.
- What happens when multiple rules target the same data type — do their form preview refinements compose? Yes, they should compose as independent validations.
- What happens when a type alias has unresolvable type parameters? The system should emit a diagnostic and produce an `unknown` / `z.unknown()` fallback.

## Requirements *(mandatory)*

### Functional Requirements

**Codegen — Type Aliases**
- **FR-001**: Codegen MUST emit TypeScript type alias declarations for every `typeAlias` in the model.
- **FR-002**: Codegen MUST emit Zod schemas for every `typeAlias` that resolves to a schema-representable type (primitives, enums, data types).
- **FR-003**: Codegen MUST emit conditions on type aliases as `.refine()` / `.superRefine()` in Zod output and validation guards in TypeScript output, consistent with existing condition handling on data types.
- **FR-004**: Codegen MUST handle chained type aliases (alias referencing another alias) by resolving the chain to the underlying type.

**Codegen — Rules**
- **FR-005**: Codegen MUST emit TypeScript validation functions for every `rule` declaration.
- **FR-006**: Codegen MUST emit Zod refinements or standalone validation schemas for rules in the Zod target.
- **FR-007**: Codegen MUST associate emitted rules with their target data type via naming convention or explicit import.

**Codegen — Reports**
- **FR-008**: Codegen MUST emit typed reporting structures (column definitions, field mappings) for every `report` declaration in the TypeScript target.
- **FR-009**: Codegen SHOULD emit JSON Schema representations for report structures where applicable.

**Codegen — Library Functions**
- **FR-010**: Codegen MUST emit type-safe function signatures (without bodies) for `library function` declarations in the TypeScript target.

**Form Preview — Expanded Coverage**
- **FR-011**: The preview schema generator MUST produce `FormPreviewSchema` entries for type aliases that resolve to form-representable types.
- **FR-012**: The preview schema generator MUST produce `FormPreviewSchema` entries for `choice` types with proper one-of constraint representation.
- **FR-013**: The form preview panel MUST display validation errors from conditions and refinements inline on the relevant fields.

**Form Preview — Function Calculations**
- **FR-014**: The preview schema generator MUST produce a `FormPreviewSchema` for function inputs, with fields matching the function's declared `inputs` parameters.
- **FR-015**: The form preview panel MUST allow users to trigger execution of the generated TypeScript function with the entered input values.
- **FR-016**: The form preview panel MUST display the computed output after function execution.
- **FR-017**: The form preview panel MUST display pre-condition and post-condition violations with clear messaging.

**General**
- **FR-018**: All newly emitted constructs MUST follow deterministic output ordering, consistent with existing codegen (topological sort, alphabetical within kind).
- **FR-019**: All newly emitted constructs MUST have byte-identical fixture tests, consistent with the existing testing strategy.
- **FR-020**: Constructs that have no meaningful representation in a target (e.g., reports in Zod) MUST be silently skipped, consistent with FR-031 precedent for functions.

### Key Entities

- **TypeAlias**: A named alias for another type, optionally with type parameters and conditions. Maps to the `typeAlias` grammar rule.
- **Rule**: A named business validation rule targeting a data type, containing an expression. Maps to the `rule` grammar rule.
- **Report**: A named reporting definition with column/field structure. Maps to the `report` grammar rule.
- **LibraryFunction**: An external function signature declaration without a body. Maps to the `library function` grammar rule.
- **FunctionPreview**: A form-based representation of a function's inputs, with execution capability and output display.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of `typeAlias` declarations in a model produce codegen output for both TypeScript and Zod targets.
- **SC-002**: 100% of `rule` declarations produce codegen output for the TypeScript target.
- **SC-003**: All Zod-emitting types (data, choice, type alias, rules) appear in the Studio form preview panel.
- **SC-004**: Function declarations appear in the form preview with input forms, and executing a function with valid inputs produces correct output in under 2 seconds.
- **SC-005**: All new codegen output is covered by byte-identical fixture tests, maintaining the existing >=99% parity standard.
- **SC-006**: No regressions in existing codegen output; all pre-existing fixture tests continue to pass.

## Assumptions

- The existing expression transpiler (`transpiler.ts`) is sufficient for rule expression evaluation; no new expression forms are required.
- Type alias type parameters will follow the same representation pattern as data type generics in the TypeScript target. If the Zod target cannot represent generics natively, type-parameterized aliases will be emitted as concrete types with parameters inlined where possible.
- Function execution in form preview will run the generated TypeScript code in a sandboxed worker, consistent with the existing codegen worker architecture, not on the main thread.
- Report codegen scope is limited to structural/type definitions; actual report rendering (tables, charts) is out of scope.
- Constructs not listed (corpus, segment, meta type, synonym source, qualifiable configuration, scope, annotations) remain out of codegen scope for this feature.
- The existing `preview-schema.ts` generator will be extended (not replaced) to handle the new construct types.
