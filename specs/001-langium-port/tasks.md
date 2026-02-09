# Tasks: rune-langium

**Input**: Design documents from `specs/001-langium-port/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Constitution-driven expectations**: CDM corpus conformance tests, typed AST generation, <200ms parse latency, 80% validation parity, browser compatibility, zero framework coupling

## Format: [ID] [P?] [US#?] Description

- `T###` -- Sequential task ID
- `[P]` -- Can run in parallel with other `[P]` tasks in the same phase
- `[US#]` -- Maps to User Story number
- `(path)` -- Primary file affected
- `(depends on T###)` -- Explicit dependency

All paths are relative to the `rune-langium/` monorepo root. Core package paths are under `packages/core/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Goal**: Monorepo with build pipeline and type generation working.

### Repository Setup
- [ ] T001 [P] Initialize repository: `package.json` with `langium`, `langium-cli`, `chevrotain`, `vitest`, `tsup` dependencies (package.json)
- [ ] T002 [P] Create `tsconfig.json` with strict mode, ES2020 target, dual CJS/ESM (tsconfig.json)
- [ ] T003 [P] Create `tsup.config.ts` for dual CJS/ESM build output with type declarations (tsup.config.ts)
- [ ] T004 Create `langium-config.json` with rune-dsl language config, `.rosetta` file extension, Chevrotain recovery enabled, maxLookahead 3 (langium-config.json) (depends on T001)
- [ ] T005 Write grammar skeleton: terminals (ID, STRING, INT, ML_COMMENT, SL_COMMENT, WS) + `RosettaModel` entry rule + `QualifiedName` fragment (src/grammar/rune-dsl.langium) (depends on T004)
- [ ] T006 Run `langium-cli generate` and verify `ast.ts`, `grammar.ts`, `module.ts` are produced (src/generated/) (depends on T005)
- [ ] T007 Create custom module file with dependency injection setup (src/services/rune-dsl-module.ts) (depends on T006)
- [ ] T008 Create `parse()` API stub returning typed `ParseResult` (src/api/parse.ts) (depends on T007)
- [ ] T009 Create package entry point exporting types and API (src/index.ts) (depends on T008)
- [ ] T010 Set up Vitest config and write first test: parse empty `RosettaModel` (tests/grammar/smoke.test.ts) (depends on T008)
- [ ] T011 Add `build`, `generate`, `test`, and `lint` scripts to package.json (package.json) (depends on T006)
- [ ] T012 [P] Create `.gitignore`, `LICENSE`, initial `README.md` (.)
- [ ] T013 Curate CDM `.rosetta` sample fixtures for testing (tests/fixtures/) (depends on T001)

### Upstream Corpus Setup
- [ ] T013a [P] Create `scripts/setup-corpus.sh` to clone/shallow-fetch [finos/rune-dsl](https://github.com/finos/rune-dsl) (Apache-2.0) and [finos/common-domain-model](https://github.com/finos/common-domain-model) (Community Specification License 1.0) at pinned version tags (scripts/setup-corpus.sh)
- [ ] T013b [P] Add `CDM_CORPUS_PATH` env var support pointing to `rosetta-source/` within the cloned CDM repo; default to `./vendor/common-domain-model/rosetta-source` (tests/helpers/corpus-loader.ts)
- [ ] T013c [P] Add `RUNE_DSL_PATH` env var support pointing to cloned rune-dsl repo root; default to `./vendor/rune-dsl` (tests/helpers/corpus-loader.ts)
- [ ] T013d Configure `.gitignore` to exclude `vendor/` directory (do not commit upstream repos) (.gitignore)
- [ ] T013e Add `postinstall` or `prepare` npm script to run `scripts/setup-corpus.sh` for dev setup (package.json) (depends on T013a)
- [ ] T013f Configure CI workflow to run `scripts/setup-corpus.sh` with pinned CDM version tag before conformance tests (.github/workflows/ci.yml) (depends on T013a)

**Checkpoint**: `npm run generate` produces `ast.ts` with `RosettaModel` interface. `parse("")` returns empty model. Smoke test passes. `scripts/setup-corpus.sh` clones both upstream repos.

---

## Phase 2: User Story 1 -- Typed Expression AST (Priority: P1) -- MVP

**Goal**: Full expression subsystem ported. All CDM expressions parse into typed AST nodes.

**Independent Test**: Import `rune-langium`, parse a `.rosetta` string with expressions. Every expression node has `$type` and typed children.

> **CRITICAL**: This is the highest-risk phase. The expression grammar has 60+ predicates, 10 precedence levels, 30 postfix operators, and the "without left parameter" pattern. If Chevrotain LL(k) handles this, everything else follows.

### Tests for User Story 1
- [ ] T014 [P] [US1] Write expression parsing tests: arithmetic (`a + b * c`) (tests/grammar/expressions.test.ts)
- [ ] T015 [P] [US1] Write expression parsing tests: logical (`a and b or c`) (tests/grammar/expressions.test.ts)
- [ ] T016 [P] [US1] Write expression parsing tests: comparison with cardinality modifiers (`a any = b`) (tests/grammar/expressions.test.ts)
- [ ] T017 [P] [US1] Write expression parsing tests: feature calls (`a -> b -> c`, `a ->> d`) (tests/grammar/expressions.test.ts)
- [ ] T018 [P] [US1] Write expression parsing tests: unary postfix (`x exists`, `x count`, `x flatten`, `x first`) (tests/grammar/expressions.test.ts)
- [ ] T019 [P] [US1] Write expression parsing tests: functional ops (`items filter [item -> item > 0]`, `extract`, `reduce`, `sort`) (tests/grammar/expressions.test.ts)
- [ ] T020 [P] [US1] Write expression parsing tests: control flow (`if cond then a else b`, `switch x case ...`) (tests/grammar/expressions.test.ts)
- [ ] T021 [P] [US1] Write expression parsing tests: literals (boolean, string, number, int, list, empty) (tests/grammar/expressions.test.ts)
- [ ] T022 [P] [US1] Write expression parsing tests: constructor expressions (`Foo { bar: baz }`) (tests/grammar/expressions.test.ts)
- [ ] T023 [P] [US1] Write expression parsing tests: implicit variable / "without left parameter" pattern (tests/grammar/expressions.test.ts)
- [ ] T024 [P] [US1] Write expression parsing tests: `then` chaining (`x filter [...] then count then + 1`) (tests/grammar/expressions.test.ts)
- [ ] T025 [P] [US1] Write expression parsing tests: type coercion operators (`to-string`, `to-number`, `to-enum`) (tests/grammar/expressions.test.ts)
- [ ] T026 [P] [US1] Write expression error recovery test: malformed expressions produce partial AST + diagnostics (tests/grammar/expressions.test.ts)

### Implementation for User Story 1
- [ ] T027 [US1] Port `PrimaryExpression` rule: literals, symbol references, implicit variable, super call, parenthesized expressions, list literals, empty keyword (src/grammar/rune-dsl.langium) (depends on T005)
- [ ] T028 [US1] Port `RosettaFeatureCall` and `RosettaDeepFeatureCall` rules (`->` and `->>` navigation) (src/grammar/rune-dsl.langium) (depends on T027)
- [ ] T029 [US1] Port `UnaryOperation` rule: all ~30 postfix operators in three groups (simple, optional-function, mandatory-function) (src/grammar/rune-dsl.langium) (depends on T028)
- [ ] T030 [US1] Port "without left parameter" pattern -- design Langium-native approach (parser actions or post-parse rewrite) (src/grammar/rune-dsl.langium) (depends on T029)
- [ ] T031 [US1] Port `MultiplicativeOperation` and `AdditiveOperation` rules (src/grammar/rune-dsl.langium) (depends on T029)
- [ ] T032 [US1] Port `BinaryOperation` rule: `contains`, `disjoint`, `default`, `join` (src/grammar/rune-dsl.langium) (depends on T031)
- [ ] T033 [US1] Port `ComparisonOperation` and `EqualityOperation` rules with `CardinalityModifier` (src/grammar/rune-dsl.langium) (depends on T032)
- [ ] T034 [US1] Port `AndOperation` and `OrOperation` rules (src/grammar/rune-dsl.langium) (depends on T033)
- [ ] T035 [US1] Port `ThenOperation` rule (lowest precedence) (src/grammar/rune-dsl.langium) (depends on T034)
- [ ] T036 [US1] Port `RosettaConditionalExpression` (if/then/else) (src/grammar/rune-dsl.langium) (depends on T027)
- [ ] T037 [US1] Port `SwitchOperation`, `SwitchCaseOrDefault`, `SwitchCaseGuard` rules (src/grammar/rune-dsl.langium) (depends on T027)
- [ ] T038 [US1] Port `InlineFunction`, `ImplicitInlineFunction`, `ClosureParameter` rules (src/grammar/rune-dsl.langium) (depends on T027)
- [ ] T039 [US1] Port `ConstructorExpression`, `ConstructorKeyValuePair` rules (src/grammar/rune-dsl.langium) (depends on T027)
- [ ] T040 [US1] Port `RosettaOnlyExistsExpression` and `WithMetaOperation` rules (src/grammar/rune-dsl.langium) (depends on T029)
- [ ] T041 [US1] Resolve `<` token ambiguity: documentation string (`<"...">`) vs comparison operator -- LL(k) strategy (src/grammar/rune-dsl.langium) (depends on T033)
- [ ] T042 [US1] Run `langium-cli generate` and verify all ~40 expression interfaces in `ast.ts` (src/generated/ast.ts) (depends on T035)
- [ ] T043 [US1] Write expression utility functions: `hasGeneratedInput`, `setGeneratedInputIfAbsent` (src/utils/expression-utils.ts) (depends on T042)
- [ ] T044 [US1] Run all expression tests, fix parser issues, iterate until green (depends on T014-T026, T042)

**Checkpoint**: All expression parsing tests pass. `ast.ts` contains ~40 typed expression interfaces with `$type` discriminators.

---

## Phase 3: User Story 2 -- Typed Data Model AST (Priority: P1)

**Goal**: Data, Choice, Attribute, Enumeration, Function structures fully ported with cross-reference resolution.

**Independent Test**: Parse CDM `.rosetta` type definitions. All Data types have `Reference<Data>` for superType, attributes have structured cardinality and type calls.

### Tests for User Story 2
- [ ] T045 [P] [US2] Write data type parsing tests: `type Foo extends Bar { attr string (0..1) }` (tests/grammar/data-types.test.ts)
- [ ] T046 [P] [US2] Write choice parsing tests: `choice Baz { option1 Foo option2 Bar }` (tests/grammar/data-types.test.ts)
- [ ] T047 [P] [US2] Write enum parsing tests: `enum Status { Active displayName "Active" Inactive }` (tests/grammar/data-types.test.ts)
- [ ] T048 [P] [US2] Write function parsing tests: full function with inputs, output, conditions, operations (tests/grammar/functions.test.ts)
- [ ] T049 [P] [US2] Write cardinality parsing tests: `(0..1)`, `(1)`, `(0..*)`, `(1..*)`, `(2..5)` (tests/grammar/data-types.test.ts)
- [ ] T050 [P] [US2] Write cross-reference resolution test: superType resolves to correct Data node (tests/scoping/cross-references.test.ts)
- [ ] T051 [P] [US2] Write namespace/import parsing tests: `namespace foo.bar version "1.0"`, `import foo.bar.*` (tests/grammar/data-types.test.ts)

### Implementation for User Story 2
- [ ] T052 [US2] Port `RosettaModel` rule: namespace, version, scope, imports, elements (src/grammar/rune-dsl.langium) (depends on T042)
- [ ] T053 [US2] Port `Data` rule: name, definition, superType reference, annotations, synonyms, attributes, conditions (src/grammar/rune-dsl.langium) (depends on T052)
- [ ] T054 [US2] Port `Attribute` rule: name, override, typeCall, cardinality, definition, synonyms, labels, rule references (src/grammar/rune-dsl.langium) (depends on T053)
- [ ] T055 [US2] Port `RosettaCardinality` rule: `(inf..sup)` and `(inf..*)` patterns (src/grammar/rune-dsl.langium) (depends on T054)
- [ ] T056 [US2] Port `TypeCall`, `TypeCallArgument`, `TypeParameter` rules for generic types (src/grammar/rune-dsl.langium) (depends on T053)
- [ ] T057 [US2] Port `Choice` and `ChoiceOption` rules (src/grammar/rune-dsl.langium) (depends on T053)
- [ ] T058 [US2] Port `Enumeration` and `RosettaEnumValue` rules (src/grammar/rune-dsl.langium) (depends on T052)
- [ ] T059 [US2] Port `Function`, `ShortcutDeclaration`, `Condition`, `PostCondition`, `Operation`, `Segment` rules (src/grammar/rune-dsl.langium) (depends on T052)
- [ ] T060 [US2] Port `Annotation`, `AnnotationRef`, `AnnotationQualifier` rules (minimal -- enough for Data/Attribute annotations) (src/grammar/rune-dsl.langium) (depends on T053)
- [ ] T061 [US2] Write cardinality utility functions: `isOptional`, `isSingular`, `isPlural`, `addCardinality`, `toConstraintString` (src/utils/cardinality-utils.ts) (depends on T055)
- [ ] T062 [US2] Write choice utility functions: `getEffectiveConditions`, `getOptions` (src/utils/choice-utils.ts) (depends on T057)
- [ ] T063 [US2] Implement `parse()` and `parseWorkspace()` public APIs (src/api/parse.ts) (depends on T059)
- [ ] T064 [US2] Run `langium-cli generate`, verify Data/Function/Enum interfaces in `ast.ts` (depends on T059)
- [ ] T065 [US2] Write public API tests: `parse()` returns typed `ParseResult` (tests/api/parse-api.test.ts) (depends on T063)
- [ ] T066 [US2] Run all data model tests, fix issues, iterate until green (depends on T045-T051, T064, T065)

**Checkpoint**: CDM Data types, enums, and functions parse. `ast.ts` contains all structural type interfaces. `parse()` API works.

---

## Phase 4: User Story 4 -- Scoping & Validation (Priority: P2)

**Goal**: Custom scope provider resolves all 21 cross-reference patterns. 80% validation parity.

**Independent Test**: Run `rune-langium` validator against CDM corpus. Compare diagnostics with Xtext LSP output. Zero false positives.

### Tests for User Story 4
- [ ] T067 [P] [US4] Write scope resolution tests: feature calls resolve to correct attribute on receiver type (tests/scoping/scope-provider.test.ts)
- [ ] T068 [P] [US4] Write scope resolution tests: deep feature calls (`->>`) resolve transitively (tests/scoping/scope-provider.test.ts)
- [ ] T069 [P] [US4] Write scope resolution tests: symbol references in function context (inputs, output, shortcuts) (tests/scoping/scope-provider.test.ts)
- [ ] T070 [P] [US4] Write scope resolution tests: switch case guards (enum values, choice options, data subtypes) (tests/scoping/scope-provider.test.ts)
- [ ] T071 [P] [US4] Write scope resolution tests: namespace imports with aliases (tests/scoping/scope-provider.test.ts)
- [ ] T072 [P] [US4] Write validation tests: cyclic inheritance detection (tests/validation/type-validator.test.ts)
- [ ] T073 [P] [US4] Write validation tests: expression type mismatches (tests/validation/expression-validator.test.ts)
- [ ] T074 [P] [US4] Write validation tests: cardinality violations (tests/validation/expression-validator.test.ts)
- [ ] T075 [P] [US4] Write validation tests: naming convention warnings (tests/validation/type-validator.test.ts)
- [ ] T076 [P] [US4] Write CDM corpus zero-false-positive test (tests/conformance/cdm-corpus.test.ts)

### Implementation for User Story 4
- [ ] T077 [US4] Implement `RuneScopeProvider`: feature call scope (cases 1-3) (src/services/rune-dsl-scope-provider.ts) (depends on T064)
- [ ] T078 [US4] Implement scope: symbol reference resolution (case 12 -- most complex) (src/services/rune-dsl-scope-provider.ts) (depends on T077)
- [ ] T079 [US4] Implement scope: operation assign root, segment features, constructor keys (cases 4-8) (src/services/rune-dsl-scope-provider.ts) (depends on T077)
- [ ] T080 [US4] Implement scope: switch case guards, enum value references, annotation paths (cases 9-21) (src/services/rune-dsl-scope-provider.ts) (depends on T078)
- [ ] T081 [US4] Implement scope: `getSymbolParentScope` -- recursive containment walk (src/services/rune-dsl-scope-provider.ts) (depends on T078)
- [ ] T082 [US4] Implement scope: import normalizer with namespace aliasing and implicit `com.rosetta.model.*` (src/services/rune-dsl-scope-provider.ts) (depends on T077)
- [ ] T083 [US4] Implement type provider: compute receiver types, expected types (src/services/rune-dsl-type-provider.ts) (depends on T077)
- [ ] T084 [US4] Port expression validator: 22 rules (src/services/rune-dsl-validator.ts) (depends on T083)
- [ ] T085 [US4] Port structural validators: cycles, unique names, duplicates (15 rules) (src/services/rune-dsl-validator.ts) (depends on T064)
- [ ] T086 [US4] Port naming convention validators: capitalization (12 rules) (src/services/rune-dsl-validator.ts) (depends on T064)
- [ ] T087 [US4] Port reporting validators: rule input types, rule references (5 rules) (src/services/rune-dsl-validator.ts) (depends on T064)
- [ ] T088 [US4] Build validation parity report: script comparing Langium vs Xtext diagnostics (tests/conformance/parity-report.ts) (depends on T084-T087)
- [ ] T089 [US4] Run all scoping and validation tests, iterate until green (depends on T067-T076, T088)

**Checkpoint**: Scope provider resolves all cross-reference patterns. 80%+ validation parity. Zero false positives on CDM corpus.

---

## Phase 5: User Story 5 -- Full Grammar Coverage (Priority: P3)

**Goal**: Complete grammar surface ported. 100% CDM corpus parse rate. Round-trip fidelity.

**Independent Test**: Parse entire CDM corpus. Re-serialize. Output matches input.

### Tests for User Story 5
- [ ] T090 [P] [US5] Write synonym parsing tests: class synonyms, enum synonyms, synonym values, mappings (tests/grammar/synonyms.test.ts)
- [ ] T091 [P] [US5] Write reporting parsing tests: `report`, `rule`, `body`, `corpus`, `segment` (tests/grammar/reporting.test.ts)
- [ ] T092 [P] [US5] Write annotation parsing tests: annotation declarations, refs with qualifiers (tests/grammar/annotations.test.ts)
- [ ] T093 [P] [US5] Write external source parsing tests: external synonym sources, external rule sources (tests/grammar/external-sources.test.ts)
- [ ] T094 [P] [US5] Write round-trip serialization test: parse -> serialize -> compare (tests/conformance/round-trip.test.ts)

### Implementation for User Story 5
- [ ] T095 [US5] Port synonym system: `RosettaSynonym`, `RosettaSynonymBody`, `RosettaSynonymValue`, `RosettaClassSynonym`, `RosettaEnumSynonym`, `RosettaMergeSynonymValue` (~8 rules) (src/grammar/rune-dsl.langium) (depends on T064)
- [ ] T096 [US5] Port mapping system: `RosettaMapping`, `RosettaMappingInstance`, `RosettaMappingPathTests`, `RosettaMapTest`, `RosettaMapPath` (~7 rules) (src/grammar/rune-dsl.langium) (depends on T095)
- [ ] T097 [US5] Port reporting system: `RosettaReport`, `RosettaRule`, `RosettaBody`, `RosettaCorpus`, `RosettaSegment`, `RosettaDocReference` (~10 rules) (src/grammar/rune-dsl.langium) (depends on T064)
- [ ] T098 [US5] Port external sources: `RosettaExternalSynonymSource`, `RosettaExternalRuleSource`, `RosettaExternalClass`, `RosettaExternalEnum` (~8 rules) (src/grammar/rune-dsl.langium) (depends on T095)
- [ ] T099 [US5] Port built-in types: `RosettaBasicType`, `RosettaRecordType`, `RosettaMetaType`, `RosettaTypeAlias`, `RosettaLibraryFunction` (~5 rules) (src/grammar/rune-dsl.langium) (depends on T064)
- [ ] T100 [US5] Port `RosettaQualifiableConfiguration` and qualifier rules (src/grammar/rune-dsl.langium) (depends on T097)
- [ ] T101 [US5] Implement serializer/formatter for round-trip output (src/services/rune-dsl-formatter.ts) (depends on T100)
- [ ] T102 [US5] Run `langium-cli generate` -- verify all ~95 interfaces in `ast.ts` (depends on T100)
- [ ] T103 [US5] Run CDM full corpus conformance test: 100% parse rate (depends on T090-T094, T102)
- [ ] T104 [US5] Run round-trip tests, fix serialization issues (depends on T101, T103)

**Checkpoint**: Full CDM corpus parses (100% rate). Round-trip serialization passes. `ast.ts` contains ~95 typed interfaces.

---

## Phase 6: Packaging & Release -- US3

**Goal**: Published packages with documentation, CI, and browser support.

**Independent Test**: `npm install @rune-langium/core` in a fresh project. Import `parse()` and all types. Works in Node.js and browser.

### Tests for User Story 3
- [ ] T105 [P] [US3] Write Node.js API integration test: `parse()` returns typed AST (tests/api/parse-api.test.ts)
- [ ] T106 [P] [US3] Write multi-file test: `parseWorkspace()` resolves cross-file references (tests/api/parse-api.test.ts)
- [ ] T107 [P] [US3] Write performance benchmark: <200ms single file, <5s CDM corpus (tests/performance/parse-benchmark.test.ts)
- [ ] T108 [P] [US3] Write browser compatibility test (tests/api/browser-compat.test.ts)

### Implementation
- [ ] T109 [US3] Finalize package entry point: export all AST types, type guards, parse API, utilities (src/index.ts) (depends on T102)
- [ ] T110 [US3] Create web worker helper: `createWorkerParser()` for off-main-thread parsing (src/worker/parser-worker.ts) (depends on T109)
- [ ] T111 [US3] Write README.md: installation, quick start, API reference, grammar overview, contributing guide (README.md) (depends on T109)
- [ ] T112 [US3] Configure GitHub Actions CI: lint, generate, test, build, conformance (`.github/workflows/ci.yml`) (depends on T109)
- [ ] T113 [US3] Configure npm publish: `files` field, `exports` map, `types` field, `sideEffects: false` (package.json) (depends on T109)
- [ ] T114 [US3] Performance optimization: profile and optimize parse latency (depends on T107)
- [ ] T115 [US3] Browser bundle verification: ensure no Node.js-only APIs leak into browser build (depends on T108)
- [ ] T116 Publish initial release to npm (depends on T105-T108, T109-T115)

**Checkpoint**: `npm install @rune-langium/core` works. All types exported. Browser and Node.js compatible. CI green.

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
