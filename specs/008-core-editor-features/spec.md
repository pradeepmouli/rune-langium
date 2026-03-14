# Feature Specification: Core Editor Features

**Feature Branch**: `008-core-editor-features`
**Created**: 2026-03-12
**Status**: Draft
**Input**: User description: "1. Add support for loading model from git repo (e.g. CDM, FpML) 2. Complete migration to langium-zod and zod-to-form (cli) 3. Add support for conditions in editor 4. Finish expression builder implementation (for both function bodies and conditions for all supported types) 5. Incorporate export via Rune-DSL code generators (rosetta-code-generators)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Load Model from Git Repository (Priority: P1)

A domain modeler opens the editor and wants to work with a standard industry model (e.g., CDM or FpML) without manually downloading files. They provide a git repository URL (or select from a known list of models), and the system clones/fetches the model files, parses them, and makes the full type system available as a read-only reference for editing and cross-referencing.

**Why this priority**: Without a loaded model, the editor has no type context. CDM and FpML are the primary use cases — loading them is a prerequisite for all other editing features to be useful beyond trivial examples.

**Independent Test**: Can be fully tested by providing a git URL (or selecting a known model), waiting for the load to complete, and verifying that all types from the model are browsable and referenceable in the editor.

**Acceptance Scenarios**:

1. **Given** the editor is open with no model loaded, **When** the user provides a public git repository URL for CDM, **Then** the system clones the repository, discovers all `.rosetta` files, parses them, and displays the model's namespace tree with zero errors.
2. **Given** the user wants to load a well-known model, **When** they select "CDM" or "FpML" from a curated list, **Then** the system loads the corresponding model from its canonical git repository using a default version/tag.
3. **Given** a model is already loaded, **When** the user requests a different version/tag of the same model, **Then** the system fetches the specified version and replaces the loaded model.
4. **Given** the user provides an invalid or inaccessible git URL, **When** the load is attempted, **Then** the system displays a clear error message explaining the failure (e.g., network error, invalid URL, no `.rosetta` files found).
5. **Given** a large model (1000+ files) is being loaded, **When** the clone/parse is in progress, **Then** the user sees a progress indicator and can cancel the operation.
6. **Given** the user has previously loaded a model, **When** they reopen the editor, **Then** the cached model is used immediately; the system checks for updates and fetches only if the version/tag has changed.

---

### User Story 2 - Complete zod-to-form Migration for All Editor Forms (Priority: P1)

A developer maintaining the editor wants all form surfaces (Enum, Data Type, Function, Choice, etc.) to be generated from Zod schemas rather than hand-coded. This ensures forms stay in sync with grammar changes and reduces maintenance burden. The CLI tooling for generating and scaffolding forms should be complete and documented.

**Why this priority**: The zod-to-form pipeline is foundational infrastructure. Until it's complete, every grammar change requires manual form updates, which is error-prone and blocks velocity on all other editor features (including conditions and expression builder integration).

**Independent Test**: Can be tested by running the CLI generation commands and verifying that all form surfaces render correctly with proper validation, matching the behavior of the existing hand-coded forms.

**Acceptance Scenarios**:

1. **Given** the langium-zod schemas are generated from the grammar, **When** the developer runs the zod-to-form CLI scaffolding command, **Then** form components are generated for all configured form surfaces (Enum, Data, Choice, Function, TypeAlias).
2. **Given** a grammar change adds a new field to a Data type, **When** the developer regenerates schemas and form scaffolds, **Then** the new field automatically appears in the generated Data form with appropriate input controls.
3. **Given** the generated forms include cross-reference fields (e.g., type selectors), **When** the user interacts with these fields, **Then** they show valid options from the loaded model's type system.
4. **Given** the CLI is configured with component mappings (TypeSelector, CardinalitySelector, etc.), **When** forms are scaffolded, **Then** custom components are used for mapped field types instead of generic inputs.

---

### User Story 3 - Add Conditions to Function Editor (Priority: P2)

A domain modeler editing a function wants to add pre-conditions and post-conditions that constrain the function's behavior. They need a UI section within the function editor where they can add, edit, name, describe, and remove conditions, each with an expression body.

**Why this priority**: Conditions are a core part of the Rune DSL function model. Without them, functions can only define operations but cannot express business rules and constraints. This is needed before the editor can represent real-world CDM functions.

**Independent Test**: Can be tested by opening a function in the editor, adding a condition with a name and expression, saving, and verifying the generated DSL text includes the condition block.

**Acceptance Scenarios**:

1. **Given** a function is open in the editor, **When** the user clicks "Add Condition", **Then** a new condition section appears with fields for optional name, optional description, and a required expression body.
2. **Given** a function has conditions, **When** the user views the function, **Then** conditions and post-conditions are displayed in separate, clearly labeled sections.
3. **Given** a condition has an expression body, **When** the user edits the expression, **Then** the expression builder opens with the function's scope (inputs, outputs, aliases) available for reference.
4. **Given** a function has multiple conditions, **When** the user reorders or removes a condition, **Then** the remaining conditions update correctly and the generated DSL reflects the change.
5. **Given** a `.rosetta` file with existing conditions is loaded, **When** the function is opened in the editor, **Then** all conditions are displayed with their names, descriptions, and expression bodies intact.

---

### User Story 4 - Complete Expression Builder for All Supported Types (Priority: P2)

A domain modeler building function bodies or condition expressions needs the expression builder to support all expression types defined in the Rune DSL grammar. Currently, some expression types render as "Unsupported" blocks. The builder should handle the full expression grammar including conditional expressions, switch/case, lambda operations, constructor expressions, and all operator types.

**Why this priority**: The expression builder already has a solid foundation with 40+ operators and visual block editing. Completing coverage for all expression types removes the "Unsupported" fallback and makes the builder production-ready for real CDM/FpML function authoring.

**Independent Test**: Can be tested by loading CDM functions that use each expression type and verifying they render as interactive blocks (not "Unsupported"), can be edited, and round-trip correctly to DSL text.

**Acceptance Scenarios**:

1. **Given** a function with a conditional expression (`if/then/else`), **When** it is opened in the expression builder, **Then** the conditional renders as an interactive block with editable condition, then-branch, and else-branch slots.
2. **Given** a function using a lambda operation (e.g., `filter`, `extract`, `reduce`), **When** it is opened in the expression builder, **Then** the lambda renders with its parameter binding and body expression as editable blocks.
3. **Given** a function using a constructor expression, **When** it is opened in the expression builder, **Then** the constructor renders with its type reference and field assignments as editable blocks.
4. **Given** any expression from the CDM corpus, **When** it is parsed and displayed in the expression builder, **Then** zero expressions render as "Unsupported" blocks.
5. **Given** the user builds an expression from scratch using the operator palette, **When** they select any supported operator, **Then** the correct block structure is inserted with appropriate placeholder slots.
6. **Given** an expression is edited in builder mode, **When** the user switches to text mode, **Then** the DSL text accurately reflects the visual structure, and switching back preserves the expression.

---

### User Story 5 - Export via Rune-DSL Code Generators (Priority: P3)

A domain modeler has authored or customized Rune DSL definitions in the editor and wants to export them as code in a target language (e.g., Java, Python, Scala, C#) using the Rosetta code generators (https://github.com/REGnosys/rosetta-code-generators). They select a target language, trigger code generation, and download or preview the generated output.

**Why this priority**: Code generation is the ultimate value delivery — it turns the DSL model into executable artifacts. However, it depends on having a working model (Story 1), complete forms (Story 2), and full expression support (Stories 3-4) first. This is a Phase 3 capability that builds on the foundation laid by the other stories.

**Independent Test**: Can be tested by loading a model with user-authored definitions, selecting a target language (e.g., Java), running the code generator, and verifying that the output compiles and matches the expected structure for the given DSL input.

**Acceptance Scenarios**:

1. **Given** a model is loaded with user-authored Rune DSL definitions, **When** the user selects "Export" and chooses a target language (e.g., Java), **Then** the system invokes the corresponding Rosetta code generator and produces output files.
2. **Given** the code generation completes successfully, **When** the user views the results, **Then** they can preview the generated code and download it as a file or archive.
3. **Given** the user selects a target language, **When** the available generators are displayed, **Then** all generators from the rosetta-code-generators project that are compatible with the loaded model are listed.
4. **Given** the DSL model has validation errors, **When** the user attempts to export, **Then** the system warns about errors and either blocks generation or clearly marks the output as potentially incomplete.
5. **Given** the code generation fails (e.g., unsupported construct for the target language), **When** the error occurs, **Then** the system displays a meaningful error message identifying which DSL construct caused the failure.

---

### Edge Cases

- What happens when the git repository has no `.rosetta` files? Display an error: "No Rune DSL model files found in repository."
- What happens when loading a model with parse errors? Load all files, display errors inline, and allow the user to work with the successfully parsed subset.
- What happens when a condition expression references a type not in the loaded model? Show a validation error on the reference but allow the condition to be saved.
- What happens when the expression builder encounters a deeply nested expression (10+ levels)? Render all levels with scrollable overflow; do not truncate or collapse.
- What happens when zod-to-form generates a form for a grammar rule that has no business-relevant fields (all internal/Langium fields)? Skip generation for that rule and log a warning.
- What happens when the user pastes DSL text with syntax errors into the expression builder's text mode? Show parse errors inline and keep the text editable; do not switch to builder mode until errors are resolved.
- What happens when the user attempts to load a model while offline? If a cached version exists, use it and inform the user they are working from cache. If no cache exists, display an error explaining that network access is required for the initial model download.
- What happens when multiple loaded models define the same namespace or type name? Display a warning identifying the conflict; the most recently loaded model's definition takes precedence.
- What happens when a code generator does not support a specific DSL construct? Display a warning listing unsupported constructs; generate code for the supported subset.
- What happens when the rosetta-code-generators service is unavailable? Display an error and suggest retrying; do not lose the user's work.

## Clarifications

### Session 2026-03-12

- Q: Are loaded models (from git) editable or read-only? → A: Read-only reference. Loaded model is immutable; users create new files that reference its types.
- Q: Should git model loading support private/authenticated repos? → A: Public repos only. No authentication required.
- Q: Should loaded models be cached between sessions? → A: Cache locally; check for updates on open (fetch only if version/tag changed).
- Q: Can developers customize generated form files, or are they fully regenerated? → A: Fully regenerated each time. Customization via zod-to-form's native extensibility (component mappings, config), not manual edits to generated files.
- Q: How should model loading behave when offline? → A: Use cached model if available; show error if no cache exists.
- Q: Can users load multiple reference models simultaneously? → A: Yes. Multiple reference models can be loaded simultaneously with a merged type system. User's own .rosetta files coexist alongside them.
- Q: What is included in a code generation export? → A: User-authored files only. Reference model(s) serve as compilation context but are not themselves exported.

## Requirements *(mandatory)*

### Functional Requirements

**Git Model Loading**

- **FR-001**: System MUST allow users to load a Rune DSL model from a public git repository URL (no authentication required).
- **FR-002**: System MUST provide a curated list of well-known models (CDM, FpML) with default versions/tags for quick loading.
- **FR-003**: System MUST discover and parse all `.rosetta` files from the cloned repository.
- **FR-004**: System MUST display loading progress and allow cancellation of in-progress model loads.
- **FR-005**: System MUST support specifying a git tag, branch, or commit ref when loading a model.
- **FR-006**: System MUST make the loaded model's full type system (data types, enums, choices, functions, type aliases) available for cross-referencing in the editor. Multiple reference models MAY be loaded simultaneously; their type systems MUST be merged into a single unified namespace for cross-referencing.
- **FR-006a**: Loaded model files MUST be read-only; users MUST NOT be able to modify them. Users create new files that reference the loaded model's types.
- **FR-006b**: System MUST cache loaded models locally for offline access and faster subsequent loads. On session open, the system MUST check whether the cached version matches the requested tag/ref and fetch updates only if changed.

**zod-to-form Migration**

- **FR-007**: System MUST generate Zod schemas from the Langium grammar that exclude internal/framework fields and include only business-relevant fields.
- **FR-008**: System MUST generate form components from Zod schemas for all primary editor surfaces: Enum, Data, Choice, Function, TypeAlias.
- **FR-009**: System MUST map domain-specific field types to custom form components (e.g., type references to TypeSelector, cardinality to CardinalitySelector).
- **FR-010**: System MUST provide CLI commands to regenerate schemas and re-scaffold forms after grammar changes. Generated form files MUST be fully regenerated (not manually edited); all customization MUST be expressed through zod-to-form configuration (component mappings, projection config).

**Conditions in Editor**

- **FR-011**: System MUST display a "Conditions" section in the function editor for adding and managing pre-conditions.
- **FR-012**: System MUST display a "Post-Conditions" section in the function editor for adding and managing post-conditions.
- **FR-013**: Each condition MUST support an optional name, optional description, and a required expression body.
- **FR-014**: Condition expressions MUST have access to the function's full scope (inputs, output, shortcuts, aliases) for reference resolution.
- **FR-015**: System MUST correctly round-trip conditions between the editor UI and DSL text (parse and serialize).

**Expression Builder Completion**

- **FR-016**: Expression builder MUST support all expression types defined in the Rune DSL grammar without falling back to "Unsupported" blocks.
- **FR-017**: Expression builder MUST support conditional expressions (`if/then/else`) as interactive blocks.
- **FR-018**: Expression builder MUST support switch/case expressions as interactive blocks with dynamic case management.
- **FR-019**: Expression builder MUST support all lambda operations (`filter`, `extract`, `sort`, `min`, `max`, `reduce`) with parameter binding and body editing.
- **FR-020**: Expression builder MUST support constructor expressions with type selection and field assignment.
- **FR-021**: Expression builder MUST round-trip all expression types: AST to visual blocks to DSL text and back without data loss.
- **FR-022**: Expression builder MUST work identically for both function body expressions and condition expressions.

**Code Generator Export**

- **FR-023**: System MUST allow users to export user-authored Rune DSL definitions to target languages using the Rosetta code generators (rosetta-code-generators). Reference model(s) MUST be provided as compilation context but MUST NOT be included in the generated output.
- **FR-024**: System MUST present available target languages/generators to the user for selection.
- **FR-025**: System MUST display generated code output for preview before download.
- **FR-026**: System MUST allow users to download generated code as files or an archive.
- **FR-027**: System MUST validate the DSL model before code generation and warn the user of any errors that may affect output quality.
- **FR-028**: System MUST display meaningful error messages when code generation fails, identifying the source of the failure.

### Key Entities

- **Model**: A collection of Rune DSL files from a git repository, representing an industry domain model (e.g., CDM, FpML). Contains namespaces, data types, enums, choices, functions, and type aliases. Loaded as a read-only reference.
- **Condition**: A named constraint on a function with an expression body. Can be a pre-condition (validated before execution) or post-condition (validated after execution).
- **ExpressionNode**: A visual building block in the expression builder representing one node of an expression tree. Types include binary operations, unary operations, feature calls, conditionals, switches, lambdas, constructors, literals, references, and lists.
- **FormSurface**: A generated form component corresponding to a grammar rule, produced by the zod-to-form pipeline. Maps Zod schema fields to UI input controls.
- **CodeGenerator**: A target-language code generator from the rosetta-code-generators project. Takes Rune DSL definitions as input and produces source code files in the target language (e.g., Java, Python, Scala, C#).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can load a CDM or FpML model from its git repository and begin editing within 60 seconds on a standard internet connection.
- **SC-002**: 100% of CDM corpus functions, when opened in the editor, display all conditions and expression bodies without "Unsupported" blocks.
- **SC-003**: All form surfaces (Enum, Data, Choice, Function, TypeAlias) are generated from Zod schemas; zero hand-coded form field definitions remain.
- **SC-004**: A grammar change followed by schema regeneration and form re-scaffolding produces updated forms without manual intervention in under 30 seconds.
- **SC-005**: Expression builder round-trips all CDM corpus expressions with zero data loss (parse to visual to serialize to re-parse produces identical AST).
- **SC-006**: Users can add, edit, and remove conditions on functions, with the generated DSL text matching the expected Rune DSL condition syntax.
- **SC-007**: Users can export a valid Rune DSL model to at least one target language and receive compilable/parseable output.

## Assumptions

- The editor runs in a browser environment. Git operations for model loading will need to use a browser-compatible git client (e.g., isomorphic-git) or a lightweight backend proxy, since native git CLI is not available in-browser.
- The existing `update-fixtures.sh` vendoring approach may serve as a reference but the user-facing feature requires dynamic, on-demand loading rather than pre-cached fixtures.
- The expression builder's existing block component architecture (BinaryBlock, ConditionalBlock, LambdaBlock, etc.) provides sufficient foundation — completion means filling gaps in AST-to-node conversion and handling edge cases, not a full rewrite.
- The zod-to-form CLI (`@zod-to-form/cli`) and `langium-zod` packages are stable enough for production use in their current versions.
- Performance targets assume models of CDM scale (~1000+ files, ~50,000+ lines of DSL).
- Only public git repositories are supported for model loading (no authentication).
- Model caching uses browser-local storage; cached models persist across sessions.
- The rosetta-code-generators project provides the code generation capability. Integration may require a service endpoint or local execution environment, to be determined during planning.
