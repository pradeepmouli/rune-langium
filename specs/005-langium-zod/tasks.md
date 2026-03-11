# Tasks: Langium-to-Zod Schema Generator

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Branch**: `005-langium-zod`

## How to Read

Tasks are grouped by phase and user story. Each task has:
- **ID**: `P<phase>-T<n>`
- **Status**: `[ ]` pending, `[x]` done, `[-]` blocked
- **File**: primary file(s) created or modified

---

## Phase 1: Setup

### US-1 (Generate Zod schemas from Langium grammar)

- [ ] **P1-T1** Create package skeleton
  - `packages/langium-zod/package.json`
  - `packages/langium-zod/tsconfig.json`
  - `packages/langium-zod/README.md`

- [ ] **P1-T2** CLI scaffolding with commander
  - `packages/langium-zod/src/cli.ts`
  - Args: `--input`, `--output`, `--include`, `--exclude`, `--projection`

- [ ] **P1-T3** Programmatic API entry point
  - `packages/langium-zod/src/index.ts`
  - Exports: `generate(options): string`

- [ ] **P1-T4** Grammar reader — load `.langium` file or JSON
  - `packages/langium-zod/src/grammar-reader.ts`
  - Use Langium's `GrammarAST` to parse grammar
  - Return normalized rule list

- [ ] **P1-T5** Grammar reader tests
  - `packages/langium-zod/test/grammar-reader.test.ts`
  - Test loading simple Hello World grammar
  - Test loading Rune DSL grammar

---

## Phase 2: Core Generator

### US-1 (Generate Zod schemas from Langium grammar)

- [ ] **P2-T1** Type analyzer — build rule dependency graph
  - `packages/langium-zod/src/type-analyzer.ts`
  - Extract rules, categorize (parser, terminal, datatype, fragment)
  - Build adjacency list of rule references

- [ ] **P2-T2** Type analyzer — cycle detection (Tarjan's SCC)
  - `packages/langium-zod/src/type-analyzer.ts`
  - Detect strongly connected components
  - Mark cyclic rules for `z.lazy()` treatment

- [ ] **P2-T3** Type analyzer tests
  - `packages/langium-zod/test/type-analyzer.test.ts`
  - Test acyclic graph ordering
  - Test cycle detection on circular grammar
  - Test fragment inlining

- [ ] **P2-T4** Schema emitter — terminal mapping
  - `packages/langium-zod/src/schema-emitter.ts`
  - `ID → z.string()`, `INT → z.number().int()`, `STRING → z.string()`
  - `NUMBER → z.number()`, `BOOLEAN → z.boolean()`

- [ ] **P2-T5** Schema emitter — operator + cardinality mapping
  - `packages/langium-zod/src/schema-emitter.ts`
  - `= → required`, `+= → z.array()`, `?= → z.boolean()`
  - `* → z.array()`, `+ → z.array().min(1)`, `? → .optional()`

- [ ] **P2-T6** Schema emitter — cross-reference mapping
  - `packages/langium-zod/src/schema-emitter.ts`
  - `[Type] → z.string()` (reference by name)

- [ ] **P2-T7** Schema emitter — basic `z.object()` output
  - `packages/langium-zod/src/schema-emitter.ts`
  - Emit complete `z.object({...})` for each parser rule
  - Include `$type` discriminator literal

- [ ] **P2-T8** Schema emitter tests (basics)
  - `packages/langium-zod/test/schema-emitter.test.ts`
  - Test terminal mapping
  - Test operator/cardinality combinations
  - Test cross-reference emission
  - Test full object emission for simple rule

---

## Phase 3: Advanced Features

### US-1 (Generate Zod schemas from Langium grammar)

- [ ] **P3-T1** Circular reference handling with `z.lazy()`
  - `packages/langium-zod/src/schema-emitter.ts`
  - Consume cycle information from type analyzer
  - Emit `z.lazy(() => ...)` for back-edges

- [ ] **P3-T2** Discriminated unions
  - `packages/langium-zod/src/schema-emitter.ts`
  - Interface rules with alternatives → `z.discriminatedUnion('$type', [...])`
  - Simple alternatives → `z.union([...])`

- [ ] **P3-T3** Fragment rule inlining
  - `packages/langium-zod/src/schema-emitter.ts`
  - Spread fragment fields into parent rule's `z.object()`

- [ ] **P3-T4** Import and header generation
  - `packages/langium-zod/src/schema-emitter.ts`
  - Generate `import { z } from 'zod'` header
  - Topological sort for declaration order
  - Generate `export type` aliases from `z.infer<>`

- [ ] **P3-T5** Advanced emitter tests
  - `packages/langium-zod/test/schema-emitter.test.ts`
  - Test z.lazy() for circular refs
  - Test discriminated union emission
  - Test fragment inlining
  - Test topological sort output order

---

## Phase 4: Projections & Conformance

### US-3 (Selective schema generation)

- [ ] **P4-T1** Rule filter — `--include`/`--exclude` patterns
  - `packages/langium-zod/src/projection.ts`
  - Glob-match rule names against patterns
  - Transitively include referenced rules

- [ ] **P4-T2** Form-surface projection mode
  - `packages/langium-zod/src/projection.ts`
  - `--projection form-surface` — emit flat schemas with only user-editable fields
  - Strip computed fields, internal references

### US-2 (Conformance testing)

- [ ] **P4-T3** Conformance check code generator
  - `packages/langium-zod/src/conformance.ts`
  - Generate `type _Check = z.infer<typeof XSchema> extends X ? true : never`
  - Output as `.test.ts` file or inline assertions

- [ ] **P4-T4** Projection and conformance tests
  - `packages/langium-zod/test/projection.test.ts`
  - Test include/exclude filtering
  - Test form-surface projection
  - Test conformance type assertion generation

---

## Phase 5: Integration Testing

### US-4 (Form-surface from Rune DSL)

- [ ] **P5-T1** Rune DSL integration test
  - `packages/langium-zod/test/rune-dsl-integration.test.ts`
  - Generate schemas from Rune DSL grammar
  - Validate against CDM corpus fixture files
  - Assert conformance with `packages/core` AST types

- [ ] **P5-T2** Determinism test
  - `packages/langium-zod/test/rune-dsl-integration.test.ts`
  - Run generation twice, diff outputs
  - Assert zero differences

- [ ] **P5-T3** Performance benchmark
  - `packages/langium-zod/test/rune-dsl-integration.test.ts`
  - Measure generation time for Rune DSL grammar
  - Assert < 2 seconds

- [ ] **P5-T4** Generated code quality
  - `packages/langium-zod/test/rune-dsl-integration.test.ts`
  - Run oxlint on generated file
  - Run TypeScript type-check on generated file

- [ ] **P5-T5** CLI end-to-end test
  - `packages/langium-zod/test/cli-e2e.test.ts`
  - Invoke CLI with Rune DSL grammar input
  - Assert output file written with expected structure
  - Test `--include`, `--exclude`, `--projection` flags

---

## Summary

| Phase | Task Count | Stories Covered |
|-------|-----------|-----------------|
| P1: Setup | 5 | US-1 |
| P2: Core Generator | 8 | US-1 |
| P3: Advanced Features | 5 | US-1 |
| P4: Projections & Conformance | 4 | US-2, US-3 |
| P5: Integration Testing | 5 | US-4 |
| **Total** | **27** | |
