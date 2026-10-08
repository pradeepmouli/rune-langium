# Expression editing validation — 2026-10-08

The [expression editing design](../specs/2026-10-08-expression-editing-design.md)
and both implementation plans are implemented in an isolated checkout based on
`709f85839b6ac4ff8ed8619ac08c6229a61ff98d`. The dirty primary checkout and user
browser tabs were preserved. No merge or deployment is part of this delivery.

## Result

Functions have one continuous Rune implementation buffer containing aliases,
preconditions, ordered nested set/add assignments and postconditions. Data
conditions have an independent active editor. Source and Inspector share compact
CodeMirror chrome, full-document offsets and one LSP plugin owner per URI.
The Builder opens a scoped private draft dialog; Apply commits one undo entry,
and Cancel/Escape preserve source. Required current-parse, revision, workspace,
read-only and expected-byte guards also protect constrained foreign-language edits.

TypeScript display records the authoritative emitted function/condition output.
The complete typed Python backend shares linked declarations, cardinality,
navigation and metadata facts with codegen. Display support is separate from the
limited inverse-editing subset. Native scalar operators also apply to exported
TypeScript where their shared proof establishes equivalence; null, collection,
metadata, temporal and structured-value semantics retain necessary helpers.

## Equality emission follow-up

Following the requested naming change, structural comparisons use
`rune.equals(left, right)` in TypeScript and Python. Collection comparisons pass
their `all`/`any` quantifier and optional inequality flag to the same namespace;
the long per-expression TypeScript comparison closure moved into the shared
runtime. Compact native scalar operators retain the existing linked type proof.
The actual exports, recorded projections and executable previews share this
emission policy. Generated runtime files and 63 golden outputs were regenerated
from their authoritative sources.

Behavioral checks cover empty and unequal collections, scalar broadcasting,
structural and temporal values, namespace dependency reporting, and legal `rune`
names in declarations, aliases, outputs and inline parameters. TypeScript
compilation and execution verify these names in all three export layouts.

Verification: `pnpm --filter @rune-langium/codegen test` passed **2,220 tests**
with the existing one skip and eight todo; Python checks used the supported 3.13
interpreter via `PYTHON_BINARY`. Studio's codegen-runtime, codegen-worker and
expression-projection suites passed **74 tests**. `pnpm run verify:codegen-corpus`
strictly compiled all **132 pinned generated files**. Codegen build/type checks,
scoped lint and authored-source formatting, generated Python runtime freshness,
and `git diff --check` passed. Existing lint warnings remain. This follow-up is
part of the open PR stack and has not been merged or deployed.

## One final review and fix pass

A fresh reviewer examined the entire branch through `fcb1a567`, reporting six
Important findings, no Critical findings and no separate Minor findings. All six
were accepted by user effect and fixed in one pass with failing behavioral
regressions followed by passing regressions and the affected broad suites:

1. Required function outputs and aliases no longer count as initialized scalar
   operands. Absent results propagate to the final cardinality error in both
   targets, rather than returning TypeScript NaN or a Python None arithmetic
   error. Python's temporary result type includes None while its public required
   return signature remains required.
2. Complete parser-worker requests serialize access to mutable Langium documents
   and indexes. Scope's parse/link/read sequence cannot consume a competing
   snapshot, including dependency-only replacements. Failed builds fail the
   scope response; the queue remains usable afterward.
3. The workspace document session retains mapped regions across Inspector
   disposal. Invalid function drafts can be reopened and repaired; changed
   signatures, targets and workspace generations require fresh coordinates.
4. Python comprehensions use the existing fresh-name allocator. Legal declarations
   cannot shadow builtins used by emission/runtime. A test scans the authoritative
   Python AST and checks every usable builtin name against generated bindings.
5. Only-exists common-parent selection compares canonical AST structure instead
   of rerendering receivers that allocate fresh temporary names. Computed common
   parents render once; different parents remain rejected.
6. Python numeric strings preserve shortest round-trip digits with the canonical
   TypeScript fixed/scientific notation thresholds and exponent format.

Focused post-fix gates passed: 140 codegen tests and 33 Studio tests. Their RED
counterexamples and final review report are preserved as local evidence under
`dist/expression-editor-validation/`; they are not production proof.

## Verification

- `PYTHON_BINARY=<Python 3.13> pnpm --filter @rune-langium/codegen exec vitest run --maxWorkers=2`:
  2,217 passed, one pre-existing skip and eight pre-existing todo cases.
- `pnpm --filter @rune-langium/studio exec vitest run --maxWorkers=2`:
  1,660 passed, two intentional skips plus one build-artifact-dependent skip while
  the concurrent build replaced dist. The post-build bundle hygiene test was then
  run separately and passed; that gate was not left unverified.
- `pnpm --filter @rune-langium/visual-editor exec vitest run --maxWorkers=2`:
  1,534 passed. The unchanged core suite passed 326 tests before the final pass.
- `PLAYWRIGHT_BASE_URL=http://localhost:5273 PLAYWRIGHT_EXPRESSION_LSP=1 pnpm --filter @rune-langium/studio exec playwright test test/e2e/expression-workspace.spec.ts --retries=0 --reporter=list`:
  seven Chromium journeys passed. They cover a pinned ten-operation function,
  alias/precondition/body/postcondition editing and undo, active Data conditions,
  invalid-draft remount/repair, complete typed views, private builder drafts,
  real local Wrangler LSP ownership, keyboard focus/Escape, settled axe checks
  in builder and Text modes, and 800/1280px with the existing largest pane font.
- `pnpm run type-check`, `pnpm run lint`, affected formatting, `git diff --check`,
  codegen/Studio builds and generated Python runtime freshness passed. Existing
  lint and bundle warnings remain. Workflow YAML syntax passed; actionlint was
  unavailable.
- Staged Python corpus: 186 linked documents, 1,295 functions, 929 Data conditions,
  86 explicit native bindings, zero syntax exclusions, unresolved declarations
  or display refusals. Staged revisions are CDM 7.0.0-dev.83, Rune 9.76.2 and
  the separately hashed staged FpML master cohort.
- `node scripts/verify-codegen-corpus.mjs`: 132 generated TypeScript files from
  189 linked documents compile strictly. Its production pins are CDM
  `c817e5f78b86c2c61caa9291efc1322697bed5ca`, FpML 3.5.0
  `675b4ca8faa27f71e345f127e890202b08456750`, and Rune 10.10.0
  `8ff5a7b39031876ef06c901102c8d96cf90236c4`. The two cohorts are reported
  separately rather than combining incompatible definitions.

## Delivery and limits

The stack consists of the indexed-operation correctness fix, the source/UI/TS
redesign, then the Python backend and final cross-target fixes. Review these
independently, but integrate the complete stack. To preserve ancestry, merge the
top PR into the middle branch, the middle into the correctness branch, then the
correctness branch into master using merge commits after authorization.

Hosted curated read-only journeys and production J10 require the deployed
redesign and remain post-deployment checks. Local serialized-curated worker and
read-only/stale guards passed. Settings currently exposes one fixed dark theme;
there is no claim of testing another theme. Native functions require explicit
bindings, and Python named IANA-zone dates retain datetime's year range 1..9999.

`pnpm exec changeset status` is blocked by existing private/skipped
design-system and instrumentation-core dependency configuration, unchanged from
the base revision. The consolidated changeset is present, but release preview
did not pass and package publication needs that separate configuration repair.
