# Python Expression Projections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, inline as previously requested by the user. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display valid linked Rune function implementations and conditions as complete Python projections, independently of reversible foreign editing.

**Architecture:** Add a browser-safe backend under codegen's shared projection surface. Resolve types, calls, choice arms, operation arguments, cardinality and metadata through authoritative core/codegen utilities; keep Python syntax and runtime implementation target-specific. The original 12-node reverse lens keeps its stricter contract. This backend consumes the document identity and projection metadata from the [main plan](2026-10-08-expression-editing.md).

**Tech Stack:** Existing TypeScript codegen infrastructure and AST; Python 3.13 standard library for projection syntax/execution validation. No Python browser runtime or new JavaScript dependency.

**Spec:** [Function and Condition Editing Redesign](../specs/2026-10-08-expression-editing-design.md).

## Global Constraints

- Rendering policy clarified 2026-10-08: prefer native Python operators/comprehensions when they preserve Rune behavior. Share semantic resolution with exports and TypeScript; helpers require a specific semantic need. Do not implement approximate display-only behavior.

- DRY is the primary correctness rule; reuse authoritative parse, source, scope and codegen paths.
- Runtime engines: `^22.22.2 || ^24.15.0 || >=26.0.0`; package manager: `pnpm@11.5.0`.
- No dependency upgrades or generated AST/schema edits are part of this redesign.
- New `packages/` source is MIT; new `apps/studio/` source is FSL-1.1-ALv2. Studio is source-available.
- Preserve dirty primary checkouts, attached peer edits, `.resources` and user browser tabs.
- Invalid drafts and unsupported reverse edits never silently become different Rune logic.
- Documentation and continuity changes travel with their implementation task.

## Review Focus

- Python chained comparisons, eager evaluation and division behavior must preserve Rune grouping/laziness/number semantics (Tasks P1/P2).
- Optional/many values and metadata wrappers must not be treated as native scalar/null tests (Tasks P1/P2).
- Deep navigation, headless pipelines, inherited enum values and Choice narrowing retain canonical resolution (Task P2).
- Typed inputs/outputs, nested assignment paths and append cardinality checks are retained; native functions require explicit bindings (Task P3).
- Every grammar kind is accounted for, including constructs absent from the staged corpus; unknown kinds never emit placeholders (Tasks P2/P4).

## Task P1: Projection context and runtime contracts

**Files:** Create `packages/codegen/src/projection/context.ts`, `python-runtime.ts`, `python-runtime.py`, generated `projection/generated/python-runtime-source.ts` and `packages/codegen/scripts/generate-python-runtime.mjs`; update codegen's build script in `package.json`. Create `packages/codegen/test/projection/python-runtime.test.ts` and `packages/codegen/test/projection/python-runtime-check.py`. Reuse existing `src/expr/` semantics and core `expression-utils`/scope utilities; factor shared resolution helpers only where an existing function is unnecessarily TS-specific.

**Interfaces:** Produce `PythonProjectionContext` containing resolved callable/type identities, local bindings, input/output cardinalities and source identity. Generate Python runtime source by loading one authoritative `.py` source at build time and emitting a browser-safe string module; do not maintain copied TS-string and Python versions of helper bodies or load fs in the worker. Runtime helper names and argument/result shapes are fixed by the semantic operation they implement, not guessed from emitted TypeScript text.

- [ ] Add shared semantic fixtures derived from existing TS/runtime tests for empty/one/many values, metadata, numeric comparisons/division, lazy branches and nested reads/writes. Compare normalized results and error classes across TS and Python, including JSON `false`, `0`, empty string, null and missing fields.
- [ ] Run `pnpm --filter @rune-langium/codegen exec vitest run test/projection/python-runtime.test.ts`; new helpers must fail before implementation. The test launches Python's standard-library driver; a required CI check must not silently skip when Python is missing.
- [ ] Implement helper-backed Python semantics and the resolved context. Use standard-library decimal/datetime/zoneinfo where needed; no approximate null/list/native-operator shortcut. Deduplicate semantic test data with existing TS cases and retain source mapping for failures. Regenerate the string module during codegen build and test deterministic regeneration plus browser-safe imports.
- [ ] Rerun the runtime comparison and affected TS tests; commit `feat(codegen): define Python projection runtime contracts`.

## Task P2: All grammar expression families

**Files:** Create `packages/codegen/src/projection/python.ts`, `python-operations.ts`, `python-navigation.ts`; create `packages/codegen/test/projection/python-expressions.test.ts` and `expression-kind-coverage.test.ts`.

**Interfaces:** `projectPythonExpression(expression: RosettaExpression, context: PythonProjectionContext): GeneratedProjection`; consume the main plan's GeneratedProjection and P1 context/runtime. Projection availability is not `isInSubsetS` and does not change parsePy's accepted subset.

- [ ] Derive a test census from generated AST reflection. Provide a parsed fixture for every concrete RosettaExpression kind, even if the current corpus does not contain it. Each kind emits syntax-valid Python or a precise actual linking/native-binding diagnostic; unknown AST kinds fail explicitly. No `None`, blank text or TODO replacement may stand for missing expression support.

  `all grammar kinds are covered`: `expect(grammarKinds.filter(kind => !coveredKinds.has(kind))).toEqual([]);`
  `unknown kinds fail explicitly`: `expect(() => projectPythonExpression(unknownKindFixture, context)).toThrow();`
- [ ] Cover literals/refs/calls; binary/logical/comparison/exists modifiers; constructors/lists; conditionals/switch/then; filter/map/reduce/sort/aggregate; conversions; choice/only-exists; deep navigation, implicit variables, metadata/as-key/as narrowing and super calls. Grouping, cardinality, short-circuit and scope assertions come from actual parsed Rune and P1 semantic cases.
- [ ] Run `pnpm --filter @rune-langium/codegen exec vitest run test/projection/python-expressions.test.ts test/projection/expression-kind-coverage.test.ts`; coverage is red until each grammar family is implemented.
- [ ] Implement target-specific syntax using shared resolved context and canonical operation helpers. Emit needed helpers by dependency, with stable names that cannot collide with user identifiers. Record expression-to-source mapping; preserve Python comparison grouping explicitly.
- [ ] Parse emitted expressions with Python `ast.parse`; execute semantic fixtures against the runtime contract. Rerun old Python reverse-lens tests unchanged. Commit `feat(codegen): render complete Rune expressions as Python`.

## Task P3: Typed function/condition projection and worker integration

**Files:** Create `packages/codegen/src/projection/python-functions.ts` and `packages/codegen/test/projection/python-functions.test.ts`; update export/projection metadata and Studio's codegen worker/service and ExpressionWorkspace tests.

**Interfaces:** `projectPythonFunction(func: RosettaFunction, context: PythonProjectionContext): GeneratedProjection` and `projectPythonCondition(condition: Condition, context: PythonProjectionContext): GeneratedProjection`. Function signatures are resolved with core `getFunctionSignature`; actual output names and semantic type/cardinality descriptors are retained. Native functions expose an explicit callable binding contract and a binding-required diagnostic, never fabricated successful bodies.

- [ ] Add pinned CDM cases for Abs/Min/Max, FilterQuantityByCurrency, UnitEquals, ArithmeticOperation, AppendToVector, Sqrt alias chains and temporal functions. Add multi-operation/nested assignment, pre/postcondition and dispatch cases. Assert typed signatures, ordered statements, correct target paths and one complete function projection.
- [ ] Add tests for imported callable/type collisions and reserved identifiers. Native calls remain visible and callable only when a binding is provided; missing bindings fail with an explicit error rather than returning placeholder results.
- [ ] Run `pnpm --filter @rune-langium/codegen exec vitest run test/projection/python-functions.test.ts`; compare generated results with the checked-in 117-case CDM reference battery, respecting tolerance rules and using `knownDifference.expectedRune` for the recorded StringEquals divergence. Do not match an upstream Python defect by weakening Rune semantics. No network or finos-cdm install is required to consume these goldens.
- [ ] Implement typed functions, conditions, runtime imports, source maps and worker wiring. Reuse projection caching/async guards from the main plan. Python selection shows generated code, not a reversible-subset refusal, while whole-body reverse editing stays disabled.
- [ ] Parse/compile generated modules, run the battery and Studio component tests. Commit `feat(studio): show typed Python implementation projections`.

## Task P4: Required coverage and delivery gate

**Files:** Extend main-plan `packages/codegen/test/projection/corpus-coverage.test.ts`; create `.github/workflows/python-projections.yml`; update codegen README and agent workflow guidance. Reuse the existing pinned reference sources/cases instead of introducing a second corpus manifest.

- [ ] Add a CI job mandatory for backend changes using the repository's trusted action/pin conventions, supported Node, pinned pnpm and Python 3.13. Run the new backend syntax/runtime/reference tests. Do not add a branch-protection requirement that leaves unrelated PRs waiting on a path-filtered workflow. Generated expression/function outputs are test artifacts, not hand-maintained goldens.
- [ ] Scan linked staged CDM/Rune/FpML expressions using the existing corpus fixture/source infrastructure. Require zero unexplained Python display refusals for valid linked expressions; report syntax/linking/native-binding requirements separately. Absence of `.resources` may skip the extended local scan, but not the checked-in grammar census or pinned execution battery.
- [ ] Run codegen build, lint/type checks, new projection tests and both unchanged reverse-lens round-trip suites. Run the main plan's browser journey with Python views enabled. Record source pins, coverage, unknown kinds and semantic discrepancies explicitly.
- [ ] Commit `test(codegen): require Python projection coverage and parity`; open the independently reviewable backend PR. Merge/deploy only with authorization for that PR, then run the targeted production journey. The complete redesign is ready only when the main and companion acceptance gates pass.

## Self-review and handoff

The plan supplies a Python implementation rather than relabelling missing support. Expression coverage, executable semantics and reverse-edit safety have distinct tests. Shared name/type/metadata/cardinality resolution remains authoritative; language-specific syntax/runtime are the necessary target boundary. All five Review Focus inputs have a test owner. This is a planned deliverable, not a claim that Python parity currently exists.
