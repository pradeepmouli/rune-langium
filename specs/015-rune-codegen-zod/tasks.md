# Tasks: Rune-Langium Native Code Generators

**Feature**: `015-rune-codegen-zod`
**Branch**: `015-rune-codegen-zod`
**Input**: spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md

Format: `- [ ] Txxx [P?] [USx?] Description with file path(s)`
`[P]` = parallelisable (different files, no pending dependency).
`[USn]` = belongs to User Story *n* (user-story phase tasks only).

Constitution tie-in: Principle II (Deterministic Fixtures) — every Tier 1 test
runs against committed fixture pairs; CDM smoke uses `tsc --noEmit` not a committed
snapshot. Principle V (Reversibility) — package rename is atomic within this
change set; `pnpm -r run type-check` must pass before Phase 2 begins.

---

## Phase 1 — Setup (Package Rename + Consumer Re-wire)

**Purpose**: Rename `packages/codegen` → `packages/codegen-legacy`, update its
`package.json`, and re-wire every downstream consumer. This is a hard prerequisite
for Phase 2: the new package cannot take the `packages/codegen` directory until the
old one vacates it. No new functionality; pure structural change.

**Gate**: `pnpm install && pnpm -r run type-check` must pass cleanly before Phase 2
begins. `grep -r '"@rune-langium/codegen"' apps/ packages/ --include="*.ts"
--include="*.tsx" --include="*.json" | grep -v codegen-legacy | grep -v
codegen-worker | grep -v codegen-container` must produce zero output.

### 1a. Rename the package directory and identity

- [X] T001 Rename `packages/codegen/` to `packages/codegen-legacy/` on disk (the pnpm workspace glob `packages/*` still matches)
- [X] T002 Update `packages/codegen-legacy/package.json`: set `"name": "@rune-langium/codegen-legacy"`, add `"deprecated"` field: `"This package bridges the legacy JVM/Rosetta codegen. Use @rune-langium/codegen for the Langium-native generator."`

### 1b. Re-wire apps/codegen-container

- [X] T003 Update `apps/codegen-container/package.json`: change `dependencies["@rune-langium/codegen"]` → `"@rune-langium/codegen-legacy": "workspace:*"`
- [X] T004 [P] Update `apps/codegen-container/src/server.ts`: rewrite every `from '@rune-langium/codegen'` import to `'@rune-langium/codegen-legacy'` (and `/node` subpath accordingly)
- [X] T005 [P] Update `apps/codegen-container/test/server.test.ts`: rewrite every `from '@rune-langium/codegen'` import to `'@rune-langium/codegen-legacy'`

### 1c. Re-wire packages/cli

- [X] T006 Update `packages/cli/package.json`: change `dependencies["@rune-langium/codegen"]` → `"@rune-langium/codegen-legacy": "workspace:*"`
- [X] T007 [P] Update `packages/cli/src/generate.ts`: rewrite `from '@rune-langium/codegen/node'` → `'@rune-langium/codegen-legacy/node'` and `from '@rune-langium/codegen'` → `'@rune-langium/codegen-legacy'`
- [X] T008 [P] Update `packages/cli/src/types/codegen-types.ts`: rewrite all imports from `'@rune-langium/codegen'` → `'@rune-langium/codegen-legacy'`

### 1d. Re-wire apps/studio

- [X] T009 Update `apps/studio/package.json`: change `dependencies["@rune-langium/codegen"]` → `"@rune-langium/codegen-legacy": "workspace:*"`
- [X] T010 [P] Update `apps/studio/src/services/codegen-service.ts`: rewrite all imports from `'@rune-langium/codegen'` → `'@rune-langium/codegen-legacy'`
- [X] T011 [P] Update `apps/studio/src/components/ExportDialog.tsx`: rewrite all imports from `'@rune-langium/codegen'` → `'@rune-langium/codegen-legacy'`

### 1e. Verification gate

- [X] T012 Run `pnpm install` to update workspace symlinks after the rename
- [X] T013 Run `pnpm -r run type-check` and confirm exit 0 — this is the Phase 1 gate; no Phase 2 work begins until this is green
- [X] T014 Run the stale-import grep from `contracts/package-rename.md §Post-rename verification` and confirm zero output

**Checkpoint**: `pnpm -r run type-check` exit 0; no remaining imports of `@rune-langium/codegen` (bare, without `-legacy` suffix) in any source file.

---

## Phase 2 — Foundational (New packages/codegen Scaffold)

**Purpose**: Create the new `packages/codegen` package with its type system, shared
infrastructure (cycle detector, topological sort, emission context, runtime helpers,
diagnostics), and the Tier 1 fixture test harness skeleton. This phase establishes
everything Phases 3–8 build upon.

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

### 2a. Package scaffolding

- [X] T015 Create `packages/codegen/package.json` per `contracts/generator-api.md §Package metadata`: `name: @rune-langium/codegen`, `version: 0.1.0`, `license: MIT`, `type: module`, exports map with `"."` → `dist/index.{d.ts,js}`, deps on `@rune-langium/core` and `langium@^4.2.0`; add `bin: { "rune-codegen": "./dist/bin/rune-codegen.js" }`; devDeps: `zod@^4.3.6`, `vitest@^4.x`, `typescript@^5.9.x`
- [X] T016 [P] Create `packages/codegen/tsconfig.json`: strict mode, ESM, `moduleResolution: bundler`, `outDir: dist`, `rootDir: src`; add `packages/codegen/tsconfig.smoke.json` referencing a temp dir for the CDM smoke runner
- [X] T017 [P] Add `// SPDX-License-Identifier: MIT` header convention note in `packages/codegen/src/` — all new source files in this package use the MIT SPDX header

### 2b. Shared types (data model entities)

- [X] T018 Create `packages/codegen/src/types.ts` with exported interfaces: `GeneratorOutput` (relativePath, content, sourceMap, diagnostics), `GeneratorOptions` (target, strict, headerComment), `Target` union (`'zod' | 'json-schema' | 'typescript'`), `SourceMapEntry` (outputLine, sourceUri, sourceLine, sourceChar), `GeneratorDiagnostic` (severity, message, code, sourceUri?, line?, char?); add `GeneratorError extends Error` class with `.diagnostics` field
- [X] T019 [P] Create `packages/codegen/src/helpers.ts`: export `RUNTIME_HELPER_SOURCE` constant string containing the three inlined helpers (`runeCheckOneOf`, `runeCount`, `runeAttrExists`) per `contracts/runtime-helpers.md §Inlined source text`
- [X] T020 [P] Create `packages/codegen/src/diagnostics.ts`: export `createDiagnostic(severity, code, message, opts?)` factory; export `hasFatalDiagnostics(diags: GeneratorDiagnostic[]): boolean`

### 2c. Type-reference graph and topological infrastructure

- [X] T021 Create `packages/codegen/src/cycle-detector.ts`: implement `buildTypeReferenceGraph(docs: LangiumDocument[]): TypeReferenceGraph` scanning all `Data` and `Attribute` nodes (including `extends` edges); implement `findCyclicTypes(graph): Set<string>` via Tarjan SCC (internal `TypeReferenceGraph` interface with `nodes: string[]` and `edges: Map<string, string[]>`)
- [X] T022 Create `packages/codegen/src/topo-sort.ts`: implement `topoSort(graph: TypeReferenceGraph, cyclicTypes: Set<string>): string[]` via Kahn's algorithm over the SCC-condensation DAG; types within an SCC are ordered by document source position; output is deterministic for identical input

### 2d. Public API entry point

- [X] T023 Create `packages/codegen/src/generator.ts`: implement top-level orchestrator `runGenerate(docs: LangiumDocument[], options: GeneratorOptions): GeneratorOutput[]` — groups docs by namespace, calls cycle-detector, topo-sort, then dispatches to the selected emitter; handles `options.strict` (throw `GeneratorError` on any fatal diagnostic); returns outputs sorted by `relativePath` ascending
- [X] T024 Create `packages/codegen/src/index.ts`: re-export `generate` (wraps `runGenerate`, normalises `documents` to array), all public types from `types.ts`, `GeneratorError`; this is the sole public API surface per `contracts/generator-api.md §Public exports`

### 2e. Fixture test harness skeleton

- [X] T025 Create `packages/codegen/test/fixtures/` directory tree with placeholder directories: `basic-types/`, `cardinality/`, `enums/`, `inheritance/`, `conditions-simple/`, `conditions-complex/`, `circular/`, `reserved-words/`, `meta-types/`, `key-refs/` — each with a `.gitkeep` so the tree is committed
- [X] T026 [P] Create `packages/codegen/test/fixture.test.ts`: implement the Tier 1 harness — `runFixtureTests(dir)` that for each fixture directory: parses `input.rune` via `createRuneServices()`, calls `generate(doc, { target: 'zod' })`, and asserts byte-identical equality with `expected.zod.ts`; exports `describeFixture(name, dir)` used by per-story test suites
- [X] T027 [P] Create `packages/codegen/test/cdm-smoke.test.ts` skeleton: import `generate`, set up temp dir, define the `tsc --noEmit` subprocess runner, define the JSON battery runner; mark all tests as `.todo` until Phase 3 unlocks them

**Checkpoint**: `pnpm --filter @rune-langium/codegen build` succeeds (no source yet for emitters, but scaffolding compiles); `pnpm --filter @rune-langium/codegen test` exits 0 (harness has no tests to run yet).

---

## Phase 3 — User Story 1: Structural Zod Schemas (Priority: P1) — MVP

**Goal**: Rune AST → emitted `*.zod.ts` with correct cardinality, enums,
inheritance chains, cycles, and reserved-word handling. CLI `rune-codegen`
command. Tier 1 fixture-diff tests passing.

**Independent Test**: Clone repo, write a Rune model with 5 cardinality forms + an
enum + one `extends` + a cycle, run `pnpm rune-codegen input.rune -o out/`,
`tsc --noEmit` the output, call `PartySchema.parse(json)` for valid and invalid
payloads. No conditions, no Studio, no other targets required (per spec §US1
Independent Test).

### 3a. RED tests for US1 (write first, ensure they fail)

- [ ] T028 [P] [US1] Create `packages/codegen/test/fixtures/basic-types/input.rune` with scalar attributes (string, int, date, boolean) and an empty type; create `packages/codegen/test/fixtures/basic-types/expected.zod.ts` (committed expected output); write failing test in `packages/codegen/test/us1-structural.test.ts` asserting byte-identical match
- [ ] T029 [P] [US1] Create `packages/codegen/test/fixtures/cardinality/input.rune` covering all five cardinality forms `(1..1)`, `(0..1)`, `(0..*)`, `(1..*)`, `(2..5)` and `(3..3)`; create `packages/codegen/test/fixtures/cardinality/expected.zod.ts`; write failing test in `packages/codegen/test/us1-structural.test.ts`
- [ ] T030 [P] [US1] Create `packages/codegen/test/fixtures/enums/input.rune` covering enum without displayName, enum with displayName strings (including a string containing `"`), and a reserved-word enum member; create `packages/codegen/test/fixtures/enums/expected.zod.ts`; write failing test
- [ ] T031 [P] [US1] Create `packages/codegen/test/fixtures/inheritance/input.rune` with single-level `extends`, a three-level chain, and a sibling type; create `packages/codegen/test/fixtures/inheritance/expected.zod.ts` asserting `ParentSchema.extend({...})`; write failing test
- [ ] T032 [P] [US1] Create `packages/codegen/test/fixtures/circular/input.rune` with mutual cycle A→B→A and a self-reference `Foo (0..1)` on `Foo`; create `packages/codegen/test/fixtures/circular/expected.zod.ts` with `z.lazy(() => ...)` on the cycle-trigger type; write failing test
- [ ] T033 [P] [US1] Create `packages/codegen/test/fixtures/reserved-words/input.rune` with attributes named `class`, `default`, `enum`, `function`; create `packages/codegen/test/fixtures/reserved-words/expected.zod.ts` with quoted/renamed property keys; write failing test

### 3b. Zod emitter implementation

- [ ] T034 [US1] Create `packages/codegen/src/emit/zod-emitter.ts`: implement `emitNamespace(docs, emissionCtx): GeneratorOutput` using Langium's `expandToNode` / `joinToNode` / `toStringAndTrace` from `langium/generate`; build `EmissionContext` (internal type per data-model §6) from topo-sort + cycle-detector results
- [ ] T035 [US1] Implement `emitTypeSchema(data: Data, ctx: EmissionContext): Generated` in `packages/codegen/src/emit/zod-emitter.ts`: emit `z.object({...})` for non-extending types; emit `<ParentSchema>.extend({...})` for extending types (FR-005); wrap in `z.lazy(() => ...)` for types in `ctx.lazyTypes` (FR-006); emit `z.object({})` for empty types (FR-008)
- [ ] T036 [US1] Implement `emitAttribute(attr: Attribute, ctx: EmissionContext): string` in `packages/codegen/src/emit/zod-emitter.ts`: map Rune scalar types to Zod primitives (`string`, `number`/`int`, `date`, `boolean`, `time`, `dateTime`); encode all six cardinality forms per `contracts/generator-api.md §Cardinality encoding` (FR-003); quote reserved-word property keys (FR-009)
- [ ] T037 [US1] Implement `emitEnum(enumNode: Enumeration, ctx: EmissionContext): Generated` in `packages/codegen/src/emit/zod-emitter.ts`: emit `z.enum([...])` with member names; emit sibling `Record<EnumType, string>` display-name map when any member has a `displayName`; escape `"` and `\` in display-name strings (FR-004)
- [ ] T038 [US1] Implement `emitFileHeader(ctx: EmissionContext): string` in `packages/codegen/src/emit/zod-emitter.ts`: emit the `// generated by rune-codegen` comment, SPDX header, `import { z } from 'zod'`, cross-namespace imports resolved from the type-reference graph, then `RUNTIME_HELPER_SOURCE` from `helpers.ts`; deterministic import order (alphabetic by `relativePath`)
- [ ] T039 [US1] Implement `emitTypeAlias(data: Data): string` in `packages/codegen/src/emit/zod-emitter.ts`: emit `export type <TypeName> = z.infer<typeof <TypeName>Schema>` for every type (FR-002)
- [ ] T040 [US1] Wire the Zod emitter into `packages/codegen/src/generator.ts`: when `options.target === 'zod'` (or undefined), call `zod-emitter.emitNamespace`; build `relativePath` as `<namespace/path>.zod.ts` following the Rune package hierarchy

### 3c. CLI entry point

- [ ] T041 [US1] Create `packages/codegen/bin/rune-codegen.ts`: implement the CLI per `contracts/cli.md` — accept `<input...>`, `--target`, `--output`, `--strict`, `--json`, `--watch`, `--version`, `--help`; use `createRuneServices()` from `@rune-langium/core` to parse `.rune` files; call `generate()`; write outputs to `--output` directory; print human-readable progress to stdout (file names written), errors/warnings to stderr; exit codes 0/1/2 per contract
- [ ] T042 [US1] Implement `--watch` mode in `packages/codegen/bin/rune-codegen.ts`: use Node.js `fs.watch` on the input path; debounce changes, re-generate on each event; print `[timestamp] change detected: file.rune` to stdout; SIGINT exits cleanly; last-successful output NOT overwritten on error
- [ ] T043 [US1] Implement `--json` output mode in `packages/codegen/bin/rune-codegen.ts`: emit JSON per `contracts/cli.md §JSON mode` with fields `target`, `durationMs`, `files`, `diagnostics`, `success`

### 3d. Turn fixtures GREEN and CDM smoke skeleton

- [ ] T044 [US1] Run `pnpm --filter @rune-langium/codegen test us1-structural` and iterate until all six fixture-diff tests (T028–T033) pass with byte-identical output; commit the `expected.zod.ts` files as the canonical committed fixture outputs
- [ ] T045 [US1] Create `packages/codegen/test/fixtures/basic-types/cases.json` with at least one valid JSON case and zero-invalid (no conditions yet); wire into `fixture.test.ts` harness for future JSON battery runs
- [ ] T046 [US1] Activate the `cdm-smoke.test.ts` Zod-target section: call `generate(cdmDocuments, { target: 'zod' })`, write to temp dir, run `tsc --project tsconfig.smoke.json --noEmit`, assert exit 0 (FR-023); mark the JSON battery sub-tests as `.todo` until Phase 4

**Independent Test Checkpoint**: Run `pnpm rune-codegen packages/curated-schema/fixtures/cdm/ -o /tmp/cdm-out/` then `tsc --noEmit` over `/tmp/cdm-out/` — zero errors (SC-002). All six US1 fixture-diff tests pass with byte-identical output.

**Checkpoint**: Six Tier 1 fixture tests green; CDM Zod `tsc --noEmit` passes; `pnpm rune-codegen --help` prints usage; `pnpm rune-codegen /tmp/hello.rune -o /tmp/out/` succeeds per quickstart §2.

---

## Phase 4 — User Story 2: Constraint Conditions as Runtime Validation (Priority: P2)

**Goal**: Rune `condition` blocks using `one-of`, `choice`, `exists`, `is absent`,
and `only exists` → `.superRefine()` predicates with diagnostic messages naming the
condition. Multiple conditions on one type merge into a single `.superRefine()` call.

**Independent Test**: Rune model with `type UnitType: a (0..1), b (0..1), c (0..1),
condition OneOf: one-of [a, b, c]` → generate → exercise with zero-present (reject),
one-present (accept), two-present (reject); each rejection message includes type name
and constraint kind (per spec §US2 Independent Test).

### 4a. RED tests for US2 (write first, ensure they fail)

- [ ] T047 [P] [US2] Create `packages/codegen/test/fixtures/conditions-simple/one-of/input.rune` with a `one-of` condition over three optional attributes; create `packages/codegen/test/fixtures/conditions-simple/one-of/expected.zod.ts` with a `.superRefine()` using `runeCheckOneOf`; create `cases.json` with zero/one/two-present JSON cases; write failing test in `packages/codegen/test/us2-conditions.test.ts`
- [ ] T048 [P] [US2] Create `packages/codegen/test/fixtures/conditions-simple/choice/input.rune` with a `choice` condition; create `expected.zod.ts` and `cases.json` (valid = exactly one, invalid = zero or two); write failing test in `packages/codegen/test/us2-conditions.test.ts`
- [ ] T049 [P] [US2] Create `packages/codegen/test/fixtures/conditions-simple/exists-absent/input.rune` covering `attr exists` and `attr is absent` on two separate types; create `expected.zod.ts` and `cases.json` (null, undefined, missing, empty-array all count as absent); write failing test
- [ ] T050 [P] [US2] Create `packages/codegen/test/fixtures/conditions-simple/only-exists/input.rune` with an `only exists` condition over `[a, b]` on a type that also has `c`; create `expected.zod.ts` and `cases.json` (reject when `c` is set alongside `a` and `b`); write failing test
- [ ] T051 [P] [US2] Create `packages/codegen/test/fixtures/conditions-simple/multi-condition/input.rune` with a type bearing three separate named conditions; create `expected.zod.ts` asserting exactly ONE `.superRefine()` call (FR-011) with all three predicates combined; write failing test

### 4b. Condition emitter implementation

- [ ] T052 [US2] Create `packages/codegen/src/expr/transpiler.ts`: implement `ExpressionTranspilerContext` interface (selfName, emitMode, conditionName, typeName, attributeTypes per data-model §7); implement `transpileCondition(cond: Condition, ctx): string` dispatcher that routes `one-of`, `choice`, `exists`, `is absent`, `only exists` to dedicated builders
- [ ] T053 [US2] Implement `emitOneOf(attrs: string[], ctx): string` in `packages/codegen/src/expr/transpiler.ts`: emit `if (!runeCheckOneOf([val.a, val.b, val.c])) ctx.addIssue({...})` with error message naming `ctx.conditionName` and `ctx.typeName`; parallel `choice` implementation uses same helper
- [ ] T054 [US2] Implement `emitExists(attrName: string, ctx): string` and `emitIsAbsent(attrName, ctx): string` and `emitOnlyExists(attrNames: string[], ctx): string` in `packages/codegen/src/expr/transpiler.ts` using `runeAttrExists`; validate that `attrName` is in `ctx.attributeTypes` — emit `GeneratorDiagnostic { code: 'unknown-attribute', severity: 'error' }` and a `/* DIAGNOSTIC */` placeholder if not (FR-025)
- [ ] T055 [US2] Implement `emitConditionBlock(conditions: Condition[], ctx: EmissionContext): string` in `packages/codegen/src/emit/zod-emitter.ts`: when a type has 1 condition, emit `.refine()`; when ≥ 2, emit a single `.superRefine()` combining all predicates in a single closure (FR-010, FR-011); include `RUNTIME_HELPER_SOURCE` in the file header when any condition is present
- [ ] T056 [US2] Wire condition emission into `emitTypeSchema()` in `packages/codegen/src/emit/zod-emitter.ts`: after emitting the object/extend body, call `emitConditionBlock()` for every `Data` node that has conditions

### 4c. Turn US2 fixtures GREEN

- [ ] T057 [US2] Run `pnpm --filter @rune-langium/codegen test us2-conditions` and iterate until all five fixture-diff tests (T047–T051) pass byte-identically; commit `expected.zod.ts` files; verify JSON battery cases (zero/one/two-present) via `fixture.test.ts` harness

**Independent Test Checkpoint**: Run `pnpm rune-codegen /tmp/hello-cond.rune -o /tmp/out/` per quickstart §3; run the behavioral Node.js script; all assertions pass (`valid`, `zeroPresent`, `twoPresent`, error message contains `OneOf`).

**Checkpoint**: Five US2 fixture tests green (byte-identical); JSON battery cases pass; FR-011 (single `.superRefine()` per type) verified by `multi-condition` fixture.

---

## Phase 5 — User Story 3: Full Expression Language Transpiler (Priority: P2)

**Goal**: All Rune expression forms (literals, navigation, existence, arithmetic,
comparison, boolean, contains, disjoint, count, aggregations, higher-order, conditional)
transpile to JavaScript predicates with Python-parity semantics (SC-003 ≥99%).

**Independent Test**: For each expression category a fixture pair (`.rune`, `expected.zod.ts`,
`cases.json`) exists; generator output compiles, accepts valid-JSON cases, rejects
invalid-JSON cases with messages naming the condition (per spec §US3 Independent Test).

### 5a. RED tests for US3 (write first, ensure they fail)

- [ ] T058 [P] [US3] Create fixture `packages/codegen/test/fixtures/conditions-complex/literals/` with `input.rune` containing conditions using string/int/boolean/date literals; create `expected.zod.ts` and `cases.json`; write failing test in `packages/codegen/test/us3-expressions.test.ts`
- [ ] T059 [P] [US3] Create fixture `packages/codegen/test/fixtures/conditions-complex/navigation/` with `input.rune` using `a -> b -> c` path navigation where any link may be absent; create `expected.zod.ts` using optional chaining; create `cases.json`; write failing test
- [ ] T060 [P] [US3] Create fixture `packages/codegen/test/fixtures/conditions-complex/arithmetic/` with `input.rune` using `+`, `-`, `*`, `/`, `=`, `<>`, `<`, `<=`, `>`, `>=`; create `expected.zod.ts` and `cases.json`; write failing test
- [ ] T061 [P] [US3] Create fixture `packages/codegen/test/fixtures/conditions-complex/boolean/` with `input.rune` using `and`, `or`; create `expected.zod.ts` and `cases.json`; write failing test
- [ ] T062 [P] [US3] Create fixture `packages/codegen/test/fixtures/conditions-complex/set-ops/` with `input.rune` using `contains` and `disjoint` between two array attributes; create `expected.zod.ts` and `cases.json` covering no-overlap/partial-overlap/identical; write failing test
- [ ] T063 [P] [US3] Create fixture `packages/codegen/test/fixtures/conditions-complex/aggregations/` with `input.rune` using `count`, `sum`, `min`, `max`, `sort`, `distinct`, `first`, `last`, `flatten`, `reverse`; create `expected.zod.ts` and `cases.json`; write failing test
- [ ] T064 [P] [US3] Create fixture `packages/codegen/test/fixtures/conditions-complex/higher-order/` with `input.rune` using `filter` and `map`; create `expected.zod.ts` and `cases.json`; write failing test
- [ ] T065 [P] [US3] Create fixture `packages/codegen/test/fixtures/conditions-complex/conditional/` with `input.rune` using `if X = Enum -> Member then Y exists`; create `expected.zod.ts` with `.superRefine()` containing an `if`-guard; create `cases.json`; write failing test
- [ ] T066 [P] [US3] Create `packages/codegen/test/parity-matrix.test.ts` with the Python-parity test matrix (200-case condition-fidelity battery): for each of the 8 condition kinds (one-of, choice, exists, only-exists, path-nav, arithmetic, if-then-else, disjoint), record expected boolean outcomes against hand-crafted JSON payloads; mark as `.todo` until transpiler is complete (SC-003)

### 5b. Expression transpiler implementation

- [ ] T067 [US3] Implement `transpileLiteral(expr, ctx): string` in `packages/codegen/src/expr/transpiler.ts`: handle `StringLiteral`, `IntLiteral`, `BoolLiteral`, `DateLiteral`; emit JS literal equivalents
- [ ] T068 [US3] Implement `transpileNavigation(expr, ctx): string` in `packages/codegen/src/expr/transpiler.ts`: walk `a -> b -> c` chains emitting `val?.a?.b?.c` optional chains (FR-013); handle null/undefined at every level without throwing
- [ ] T069 [US3] Implement `transpileArithmetic(expr, ctx): string` and `transpileComparison(expr, ctx): string` in `packages/codegen/src/expr/transpiler.ts`: emit JS operators for `+`, `-`, `*`, `/`, `=` (→ `===`), `<>` (→ `!==`), `<`, `<=`, `>`, `>=`
- [ ] T070 [US3] Implement `transpileBoolean(expr, ctx): string` in `packages/codegen/src/expr/transpiler.ts`: emit `&&` for `and`, `||` for `or`; handle parenthesization for precedence
- [ ] T071 [US3] Implement `transpileSetOps(expr, ctx): string` in `packages/codegen/src/expr/transpiler.ts`: emit `someArray.includes(x)` for `contains`; emit `!leftArray.some(v => rightArray.includes(v))` for `disjoint`
- [ ] T072 [US3] Implement aggregation transpilation in `packages/codegen/src/expr/transpiler.ts`: `count` → `runeCount(arr)`, `sum` → `arr?.reduce((a,b) => a + b, 0) ?? 0`, `min`/`max` → `Math.min/max(...arr ?? [])`, `sort` → `[...arr ?? []].sort()`, `distinct` → `[...new Set(arr ?? [])]`, `first` → `(arr ?? [])[0]`, `last` → `(arr ?? []).at(-1)`, `flatten` → `(arr ?? []).flat()`, `reverse` → `[...arr ?? []].reverse()`; each handles null/undefined gracefully
- [ ] T073 [US3] Implement `transpileHigherOrder(expr, ctx): string` in `packages/codegen/src/expr/transpiler.ts`: emit `(arr ?? []).filter(item => ...)` for `filter`; emit `(arr ?? []).map(item => ...)` for `map`; recursively transpile the lambda body using a child `ExpressionTranspilerContext` with `selfName` set to the lambda parameter name
- [ ] T074 [US3] Implement `transpileConditional(expr, ctx): string` in `packages/codegen/src/expr/transpiler.ts`: emit `if (antecedent) { consequent }` — the antecedent uses optional chaining; consequent only fires when antecedent holds; matches spec §US3 Scenario 2 semantics
- [ ] T075 [US3] Implement `transpileExpression(expr, ctx): string` top-level dispatcher in `packages/codegen/src/expr/transpiler.ts` routing to all form handlers; verify all Rune expression node types from `@rune-langium/core` AST are handled (no uncovered branches)

### 5c. Turn US3 fixtures GREEN and enable parity matrix

- [ ] T076 [US3] Run `pnpm --filter @rune-langium/codegen test us3-expressions` and iterate until all eight fixture-diff tests (T058–T065) pass byte-identically; commit `expected.zod.ts` files
- [ ] T077 [US3] Enable and populate `parity-matrix.test.ts` (T066): for each condition kind, wire the emitted Zod predicate against the 200-case JSON battery; assert ≥99% parity with recorded Python outputs (SC-003)
- [ ] T078 [US3] Activate full CDM smoke Zod `tsc --noEmit` test in `packages/codegen/test/cdm-smoke.test.ts` and activate the JSON battery sub-tests per `research.md R8 §Tier 2b` — at least one valid + one invalid JSON case per condition kind; assert error message contains the condition name (FR-024)

**Independent Test Checkpoint**: All eight expression-category fixture-diff tests pass; parity matrix shows ≥99% parity; CDM Zod smoke passes `tsc --noEmit` with zero errors.

**Checkpoint**: 13 total US3 fixture tests green; parity matrix green; CDM smoke Zod target green; FR-012 (all expression forms) covered.

---

## Phase 6 — User Story 4: Studio Multi-Target Live Preview (Priority: P3)

**Goal**: `CodePreviewPanel` + `TargetSwitcher` on the Studio right-hand panel;
generation in the LSP worker; source-mapping click handler for Zod, JSON Schema,
and TypeScript targets; 500ms update budget; last-known-good retention on errors.

**Independent Test**: Open Studio against CDM fixture; type a character; right-hand
panel re-renders within 500ms; switch target dropdown → panel re-renders; click
a generated region → editor cursor navigates to originating Rune source line
(per spec §US4 Independent Test). Note: US4 depends on US3 (transpiler) for Zod
target, US5-A (JSON Schema) for that target, and US5-B (TypeScript class) for that
target. Implement US4 last so all targets are available.

### 6a. RED tests for US4 (write first, ensure they fail)

- [ ] T079 [P] [US4] Write failing component test at `apps/studio/src/components/__tests__/TargetSwitcher.test.tsx`: renders three buttons (Zod, JSON Schema, TypeScript); clicking each calls `onChange` with the correct `Target` value; default is "Zod"; uses `@rune-langium/design-system` primitives
- [ ] T080 [P] [US4] Write failing component test at `apps/studio/src/components/__tests__/CodePreviewPanel.test.tsx`: (a) shows "Generating..." status on initial mount; (b) renders content in read-only Monaco when a `codegen:result` message arrives; (c) shows amber "Outdated — fix errors to refresh" when `codegen:outdated` is received; (d) retains last-good content (does NOT blank) on `codegen:outdated`
- [ ] T081 [P] [US4] Write failing integration test at `apps/studio/src/components/__tests__/CodePreviewPanel-sourcemap.test.tsx`: simulate a `codegen:result` message with a non-empty `sourceMap`; simulate a Monaco `onMouseDown` event at a line that has a source-map entry; assert `revealLineInCenter` and `setSelection` are called on the source editor with the correct source location
- [ ] T082 [P] [US4] Write failing component test at `apps/studio/src/components/__tests__/CodePreviewPanel-targets.test.tsx`: switching `TargetSwitcher` from Zod → JSON Schema sends `{ type: 'codegen:generate', target: 'json-schema' }` to the LSP worker; panel re-renders with new content on `codegen:result` response

### 6b. Studio store and worker wiring

- [ ] T083 [US4] Add `codePreviewTarget: Target` field to the Studio's zustand workspace store in `apps/studio/src/store/workspace-store.ts` (or equivalent per `contracts/studio-preview.md §State location`); persist to IndexedDB via existing workspace persistence layer; default `'zod'`
- [ ] T084 [US4] Modify the LSP Worker entry file (`apps/studio/src/workers/lsp-worker.ts` or equivalent) to: (a) handle `codegen:generate` messages, (b) call `generate(builtDocuments, { target })` from `@rune-langium/codegen`, (c) postMessage `codegen:result` with `{ target, relativePath, content, sourceMap }`, (d) postMessage `codegen:outdated` when source has parser errors; add 200ms debounce on the generation call per `contracts/studio-preview.md §When generation runs`
- [ ] T085 [US4] Add the build-phase listener hook in the LSP Worker: after `DocumentBuilder.build()` succeeds, fire `generate()` for the current `codePreviewTarget` and post the result; lazy per-target: only generate the active target, not all three

### 6c. React components

- [ ] T086 [US4] Create `apps/studio/src/components/TargetSwitcher.tsx` (FSL-1.1-ALv2 SPDX header): segmented control with props `value: Target` and `onChange: (t: Target) => void`; labels "Zod" / "JSON Schema" / "TypeScript"; use `@rune-langium/design-system` primitives; accessible (keyboard-navigable)
- [ ] T087 [US4] Create `apps/studio/src/components/CodePreviewPanel.tsx` (FSL-1.1-ALv2 SPDX header): mounts a read-only Monaco editor instance; renders status bar (green "Generated (Zod)", amber "Outdated — fix errors to refresh", grey "Generating…", red "Preview unavailable — reload Studio") per `contracts/studio-preview.md §Status indicator`; listens for `codegen:result` and `codegen:outdated` worker messages; installs `onMouseDown` click-to-navigate handler referencing `sourceMap` entries per `contracts/studio-preview.md §Click-to-navigate handler`; retains last-rendered content on `codegen:outdated`
- [ ] T088 [US4] Register `CodePreviewPanel` in the Studio dockview layout in `apps/studio/src/shell/layout-factory.ts`: add it to the right-hand panel group alongside existing panels; ensure it receives the active document's editor reference for `revealLineInCenter` / `setSelection` navigation

### 6d. Turn US4 tests GREEN

- [ ] T089 [US4] Run `pnpm --filter @rune-langium/studio test` and iterate until the four US4 component/integration tests (T079–T082) pass; verify `TargetSwitcher` renders correctly and raises correct events; verify `CodePreviewPanel` status transitions match the state machine

**Independent Test Checkpoint**: Start Studio dev server; open a small Rune fixture; CodePreviewPanel renders Zod output within 500ms; switch to JSON Schema → panel re-renders; switch to TypeScript → panel re-renders; click a generated line → editor cursor moves to source location.

**Checkpoint**: Four US4 component tests green; `TargetSwitcher` renders and calls `onChange`; `CodePreviewPanel` handles all four status states; click-to-navigate fires correct Monaco calls.

---

## Phase 7 — User Story 5A: JSON Schema 2020-12 Target (Priority: P3)

**Goal**: `--target json-schema` emits `*.schema.json` files conforming to JSON Schema
2020-12 meta-schema with cardinality and enum encoding matching the Zod target.

**Independent Test**: Run `rune-codegen --target json-schema input.rune -o out/`; validate
output with `ajv --spec=draft2020`; compare cardinality/enum structure with Zod target
output (per spec §US5 Independent Test).

### 7a. RED tests for US5A (write first, ensure they fail)

- [ ] T090 [P] [US5] Write failing test in `packages/codegen/test/us5a-jsonschema.test.ts`: for the `cardinality` fixture, generate `json-schema` target and assert `"type": "array", "minItems": 1` for `(1..*)`, `"minItems": 2, "maxItems": 5` for `(2..5)`, no `"maxItems"` for `(0..*)`, `"required"` contains `(1..1)` fields
- [ ] T091 [P] [US5] Write failing test: for the `enums` fixture, generate JSON Schema and assert `"enum": ["Buy", "Sell"]` shape; write failing meta-schema validation test using `ajv` that the output validates against `https://json-schema.org/draft/2020-12/schema`
- [ ] T092 [P] [US5] Create `packages/codegen/test/fixtures/cardinality/expected.schema.json` and `packages/codegen/test/fixtures/enums/expected.schema.json` (committed); write failing byte-identical fixture-diff test for JSON Schema target in `packages/codegen/test/fixture.test.ts`

### 7b. JSON Schema emitter implementation

- [ ] T093 [US5] Create `packages/codegen/src/emit/json-schema-emitter.ts`: implement `emitNamespace(docs, emissionCtx): GeneratorOutput` producing one `*.schema.json` per namespace; emit `$schema`, `$id`, `title`, `$defs` object with one entry per type; cross-namespace type references use `$ref: '<otherFile>.schema.json#/$defs/TypeName'`
- [ ] T094 [US5] Implement `emitTypeDef(data: Data, ctx: EmissionContext): object` in `packages/codegen/src/emit/json-schema-emitter.ts`: emit `"type": "object"`, `"properties"` object, `"required"` array for `(1..1)` attributes, `"additionalProperties": false`; handle `extends` via `"allOf": [{ "$ref": "#/$defs/Parent" }, { "properties": {...} }]`
- [ ] T095 [US5] Implement cardinality encoding in `packages/codegen/src/emit/json-schema-emitter.ts`: `(1..*)` → `"type": "array", "minItems": 1`; `(n..m)` → `"type": "array", "minItems": n, "maxItems": m`; `(0..*)` → `"type": "array"` (no minItems/maxItems); enum attribute → `"$ref": "#/$defs/EnumName"`; `"enum"` def for `Enumeration` nodes
- [ ] T096 [US5] Implement JSON Schema source mapping in `packages/codegen/src/emit/json-schema-emitter.ts`: populate `GeneratorOutput.sourceMap` with entries mapping JSON Pointer paths (`/$defs/TypeName`, `/properties/attrName`) to source locations per `contracts/studio-preview.md §Source-map coverage per target`
- [ ] T097 [US5] Wire JSON Schema emitter into `packages/codegen/src/generator.ts` for `options.target === 'json-schema'`; `relativePath` suffix is `.schema.json`

### 7c. Turn US5A tests GREEN

- [ ] T098 [US5] Run `pnpm --filter @rune-langium/codegen test us5a-jsonschema` and iterate until the three JSON Schema tests (T090–T092) pass; commit `expected.schema.json` fixtures; activate CDM smoke `tsc --noEmit` for JSON Schema target in `cdm-smoke.test.ts`

**Checkpoint**: Three JSON Schema tests green; `ajv` meta-schema validation passes; CDM JSON Schema smoke target activated.

---

## Phase 8 — User Story 5B: Full TypeScript Class Target (Priority: P3)

**Goal**: `--target typescript` emits `*.ts` modules with `class` declarations, type
guards, `from()` static factories, discriminator predicates, and `validate*()` condition
instance methods — zero Zod imports.

**Independent Test**: Run `rune-codegen --target typescript input.rune -o out/`;
confirm zero `from 'zod'` imports; `tsc --noEmit` passes; `Party.from({...})` returns
a `Party` instance; `isParty(x)` works; `party.validateNonNegative()` returns correct
accept/reject (per spec §US5 Independent Test).

### 8a. RED tests for US5B (write first, ensure they fail)

- [ ] T099 [P] [US5] Write failing test in `packages/codegen/test/us5b-typescript.test.ts`: for the `basic-types` fixture generate TypeScript target and assert: `class` keyword present, `static from(` present, `isTypeName(` function present, ZERO occurrences of `from 'zod'`
- [ ] T100 [P] [US5] Write failing test: for `inheritance` fixture generate TypeScript and assert `class Child extends Parent` (not `implements`); assert discriminator function `isChild(x: Parent): x is Child` is present
- [ ] T101 [P] [US5] Write failing test: for `conditions-simple/one-of` fixture generate TypeScript and assert a `validateOneOf()` method on the class with return type `{ valid: boolean; errors: string[] }`; execute the method against valid/invalid payloads via dynamic import and assert correct accept/reject
- [ ] T102 [P] [US5] Create `packages/codegen/test/fixtures/basic-types/expected.ts` and `packages/codegen/test/fixtures/inheritance/expected.ts` (committed); write failing byte-identical fixture-diff tests for TypeScript target in `packages/codegen/test/fixture.test.ts`
- [ ] T103 [P] [US5] Write failing test asserting that the TypeScript-target output for the `conditions-simple/one-of` fixture and the Zod-target `z.infer<typeof Schema>` for the same fixture are structurally assignment-compatible for plain-data fields (spec §US5 Scenario 5)

### 8b. TypeScript class emitter implementation

- [ ] T104 [US5] Create `packages/codegen/src/emit/ts-emitter.ts`: implement `emitNamespace(docs, ctx): GeneratorOutput` producing one `*.ts` per namespace; file header includes SPDX MIT, `RUNTIME_HELPER_SOURCE` (no `import { z }` line), and cross-namespace plain-TS imports; `relativePath` suffix is `.ts`
- [ ] T105 [US5] Implement `emitInterface(data: Data, ctx): string` in `packages/codegen/src/emit/ts-emitter.ts`: emit `export interface <TypeName>Shape { ... }` with each attribute as a typed field; map Rune types to TS primitives; encode cardinality as `optional?: T` / `T[]` / `T` (no Zod involved)
- [ ] T106 [US5] Implement `emitClass(data: Data, ctx): string` in `packages/codegen/src/emit/ts-emitter.ts`: emit `export class <TypeName> implements <TypeName>Shape` (or `extends <ParentName>` for inherited types); emit instance fields matching the interface; emit `private constructor(data: <TypeName>Shape)` body assigning all fields
- [ ] T107 [US5] Implement `emitFromFactory(data: Data, ctx): string` in `packages/codegen/src/emit/ts-emitter.ts`: emit `static from(json: unknown): <TypeName>` that calls `isTypeName(json)`, throws `TypeError` on failure, returns `new TypeName(json as <TypeName>Shape)`
- [ ] T108 [US5] Implement `emitTypeGuard(data: Data, ctx): string` in `packages/codegen/src/emit/ts-emitter.ts`: emit `export function is<TypeName>(x: unknown): x is <TypeName>` checking all required fields via `typeof` and `Array.isArray`; for inherited types also check `x instanceof Parent`
- [ ] T109 [US5] Implement `emitDiscriminatorPredicate(child: Data, parent: Data, ctx): string` in `packages/codegen/src/emit/ts-emitter.ts`: emit `export function is<ChildName>(x: <ParentName>): x is <ChildName>` with a structural check for child-specific fields
- [ ] T110 [US5] Implement `emitValidateMethods(data: Data, ctx): string` in `packages/codegen/src/emit/ts-emitter.ts`: for each `condition <Name>` on the type, emit `validate<Name>(): { valid: boolean; errors: string[] }`; reuse `transpileCondition()` from `packages/codegen/src/expr/transpiler.ts` with `emitMode: 'ts-method'` (predicate pushes to local `errors` array instead of `ctx.addIssue`)
- [ ] T111 [US5] Wire TypeScript emitter into `packages/codegen/src/generator.ts` for `options.target === 'typescript'`

### 8c. Turn US5B tests GREEN

- [ ] T112 [US5] Run `pnpm --filter @rune-langium/codegen test us5b-typescript` and iterate until all five TypeScript-target tests (T099–T103) pass; commit `expected.ts` fixtures; activate CDM smoke TypeScript `tsc --noEmit` test in `cdm-smoke.test.ts`; confirm zero `from 'zod'` in CDM TypeScript output

**Independent Test Checkpoint**: `pnpm rune-codegen /tmp/hello.rune --target typescript -o /tmp/out/`; `grep "from 'zod'" /tmp/out/hello/world.ts` returns nothing; `tsc --noEmit` passes; quickstart §4 TypeScript assertions all pass.

**Checkpoint**: Five US5B tests green; CDM TypeScript smoke target active; zero Zod imports in any TypeScript-target output; `validate*()` methods return correct accept/reject decisions.

---

## Phase 8b — User Story 6: Rune `func` → TypeScript function emission (Priority: P3)

**Goal**: Every Rune `func` declaration in a namespace emits as a module-level
`export function` in the same `*.ts` output file as its peer types. Typed inputs
and output, body transpiled through the US3 expression pipeline, pre/post condition
checks, topological call-graph ordering, cross-namespace imports, abstract-func
handling, and silent-skip on non-TS targets.

**Depends on**: Phase 5 (US3 expression transpiler — load-bearing for body emission)
AND Phase 8 (US5B TypeScript class emitter — the module host for emitted functions).

**Independent Test**: `func AddTwo: inputs: a int (1..1), b int (1..1), output: r int (1..1),
set r: a + b` → `rune-codegen --target typescript` → `import { AddTwo }` →
`AddTwo({ a: 2, b: 3 }) === 5`. For a condition-bearing func, valid inputs return a value;
invalid inputs throw a diagnostic naming the failed condition.

### 8b-i. Prior-art inventory and fixture RED tests

- [ ] T113 [P] [US6] Read and inventory `packages/visual-editor/src/adapters/expression-node-to-dsl.ts` (327 lines) and `ast-to-expression-node.ts` (421 lines): document the operator-precedence table entries, visitor-pattern dispatch over `$type`, and block taxonomy (BinaryBlock, ComparisonBlock, ConditionalBlock, ConstructorBlock, FeatureCallBlock, LambdaBlock, ListBlock, LiteralBlock, ReferenceBlock, SwitchBlock, UnaryBlock) in a comment block at the top of `packages/codegen/src/types/func.ts` so the Phase 8b implementer has the dispatch map in one place; no code changes to the visual-editor package
- [ ] T114 [P] [US6] Create fixture `packages/codegen/test/fixtures/funcs/add-two/input.rune` with `func AddTwo` (two scalar inputs, one scalar output, `set r: a + b`); create `expected.ts` showing `export function AddTwo(input: { a: number; b: number }): number { let result: number; result = input.a + input.b; return result; }`; write failing test in `packages/codegen/test/us6-funcs.test.ts` asserting byte-identical match
- [ ] T115 [P] [US6] Create fixture `packages/codegen/test/fixtures/funcs/accumulator/input.rune` with a `func` whose output is `(0..*)` and uses `add` statements to accumulate items; create `expected.ts` showing `const result: T[] = []` + `result.push(…)` body; write failing test in `packages/codegen/test/us6-funcs.test.ts`
- [ ] T116 [P] [US6] Create fixture `packages/codegen/test/fixtures/funcs/alias-func/input.rune` with a `func` that uses `alias x: input -> nested -> field` and then references `x` in a `set` expression; create `expected.ts` showing `const x = input?.nested?.field; result = x;`; write failing test
- [ ] T117 [P] [US6] Create fixture `packages/codegen/test/fixtures/funcs/recursive/input.rune` with a directly-recursive `func F` that calls itself in its body; create `expected.ts` using hoisted `function` declaration (not `const`); write failing test asserting the hoisted form

### 8b-ii. RuneFunc and FuncBodyContext types

- [ ] T118 [US6] Create `packages/codegen/src/types/func.ts`: implement `RuneFuncParam`, `RuneFuncAlias`, `RuneFuncAssignment`, and `RuneFunc` interfaces per `data-model.md §12`; implement `FuncBodyContext` extending `ExpressionTranspilerContext` per `data-model.md §13`; export `topoSortFuncs(funcs: RuneFunc[], callGraph: Map<string, Set<string>>): RuneFunc[]` (Kahn's algorithm over the func call graph, mirrors `topo-sort.ts` for types)

### 8b-iii. Call-graph pre-scan and topological ordering

- [ ] T119 [US6] Implement `buildFuncCallGraph(funcs: RuneFunc[]): Map<string, Set<string>>` in `packages/codegen/src/types/func.ts`: walk each `RuneFunc`'s `assignments` and `aliases` expression nodes looking for `FeatureCallBlock` / function-call nodes; populate the adjacency map `funcName → Set<funcName>`; detect direct cycles (a func calling itself) and mark them — these will use hoisted `function` declarations rather than `const` to avoid TDZ issues (FR-030)

### 8b-iv. Body-statement emitter

- [ ] T120 [US6] Implement `emitFuncSet(assignment: RuneFuncAssignment, ctx: FuncBodyContext): string` in `packages/codegen/src/emit/ts-emitter.ts`: for `kind: 'set'`, emit `result = <transpileExpression(assignment.exprNode, ctx)>;` (FR-029); for `kind: 'add'`, emit `result.push(<transpileExpression(assignment.exprNode, ctx)>);`
- [ ] T121 [US6] Implement `emitFuncAlias(alias: RuneFuncAlias, ctx: FuncBodyContext): string` in `packages/codegen/src/emit/ts-emitter.ts`: emit `const <safeAlias> = <transpileExpression(alias.exprNode, ctx)>;`; use `ctx.aliasBindings` for collision-free renaming when alias name shadows an input parameter (FR-029)
- [ ] T122 [US6] Implement `emitFuncPreConditions(func: RuneFunc, ctx: FuncBodyContext): string` in `packages/codegen/src/emit/ts-emitter.ts`: emit pre-condition checks that throw `new Error('Diagnostic: <conditionName> failed')` for each pre-condition that is violated; use `transpileCondition()` from `expr/transpiler.ts` with `emitMode: 'ts-method'` (FR-029)
- [ ] T123 [US6] Implement `emitFuncPostConditions(func: RuneFunc, ctx: FuncBodyContext): string` in `packages/codegen/src/emit/ts-emitter.ts`: emit post-condition checks after the last assignment and before `return result`; same shape as pre-conditions but evaluated after body execution (FR-029)
- [ ] T124 [US6] Implement `emitFuncBody(func: RuneFunc, ctx: FuncBodyContext): string` in `packages/codegen/src/emit/ts-emitter.ts`: compose the full function body — result variable declaration (`let result: T` or `const result: T[] = []`), pre-conditions, aliases in declaration order, assignments in declaration order, post-conditions, `return result`; for `isAbstract: true` funcs emit pre-conditions then `throw new Error('Diagnostic: <funcName> — not_implemented...')` and emit a `GeneratorDiagnostic { code: 'abstract-func', severity: 'info' }` (FR-032)

### 8b-v. Cross-namespace imports and module wiring

- [ ] T125 [US6] Implement `collectFuncCrossNamespaceImports(funcs: RuneFunc[], ctx: EmissionContext): string[]` in `packages/codegen/src/emit/ts-emitter.ts`: scan each func's body for calls to funcs in other namespaces; emit `import { G } from '../base/math/index.js'` statements using the same import-resolution rules as cross-namespace type references (FR-007, FR-030); add to the file header alongside type imports
- [ ] T126 [US6] Wire func emission into `emitNamespace()` in `packages/codegen/src/emit/ts-emitter.ts` for `options.target === 'typescript'`: after all type declarations, extract `RuneFunc` nodes from the namespace, build `callGraph`, call `topoSortFuncs()`, emit each func via `emitFunc()` in topological order; for cyclic call groups emit `function` declarations (hoisted) rather than `const` arrow functions; add `funcs: GeneratedFunc[]` to the returned `GeneratorOutput` (FR-028, FR-030)
- [ ] T127 [US6] Implement the silent-skip path for Zod and JSON Schema targets: in `packages/codegen/src/emit/zod-emitter.ts` and `json-schema-emitter.ts`, confirm that `RuneFunc` nodes are never visited and that `GeneratorOutput.funcs` is always `[]`; add a unit test in `packages/codegen/test/us6-funcs.test.ts` that generates a model containing a `func` with `target: 'zod'` and asserts `outputs.every(o => o.funcs.length === 0)` and no func text appears in `content` (FR-031)

### 8b-vi. Fixture-diff tests and SC-009 fidelity matrix

- [ ] T128 [P] [US6] Run `pnpm --filter @rune-langium/codegen test us6-funcs` and iterate until all four func fixture-diff tests (T114–T117) pass byte-identically; commit `expected.ts` files; verify that the accumulator and alias fixtures produce correct TypeScript output compilable with `tsc --noEmit`
- [ ] T129 [US6] Create `packages/codegen/test/func-fidelity-matrix.test.ts`: implement the SC-009 function-fidelity test matrix — 100-case battery for the curated CDM func subset; for each func in the matrix: (a) confirm the emitted module compiles with `tsc --noEmit`, (b) dynamically import and call the function with valid CDM input, (c) assert output matches the Python generator's evaluation of the same function on the same input; assert ≥99% behavioral parity; mark as `.todo` until Phase 8b implementation tasks are green (SC-009)

### 8b-vii. CLI and quickstart

- [ ] T130 [US6] Update the CLI smoke test in `packages/codegen/test/cdm-smoke.test.ts` to assert that after `--target typescript` generation, the output directory contains at least one non-empty `*.ts` file with `export function` declarations and the `funcs` array on at least one `GeneratorOutput` is non-empty for models that include Rune `func` declarations; update `quickstart.md` §8 (or create §8 if absent) with a worked func example matching the `AddTwo` scenario from spec §US6 Independent Test

**Independent Test Checkpoint**: `pnpm rune-codegen packages/curated-schema/fixtures/cdm/ --target typescript -o /tmp/ts-out/`; `tsc --noEmit` on `/tmp/ts-out/` passes; `import { AddTwo } from '.../generated'`; `AddTwo({ a: 2, b: 3 }) === 5`; running `--target zod` on the same input produces zero func output.

**Checkpoint**: 18 Phase 8b tasks green (T113–T130); all four func fixture-diff tests byte-identical; SC-009 fidelity matrix task activated; silent-skip unit test passes for Zod and JSON Schema targets; CDM TypeScript smoke includes func assertion.

---

## Phase 9 — Polish

**Purpose**: Full CDM smoke across all three targets, byte-identical CI fixture-diff
job, performance benchmark, determinism check, and end-to-end acceptance gate per
quickstart §7.

- [ ] T131 Activate all three CDM smoke sub-tests in `packages/codegen/test/cdm-smoke.test.ts`: Zod `tsc --noEmit`, JSON Schema `tsc --noEmit` (N/A — JSON files, use `ajv` meta-schema validation), TypeScript `tsc --noEmit`; JSON battery for every condition kind × both valid and invalid cases; assert all pass; assert total run time < 30s (SC-006)
- [ ] T132 [P] Run `time pnpm rune-codegen packages/curated-schema/fixtures/cdm/ --target zod -o /tmp/cdm-out/` and assert elapsed real time < 30s on a modern laptop; document the baseline in a comment in `cdm-smoke.test.ts` (SC-006)
- [ ] T133 [P] Add determinism check to `packages/codegen/test/fixture.test.ts`: run each Tier 1 fixture twice in the same vitest process and assert the two outputs are byte-identical (SC-007 in-process guard)
- [ ] T134 [P] Add a CI fixture-diff job definition in `.github/workflows/` (or update the existing one): runs `pnpm --filter @rune-langium/codegen test fixture`; if any fixture output differs from the committed `expected.*` file, fails the job with a diff; this enforces SC-007 in CI (byte-identical re-runs)
- [ ] T135 [P] Run the full stale-import verification from `contracts/package-rename.md §Post-rename verification`: confirm `pnpm --filter @rune-langium/codegen-container exec node -e "import('@rune-langium/codegen-legacy').then(...)"` returns OK; confirm legacy package still builds with `pnpm --filter @rune-langium/codegen-legacy run build`
- [ ] T136 [P] Run quickstart §7 acceptance gate: `pnpm -r test` (all tests pass); `pnpm -r run type-check` (exit 0); `pnpm --filter @rune-langium/codegen test fixture` (all fixture tests pass, byte-identical); re-run a second time to confirm determinism
- [ ] T137 Add `meta-types` and `key-refs` fixture coverage: create `packages/codegen/test/fixtures/meta-types/input.rune` and `packages/codegen/test/fixtures/key-refs/input.rune` with `expected.zod.ts`; write and pass fixture-diff tests for these remaining fixture taxonomy entries (data-model §4)
- [ ] T138 [P] Run `pnpm --filter @rune-langium/studio test` to confirm all existing Studio tests still pass after Phase 6 additions; confirm no regression in `ExportDialog.tsx` (which now uses `@rune-langium/codegen-legacy`)

**Checkpoint**: All 10 phases complete; `pnpm -r test` green; `pnpm -r run type-check` green; CDM smoke < 30s; all fixture-diff tests byte-identical on two consecutive runs; quickstart §1–§8 steps all succeed.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup/Rename)
  └─► Phase 2 (Foundational scaffold)
        └─► Phase 3 (US1 — Structural Zod) ← MVP cut here
              └─► Phase 4 (US2 — Conditions)
                    └─► Phase 5 (US3 — Expression transpiler)
                          └─► Phase 7 (US5A — JSON Schema)   ─┐
                          └─► Phase 8  (US5B — TypeScript)   ─┤─► Phase 8b (US6 — func emission)
                                └─► Phase 8b (US6 — funcs)   ─┤
                                                               └─► Phase 6 (US4 — Studio)
                                                                     └─► Phase 9 (Polish)
```

**Key cross-dependencies**:
- Phase 6 (US4, Studio) depends on Phase 5 (US3, transpiler), Phase 7 (US5A, JSON
  Schema emitter), and Phase 8 (US5B, TypeScript emitter) so that all three targets
  are available for the target-switcher panel. Do not begin Phase 6 implementation
  until Phases 5, 7, and 8 are green.
- Phase 8b (US6, func emission) depends on Phase 5 (US3, expression transpiler —
  load-bearing for body emission) AND Phase 8 (US5B, TypeScript class emitter —
  the module host for emitted functions). Phase 8b ships alongside Phase 8 in
  the same TS-target pipeline; neither requires Phase 6 (Studio) to be complete.

### User Story Dependencies

- **US1 (P1)**: Depends only on Phase 2 foundational scaffold. No story dependencies.
- **US2 (P2)**: Depends on US1 (condition emitter extends Zod emitter built in US1).
- **US3 (P2)**: Depends on US2 (expression transpiler extends condition emitter; `ExpressionTranspilerContext` built in US2).
- **US4 (P3)**: Depends on US1 + US3 + US5A + US5B (all three generation targets must work before the multi-target preview is wired up).
- **US5A (P3)**: Depends on Phase 2 foundational scaffold + US1 (EmissionContext, TypeReferenceGraph built in US1 phase).
- **US5B (P3)**: Depends on US3 (expression transpiler reused with `emitMode: 'ts-method'`).
- **US6 (P3)**: Depends on US3 (expression transpiler is the load-bearing piece for body emission — FR-029 explicitly calls out the same pipeline) AND US5B (the TypeScript class emitter is the module host; funcs emit into the same `*.ts` file as their peer types).

### Within Each Phase

- RED test tasks (fixture creation + failing test writing) are marked `[P]` and can
  be written in parallel across fixture directories; they MUST be written and FAILING
  before the implementation tasks for that story begin.
- Implementation tasks within a story are mostly sequential (emitter → wiring → CLI).
- Polish tasks marked `[P]` can run in parallel once all story phases are complete.

---

## Parallel Opportunities Per Phase

| Phase | Tasks that can run in parallel |
|-------|-------------------------------|
| Phase 1 | T004, T005 (codegen-container files) ‖ T007, T008 (cli files) ‖ T010, T011 (studio files) |
| Phase 2 | T016, T017 (tsconfig, header note) ‖ T019, T020 (helpers.ts, diagnostics.ts) ‖ T026, T027 (test harness files) |
| Phase 3 | T028–T033 (all six RED fixture pairs — independent directories) |
| Phase 4 | T047–T051 (all five US2 RED fixture pairs) |
| Phase 5 | T058–T066 (all eight US3 RED fixture pairs + parity matrix skeleton) |
| Phase 6 | T079–T082 (all four US4 RED component/integration tests) |
| Phase 7 | T090–T092 (all three US5A RED tests) |
| Phase 8 | T099–T103 (all five US5B RED tests) |
| Phase 8b | T113, T114, T115, T116, T117 (prior-art inventory + four RED fixture pairs — all independent directories) |
| Phase 9 | T132, T133, T134, T135, T136, T138 |

---

## MVP Scope

**MVP = Phase 1 (rename) + Phase 2 (scaffold) + Phase 3 (US1 Zod structural).**

After Phase 3, a TypeScript developer with no JVM installed can install `@rune-langium/codegen`,
run `pnpm rune-codegen <input> -o <out>`, and get Zod schemas with cardinality, enums, and
inheritance that pass `tsc --noEmit` and validate JSON payloads at runtime. This alone
delivers SC-001 (< 5 minutes vs. ~60 minutes with Maven) and SC-002 (`tsc --noEmit` on CDM).
Phases 4–9 (including Phase 8b — US6 func emission) are incremental value additions that
can be deferred without breaking the MVP. Phase 8b is a required sibling of Phase 8 within
the TS target: the TS target is meaningfully incomplete without func support (shapes-only
TS output replicates the gap of the existing Rosetta TS generator), so Phase 8b must ship
in the same release as Phase 8 at the latest.

---

## Per-Story Independent Test Reference

### US1 (Phase 3)

Developer writes a Rune model covering 5 cardinality forms, an enum with `displayName`,
one `extends` chain, and a mutual cycle. Runs `pnpm rune-codegen input.rune -o out/`.
Then: `tsc --noEmit` on `out/` → exit 0; `PartySchema.parse(validJson)` → succeeds;
`PartySchema.safeParse(invalidJson).success === false` → confirmed. No conditions, Studio,
or other targets required.

### US2 (Phase 4)

Model: `type UnitType: a (0..1), b (0..1), c (0..1), condition OneOf: one-of [a, b, c]`.
Generates schema. Tests: `safeParse({})` → fail (zero present); `safeParse({ a: 'x' })`
→ pass (one present); `safeParse({ a: 'x', b: 'y' })` → fail (two present). Each
failure message includes "OneOf".

### US3 (Phase 5)

For each of 8 expression categories: a fixture pair exists; generator output (a) compiles,
(b) accepts documented-valid JSON cases, (c) rejects documented-invalid JSON cases with a
message naming the condition. Parity matrix: ≥99% match with Python reference outputs
on 200-case battery (SC-003).

### US4 (Phase 6)

Open Studio against CDM fixture. Right-hand panel shows Zod output within 500ms of first
successful build. Switch to JSON Schema → re-renders within 500ms. Switch to TypeScript →
re-renders within 500ms. Click any generated line → editor cursor navigates to originating
Rune source line. Introduce syntax error → amber status, last-good output retained.

### US5 (Phases 7–8)

JSON Schema: `rune-codegen --target json-schema input.rune -o out/`; `ajv --spec=draft2020`
validates output; cardinality/enums match Zod target semantics. TypeScript: `rune-codegen
--target typescript input.rune -o out/`; zero `from 'zod'` imports; `tsc --noEmit` passes;
`Party.from({...valid...})` returns Party instance; `isParty(x)` works; `party.validateNonNegative()`
accepts/rejects correctly.

### US6 (Phase 8b)

`func AddTwo: inputs: a int (1..1), b int (1..1), output: r int (1..1), set r: a + b` →
`rune-codegen --target typescript` → `import { AddTwo }` → `AddTwo({ a: 2, b: 3 }) === 5`.
For a condition-bearing func (e.g., `func DivSafe` with a pre-condition that the divisor is
non-zero), valid inputs return a value and invalid inputs throw a diagnostic naming the failed
condition. Running the same model with `--target zod` produces zero func output (funcs silently
skipped). CDM func subset: ≥99% behavioral parity with Python generator on 100-case
function-fidelity matrix (SC-009).
