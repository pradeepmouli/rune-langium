# Research Notes -- rune-langium

## Decisions

### 1) Parser Technology: Langium over alternatives

- **Decision**: Use Langium 4.2.0 as the TypeScript-native parser framework
- **Rationale**: Langium is built by TypeFox (the Xtext creators) specifically as the TypeScript successor to Xtext. Grammar syntax is intentionally similar, reducing migration effort. Auto-generates typed AST interfaces from the grammar. Chevrotain-based parser with error recovery. First-class LSP support if needed later.
- **Alternatives considered**:
  - **tree-sitter**: Lower-level (C/WASM), no type generation, requires manual AST typing. Better for syntax highlighting than semantic analysis.
  - **ANTLR4-ts**: TypeScript ANTLR target exists but no type generation, no LSP framework, and would reproduce the same LL(*) approach without the benefits.
  - **Chevrotain directly**: Powerful but requires hand-writing the entire parser, AST types, and infrastructure that Langium provides for free.
  - **PEG.js / Ohm**: Simpler parsers unsuitable for the grammar's complexity (cross-references, scoping, 10-level precedence).
  - **Keep Xtext + write types manually**: Preserves Java dependency, creates two sources of truth (grammar + hand-written types), doesn't solve the fundamental problem.

### 2) Grammar Translation Strategy: Manual port, not automated

- **Decision**: Manually translate the Xtext grammar rule-by-rule to Langium syntax
- **Rationale**: The grammar has 60+ syntactic predicates (`=>` and `->`) that require case-by-case analysis for Chevrotain LL(k) compatibility. The "without left parameter" pattern (7 duplicated rules for implicit variable binding) needs redesign. The three Xcore metamodels contain Java operations that must become TypeScript utilities. Automated tools (`xtext2langium`) would need 50%+ manual rework.
- **Alternatives considered**:
  - **xtext2langium tool**: Handles basic grammar translation but chokes on predicates, Xcore operations, and complex cross-references.
  - **AI-assisted translation**: Useful for mechanical aspects but can't reason about LL(k) compatibility.

### 3) EMF Metamodel Replacement: Grammar-inferred AST

- **Decision**: Let Langium infer the AST from the grammar (no separate metamodel). Supplement with TypeScript utility functions for computed properties.
- **Rationale**: Langium's grammar IS the metamodel. It generates `ast.ts` with all node interfaces. The ~141 Xcore classes with Java operations translate to: (a) grammar rules for structural properties, (b) TypeScript utility functions for derived/computed properties (e.g., `RosettaCardinality.add()`, `Choice.getConditions()`).
- **Alternatives considered**:
  - **Hand-write separate TypeScript interfaces**: Two sources of truth; defeats purpose of Langium type generation.
  - **Use Langium's AST extension mechanism**: Viable for a small number of computed properties but not for 141 classes.

### 4) Scoping Strategy: Custom ScopeProvider in TypeScript

- **Decision**: Implement a custom `RuneScopeProvider` in TypeScript replicating the 21 EReference cases from Xtext
- **Rationale**: Scoping is the most semantically complex part. The 21-case dispatch in Java maps to Langium's `ScopeComputation` + `ScopeProvider` services. Each case can be ported individually and tested against CDM fixtures. Langium defaults handle ~5 of the 21 cases.

### 5) Validation Strategy: Incremental parity

- **Decision**: Port validation rules incrementally by category, targeting 80% parity
- **Rationale**: 101 rules is significant but they're independent. Priority order: (1) expression type checking (22 rules), (2) structural constraints — cycles, duplicates (15 rules), (3) naming conventions (12 rules), (4) reporting rules (5 rules). Remaining ~47 lower-priority rules deferred.

### 6) Expression Grammar: Restructure for LL(k)

- **Decision**: Restructure the expression grammar's predicate-heavy patterns for Chevrotain LL(k) with `maxLookahead: 3`
- **Rationale**: The Xtext grammar uses ANTLR LL(*) with 60+ predicates. Chevrotain is LL(k). The 10-level precedence chain translates directly. The "without left parameter" pattern needs redesign — likely using Langium actions to inject implicit variables post-parse. The `<` ambiguity needs explicit keyword gating.
- **Risk**: Highest-risk area. If `maxLookahead: 3` is insufficient, increase it or restructure further.

### 7) Package Architecture: Zero-dependency library

- **Decision**: Build as a library package with no framework dependencies. Export parser services, AST types, and utility functions. Consuming packages integrate however they choose.
- **Rationale**: Maximum reusability. An editor project imports the types and parser. A CLI tool imports the validator. A code generator imports the AST traversal utilities. No opinions about state management, UI frameworks, or deployment.
- **Alternatives considered**:
  - **Full LSP server**: Too opinionated for a library. LSP can be built on top.

### 8) Browser Execution: Pure JS, web worker compatible

- **Decision**: Ensure the package works in browsers. Provide a helper for web worker deployment but don't mandate it.
- **Rationale**: Langium + Chevrotain are pure JavaScript — no native modules or Node.js-only APIs. The package should import cleanly in browser bundlers (Vite, webpack, esbuild). A `createWorkerParser()` helper can be provided for projects that want off-main-thread parsing.
- **Alternatives considered**:
  - **Node.js only**: Limits potential consumers.
  - **WASM compilation**: Langium doesn't compile to WASM; unnecessary complexity.

### 9) Test Fixture Strategy: Bundled CDM samples + external corpus

- **Decision**: Bundle a curated set of CDM `.rosetta` samples in the package's test fixtures. Support loading the full CDM corpus from a configurable path for conformance testing.
- **Rationale**: The package needs to be self-contained for `npm test` to work. A small curated set covers grammar rules. Full CDM corpus conformance runs as an optional/CI-only test suite.
- **Upstream repositories**:
  - **Source grammar**: [finos/rune-dsl](https://github.com/finos/rune-dsl) (Apache-2.0) — `rune-lang/src/main/java/com/regnosys/rosetta/Rosetta.xtext` and `rune-lang/model/*.xcore`
  - **CDM test corpus**: [finos/common-domain-model](https://github.com/finos/common-domain-model) (Community Specification License 1.0) — all `.rosetta` files under `rosetta-source/`
- **Loading strategy**: A `scripts/setup-corpus.sh` script clones or shallow-fetches both repos at pinned version tags into `vendor/`. Tests use `CDM_CORPUS_PATH` and `RUNE_DSL_PATH` env vars (defaults: `./vendor/common-domain-model/rosetta-source` and `./vendor/rune-dsl`). Neither repository is bundled in the npm package at runtime.

## Clarifications Resolved

1. **Xtext coexistence**: `rune-langium` does not replace Xtext for Java codegen. They serve different purposes.
2. **Langium maturity**: Version 4.2.0 is stable, used in production. TypeFox actively maintains it.
3. **Grammar complexity**: The Rune grammar is at the high end of Langium's sweet spot. Complex but tractable.
4. **Package boundary**: The package exports types and services. It does NOT export UI components, store adapters, or editor bindings.
5. **Versioning**: The package version tracks grammar compatibility. Breaking grammar changes = major version bump.
