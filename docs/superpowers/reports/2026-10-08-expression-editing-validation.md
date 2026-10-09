# Expression editing validation — 2026-10-08

The [expression editing design](../specs/2026-10-08-expression-editing-design.md)
and both implementation plans are implemented in an isolated checkout based on
`709f85839b6ac4ff8ed8619ac08c6229a61ff98d`. The dirty primary checkout and user
browser tabs were preserved. No production deployment is part of this delivery.

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

## Other built-in emission follow-up

Expression calls now use the `rune` namespace for presence, count, collection and
cardinality helpers, temporal conversions/calendar fields and metadata operations.
Native operators and standard-library calls retain their existing compact syntax.
`contains`, `disjoint` and `distinct` moved from inline closures into the shared
collection runtime; metadata-aware distinct retains its key selection and stable
order. A single source composer now builds TypeScript, JavaScript and sidecar
runtimes, with namespace aliases referencing the existing generic functions and
presence type guard. Metadata definitions remain selected by the existing usage
gate. Bundled imports use the namespace; flat implementation exports remain
available to existing consumers. Python exposes corresponding static aliases,
and helper discovery follows namespace methods and callbacks without including
unrelated helpers.

The missing `rune.exists` regression failed before implementation. Runtime parity
checks cover empty lists, falsy scalars, structural membership/distinct and metadata;
strict compilation covers namespace generic inference and generated imports in all
layouts. The authoritative generator regenerated 63 TypeScript/Zod goldens.
`pnpm --filter @rune-langium/codegen test` passes **2,222 tests**, with the existing
one skip and eight todo. The three Studio worker/projection suites pass **74 tests**;
`pnpm run verify:codegen-corpus` strictly compiles **132 pinned files**. Codegen build
and type checks, scoped lint, formatting, runtime freshness and `git diff --check`
pass. Existing lint warnings remain. No merge or deployment has occurred.

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


## PR review follow-up

Actionable correctness findings across #576–#578 have regression fixes. The
correctness branch forwards the complete indexed-operation action through the
Studio adapter, and its operation regression uses an original MIT `Summarize`
fixture. The separately pinned CDM browser fixture and its dependency cohort remain
unchanged.

The standalone workspace branch now submits current sources and serialized
references to the canonical parser-worker scope pipeline, normalizes file URIs,
and serializes complete parse/link/scope requests. Offline router regressions
cover empty and stale workers, changed dependency symbols, and stale positions.
Confirmed declaration rename/delete invalidates the Inspector binding while
pending/invalid drafts remain repairable. Bundled TypeScript output keeps code
and display projections without stale per-namespace `GeneratedFunc` paths. Choice
symbols flow through core scope, the presentation adapter and the picker; the
picker requires known callable arity and retains confirmed zero-input calls.
Visual-editor reuses core's scope-kind type.

Deferred callable descriptions now materialize through the shared Rune linker
before signatures are read; unreferenced inherited/external functions are available
on the first Builder invocation, with one materialization per document. Unrelated
model stubs remain deferred. Source and Inspector preserve CRLF through actual
Enter, paste and undo/redo commands while retaining full-file offsets. Unfilled
Builder slots use an invalid preview marker, so Apply rejects them even after
switching to Text; the real identifier `___` remains valid.

Parse and hydration now share complete workspace replacement cleanup. A removed
file's enums and Choices disappear from an unchanged owner's scope; parsed and
unmaterialized exports are cleared for empty snapshots too. Three failing
real-worker regressions passed after the shared reset, and all 20 parser/scope
checks passed. The Python-tab finding on the middle PR is fulfilled by integrating
the implemented projection from the top PR.

Expression owners retain their declaration kind across binding, capture and scope
requests. Same-named Data and function declarations resolve independently; ambiguous
legacy names fail closed. The shared core lookup serves Studio and its worker.
Core passed 329 tests and the focused Studio ownership checks passed 22 tests.
Builder scope permits syntax errors in unrelated files while rejecting owner errors
and failed snapshot builds. A failing unrelated-draft regression turned green;
all 12 snapshot/service/scope tests, Studio type checks and scoped lint passed.
Effective output enum scope also covers inherited and dispatch functions. The
simple bare-member example linked through global fallback, but a same-named
member from another enum reproduced a wrong-target binding. A declaration-identity
regression failed before the shared signature fix and passed afterward. The final
core suite passed 331 tests; 139 affected Python projection tests, 12 Studio scope
tests, workspace type checks and scoped lint passed against forced core exports.
Core implementation ranges retain same-line and comment-only bodies as well as
trailing comments, for parsed and serialized models and both LF/CRLF sources.
All five original comment regressions failed before the fix. The expanded
source-range suite passed 16 tests; the final core suite passed 338 tests and
22 affected Studio workspace/projection tests passed. Workspace types and scoped
lint passed against forced core exports.
The trailing-comment boundary now excludes following top-level documentation
while retaining same-line or indented body comments. Three parsed/serialized
LF/CRLF regressions failed before that boundary fix. All 19 source-range tests,
341 core tests and 22 affected Studio tests passed afterward, along with workspace
types and scoped lint. The commit hook now formats after lint auto-fixes so import
rewrites cannot leave formatting drift.

The Python branch preserves signed zero, unwraps implicit metadata feature
bindings, narrows collections element by element and shares declaration-based
scalar classification with the TypeScript input adapter. Internally created
metadata dictionaries carry provenance without adding JSON keys, making nested
function normalization idempotent while leaving ordinary `value` and
`externalReference` Data fields intact. Annotation factories and their Args
companions use the same central runtime-name allocator as other declarations;
strict compilation and execution cover all three TypeScript layouts.

Optional Python metadata arguments and constructor fields retain absence before
conversion, required parameters reject missing values, and falsy zero stays
present. Internally created wrappers preserve their empty metadata across nested
calls. Explicit absent join separators use the TypeScript comma default; omitted,
empty and present separators retain their distinct behavior. These regressions
execute the authoritative TypeScript and Python output against the same inputs.
Implicit switch feature reads unwrap metadata without discarding branch wrapper
provenance. Python `to-int` retains negative zero from numeric and string inputs,
including its reciprocal sign. Both had failing runtime comparisons before the
fix; all 209 projection tests passed afterward.

Shortcut assignments use the allocated Python local binding as their root.
Shared assignment extraction derives shortcut collection and metadata facts from
the existing expression helpers, keeping TypeScript and Python traversal aligned.
Four executable parity regressions cover ordinary and reserved names, collection
roots and metadata roots created by emitted functions. Removing root registration
fails all four; removing shared root facts fails both shape regressions. Restored
code passed 141 Python function tests and 25 Studio workspace/projection/scope
tests. The final codegen suite passed 2,232 tests, with the existing one skip and
eight todo cases; the corpus strictly compiled 132 TypeScript files. Workspace
type checks, lint and the full formatting check passed.

Correctness fixes had failing behavioral regressions followed by passing ones; fixture provenance was reviewed separately.
The standalone #577 broad gates passed 327 core, 1,536 visual-editor, 2,022 codegen
and 1,654 Studio tests. Existing skips/todo cases were retained. The middle branch
also includes the preview mock updates so the shared CodeMirror state API is
exercised without incomplete state-module mocks. Its pre-push hook passed all
workspace type checks.

On the final stack, codegen passed 2,228 tests using supported Python 3.13
(`PYTHON_BINARY`), with the existing one skip and eight todo cases. The pinned
codegen corpus strictly compiled 132 emitted TypeScript files. Workspace type
checks, lint, package builds and generated Python runtime freshness passed;
existing lint warnings remain. The latest standalone workspace gates passed
328 core, 71 LSP, 1,537 visual-editor and 1,657 Studio tests, with two intentional
Studio skips. The final combined Studio suite passed 1,674 tests with the same
two intentional skips; all tracked suites were included. Workspace type checks,
lint, changed-source formatting, package builds and runtime freshness passed.
The final builds were forced after discovering stale compiled core output from
stack branch switches; the inherited dispatch fixture then passed against the
rebuilt exports. The 2,228-test codegen run includes the latest Python fixes.

Full Studio runs exclude the ignored local reproduction under
`test/prod-ux/report/**`, which asserts the former bug; every tracked Studio suite
is included. Review fixes are delivered through the existing open PR stack;
the user subsequently authorized top-down integration using merge commits after fresh review and CI checks. This validation does not claim a production deployment.
