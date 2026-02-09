# Feature Specification: rune-langium

**Repository**: `rune-langium`
**Created**: 2026-02-07
**Status**: Draft
**Input**: User description: "Create a Langium-based parser for the Rune DSL that produces typed TypeScript AST interfaces from the grammar, suitable for integration into any consuming project."

## Overview

`rune-langium` is a TypeScript package that provides a Langium-based parser for the Rune DSL (Rosetta). It translates the existing Xtext grammar (~95 rules, 3 EMF metamodels) into a Langium grammar that auto-generates fully typed TypeScript AST interfaces. The package is consumable by any project in the monorepo or externally — editors, CLI tools, code generators, or CI pipelines.

It exposes:
- A Langium grammar for `.rosetta` files
- Auto-generated TypeScript AST types (~95 interfaces)
- Parsing services (Node.js and browser/web worker)
- Cross-reference scoping and validation services
- Utility functions for computed properties (cardinality algebra, choice conditions, etc.)

## Clarifications

### Session 2026-02-07

**Q1**: Is this a library or an application?
**A**: A library package (`rune-langium`). No UI, no server, no CLI application. Consuming packages import the parser and types.

**Q2**: Does this replace the Xtext implementation?
**A**: For parsing and type generation, yes. The Xtext/Xtend pipeline continues to own Java code generation — that is out of scope for this package.

**Q3**: What are the expected consumers?
**A**: Any TypeScript/JavaScript project that needs to parse Rune DSL files: visual editors, CLI validators, code generators, CI linting tools, documentation generators. The package is consumer-agnostic.

**Q4**: Should the package include a CLI?
**A**: A minimal CLI for parsing and validating `.rosetta` files is included as a convenience. The primary API is programmatic.

**Q5**: What's the project structure?
**A**: A monorepo (`rune-langium`) scoped as `@rune-langium/*` with multiple packages (e.g. `@rune-langium/core`, `@rune-langium/cli`). Packages export types, parser services, and utility functions.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Typed Expression AST (Priority: P1)

As a **developer consuming the rune-langium package**, I want expressions parsed into a typed TypeScript AST so that I can build tools (editors, validators, visualizers) that understand the structure of Rune expressions instead of treating them as opaque strings.

**Why this priority**: Expressions are the most complex and highest-value part of the grammar. The existing Xtext implementation produces an EMF AST inaccessible to TypeScript consumers. This is the core differentiator.

**Independent Test**: Import `rune-langium`, parse a `.rosetta` string containing functions with expressions. Verify each expression node has a discriminated union `$type` and all child nodes are recursively typed.

**Acceptance Scenarios**:

1. **Given** a Rune function with `if condition then expr1 else expr2`, **When** parsed by `rune-langium`, **Then** the result is a `RosettaConditionalExpression` node with typed `if`, `ifthen`, and `elsethen` children
2. **Given** a Rune expression `a -> b -> c exists`, **When** parsed, **Then** the result is a nested `RosettaExistsExpression` containing `RosettaFeatureCall` nodes with `Reference<RosettaFeature>` cross-references
3. **Given** a Rune expression `items filter [item -> item > 0] then count`, **When** parsed, **Then** the result is a `ThenOperation` containing a `RosettaCountOperation` with a `FilterOperation` child containing a typed `InlineFunction`
4. **Given** an expression with a syntax error, **When** parsed, **Then** the parser returns a partial AST with error recovery and diagnostics

---

### User Story 2 - Typed Data Model AST (Priority: P1)

As a **developer consuming the rune-langium package**, I want `Data`, `Choice`, `Attribute`, `Enumeration`, and `Function` constructs parsed into typed AST nodes so that I can build type-aware tooling with proper cross-reference resolution.

**Why this priority**: The structural types are the foundation of the Rune DSL. Typed `Reference<T>` cross-references enable refactoring tools, dependency analysis, and type-safe code generation.

**Independent Test**: Parse CDM `.rosetta` files using `rune-langium`. Verify all Data types, enums, and functions produce typed AST nodes with resolved cross-references.

**Acceptance Scenarios**:

1. **Given** a `type Foo extends Bar` declaration, **When** parsed, **Then** the `Data` node has `superType: Reference<Data>` that resolves to the `Bar` node
2. **Given** an attribute `amount number (1..1)`, **When** parsed, **Then** the `Attribute` node has structured `card: RosettaCardinality` with `inf=1, sup=1` and `typeCall: TypeCall` resolving to `number`
3. **Given** a `choice` type with three options, **When** parsed, **Then** the `Choice` node has typed `ChoiceOption[]` children with derived cardinality
4. **Given** a function with inputs, output, conditions, and operations, **When** parsed, **Then** the `Function` node has all sub-structures as typed AST nodes

---

### User Story 3 - Programmatic API & Browser Support (Priority: P2)

As a **developer integrating rune-langium into a web application**, I want a clean programmatic API that works in both Node.js and browser environments so that I can parse Rune files without a Java runtime.

**Why this priority**: Eliminating the Java dependency is a key motivation. Browser support enables web-based editors and tools.

**Independent Test**: Import `rune-langium` in a browser-bundled test. Parse a `.rosetta` string. Verify the full typed AST is returned.

**Acceptance Scenarios**:

1. **Given** a Node.js script importing `@rune-langium/core`, **When** `parse(source)` is called with a `.rosetta` string, **Then** a typed AST is returned in <200ms
2. **Given** a multi-file model, **When** parsed with `parseWorkspace(files)`, **Then** cross-file references resolve correctly
3. **Given** a browser environment, **When** the package is imported, **Then** parsing works without Node.js-specific APIs
4. **Given** a web worker, **When** parsing is delegated to the worker, **Then** the main thread remains unblocked

---

### User Story 4 - Scoping & Validation (Priority: P2)

As a **developer building a Rune DSL linter or editor**, I want validation diagnostics comparable to the Xtext LSP so that my tool provides the same error reporting quality.

**Why this priority**: Validation parity is needed for consumers to replace the Xtext LSP. Can be delivered incrementally.

**Independent Test**: Run the `rune-langium` validator against the CDM corpus. Compare diagnostics with the Xtext LSP. Track parity percentage.

**Acceptance Scenarios**:

1. **Given** a type with a cyclic inheritance chain, **When** validated, **Then** a diagnostic is reported matching the Xtext validator
2. **Given** an expression with a type mismatch, **When** validated, **Then** a type error diagnostic is produced
3. **Given** valid CDM source files, **When** validated, **Then** zero false-positive diagnostics are reported
4. **Given** the 101 Xtext validation rules, **When** audited, **Then** at least 80% have `rune-langium` equivalents

---

### User Story 5 - Full Grammar Coverage (Priority: P3)

As a **developer needing complete DSL coverage**, I want the synonym system, annotation system, and reporting/regulatory constructs available as TypeScript types so that I can build tools for the full Rune DSL surface.

**Why this priority**: Lower priority for initial consumers but needed for full round-trip fidelity and regulatory tooling.

**Independent Test**: Parse CDM files that use synonyms, annotations, and reporting rules. Verify all constructs produce typed AST nodes and round-trip correctly.

**Acceptance Scenarios**:

1. **Given** an attribute with `[synonym FpML value "foo" path "bar"]`, **When** parsed, **Then** the `RosettaSynonym` node has typed `source`, `value`, and `path` fields
2. **Given** a `report` declaration with regulatory references, **When** parsed, **Then** the `RosettaReport` node has resolved `Reference<RosettaBody>` and `Reference<RosettaCorpus>`
3. **Given** a complete CDM namespace, **When** parsed and re-serialized, **Then** the output is semantically equivalent to the input

---

### Edge Cases

- **Empty expressions**: `condition Foo` with no expression body
- **Deeply nested expressions**: 10+ levels of `->` navigation
- **Ambiguous `<` token**: Documentation start vs comparison operator
- **Implicit variable binding**: `filter [item > 0]` vs `filter [x | x > 0]`
- **Custom cardinality ranges**: `(2..5)` beyond the standard four patterns
- **Multi-file cross-references**: Type in namespace A extending type in namespace B
- **Unicode identifiers**: Non-ASCII characters in names or string literals
- **Error recovery**: Partial parse of syntactically invalid files

---

## Requirements *(mandatory)*

### DSL Fidelity & Validation *(mandatory for rune models)*

- **LANG-RT-001**: The Langium grammar MUST parse all valid `.rosetta` files accepted by the Xtext parser without loss of information
- **LANG-RT-002**: The Langium AST MUST be serializable back to `.rosetta` syntax that is semantically equivalent to the input
- **LANG-RT-003**: Cross-references MUST resolve using `Reference<T>` with the same scoping rules as the Xtext `RosettaScopeProvider`
- **LANG-VAL-001**: The validator MUST report diagnostics for at least 80% of the 101 Xtext validation rules
- **LANG-VAL-002**: The validator MUST NOT produce false-positive diagnostics on valid CDM source files
- **LANG-PARSE-001**: The parser MUST use Chevrotain error recovery to produce partial ASTs for invalid input
- **LANG-PARSE-002**: The grammar MUST handle all 60+ syntactic predicates from the Xtext grammar, restructured for LL(k)

### TypeScript Type Generation

- **LANG-TS-001**: `langium-cli` MUST generate TypeScript interfaces for all ~95 grammar rules
- **LANG-TS-002**: Generated types MUST include discriminated union types with `$type` discriminator
- **LANG-TS-003**: Generated types MUST include type guard functions (`isData()`, `isFunction()`, etc.)
- **LANG-TS-004**: Expression nodes MUST be represented as a recursive typed tree, not opaque strings
- **LANG-TS-005**: Cross-references MUST use `Reference<T>` generic types

### API & Packaging

- **LANG-API-001**: The package MUST export a `parse(source: string): ParseResult` function
- **LANG-API-002**: The package MUST export a `parseWorkspace(files: Map<string, string>): WorkspaceResult` for multi-file models
- **LANG-API-003**: The package MUST export all generated AST types from a single entry point
- **LANG-API-004**: The package MUST export type guard functions for all AST node types
- **LANG-API-005**: The package MUST work in Node.js (>=18) and modern browsers (ES2020+)
- **LANG-API-006**: The package MUST have zero runtime dependencies beyond `langium` and `chevrotain`

### Observability & Quality Gates

- **LANG-OBS-001**: Parse errors MUST produce structured diagnostics with line/column, severity, and message
- **LANG-OBS-002**: A validation parity report MUST track which Xtext rules have equivalents
- **LANG-OBS-003**: A grammar conformance test suite MUST cover all top-level constructs and expression operators
- **LANG-OBS-004**: Performance benchmarks MUST be automated (parse time for CDM corpus, memory usage)

---

## Success Criteria *(mandatory)*

- **SC-001**: Langium grammar parses 100% of the CDM corpus without parse errors
- **SC-002**: Generated `ast.ts` contains ~95 TypeScript interfaces covering all grammar rules
- **SC-003**: Expression nodes are fully typed (zero opaque `string` representations)
- **SC-004**: `parse()` and `parseWorkspace()` APIs work in Node.js and browser
- **SC-005**: Parse latency <200ms for single files, <5s for full CDM corpus
- **SC-006**: Validation parity reaches 80% of Xtext rules
- **SC-007**: Package published to npm with complete type exports

---

## Upstream Dependencies

### Rune DSL (Source Grammar)

- **Repository**: [finos/rune-dsl](https://github.com/finos/rune-dsl) (Apache-2.0)
- **Formerly**: `REGnosys/rosetta-dsl`
- **What we need**: The Xtext grammar (`Rosetta.xtext`), Xcore metamodels (`Rosetta.xcore`, `RosettaSimple.xcore`, `RosettaExpression.xcore`), and built-in type definitions from `rune-lang/`
- **How we use it**: Reference-only for grammar porting. The `.xtext` and `.xcore` files define the language rules that the Langium grammar must replicate. Not a runtime dependency.
- **Key path**: `rune-lang/src/main/java/com/regnosys/rosetta/Rosetta.xtext`
- **Key path**: `rune-lang/model/*.xcore` (3 metamodel files)
- **Key path**: `rune-lang/src/main/java/com/regnosys/rosetta/validation/` (101 validation rules)
- **Key path**: `rune-lang/src/main/java/com/regnosys/rosetta/scoping/` (21 scoping cases)

### FINOS Common Domain Model (CDM) -- Test Corpus

- **Repository**: [finos/common-domain-model](https://github.com/finos/common-domain-model) (Community Specification License 1.0)
- **What we need**: The `.rosetta` model source files as the conformance test corpus
- **How we use it**: Parse the entire CDM corpus to verify grammar completeness (SC-001: 100% parse rate). Also used for validation parity testing, performance benchmarks, and round-trip serialization tests.
- **Key path**: `rosetta-source/` (all `.rosetta` model files)
- **Current version**: 7.0.0-dev.x (682+ releases)
- **Loading strategy**: Clone or shallow-fetch at test time. NOT bundled in the npm package. Configured via environment variable `CDM_CORPUS_PATH` or fetched by a test setup script.

### Loading Requirements

- **LANG-CORPUS-001**: The test suite MUST be able to load the full CDM corpus from `finos/common-domain-model` for conformance testing
- **LANG-CORPUS-002**: The test suite MUST be able to load the Rune DSL built-in types from `finos/rune-dsl` (required for cross-reference resolution of primitives like `string`, `number`, `date`, etc.)
- **LANG-CORPUS-003**: A test setup script MUST clone/fetch both repositories to a configurable local path
- **LANG-CORPUS-004**: CI MUST run conformance tests against a pinned CDM version tag for reproducibility
- **LANG-CORPUS-005**: The package itself MUST NOT depend on or bundle either repository at runtime

---

## Assumptions

1. Langium 4.2.0 is stable and suitable for production use
2. Chevrotain LL(k) parser can handle the Rune grammar with `maxLookahead: 3`
3. The Xtext Java pipeline remains available for Java code generation — out of scope
4. CDM `.rosetta` source files are available from [finos/common-domain-model](https://github.com/finos/common-domain-model) for conformance testing
5. The Rune DSL grammar at [finos/rune-dsl](https://github.com/finos/rune-dsl) is the authoritative source for porting
6. Both upstream repositories are open source and available for CI cloning

---

## Out of Scope

- Java code generation (remains in Xtext/Xtend)
- VS Code extension (separate project, would consume this package)
- Monaco editor integration (separate project, would consume this package)
- Editor UI, state management, or framework-specific bindings
- Migration of Xtend-based formatters
- LSP server implementation (Langium can generate one, but it's a separate deliverable)
- Any coupling to a specific editor, UI framework, or backend
