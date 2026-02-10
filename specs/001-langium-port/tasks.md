# Tasks: rune-langium

**Input**: Design documents from `specs/001-langium-port/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Constitution-driven expectations**: Vendored fixtures, typed AST generation, <200ms parse latency, 80% validation parity, browser compatibility, zero framework coupling

## Format: [ID] [P?] [US#?] Description

- `T###` -- Sequential task ID
- `[P]` -- Can run in parallel with other `[P]` tasks in the same phase
- `[US#]` -- Maps to User Story number
- `(path)` -- Primary file affected
- `(depends on T###)` -- Explicit dependency

All paths are relative to the `rune-langium/` monorepo root. Core package paths are under `packages/core/`.

## Constitution Check

- Principle I: Grammar and AST changes must preserve typed nodes and Xtext parity.
- Principle II: All conformance/parity/benchmark tests use vendored fixtures.
- Principle III: Validation stays parity-only, with parity reporting updated.
- Principle IV: Performance benchmarks and worker support remain required.
- General Gates: Grammar/scoping/validation changes include tests and parity/conformance updates.

---

## Phase 1: Setup (Shared Infrastructure)

**Goal**: Monorepo with build pipeline and type generation working.

### Repository Setup
- [X] T001 [P] Create `packages/core/package.json` with `langium`, `langium-cli`, `chevrotain`, `vitest`, `tsup` dependencies (packages/core/package.json)
- [X] T002 [P] Create `packages/core/tsconfig.json` with strict mode, ES2020 target, dual CJS/ESM (packages/core/tsconfig.json)
- [X] T003 [P] Create `packages/core/tsup.config.ts` for dual CJS/ESM build output with type declarations (packages/core/tsup.config.ts)
- [X] T004 Create `packages/core/langium-config.json` with rune-dsl language config, `.rosetta` file extension, Chevrotain recovery enabled, maxLookahead 4 (packages/core/langium-config.json) (depends on T001)
- [X] T005 Write full grammar: all ~95 rules ported from Xtext via xtext2langium + manual fixes for Chevrotain LL(k) (packages/core/src/grammar/rune-dsl.langium) (depends on T004)
- [X] T006 Run `langium-cli generate` and verify `ast.ts`, `grammar.ts`, `module.ts` are produced (packages/core/src/generated/) (depends on T005)
- [X] T007 Create custom module file with dependency injection setup (packages/core/src/services/rune-dsl-module.ts) (depends on T006)
- [X] T008 Create `parse()` API stub returning typed `ParseResult` (packages/core/src/api/parse.ts) (depends on T007)
- [X] T009 Create package entry point exporting types and API (packages/core/src/index.ts) (depends on T008)
- [X] T010 Set up Vitest config and write smoke tests: 5/5 passing (packages/core/test/grammar/smoke.test.ts) (depends on T008)
- [X] T011 Add `build`, `generate`, `test`, and `lint` scripts to packages/core/package.json (packages/core/package.json) (depends on T006)
- [X] T012 [P] Write `packages/core/README.md` with usage and API overview (packages/core/README.md)
- [X] T013 [P] Add curated CDM `.rosetta` sample fixtures (packages/core/test/fixtures/cdm) (depends on T001)

### Fixture Setup
- [X] T013a [P] Vendor rune-dsl snapshot (grammar + built-in types) under `packages/core/test/fixtures/rune-dsl` (packages/core/test/fixtures/rune-dsl)
- [X] T013b [P] Add `scripts/update-fixtures.sh` to refresh vendored snapshots manually (scripts/update-fixtures.sh)
- [X] T013c Configure `.gitignore` and package `files` field to exclude fixtures from npm publish (package.json, packages/core/package.json)
- [X] T013d Add fixture loader utility for tests (packages/core/test/helpers/fixture-loader.ts)

**Checkpoint**: `npm run generate` produces `ast.ts` with `RosettaModel` interface. `parse("")` returns empty model. Vendored fixtures present.

---

## Phase 2: User Story 1 -- Typed Expression AST (Priority: P1) -- MVP

**Goal**: Full expression subsystem ported. All CDM expressions parse into typed AST nodes.

**Independent Test**: Import `rune-langium`, parse a `.rosetta` string with expressions. Every expression node has `$type` and typed children.

> **CRITICAL**: This is the highest-risk phase. The expression grammar has 60+ predicates, 10 precedence levels, 30 postfix operators, and the "without left parameter" pattern. If Chevrotain LL(k) handles this, everything else follows.

### Tests for User Story 1
- [X] T014 [P] [US1] Write expression parsing tests: arithmetic (`a + b * c`) (packages/core/tests/grammar/expressions.test.ts)
- [X] T015 [P] [US1] Write expression parsing tests: logical (`a and b or c`) (packages/core/tests/grammar/expressions.test.ts)
- [X] T016 [P] [US1] Write expression parsing tests: comparison with cardinality modifiers (`a any = b`) (packages/core/tests/grammar/expressions.test.ts)
- [X] T017 [P] [US1] Write expression parsing tests: feature calls (`a -> b -> c`, `a ->> d`) (packages/core/tests/grammar/expressions.test.ts)
- [X] T018 [P] [US1] Write expression parsing tests: unary postfix (`x exists`, `x count`, `x flatten`, `x first`) (packages/core/tests/grammar/expressions.test.ts)
- [X] T019 [P] [US1] Write expression parsing tests: functional ops (`items filter [item -> item > 0]`, `extract`, `reduce`, `sort`) (packages/core/tests/grammar/expressions.test.ts)
- [X] T020 [P] [US1] Write expression parsing tests: control flow (`if cond then a else b`, `switch x case ...`) (packages/core/tests/grammar/expressions.test.ts)
- [X] T021 [P] [US1] Write expression parsing tests: literals (boolean, string, number, int, list, empty) (packages/core/tests/grammar/expressions.test.ts)
- [X] T022 [P] [US1] Write expression parsing tests: constructor expressions (`Foo { bar: baz }`) (packages/core/tests/grammar/expressions.test.ts)
- [X] T023 [P] [US1] Write expression parsing tests: implicit variable / "without left parameter" pattern (packages/core/tests/grammar/expressions.test.ts)
- [X] T024 [P] [US1] Write expression parsing tests: `then` chaining (`x filter [...] then count then + 1`) (packages/core/tests/grammar/expressions.test.ts)
- [X] T025 [P] [US1] Write expression parsing tests: type coercion operators (`to-string`, `to-number`, `to-enum`) (packages/core/tests/grammar/expressions.test.ts)
- [X] T026 [P] [US1] Write expression error recovery test: malformed expressions produce partial AST + diagnostics (packages/core/tests/grammar/expressions.test.ts)

### Implementation for User Story 1
- [X] T027 [US1] Port `PrimaryExpression` rule: literals, symbol references, implicit variable, super call, parenthesized expressions, list literals, empty keyword (packages/core/src/grammar/rune-dsl.langium) (depends on T005)
- [X] T028 [US1] Port `RosettaFeatureCall` and `RosettaDeepFeatureCall` rules (`->` and `->>` navigation) (packages/core/src/grammar/rune-dsl.langium) (depends on T027)
- [X] T029 [US1] Port `UnaryOperation` rule: all ~30 postfix operators in three groups (simple, optional-function, mandatory-function) (packages/core/src/grammar/rune-dsl.langium) (depends on T028)
- [X] T030 [US1] Port "without left parameter" pattern -- design Langium-native approach (parser actions or post-parse rewrite) (packages/core/src/grammar/rune-dsl.langium) (depends on T029)
- [X] T031 [US1] Port `MultiplicativeOperation` and `AdditiveOperation` rules (packages/core/src/grammar/rune-dsl.langium) (depends on T029)
- [X] T032 [US1] Port `BinaryOperation` rule: `contains`, `disjoint`, `default`, `join` (packages/core/src/grammar/rune-dsl.langium) (depends on T031)
- [X] T033 [US1] Port `ComparisonOperation` and `EqualityOperation` rules with `CardinalityModifier` (packages/core/src/grammar/rune-dsl.langium) (depends on T032)
- [X] T034 [US1] Port `AndOperation` and `OrOperation` rules (packages/core/src/grammar/rune-dsl.langium) (depends on T033)
- [X] T035 [US1] Port `ThenOperation` rule (lowest precedence) (packages/core/src/grammar/rune-dsl.langium) (depends on T034)
- [X] T036 [US1] Port `RosettaConditionalExpression` (if/then/else) (packages/core/src/grammar/rune-dsl.langium) (depends on T027)
- [X] T037 [US1] Port `SwitchOperation`, `SwitchCaseOrDefault`, `SwitchCaseGuard` rules (packages/core/src/grammar/rune-dsl.langium) (depends on T027)
- [X] T038 [US1] Port `InlineFunction`, `ImplicitInlineFunction`, `ClosureParameter` rules (packages/core/src/grammar/rune-dsl.langium) (depends on T027)
- [X] T039 [US1] Port `ConstructorExpression`, `ConstructorKeyValuePair` rules (packages/core/src/grammar/rune-dsl.langium) (depends on T027)
- [X] T040 [US1] Port `RosettaOnlyExistsExpression` and `WithMetaOperation` rules (packages/core/src/grammar/rune-dsl.langium) (depends on T029)
- [X] T041 [US1] Resolve `<` token ambiguity: documentation string (`<"...">`) vs comparison operator -- LL(k) strategy (packages/core/src/grammar/rune-dsl.langium) (depends on T033)
- [X] T042 [US1] Run `langium-cli generate` and verify all ~40 expression interfaces in `ast.ts` (packages/core/src/generated/ast.ts) (depends on T035)
- [X] T043 [US1] Write expression utility functions: `hasGeneratedInput`, `setGeneratedInputIfAbsent` (packages/core/src/utils/expression-utils.ts) (depends on T042)
- [X] T123 [US1] Add grammar parity check harness comparing Xtext vs Langium acceptance on vendored fixtures (packages/core/tests/conformance/grammar-parity.test.ts) (depends on T042)
- [X] T044 [US1] Run all expression tests, fix parser issues, iterate until green (depends on T014-T026, T042)

**Checkpoint**: All expression parsing tests pass. `ast.ts` contains ~40 typed expression interfaces with `$type` discriminators.

---

## Phase 3: User Story 2 -- Typed Data Model AST (Priority: P1)

**Goal**: Data, Choice, Attribute, Enumeration, Function structures fully ported with cross-reference resolution.

**Independent Test**: Parse CDM `.rosetta` type definitions. All Data types have `Reference<Data>` for superType, attributes have structured cardinality and type calls.

### Tests for User Story 2
- [X] T045 [P] [US2] Write data type parsing tests: `type Foo extends Bar { attr string (0..1) }` (packages/core/tests/grammar/data-types.test.ts)
- [X] T046 [P] [US2] Write choice parsing tests: `choice Baz { option1 Foo option2 Bar }` (packages/core/tests/grammar/data-types.test.ts)
- [X] T047 [P] [US2] Write enum parsing tests: `enum Status { Active displayName "Active" Inactive }` (packages/core/tests/grammar/data-types.test.ts)
- [X] T048 [P] [US2] Write function parsing tests: full function with inputs, output, conditions, operations (packages/core/tests/grammar/functions.test.ts)
- [X] T049 [P] [US2] Write cardinality parsing tests: `(0..1)`, `(1)`, `(0..*)`, `(1..*)`, `(2..5)` (packages/core/tests/grammar/data-types.test.ts)
- [X] T050 [P] [US2] Write cross-reference resolution test: superType resolves to correct Data node (packages/core/tests/scoping/cross-references.test.ts)
- [X] T051 [P] [US2] Write namespace/import parsing tests: `namespace foo.bar version "1.0"`, `import foo.bar.*` (packages/core/tests/grammar/data-types.test.ts)

### Implementation for User Story 2
- [X] T052 [US2] Port `RosettaModel` rule: namespace, version, scope, imports, elements (packages/core/src/grammar/rune-dsl.langium) (depends on T042)
- [X] T053 [US2] Port `Data` rule: name, definition, superType reference, annotations, synonyms, attributes, conditions (packages/core/src/grammar/rune-dsl.langium) (depends on T052)
- [X] T054 [US2] Port `Attribute` rule: name, override, typeCall, cardinality, definition, synonyms, labels, rule references (packages/core/src/grammar/rune-dsl.langium) (depends on T053)
- [X] T055 [US2] Port `RosettaCardinality` rule: `(inf..sup)` and `(inf..*)` patterns (packages/core/src/grammar/rune-dsl.langium) (depends on T054)
- [X] T056 [US2] Port `TypeCall`, `TypeCallArgument`, `TypeParameter` rules for generic types (packages/core/src/grammar/rune-dsl.langium) (depends on T053)
- [X] T057 [US2] Port `Choice` and `ChoiceOption` rules (packages/core/src/grammar/rune-dsl.langium) (depends on T053)
- [X] T058 [US2] Port `Enumeration` and `RosettaEnumValue` rules (packages/core/src/grammar/rune-dsl.langium) (depends on T052)
- [X] T059 [US2] Port `Function`, `ShortcutDeclaration`, `Condition`, `PostCondition`, `Operation`, `Segment` rules (packages/core/src/grammar/rune-dsl.langium) (depends on T052)
- [X] T060 [US2] Port `Annotation`, `AnnotationRef`, `AnnotationQualifier` rules (minimal -- enough for Data/Attribute annotations) (packages/core/src/grammar/rune-dsl.langium) (depends on T053)
- [X] T061 [US2] Write cardinality utility functions: `isOptional`, `isSingular`, `isPlural`, `addCardinality`, `toConstraintString` (packages/core/src/utils/cardinality-utils.ts) (depends on T055)
- [X] T062 [US2] Write choice utility functions: `getEffectiveConditions`, `getOptions` (packages/core/src/utils/choice-utils.ts) (depends on T057)
- [X] T063 [US2] Implement `parse()` and `parseWorkspace()` public APIs (packages/core/src/api/parse.ts) (depends on T059)
- [X] T064 [US2] Run `langium-cli generate`, verify Data/Function/Enum interfaces in `ast.ts` (depends on T059)
- [X] T065 [US2] Write public API tests: `parse()` returns typed `ParseResult` (packages/core/tests/api/parse-api.test.ts) (depends on T063)
- [X] T066 [US2] Run all data model tests, fix issues, iterate until green (depends on T045-T051, T064, T065)

**Checkpoint**: CDM Data types, enums, and functions parse. `ast.ts` contains all structural type interfaces. `parse()` API works.

---

## Phase 4: User Story 4 -- Scoping & Validation (Priority: P2)

**Goal**: Custom scope provider resolves all 21 cross-reference patterns. 80% validation parity.

**Independent Test**: Run `rune-langium` validator against CDM corpus. Compare diagnostics with Xtext LSP output. Zero false positives.

### Tests for User Story 4
- [X] T067 [P] [US4] Write scope resolution tests: feature calls resolve to correct attribute on receiver type (packages/core/tests/scoping/scope-provider.test.ts)
- [X] T068 [P] [US4] Write scope resolution tests: deep feature calls (`->>`) resolve transitively (packages/core/tests/scoping/scope-provider.test.ts)
- [X] T069 [P] [US4] Write scope resolution tests: symbol references in function context (inputs, output, shortcuts) (packages/core/tests/scoping/scope-provider.test.ts)
- [X] T070 [P] [US4] Write scope resolution tests: switch case guards (enum values, choice options, data subtypes) (packages/core/tests/scoping/scope-provider.test.ts)
- [X] T071 [P] [US4] Write scope resolution tests: namespace imports with aliases (packages/core/tests/scoping/scope-provider.test.ts)
- [X] T072 [P] [US4] Write validation tests: cyclic inheritance detection (packages/core/tests/validation/type-validator.test.ts)
- [X] T073 [P] [US4] Write validation tests: expression type mismatches (packages/core/tests/validation/expression-validator.test.ts)
- [X] T074 [P] [US4] Write validation tests: cardinality violations (packages/core/tests/validation/expression-validator.test.ts)
- [X] T075 [P] [US4] Write validation tests: naming convention warnings (packages/core/tests/validation/type-validator.test.ts)
- [X] T076 [P] [US4] Write CDM corpus zero-false-positive test (packages/core/tests/conformance/cdm-corpus.test.ts)

### Implementation for User Story 4
- [X] T077 [US4] Implement `RuneScopeProvider`: feature call scope (cases 1-3) (packages/core/src/services/rune-dsl-scope-provider.ts) (depends on T064)
- [X] T078 [US4] Implement scope: symbol reference resolution (case 12 -- most complex) (packages/core/src/services/rune-dsl-scope-provider.ts) (depends on T077)
- [X] T079 [US4] Implement scope: operation assign root, segment features, constructor keys (cases 4-8) (packages/core/src/services/rune-dsl-scope-provider.ts) (depends on T077)
- [X] T080 [US4] Implement scope: switch case guards, enum value references, annotation paths (cases 9-21) (packages/core/src/services/rune-dsl-scope-provider.ts) (depends on T078)
- [X] T081 [US4] Implement scope: `getSymbolParentScope` -- recursive containment walk (packages/core/src/services/rune-dsl-scope-provider.ts) (depends on T078)
- [X] T082 [US4] Implement scope: import normalizer with namespace aliasing and implicit `com.rosetta.model.*` (packages/core/src/services/rune-dsl-scope-provider.ts) (depends on T077)
- [X] T083 [US4] Implement type provider: compute receiver types, expected types (packages/core/src/services/rune-dsl-type-provider.ts) (depends on T077)
- [X] T084 [US4] Port expression validator: 22 rules (packages/core/src/services/rune-dsl-validator.ts) (depends on T083)
- [X] T085 [US4] Port structural validators: cycles, unique names, duplicates (15 rules) (packages/core/src/services/rune-dsl-validator.ts) (depends on T064)
- [X] T086 [US4] Port naming convention validators: capitalization (12 rules) (packages/core/src/services/rune-dsl-validator.ts) (depends on T064)
- [X] T087 [US4] Port reporting validators: rule input types, rule references (5 rules) (packages/core/src/services/rune-dsl-validator.ts) (depends on T064)
- [X] T088 [US4] Build validation parity report: script comparing Langium vs Xtext diagnostics (packages/core/tests/conformance/parity-report.ts) (depends on T084-T087)
- [X] T089 [US4] Run all scoping and validation tests, iterate until green (depends on T067-T076, T088)

**Checkpoint**: Scope provider resolves all cross-reference patterns. 80%+ validation parity. Zero false positives on CDM corpus.

---

## Phase 5: User Story 5 -- Full Grammar Coverage (Priority: P3)

**Goal**: Complete grammar surface ported. 100% CDM corpus parse rate. Round-trip fidelity.

**Independent Test**: Parse entire CDM corpus. Re-serialize. Output matches input.

### Tests for User Story 5
- [X] T090 [P] [US5] Write synonym parsing tests: class synonyms, enum synonyms, synonym values, mappings (packages/core/tests/grammar/synonyms.test.ts)
- [X] T091 [P] [US5] Write reporting parsing tests: `report`, `rule`, `body`, `corpus`, `segment` (packages/core/tests/grammar/reporting.test.ts)
- [X] T092 [P] [US5] Write annotation parsing tests: annotation declarations, refs with qualifiers (packages/core/tests/grammar/annotations.test.ts)
- [X] T093 [P] [US5] Write external source parsing tests: external synonym sources, external rule sources (packages/core/tests/grammar/external-sources.test.ts)
- [X] T094 [P] [US5] Write round-trip serialization test: parse -> serialize -> compare (packages/core/tests/conformance/round-trip.test.ts)

### Implementation for User Story 5
- [X] T095 [US5] Port synonym system: `RosettaSynonym`, `RosettaSynonymBody`, `RosettaSynonymValue`, `RosettaClassSynonym`, `RosettaEnumSynonym`, `RosettaMergeSynonymValue` (~8 rules) (packages/core/src/grammar/rune-dsl.langium) (depends on T064)
- [X] T096 [US5] Port mapping system: `RosettaMapping`, `RosettaMappingInstance`, `RosettaMappingPathTests`, `RosettaMapTest`, `RosettaMapPath` (~7 rules) (packages/core/src/grammar/rune-dsl.langium) (depends on T095)
- [X] T097 [US5] Port reporting system: `RosettaReport`, `RosettaRule`, `RosettaBody`, `RosettaCorpus`, `RosettaSegment`, `RosettaDocReference` (~10 rules) (packages/core/src/grammar/rune-dsl.langium) (depends on T064)
- [X] T098 [US5] Port external sources: `RosettaExternalSynonymSource`, `RosettaExternalRuleSource`, `RosettaExternalClass`, `RosettaExternalEnum` (~8 rules) (packages/core/src/grammar/rune-dsl.langium) (depends on T095)
- [X] T099 [US5] Port built-in types: `RosettaBasicType`, `RosettaRecordType`, `RosettaMetaType`, `RosettaTypeAlias`, `RosettaLibraryFunction` (~5 rules) (packages/core/src/grammar/rune-dsl.langium) (depends on T064)
- [X] T100 [US5] Port `RosettaQualifiableConfiguration` and qualifier rules (packages/core/src/grammar/rune-dsl.langium) (depends on T097)
- [X] T101 [US5] Implement serializer/formatter for round-trip output (packages/core/src/services/rune-dsl-formatter.ts) (depends on T100)
- [X] T102 [US5] Run `langium-cli generate` -- verify all ~95 interfaces in `ast.ts` (depends on T100)
- [X] T103 [US5] Run CDM full corpus conformance test: 100% parse rate (depends on T090-T094, T102)
- [X] T104 [US5] Run round-trip tests, fix serialization issues (depends on T101, T103)

**Checkpoint**: Full CDM corpus parses (100% rate). Round-trip serialization passes. `ast.ts` contains ~95 typed interfaces.

---

## Phase 6: Packaging & Release -- US3

**Goal**: Published core + CLI packages with documentation, CI, and browser support.

**Independent Test**: `npm install @rune-langium/core` and `@rune-langium/cli` in a fresh project. Import `parse()` and all types. `rune-langium parse` works in Node.js.

### Tests for User Story 3
- [X] T105 [P] [US3] Write Node.js API integration test: `parse()` returns typed AST (packages/core/tests/api/parse-api.test.ts)
- [X] T106 [P] [US3] Write multi-file test: `parseWorkspace()` resolves cross-file references (packages/core/tests/api/parse-api.test.ts)
- [X] T107 [P] [US3] Write performance benchmark: <200ms single file, <5s CDM corpus (packages/core/tests/performance/parse-benchmark.test.ts)
- [X] T108 [P] [US3] Write browser compatibility test (packages/core/tests/api/browser-compat.test.ts)
- [X] T117 [P] [US3] Write CLI parse test: human output and `--json` output (packages/cli/tests/cli-parse.test.ts)
- [X] T118 [P] [US3] Write CLI validate test: aggregates errors, exits non-zero (packages/cli/tests/cli-validate.test.ts)

### Implementation
- [X] T109 [US3] Finalize package entry point: export all AST types, type guards, parse API, utilities (packages/core/src/index.ts) (depends on T102)
- [X] T110 [US3] Create web worker helper: `createWorkerParser()` for off-main-thread parsing (packages/core/src/worker/parser-worker.ts) (depends on T109)
- [X] T111 [US3] Write README.md: installation, quick start, API reference, grammar overview, contributing guide (packages/core/README.md) (depends on T109)
- [X] T112 [US3] Configure GitHub Actions CI: lint, generate, test, build, conformance (`.github/workflows/ci.yml`) (depends on T109)
- [X] T113 [US3] Configure npm publish: `files` field, `exports` map, `types` field, `sideEffects: false` (package.json, packages/core/package.json) (depends on T109)
- [X] T114 [US3] Performance optimization: profile and optimize parse latency (depends on T107)
- [X] T115 [US3] Browser bundle verification: ensure no Node.js-only APIs leak into browser build (depends on T108)
- [X] T119 [US3] Create `@rune-langium/cli` package with bin entry (packages/cli/package.json) (depends on T109)
- [X] T120 [US3] Implement CLI `parse` command with file/dir/glob inputs (packages/cli/src/parse.ts) (depends on T119)
- [X] T121 [US3] Implement CLI `validate` command with exit codes and `--json` output (packages/cli/src/validate.ts) (depends on T120)
- [X] T122 [US3] Wire CLI entrypoint and shared formatting utils (packages/cli/src/index.ts) (depends on T120-T121)
- [X] T124 [US3] Verify generated type guards are exported and usable (packages/core/tests/api/type-guards.test.ts) (depends on T102, T109)
- [X] T116 Publish initial release to npm (depends on T105-T108, T109-T115, T117-T118, T119-T124)

**Checkpoint**: `npm install @rune-langium/core` and `@rune-langium/cli` works. All types exported. Browser and Node.js compatible. CLI parse/validate works. CI green.

---

## Dependencies & Execution Order

```
Phase 1 (T001-T013): Setup
  │
  ▼
Phase 2 (T014-T044): Expression Grammar [CRITICAL PATH]
  │
  ▼
Phase 3 (T045-T066): Data Model Grammar
  │
  ├──────────────────────┐
  ▼                      ▼
Phase 4 (T067-T089):   Phase 5 (T090-T104):
Scoping & Validation    Full Grammar
  │                      │
  └──────────┬───────────┘
             ▼
Phase 6 (T105-T116): Packaging & Release
```

## Parallel Execution Examples

**Within Phase 1**: T001, T002, T003, T012 can all run in parallel.

**Within Phase 2**: All test tasks (T014-T026) in parallel. Implementation tasks are sequential.

**Phase 4 + Phase 5**: Can partially overlap. Synonym grammar (T095-T100) doesn't depend on scoping (T077-T082).

## Implementation Strategy

**MVP First**: Phase 2 (expression grammar) proves viability. If Chevrotain handles the expression complexity, the project is feasible.

**Incremental Delivery**: Each phase is independently valuable. A consumer only needing expression types can adopt after Phase 2.

**Parallel Teams**: Grammar engineer on Phases 2-3, validation engineer on Phase 4, packaging engineer on Phase 6.
