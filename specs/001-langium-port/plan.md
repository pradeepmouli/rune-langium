# Implementation Plan: rune-langium

**Repository**: `rune-langium` | **Date**: 2026-02-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-langium-port/spec.md`

## Summary

Port the Xtext-based Rune DSL (~95 grammar rules, 3 Xcore metamodels, 101 validation rules, 21 scoping cases) to Langium 4.2.0. The `rune-langium` package auto-generates ~95 TypeScript AST interfaces from the grammar and exposes a clean programmatic API for parsing, validating, and traversing `.rosetta` files.

Phased delivery: expression grammar proof-of-concept first (highest risk + highest value), then structural types, then scoping/validation, then full grammar coverage.

## Technical Context

- **Language**: TypeScript (strict mode)
- **Framework**: Langium 4.2.0, Chevrotain parser
- **Build**: tsup or tsc for dual CJS/ESM output
- **Dependencies**: `langium`, `chevrotain` (runtime); `langium-cli`, `vitest`, `tsup` (dev)
- **Testing**: Vitest for unit/integration tests, CDM corpus for conformance
- **Platform**: Node.js (>=18) and modern browsers (ES2020+)
- **Source grammar**: [finos/rune-dsl](https://github.com/finos/rune-dsl) — `rune-lang/src/main/java/com/regnosys/rosetta/Rosetta.xtext` + `rune-lang/model/*.xcore` (Apache-2.0; reference, not runtime dependency)
- **Test corpus**: [finos/common-domain-model](https://github.com/finos/common-domain-model) — CDM `.rosetta` files in `rosetta-source/` (Community Specification License 1.0; cloned at test time, not bundled)

## Project Structure

### Documentation

```
specs/001-langium-port/
  spec.md              # Feature specification
  plan.md              # This file
  tasks.md             # Task breakdown
  research.md          # Technical decisions
  data-model.md        # AST type documentation
  checklists/
    requirements.md    # Requirements tracking
```

### Source Code (`@rune-langium/*` monorepo)

```
rune-langium/
  packages/
    core/                                  # @rune-langium/core
      src/
        grammar/
          rune-dsl.langium                 # Langium grammar (main artifact)
        generated/
          ast.ts                           # Auto-generated AST types
          grammar.ts                       # Auto-generated grammar access
          module.ts                        # Auto-generated module
        services/
          rune-dsl-module.ts               # Custom service bindings
          rune-dsl-validator.ts            # Validation rules
          rune-dsl-scope-provider.ts       # Custom scoping (21 cases)
          rune-dsl-type-provider.ts        # Type computation
        utils/
          cardinality-utils.ts             # Cardinality algebra
          choice-utils.ts                  # Choice derived conditions
          expression-utils.ts              # Expression helpers
        api/
          parse.ts                         # parse() and parseWorkspace()
          types.ts                         # Public API type re-exports
        worker/
          parser-worker.ts                 # Web worker helper (optional)
        index.ts                           # Package entry point
      tests/
        grammar/
          expressions.test.ts              # Expression parsing tests
          data-types.test.ts               # Data/Choice/Enum tests
          functions.test.ts                # Function parsing tests
          synonyms.test.ts                 # Synonym parsing tests
          reporting.test.ts                # Report/Rule tests
        scoping/
          scope-provider.test.ts           # Cross-reference resolution
        validation/
          expression-validator.test.ts     # Expression validation
          type-validator.test.ts           # Type validation
        conformance/
          cdm-corpus.test.ts               # Full CDM parse conformance
          round-trip.test.ts               # Serialization round-trip
        performance/
          parse-benchmark.test.ts          # Latency benchmarks
        api/
          parse-api.test.ts                # Public API tests
        fixtures/
          *.rosetta                         # Curated CDM samples
      langium-config.json                  # Langium CLI configuration
      tsconfig.json
      package.json
    cli/                                   # @rune-langium/cli (optional)
      src/
        index.ts                           # CLI entry point
      package.json
  scripts/
    setup-corpus.sh                        # Clone upstream repos
  tsconfig.json                            # Root tsconfig
  package.json                             # Workspace root
  README.md
  LICENSE
```

## Complexity Tracking

| Risk | Description | Mitigation |
|------|-------------|------------|
| `maxLookahead: 3` may be insufficient | Chevrotain LL(k) vs ANTLR LL(*). Some predicate patterns may need higher lookahead. | Monitor during Phase 2. Increase if specific rules fail. |
| "Without left parameter" grammar duplication | 7 Xtext rules duplicated for implicit variable binding. Needs Langium-native redesign. | Prototype in Phase 2 using parser actions or post-parse rewrite. |
| Browser bundle size | Langium + Chevrotain may produce a large bundle. | Tree-shake. Provide a slim `types-only` export for consumers that only need types. |
| CDM test fixture licensing | CDM source files may have licensing constraints for bundling. | Bundle only curated samples. Full corpus test as optional CI step. |

## Phase Plan

### Phase 1: Project Setup & Infrastructure
**Goal**: Repository with build pipeline, initial grammar skeleton, and generated type output.

- Initialize repository with `package.json`, `tsconfig.json`, `langium-config.json`
- Create `scripts/setup-corpus.sh` to clone/fetch [finos/rune-dsl](https://github.com/finos/rune-dsl) and [finos/common-domain-model](https://github.com/finos/common-domain-model) at pinned version tags
- Add `CDM_CORPUS_PATH` and `RUNE_DSL_PATH` env var support for configurable corpus locations
- Configure dual CJS/ESM build output via tsup
- Write grammar skeleton: terminals (ID, STRING, INT, ML_COMMENT, SL_COMMENT, WS) + `RosettaModel` entry rule
- Run `langium-cli generate` to verify type generation pipeline
- Set up Vitest test harness with Langium test utilities
- Create `parse()` API stub
- **Checkpoint**: `npm run generate` produces `ast.ts` with `RosettaModel` interface. `parse("")` returns empty model.

### Phase 2: Expression Grammar (Proof of Concept) -- US1
**Goal**: Full expression subsystem ported and parsing correctly. This is the highest-risk phase.

- Port 10-level precedence chain from Xtext to Langium
- Handle "without left parameter" pattern (7 rules)
- Port all ~30 postfix operators in `UnaryOperation`
- Port functional operations (filter, extract, reduce, sort, min, max)
- Port control flow (if/then/else, switch, with-meta)
- Port literals, constructors, feature calls
- Resolve `<` ambiguity (doc string vs comparison) for LL(k)
- Write comprehensive expression parsing tests
- **Checkpoint**: All CDM expressions parse into typed AST nodes. `ast.ts` contains ~40 expression interfaces.

### Phase 3: Core Data Model Grammar -- US2
**Goal**: Data, Choice, Attribute, Enumeration, Function, Condition structures fully ported.

- Port `Data`, `Choice`, `ChoiceOption`, `Attribute` rules
- Port `Enumeration`, `RosettaEnumValue` rules
- Port `Function`, `ShortcutDeclaration`, `Condition`, `PostCondition`, `Operation` rules
- Port `TypeCall`, `TypeParameter`, `RosettaCardinality` rules
- Port `RosettaModel`, `Import`, namespace/scope rules
- Write cardinality and choice utility functions
- Implement `parse()` and `parseWorkspace()` APIs
- **Checkpoint**: CDM Data types, enums, and functions parse. Cross-references resolve. Public API works.

### Phase 4: Scoping & Validation -- US4
**Goal**: Custom scope provider resolves cross-references. Priority validation rules ported.

- Implement custom `ScopeProvider` for 21 EReference cases
- Port expression validator (22 rules)
- Port structural validators (15 rules)
- Port naming convention validators (12 rules)
- Port reporting validators (5 rules)
- Build validation parity report
- **Checkpoint**: 80% validation parity, zero false positives on CDM corpus.

### Phase 5: Full Grammar Coverage -- US5
**Goal**: Synonyms, reporting, annotations, external sources ported. 100% grammar surface.

- Port synonym system (~15 rules)
- Port annotation system (~5 rules)
- Port reporting/regulatory system (~10 rules)
- Port external annotation/rule sources (~8 rules)
- Port built-in types, library functions
- Implement serializer/formatter for round-trip
- CDM full corpus conformance test (100% parse rate)
- **Checkpoint**: Full CDM corpus parses and round-trips. `ast.ts` contains ~95 interfaces.

### Phase 6: Packaging & Release
**Goal**: Published package with documentation and CI.

- Finalize public API exports (`index.ts`)
- Write README with usage examples, API reference
- Configure CI (GitHub Actions): lint, test, generate, build, conformance
- Browser compatibility testing
- Web worker helper
- Performance benchmarks
- Publish to npm
- **Checkpoint**: `npm install @rune-langium/core` works. All tests pass in CI.
