# Implementation Plan: Rune-Langium Native Code Generators

**Branch**: `015-rune-codegen-zod` | **Date**: 2026-04-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/015-rune-codegen-zod/spec.md`

## Summary

Replace the JVM-coupled `packages/codegen` (Rosetta bridge) with a
Langium-native generator that emits Zod schemas, JSON Schema 2020-12,
and full TypeScript class modules from `.rune` AST documents. The
new package takes the canonical `packages/codegen` name; the existing
JVM bridge is renamed `packages/codegen-legacy` in the same change
set. All three emitter targets share a common expression-transpiler
layer; each target adds its own surface (Zod `.superRefine()`, JSON
Schema `definitions`, TypeScript class methods). Runtime helpers
(`runeCheckOneOf`, `runeCount`, `runeAttrExists`) are inlined into
every emitted file — no companion runtime package. Studio integration
adds a live-preview panel with a target switcher and source-mapping
for all three targets.

## Technical Context

**Language/Version**: TypeScript 5.9+ (strict mode, ESM) — all new
packages and apps run on Node 20+. No JVM dependency for the new
package.

**Primary Dependencies**:
- `langium@4.2.x` (already in `packages/core`): `expandToString`,
  `expandToNode`, `toStringAndTrace`, `joinToNode` from
  `langium/generate` for template-string emission with source-
  mapping. The `LangiumDocument` and `LangiumServices` types from
  `langium` for the generator's input type.
- `@rune-langium/core` (workspace): the Rune grammar, generated AST
  types (`Data`, `Attribute`, `Condition`, `Enumeration`, etc.), and
  type guards (`isData`, `isAttribute`, `isCondition`,
  `isEnumeration`, …) from `packages/core/src/generated/ast.ts`.
- `zod@^4.3.x` (devDependency only — for fixture tests of Zod-target
  output; NOT a runtime dep of the emitted files or the generator
  library itself). Consumers of the Zod-target emitted files depend
  on Zod; the generator does not.
- `vitest@^4.x` for the two-tier test suite.
- No `@rune-langium/runtime` package ships; helpers are inlined.

**Storage**: No persistent storage in the generator. The CLI writes to
disk; the Studio integration writes to in-memory virtual file system
(strings delivered via `GeneratorOutput`).

**Testing**:
- **Tier 1 — fixture-diff**: vitest + committed expected-output files
  under `packages/codegen/test/fixtures/`. Assertion: byte-identical
  equality between generator output and committed expected file. Covers
  every Rune construct in the fixture taxonomy (FR-022).
- **Tier 2 — CDM smoke**: vitest integration test that (a) invokes
  `generate(cdmDocuments, { target: 'zod' })` and pipes output to
  a temp dir, (b) shells out `tsc --noEmit --strict` over that temp
  dir, (c) runs a JSON battery of valid/invalid CDM instances against
  the emitted schemas (FR-023, FR-024).
- No committed CDM snapshot; the `tsc --noEmit` step IS the structural
  correctness check.

**Target Platform**:
- Node 20+ CLI (disk I/O via `node:fs`).
- Browser / Web Worker (Studio; Vite-bundled; no `node:fs`; I/O via
  in-memory strings passed to generator, results returned as
  `GeneratorOutput` tuples).

**Project Type**: Library + CLI (`packages/codegen`) plus a Studio
panel integration (`apps/studio/src/`). No new app or Cloudflare
Worker.

**Performance Goals**:
- Full CDM generation (thousands of types, ~50,000 attributes)
  completes in under 30 seconds on a modern laptop (SC-006).
- Studio live-preview panel updates within 500ms of a successful build
  phase on a 1000-type model (SC-004, FR-017).
- Generator-level heap stays within the existing Node 20 default
  (1.5 GB); no `--max-old-space-size` flag required.

**Constraints**:
- Emitted Zod files must compile under `tsc --noEmit --strict` (SC-002).
- Emitted TypeScript-target files must have zero `zod` imports (FR-020).
- Re-running the generator on identical input produces byte-identical
  output (SC-007). Requires deterministic iteration order over the
  Langium AST (use topological-sorted array, not `Map` iteration order).
- `pnpm -r run type-check` must pass after the rename (FR-027).
- MIT license for `packages/codegen`; FSL-1.1-ALv2 for Studio
  integration files.

**Scale/Scope**:
- 6 user stories, 32 FRs, 9 SCs.
- 1 new package (`packages/codegen` — wholly new source, reusing the
  directory after rename), 1 renamed package (`packages/codegen-legacy`).
- ~6 source files modified in `apps/codegen-container`, `apps/studio`,
  `packages/cli`.
- ~18–23 new source files in the new `packages/codegen`.
- ~35 fixture pairs under `packages/codegen/test/fixtures/`.
- 1 Studio panel component + 1 target-switcher component.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Notes |
|---|---|---|
| **I. DSL Fidelity & Typed AST** | ✅ | The generator consumes the Rune AST read-only; no grammar changes. Expression nodes traverse typed AST nodes (not opaque strings). Cross-references are resolved via Langium's `Reference<T>` before the emitter runs. |
| **II. Deterministic Fixtures** | ✅ PASS-with-justification | Tier 1 fixture-diff: committed expected-output files cover every Rune construct; CI asserts byte-identical equality (SC-007, FR-022). Tier 2 CDM smoke: CDM output is NOT committed — `tsc --noEmit` is the structural guard, a JSON battery covers behavioral correctness. The no-committed-snapshot choice (Q2/A) is justified: ~10–50 MB of snapshot churn per grammar tweak would make unrelated CI diffs unreadable, while `tsc --noEmit` already catches any structural emission regression. |
| **III. Validation Parity** | ✅ | Generator-time diagnostics (FR-025) surface mis-spelled condition attribute references as structured errors (line, column, severity, message) matching the constitution's diagnostic schema. No new validator rules are added to the Langium grammar. |
| **IV. Performance & Workers** | ✅ | Generation runs in a Web Worker in the Studio (not main thread), isolating the 30s CDM bound from the UI. The 500ms preview-update budget (FR-017, SC-004) applies to the debounce cycle on the already-parsed document, not a full re-parse. |
| **V. Reversibility & Compatibility** | ✅ PASS-with-justification | The rename of `packages/codegen` → `packages/codegen-legacy` is a breaking import-path change for `apps/codegen-container`, `apps/studio`, and `packages/cli`. Constitution §V requires a migration guide and staged rollout for deprecations. Justification: the lead explicitly approved Q1/B; the rename is atomic within this feature's change set (FR-026, FR-027); `pnpm -r run type-check` must pass before merge (not after); the legacy package itself is not removed (removal is tracked separately); and downstream consumers are re-wired in the same PR, so there is no window where the workspace is inconsistent. The migration guide is `contracts/package-rename.md`. |
| **Workflow Quality Gates (Feature Development)** | ✅ | Spec complete; clarify answers locked in; plan in progress; TDD will apply during `/speckit.implement`; code review on PRs. |

**Additional scope note (US6)**: Rune `func` declarations are required for TS-target parity with the Java and Python Rosetta generators; without them the TypeScript target ships typed shapes + condition methods but cannot compute CDM-defined values (DCF, payoff math, date adjustments) — which is the principal gap that motivated the TypeScript target in the first place. Phase 8b is therefore a required sibling of Phase 8 (US5B class emission), not optional polish.

**Result**: PASS. Two principles require justification (II, V), documented above.

### Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| No committed CDM snapshot (Constitution II requires deterministic fixtures for "conformance" tests) | A ~10–50 MB snapshot for the full CDM would create unreadable CI diffs on every grammar tweak; `tsc --noEmit` catches structural regressions equally well | Committing a partial CDM snapshot would not cover the full corpus; committing the full one has the churn problem; JSON battery covers behavioral correctness that `tsc` cannot. Q2/A explicitly chose this trade-off. |
| Breaking import-path rename within a single change set (Constitution V requires staged rollout for deprecations) | The new MIT generator MUST occupy the canonical `packages/codegen` name so downstream consumers see an idiomatic package name; the old JVM bridge is a legacy concern. Q1/B explicitly approved this. | A two-step staged rename would leave the workspace inconsistent between PRs; the re-wire of all consumers in one change set is the safest atomic approach. |

## Project Structure

### Documentation (this feature)

```text
specs/015-rune-codegen-zod/
├── plan.md              # This file (/speckit.plan output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── generator-api.md        # Public TypeScript surface of @rune-langium/codegen
│   ├── cli.md                  # rune-codegen CLI contract
│   ├── studio-preview.md       # Studio live-preview integration contract
│   ├── runtime-helpers.md      # Inlined helper API (runeCheckOneOf etc.)
│   └── package-rename.md       # Rename/rewire contract for downstream consumers
├── checklists/
│   └── requirements.md  # Already exists from /speckit.specify
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT this command)
```

### Source Code (repository root)

```text
packages/
├── codegen/                          # WHOLLY NEW — MIT-licensed Langium-native generator
│   ├── package.json                  # name: @rune-langium/codegen, license: MIT
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts                  # Public API: generate(), Target, GeneratorOutput, GeneratorOptions
│   │   ├── types.ts                  # GeneratorOutput, GeneratorOptions, Target, SourceMap types
│   │   ├── generator.ts              # Top-level orchestrator: load docs → topo-sort → emit
│   │   ├── cycle-detector.ts         # Tarjan SCC over TypeReferenceGraph → z.lazy() candidates
│   │   ├── topo-sort.ts              # Kahn's algorithm over the cycle-free residual graph
│   │   ├── emit/
│   │   │   ├── zod-emitter.ts        # Zod target: types → z.object() + .superRefine() + helpers
│   │   │   ├── json-schema-emitter.ts # JSON Schema 2020-12 target: types → definitions
│   │   │   └── ts-emitter.ts         # TypeScript class target: class + type guard + from() + validate*()
│   │   ├── expr/
│   │   │   └── transpiler.ts         # Rune expression → JS predicate string (shared by all targets)
│   │   ├── helpers.ts                # runeCheckOneOf / runeCount / runeAttrExists source strings
│   │   └── diagnostics.ts            # Generator-time structured errors (FR-025)
│   ├── bin/
│   │   └── rune-codegen.ts           # CLI entry point
│   └── test/
│       ├── fixtures/                 # Tier 1: committed .rune + expected output + JSON cases
│       │   ├── basic-types/
│       │   ├── cardinality/
│       │   ├── enums/
│       │   ├── inheritance/
│       │   ├── conditions-simple/
│       │   ├── conditions-complex/
│       │   ├── circular/
│       │   └── reserved-words/
│       ├── fixture.test.ts           # Tier 1 byte-identical fixture diffs
│       └── cdm-smoke.test.ts         # Tier 2 CDM tsc + JSON battery
│
├── codegen-legacy/                   # RENAMED from packages/codegen (JVM bridge)
│   ├── package.json                  # name: @rune-langium/codegen-legacy, was @rune-langium/codegen
│   └── src/                          # All source files unchanged; only name + exports updated
│
├── cli/                              # MODIFIED: import paths updated
│   └── src/
│       ├── generate.ts               # @rune-langium/codegen/node → @rune-langium/codegen-legacy/node
│       └── types/codegen-types.ts    # re-export updated import path

apps/
├── studio/                           # MODIFIED
│   └── src/
│       ├── components/
│       │   ├── CodePreviewPanel.tsx  # NEW — live-preview panel with target switcher
│       │   └── TargetSwitcher.tsx    # NEW — Zod | JSON Schema | TypeScript toggle
│       └── services/
│           └── codegen-service.ts    # MODIFIED: updated import + add preview generation path
│
├── codegen-container/                # MODIFIED: dependency + imports updated
│   ├── package.json                  # @rune-langium/codegen → @rune-langium/codegen-legacy
│   └── src/server.ts                 # import paths updated
│
└── codegen-worker/                   # NO CODE CHANGES (does not import codegen types directly)
```

**Structure Decision**: The repo is a pnpm workspace monorepo. This
feature adds one wholly-new package (`packages/codegen`), renames one
existing package (`packages/codegen-legacy`), and makes targeted
modifications to three existing consumers. No new Cloudflare Workers;
no new apps. The Studio integration is a pair of React components +
a service layer update, not a new page.

The feature splits into **10 phases**, each independently releasable:

| Phase | Name | US | Priority |
|-------|------|----|---------|
| Phase 1 | Setup (Package Rename + Consumer Re-wire) | — | blocker |
| Phase 2 | Foundational scaffold (new `packages/codegen`) | — | blocker |
| Phase 3 | User Story 1 — Structural Zod Schemas | US1 | P1 / MVP |
| Phase 4 | User Story 2 — Constraint Conditions | US2 | P2 |
| Phase 5 | User Story 3 — Full Expression Transpiler | US3 | P2 |
| Phase 6 | User Story 4 — Studio Live Preview | US4 | P3 |
| Phase 7 | User Story 5A — JSON Schema 2020-12 Target | US5 | P3 |
| Phase 8 | User Story 5B — Full TypeScript Class Target | US5 | P3 |
| Phase 8b | User Story 6 — Rune `func` → TS function emission | US6 | P3 |
| Phase 9 | Polish (CDM smoke, CI, determinism, acceptance gate) | — | P3 |

1. **Phase 1 — Package rename + consumer re-wire**: Rename
   `packages/codegen` → `packages/codegen-legacy`, update its
   `package.json` name and exports, update every import in
   `apps/codegen-container`, `apps/studio`, and `packages/cli`.
   Gate: `pnpm -r run type-check` must pass cleanly. No new
   functionality; this is a pure structural change.

2. **Phase 2 — New `packages/codegen` (Zod target, P1)**: Create the
   new package with the generator orchestrator, cycle detector, topo
   sort, and Zod emitter. Covers FR-001 through FR-014. Tier 1
   fixture tests for basic types, cardinality, enums, inheritance,
   simple conditions, and circular references must pass.

3. **Phase 3 — Expression transpiler (P2 / FR-012)**: Build the full
   expression language transpiler for all Rune expression forms. Tier
   1 fixture tests for complex conditions (if/then/else, choice, path
   navigation, aggregations, higher-order) must pass. CDM smoke test
   (Tier 2) runs for the first time.

4. **Phase 4 — JSON Schema + TypeScript class targets (P3)**: Add
   `json-schema-emitter.ts` and `ts-emitter.ts`. CLI flags
   `--target json-schema` and `--target typescript` wired. Tier 1
   fixtures extended for both targets. CDM smoke extended to both
   targets.

5. **Phase 5 — Studio live-preview integration (P3 / FR-017–FR-018)**:
   Add `CodePreviewPanel.tsx` and `TargetSwitcher.tsx`. Wire
   generator into the Studio's build-phase listener. Source-mapping
   click handlers for all three targets. Studio integration tests.

6. **Phase 8b — Rune `func` → TypeScript function emission (P3 / FR-028–FR-032)**:
   Build on the TS-target module pipeline from Phase 8 (US5B) and the
   expression transpiler from Phase 5 (US3). Every Rune `func` in a
   namespace emits as a module-level `export function` in the same
   `.ts` output file as its peer types. Includes: `RuneFunc` /
   `FuncBodyContext` types; call-graph pre-scan + topological ordering
   for non-cyclic call dependencies; `set` / `add` / `alias`
   statement emitters; abstract-func handling (throw + non-fatal hint);
   silent-skip path for Zod and JSON Schema targets; SC-009
   function-fidelity test matrix. Depends on Phase 5 (US3 transpiler)
   AND Phase 8 (US5B class emission).
