# Research: Rune-Langium Native Code Generators

**Feature**: `015-rune-codegen-zod`
**Phase**: 0 (Outline & Research)
**Date**: 2026-04-26

This document resolves all technical decisions that shape Phase 1
(data model, contracts, quickstart). Each section corresponds to a
locked-in clarify answer or an architectural question surfaced during
repo exploration. No NEEDS CLARIFICATION markers remain.

---

## R1 — Langium codegen idioms (FR-001, FR-007, SC-007)

**Decision**: Use `expandToString` for simple single-line fragments
(type aliases, enum members, import statements) and `expandToNode`
for multi-line structured output (object bodies, `superRefine`
closures). Chain `joinToNode` for comma-separated or newline-
separated lists of AST-derived strings. Capture source positions via
`toStringAndTrace` at the top level of each emitted module to build
the source map delivered in `GeneratorOutput.sourceMap`.

**Rationale**: These four functions are the canonical Langium codegen
API (`langium/generate`). `expandToString` handles indentation via
template-string backtick syntax and produces a plain `string`.
`expandToNode` produces a `Generated` node graph that defers
rendering, allowing `toStringAndTrace` to walk the node tree and emit
`(outputOffset, sourceUri, sourceLine, sourceChar)` tuples — exactly
what source-map consumers need (FR-018). Using `joinToNode` for
attribute lists preserves deterministic insertion order without manual
comma-bookkeeping, satisfying SC-007's byte-identical re-run
requirement.

**Alternatives considered**:
- *Hand-rolled template strings with `Array.join(',')`*: deterministic
  but loses the source-map tracing that `toStringAndTrace` provides
  for free. **Rejected** (source mapping for all three targets is
  mandatory per Q4/B).
- *`generationContext` from langium's `LangiumGeneratorContext`*:
  undocumented internal API in Langium 4.2.x; unstable across patch
  releases. **Rejected**.

---

## R2 — Zod 4 vs. Zod 3 (FR-002, FR-003, FR-004)

**Decision**: Target Zod 4 (`^4.3.x`). The workspace already uses
`zod@^4.3.6` in `packages/curated-schema` (`package.json` dep). The
new `packages/codegen` does NOT depend on Zod at runtime; the Zod
version is a concern for consumers of the emitted files, not the
generator itself. Fixture tests use the workspace's Zod 4 install to
validate emitted files.

Key Zod 4 API shapes used in emitted output:

```ts
// Required scalar
z.string()
// Optional scalar
z.string().optional()
// Array cardinality
z.array(z.string())               // (0..*)
z.array(z.string()).min(1)        // (1..*)
z.array(z.string()).min(2).max(5) // (2..5)
z.array(z.string()).length(3)     // (3..3) where n>1
// Enum
z.enum(['Buy', 'Sell'])
// Object
z.object({ field: z.string() })
// Extend (inheritance)
ParentSchema.extend({ extra: z.number() })
// Lazy (circular)
z.lazy(() => FooSchema)
// Refine / superRefine
schema.superRefine((val, ctx) => { ... })
```

**Rationale**: Zod 4 is the current workspace standard. Zod 3's
`.superRefine()` API is compatible, but Zod 4 adds improved error
message customization (`ctx.addIssue` with `code: z.ZodIssueCode.custom`).
The emitted `.superRefine()` bodies target Zod 4's `ZodIssueCode`
enum for consistent error-message format. Committing to Zod 4 avoids
dual-version hedging in the fixture suite.

**Alternatives considered**:
- *Zod 3 (`^3.22.x`)*: older but still widely deployed. Workspace
  already standardized on 4. **Rejected**.
- *Emit both Zod 3 and Zod 4 variants via a `--zod-version` flag*:
  doubles the fixture surface; no user demand. **Rejected**.

---

## R3 — Cycle detection and topological sort (FR-006, FR-007, SC-007)

**Decision**: Two-pass graph processing.

**Pass 1 — Tarjan's SCC**: Build a `TypeReferenceGraph` (adjacency
list of `Data` node names) by scanning all attribute types in all
documents. Run Tarjan's strongly-connected-components algorithm to
find all SCCs of size ≥ 2 (mutual cycles) or size 1 with a self-edge
(self-reference like `type Foo: child Foo (0..1)`). Every type that
participates in any SCC is marked as `requiresLazy: true`.

**Pass 2 — Kahn's algorithm on the DAG residual**: Collapse each SCC
into a single node, producing a DAG. Run Kahn's topological sort on
the DAG to determine emit order. Types within an SCC are emitted in
the order they appear in the original Langium document (stable, since
Langium preserves source order). This guarantees that non-cyclic
forward references are always declared before first use (FR-007).

For cyclic pairs, the first-encountered type in document order emits
the `z.lazy(() => OtherSchema)` wrapper; the second is declared
normally. `z.lazy(() => …)` makes the reference late-bound at
validation time, breaking the initialization cycle.

**Alternatives considered**:
- *DFS-based cycle detection only (no Tarjan)*: simpler, but produces
  false positives (DFS back-edges may over-flag non-cyclic paths in
  large graphs). **Rejected**.
- *Always emit `z.lazy()` for all types*: eliminates the cycle problem
  but produces verbose output that fails `tsc --noEmit` for certain
  generic inference paths. **Rejected**.
- *Johnson's algorithm*: finds all simple cycles; overkill for a
  schema graph where only mutual-reference pairs matter. **Rejected**.

---

## R4 — JSON Schema 2020-12 emission strategy (FR-019, US5)

**Decision**: Use `zod-to-json-schema` (or a thin custom walker) to
derive the JSON Schema output from the same intermediate
representation (TypeReferenceGraph + EmissionContext) that the Zod
emitter uses, NOT from the emitted Zod strings. The JSON Schema
emitter walks the same sorted-type list and emits a single
`$defs`-based document per namespace, with `$ref: '#/$defs/TypeName'`
for cross-type references. Cardinality encodes as
`"type": "array", "minItems": n, "maxItems": m` (or `"minItems": 1`
for `(1..*)`, no `maxItems` for `(0..*)`) and required-field tracking
via the JSON Schema `"required": [...]` array.

**Source mapping for JSON Schema**: Use JSON Pointer strings
(`/properties/account`, `/$defs/Party`) as the output-side key. Each
pointer maps to a `(sourceUri, sourceLine, sourceChar)` tuple
delivered in `GeneratorOutput.sourceMap`. The Studio's click handler
walks from clicked DOM node → JSON Pointer → source location (FR-018).

**Rationale**: JSON Schema 2020-12 is the meta-schema that downstream
schema registries and OpenAPI tooling consume. The `$defs` + `$ref`
pattern is the idiomatic 2020-12 form for type reuse; `definitions`
is the JSON Schema draft-07 form and is NOT used here (FR-019 targets
2020-12 explicitly). Deriving from the same IR — not from the emitted
Zod strings — keeps the two targets structurally consistent and avoids
a string-parse step.

**Alternatives considered**:
- *Derive JSON Schema by running `zod-to-json-schema` over the emitted
  Zod module at runtime*: requires executing the emitted TypeScript,
  which is out of scope for a browser-native generator. **Rejected**.
- *Emit JSON Schema draft-07*: incompatible with the explicit FR-019
  requirement (2020-12 meta-schema validation). **Rejected**.
- *Sidecar source-map file (`.map` JSON)*: adds a second output file
  per namespace; the `GeneratorOutput.sourceMap` field already handles
  this in-memory. **Deferred** to a future export-optimisation if
  consumers need on-disk `.map` files.

---

## R5 — Class-style TypeScript emission (FR-020, US5, Q4b/C)

**Decision**: The TypeScript target emits full `.ts` modules with:

```ts
// Interface (structural shape for plain-data compatibility)
interface PartyShape {
  partyId: string;
  accounts: Account[];
}

// Class
class Party implements PartyShape {
  partyId: string;
  accounts: Account[];

  // Static factory — validates and instantiates
  static from(json: unknown): Party { ... }

  // Type guard
  // (top-level, not instance method — TS convention)
}

// Top-level type guard
function isParty(x: unknown): x is Party { ... }

// Discriminator predicate (for inheritance hierarchies)
function isQuantity(x: MeasureBase): x is Quantity { ... }

// Condition instance methods
// (one per named condition on the type)
validateNonNegative(): { valid: boolean; errors: string[] } { ... }
```

Condition methods reuse the same expression transpiler (`expr/transpiler.ts`)
as the Zod target, but emit the predicate body as a method body
rather than a `.superRefine()` closure. The return type
`{ valid: boolean; errors: string[] }` mirrors the Java and C#
Rosetta generators' `ValidationResult` shape (SC-005, FR-020). The
emitted module has zero `import … from 'zod'` statements (verified
by the fixture test's `assertNoZodImport` check).

**Condition method vs. `.superRefine()` body**: the expression
transpiler receives an `EmitMode` parameter (`'zod-refine' |
'ts-method'`). In Zod mode, the predicate pushes to `ctx.issues`;
in TS-method mode, it pushes to a local `errors` array and returns
`{ valid: errors.length === 0, errors }`.

**Runtime helpers in TS target**: the three helpers
(`runeCheckOneOf`, `runeCount`, `runeAttrExists`) are also inlined
into the TS-target output as `const` function declarations,
identically to the Zod target. No Zod dependency in their
implementations.

**Alternatives considered**:
- *Emit `.d.ts` declaration files (ambient declarations only)*:
  matches what Rosetta TS generator does; provides no runtime value.
  **Rejected** — Q4b/C explicitly chose full class emission.
- *Emit interface-only + factory functions (no class keyword)*:
  simpler but loses `instanceof` support and diverges from the Java /
  C# parity narrative (SC-005). **Rejected**.
- *Emit a `validateAll(): ValidationResult[]` method that runs all
  conditions together*: additive, can be added later. Not in scope
  for this feature.

---

## R6 — Studio target-switcher integration (FR-017, FR-018, US4, Q4/B)

**Decision**: The Studio mounts a `CodePreviewPanel` component on the
right-hand dockview panel group (reusing the existing dockview layout
from feature 012/014). The panel contains:

1. A `TargetSwitcher` (segmented control: "Zod" | "JSON Schema" |
   "TypeScript"). Default: "Zod". Selection persists in local
   workspace state (zustand store) per workspace.

2. A read-only Monaco editor instance (the same Monaco instance used
   by the source editor, just in read-only mode) displaying the
   generated output for the active target.

3. A status indicator: green "up to date" when the last build phase
   succeeded, amber "outdated — fix errors to refresh" when the
   source has parser errors (FR-017 last-known-good retention).

**Generation trigger**: The Studio's existing build-phase listener
(the langium document lifecycle event fired after a successful parse
+ validation) fires the codegen call. The generator runs in the LSP
Web Worker (already exists from 014) so generation does not block
the main thread. Output strings + source map are posted back to the
main thread via `postMessage`. A debounce of 200ms prevents bursts
of edits from queuing up multiple generation runs.

**Source-map click handler**: Each line of the Monaco read-only editor
is decorated with a `GeneratorOutput.sourceMap` entry. On
`editor.onMouseDown`, the handler looks up the clicked line in the
source map and calls the Monaco main editor's `revealLineInCenter` +
`setSelection` to navigate to the originating Rune source location
(FR-018).

**Alternatives considered**:
- *Use a plain `<textarea>` or `<pre>` for the preview*: simple but
  loses syntax highlighting and the click-to-navigate affordance
  (FR-018). **Rejected**.
- *Separate Web Worker per target*: reduces latency when all three
  targets are computed in parallel, but adds message-routing
  complexity. The studio only shows one target at a time; lazy
  generation on target switch is sufficient. **Rejected** for initial
  implementation; can be revisited if generation time becomes a
  problem at scale.
- *Source-map delivered as a sidecar JSON file*: unnecessary overhead
  for the in-process Studio context. `GeneratorOutput.sourceMap` is
  passed in-memory. **Rejected**.

---

## R7 — Package rename strategy (FR-026, FR-027, Q1/B)

**Decision**: Atomic three-step rename within a single change set
(Phase 1 of the implementation plan):

**Step 1**: In `packages/codegen/`, update only `package.json`:
  - `name`: `@rune-langium/codegen` → `@rune-langium/codegen-legacy`
  - Add `deprecated` field: `"This package is the legacy JVM-bridge codegen. Use @rune-langium/codegen for the Langium-native generator."`
  - All other fields (`version`, `exports`, `dependencies`) unchanged.
  - Do NOT rename the directory yet (pnpm workspace symlinks use the
    package name from `package.json`, not the directory name; but the
    directory name helps humans). After `package.json` update, rename
    directory from `packages/codegen` to `packages/codegen-legacy`.

**Step 2**: Update the root `pnpm-workspace.yaml` if the directory
pattern is glob-based (it is: `packages/*`). No change needed —
`packages/codegen-legacy` still matches `packages/*`.

**Step 3**: Update all downstream consumers to import from
`@rune-langium/codegen-legacy` instead of `@rune-langium/codegen`:

| File | Change |
|------|--------|
| `apps/codegen-container/package.json` | dep: `@rune-langium/codegen` → `@rune-langium/codegen-legacy` |
| `apps/codegen-container/src/server.ts` | all import paths |
| `apps/codegen-container/test/server.test.ts` | all import paths |
| `packages/cli/package.json` | dep: `@rune-langium/codegen` → `@rune-langium/codegen-legacy` |
| `packages/cli/src/generate.ts` | all import paths |
| `packages/cli/src/types/codegen-types.ts` | all import paths |
| `apps/studio/package.json` | dep: `@rune-langium/codegen` → `@rune-langium/codegen-legacy` |
| `apps/studio/src/services/codegen-service.ts` | all import paths |
| `apps/studio/src/components/ExportDialog.tsx` | all import paths |

**Step 4**: Create the new `packages/codegen/` directory from scratch
(Phase 2). The new package takes the canonical `@rune-langium/codegen`
name with MIT license.

**Verification gate**: `pnpm install && pnpm -r run type-check` must
pass before Phase 2 begins. The pre-push hook enforces this.

**Alternatives considered**:
- *Keep `packages/codegen` as the JVM bridge; put the new generator
  in `packages/codegen-native`*: forces downstream consumers to adopt
  a non-canonical name for the primary generator. **Rejected** per
  Q1/B.
- *Two-PR approach (rename first, new package second)*: each PR is
  smaller, but the first PR leaves the workspace with a broken
  `@rune-langium/codegen` dep between merges if the second PR is
  delayed. **Rejected** for atomicity.

---

## R8 — CDM smoke-test execution plan (FR-023, FR-024, Q2/A)

**Decision**: Two-tier execution plan for the CDM smoke test.

**Tier 2a — `tsc --noEmit` structural guard**:
1. `cdm-smoke.test.ts` calls `generate(cdmDocuments, { target: 'zod' })`
   (and separately for `json-schema` and `typescript` targets).
2. Generator output strings are written to a temp directory
   (`os.tmpdir() + '/rune-codegen-smoke-' + Date.now()`).
3. A dedicated `tsconfig.smoke.json` in `packages/codegen/test/`
   points `rootDir` at the temp dir and enables `strict: true`. The
   test shells out `tsc --project tsconfig.smoke.json --noEmit`.
4. Non-zero exit code → test fails with the `tsc` stderr as the
   failure message.

**Tier 2b — JSON battery**:
1. For each condition kind in the taxonomy (one-of, choice, exists,
   only-exists, path-navigation, arithmetic, if-then-else, disjoint),
   one JSON fixture pair exists: `valid.json` (MUST parse) and
   `invalid.json` (MUST fail parse with a message naming the
   condition).
2. `cdm-smoke.test.ts` imports the emitted Zod schemas via
   `require(tempDir + '/cdm/...js')` (dynamic require, ESM-compatible
   via `createRequire`) and calls `schema.safeParse(json)`.
3. Pass condition: `safeParse(valid.json).success === true` and
   `safeParse(invalid.json).success === false`. The invalid case also
   asserts that `error.errors[0].message` contains the condition name.

**No committed CDM snapshot**: CDM output is regenerated on every run.
The temp directory is cleaned up after the test. CI fails only if
`tsc --noEmit` errors or a JSON battery case fails.

**Alternatives considered**:
- *Commit the full CDM snapshot (`~10–50 MB`)*: structural regressions
  are caught, but every grammar tweak produces a massive diff that
  obscures the real change. **Rejected** per Q2/A.
- *Run `tsc` via the TypeScript compiler API (no subprocess)*:
  eliminates the subprocess overhead but requires bundling `typescript`
  as a devDep and managing `ModuleResolutionHost` complexity.
  The subprocess approach is simpler and matches the user's actual
  `tsc --noEmit` workflow (SC-001). **Accepted as subprocess**.
- *Use `ajv` to validate JSON Schema output against the 2020-12
  meta-schema at smoke time*: additive correctness check. Included in
  the JSON battery for the JSON Schema target (Tier 2b extension for
  Phase 4).

---

## Open questions resolved

All Technical Context items and clarify answers are resolved. No
remaining NEEDS CLARIFICATION markers.

| Clarify answer | Resolution |
|---|---|
| Q1/B — Package rename | R7: atomic three-step rename within Phase 1; consumers re-wired in same change set; verification gate = `pnpm -r run type-check` |
| Q2/A — Two-tier testing | R8: Tier 1 = committed fixture-diffs (byte-identical); Tier 2 = `tsc --noEmit` + JSON battery; no CDM snapshot |
| Q3/A — Inline runtime helpers | R5 (helpers section): three helpers inlined as `const` declarations in every emitted file; no `@rune-langium/runtime` package; adds ~30 LOC per file |
| Q4/B — Studio multi-target preview | R6: target switcher on `CodePreviewPanel`; source mapping for all three targets; generation in LSP worker |
| Q4b/C — Full class-style TypeScript target | R5: `class` + `interface` + `isType()` guard + `from()` + `validate*()` methods; zero Zod imports; expression transpiler reused |
