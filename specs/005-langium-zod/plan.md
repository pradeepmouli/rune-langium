# Implementation Plan: Langium-to-Zod Schema Generator

**Branch**: `005-langium-zod` | **Date**: 2026-02-18 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/005-langium-zod/spec.md`

## Summary

Build a code generation utility (`@rune-langium/langium-zod`) that reads a Langium grammar and produces Zod v4 schemas for the generated AST types. The tool handles Langium-specific constructs (cross-references, cardinality, discriminated unions, circular references) that generic TS-to-Zod tools cannot. Delivered as a CLI + library, usable as a build step alongside `langium generate`.

## Technical Context

**Language/Version**: TypeScript 5.9+ (strict mode, ESM)
**Primary Dependencies**:
- `langium` 4.x (grammar parsing, GrammarAST types)
- `zod` 4.x (output target)
- `commander` 13.x (CLI)
**Testing**: Vitest
**Build**: tsgo
**Target Platform**: Node.js 20+

## Constitution Check

| Principle | Status | Implementation |
|-----------|--------|----------------|
| **I. DSL Fidelity** | PASS | Reads Langium grammar directly — the single source of truth for AST structure. |
| **II. Deterministic Fixtures** | PASS | Tests use the Rune DSL grammar vendored in the repo. |
| **III. Validation Parity** | PASS | Generated schemas match Langium's type system; conformance checks enforce parity. |
| **IV. Performance** | PASS | Generation is a build-time CLI step, not runtime. Target <2s. |
| **V. Reversibility** | PASS | Generated files are gitignored; regeneration is idempotent. |

**Gate result**: PASS

## Project Structure

```text
packages/langium-zod/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts              # Library entry (programmatic API)
│   ├── cli.ts                # CLI entry (commander)
│   ├── grammar-reader.ts     # Load .langium or grammar.json
│   ├── type-analyzer.ts      # Analyze rules, build dependency graph, detect cycles
│   ├── schema-emitter.ts     # Emit Zod schema TypeScript code
│   ├── projection.ts         # Form-surface projection config
│   └── conformance.ts        # Conformance check code generator
└── test/
    ├── grammar-reader.test.ts
    ├── type-analyzer.test.ts
    ├── schema-emitter.test.ts
    ├── rune-dsl-integration.test.ts
    └── fixtures/
        ├── hello-world.langium
        └── circular.langium
```

## Phases

### Phase 0: Research (Complete)

Research documented in [research.md](research.md).

### Phase 1: Setup

- Package skeleton, tsconfig, dependencies
- CLI scaffolding with commander
- Grammar reader (JSON and .langium input)

### Phase 2: Core Generator

- Type analyzer: rule dependency graph, cycle detection (Tarjan's)
- Schema emitter: grammar rules → Zod `z.object()` code
- Terminal mapping: `ID → z.string()`, `INT → z.number().int()`, etc.
- Operator mapping: `= → required`, `+= → array`, `?= → boolean`
- Cross-reference mapping: `[Type] → z.string()`
- Cardinality: `* → z.array()`, `+ → z.array().min(1)`, `? → .optional()`

### Phase 3: Advanced Features

- Circular reference handling: `z.lazy()`
- Discriminated unions: `z.discriminatedUnion('$type', [...])`
- Union alternatives: `z.union([A, B, C])`
- Fragment rule inlining

### Phase 4: Projections & Conformance

- Projection config: `--include`, `--exclude`, `--projection`
- Conformance check generator: `z.infer` type assertions
- Form-surface projection mode

### Phase 5: Integration Testing

- Run against Rune DSL grammar, validate against CDM corpus
- Benchmark generation speed
- Verify deterministic output (no diff on regeneration)
- Lint generated code with oxlint

## Dependencies

- **Upstream**: `@rune-langium/core` (grammar source, AST types for conformance)
- **Downstream**: `@rune-langium/visual-editor` (form-surface schemas), any Langium project

## Risks

| Risk | Mitigation |
|------|------------|
| Langium grammar AST API may change in v5 | Pin langium version; abstract grammar access behind reader interface |
| Complex grammars with deeply nested alternatives | Start with Rune DSL grammar; expand coverage iteratively |
| Performance with large grammars | Profile and optimize; generation is offline, 2s target is generous |
| Zod v4/v5 API changes | Emit via string templates; template is the only Zod-coupled layer |
