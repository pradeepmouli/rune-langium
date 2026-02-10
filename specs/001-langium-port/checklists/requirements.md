# Requirements Checklist -- rune-langium

## DSL Fidelity & Validation

- [ ] **LANG-RT-001**: Langium grammar parses all valid `.rosetta` files accepted by Xtext
- [ ] **LANG-RT-002**: Langium AST round-trips to semantically equivalent `.rosetta` syntax
- [ ] **LANG-RT-003**: Cross-references resolve using `Reference<T>` with Xtext-equivalent scoping
- [ ] **LANG-VAL-001**: Validator covers 80%+ of 101 Xtext validation rules
- [ ] **LANG-VAL-002**: Zero false-positive diagnostics on valid CDM source files
- [ ] **LANG-PARSE-001**: Chevrotain error recovery produces partial ASTs for invalid input
- [ ] **LANG-PARSE-002**: All 60+ Xtext syntactic predicates handled in LL(k) grammar

## TypeScript Type Generation

- [ ] **LANG-TS-001**: `langium-cli` generates interfaces for all ~95 grammar rules
- [ ] **LANG-TS-002**: Discriminated union types with `$type` for all alternatives
- [ ] **LANG-TS-003**: Type guard functions generated (`isData()`, `isFunction()`, etc.)
- [ ] **LANG-TS-004**: Expression nodes as recursive typed tree (not opaque strings)
- [ ] **LANG-TS-005**: Cross-references use `Reference<T>` generic types

## API & Packaging

- [ ] **LANG-API-001**: `parse(source)` returns typed `ParseResult`
- [ ] **LANG-API-002**: `parseWorkspace(files)` handles multi-file models
- [ ] **LANG-API-003**: All generated AST types exported from single entry point
- [ ] **LANG-API-004**: Type guard functions exported for all AST node types
- [ ] **LANG-API-005**: Works in Node.js (>=18) and modern browsers (ES2020+)
- [ ] **LANG-API-006**: Zero runtime dependencies beyond `langium` and `chevrotain`

## Observability & Quality Gates

- [ ] **LANG-OBS-001**: Structured diagnostics with line/column, severity, message
- [ ] **LANG-OBS-002**: Validation parity report tracking Xtext rule coverage
- [ ] **LANG-OBS-003**: Grammar conformance test suite covering all constructs
- [ ] **LANG-OBS-004**: Automated performance benchmarks (parse time, memory)

## Upstream Corpus & Dependencies

- [ ] **LANG-CORPUS-001**: Test suite MUST load full CDM corpus from [finos/common-domain-model](https://github.com/finos/common-domain-model) for conformance testing
- [ ] **LANG-CORPUS-002**: Test suite MUST load Rune DSL built-in types from [finos/rune-dsl](https://github.com/finos/rune-dsl) for cross-reference resolution
- [ ] **LANG-CORPUS-003**: Test setup script (`scripts/setup-corpus.sh`) MUST clone/fetch both repositories at pinned version tags
- [ ] **LANG-CORPUS-004**: CI MUST run conformance tests against pinned CDM version tag
- [ ] **LANG-CORPUS-005**: Package MUST NOT depend on or bundle either repository at runtime

## Success Criteria

- [ ] **SC-001**: 100% CDM corpus parse rate
- [ ] **SC-002**: ~95 TypeScript interfaces in generated `ast.ts`
- [ ] **SC-003**: Zero opaque `string` expression representations
- [ ] **SC-004**: `parse()` and `parseWorkspace()` work in Node.js and browser
- [ ] **SC-005**: <200ms single file, <5s corpus parse latency
- [ ] **SC-006**: 80% validation parity
- [ ] **SC-007**: Package published to npm with complete type exports
