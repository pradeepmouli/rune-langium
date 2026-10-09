# Function and Condition Editing Redesign

**Status:** Implemented and locally verified; PR review and authorized production deployment pending.
**Date:** 2026-10-08
**Implementation:** [Main plan](../plans/2026-10-08-expression-editing.md), [Python projection plan](../plans/2026-10-08-python-expression-projections.md).
**Evidence:** [Validation and final review fixes](../reports/2026-10-08-expression-editing-validation.md).

## Problem and evidence

FunctionForm renders each operation separately but commits every operation through one field and an action that replaces `operations[0]`. A component reproduction using CDM's `ConvertToAdjustableOrRelativeDate` confirmed that editing operation 1 changes operation 0. Production renders ten builders for that function, omits nested assignment paths from all ten headings, and switches all ten editors when one builder/lens toggle is clicked. Aliases are separate read-only blocks.

LanguageLensEditor reparses isolated text and gates display on a 12-node reversible subset. The current corpus scan found refusals for 1,196/1,454 operation expressions, 681/775 conditions and 451/652 aliases. Eight of 238 source files had syntax errors and were excluded. Pinned, linked CDM functions such as Abs, Min and FilterQuantityByCurrency generate and strictly compile as TypeScript despite being refused by the lens. Python has the same narrow display coverage; no full Python backend was verified.

The old [lens design](2026-07-11-expression-language-lens-design.md) remains authoritative for **accepted foreign-language write-back safety**. This design supersedes its use of reversibility as a display boundary, and the [Phase 2 plan](../plans/2026-07-12-expression-language-lens-phase2.md)'s single-operation editing restriction.

## Product behavior

### Functions

Keep the existing schema-backed name, documentation, inheritance and typed signature controls. Below them, show one continuous **Implementation** editor. It contains aliases, preconditions, ordered `set`/`add` statements and postconditions in the order required by the Rune grammar. Assignment paths, comments, indentation and blank lines stay visible and editable. Remove duplicate function condition editing beneath this buffer.

One toolbar contains **Rune / TypeScript / Python**, **Build expression**, and **Open in Source**. Rune is the default editable view. Generated language views are read-only by default, labelled **Generated view**, with ordinary copy/select/search controls. Selecting a projection never disables or changes other conditions' editor state.

The editor keeps normal text behavior: multi-line selection/paste, indent/outdent, search, undo/redo and keyboard navigation. Typing temporarily invalid Rune retains the user's text, shows diagnostics and does not restore stale source. Projection results from the last valid revision are labelled stale while a new parse is pending or invalid.

Structural form actions that would regenerate that declaration wait until the owning draft has a current successful parse, with a visible explanation. The Rune text editor remains editable. This prevents a signature/rule-list action from overwriting an invalid or newer draft through graph-to-source reconciliation.

### Data conditions

The Conditions tab contains a compact selectable rule list and one active rule editor. Name and description remain schema-backed fields for the selected rule. The expression uses the same Rune editor, language toolbar and builder dialog as function expressions. Conditions retain their independent identities; selecting, reordering or deleting a rule cannot redirect an open draft to a different condition.

### Builder dialog

Build expression acts on the expression at the caret, or on a selection that matches a parsed expression. It opens a large dialog with **scope**, **builder canvas** and **Rune preview**, shown once. Apply and Cancel are explicit. Editing the builder does not mutate the workspace until Apply; Apply replaces exactly the captured expression and creates one undo entry. Cancel and Escape leave source unchanged and return focus to the triggering editor.

If the captured expression or workspace changes while the dialog is open, Apply is blocked with `The source changed. Reopen the builder to apply this draft.` The draft remains available to copy. An unsupported builder node is preserved as exact Rune text; it is never simplified or replaced by a placeholder. The text editor remains available for every valid Rune expression.

Use existing design-system Dialog, buttons, tabs, surfaces and tokens. Dialog width is at most 1120px and leaves 16px on each viewport edge; height leaves the same clearance. Scope/canvas/preview stack on narrow screens. The Inspector editor grows within its pane instead of creating repeated small scroll boxes.

## Canonical document and package boundaries

Rune source in the owning workspace **file** is authoritative. A namespace is not a file identity: two files in one namespace must remain distinct. Body and condition edits use the existing `handleSourceChange(path, content)` → workspace parse/reconcile path. They do not concatenate namespace source or maintain a second AST mutation pipeline.

Core supplies CST-derived regions, using original UTF-16 offsets. It owns body/expression location and inherited attribute/function signature resolution. Studio owns the file binding, revision checks, CodeMirror views, workers and network LSP. Visual-editor owns form layout, builder presentation and host slots; it gains no Studio imports or CodeMirror dependency. Codegen owns derived TS/Python projection semantics and accepted foreign parse-back.

The Inspector's CodeMirror document retains the complete owning file internally, with content outside its region concealed and protected from user editing. This preserves real URI and LSP coordinates. Source and Inspector changes flow through the same workspace buffer. External synchronisation does not become another user undo entry. Only one view per URI owns the LSP plugin's didChange stream at a time; focus transfers ownership and flushes pending edits. LspProvider remains the sole didOpen/didClose owner.

Read-only curated/system declarations can be viewed and projected after the existing lazy source hydration. Editing and builder Apply remain disabled. Missing source is a loading/error state, never an empty writable body. A new source-less declaration must obtain an owning file through the existing create/serialize flow before region editing begins.

## Projection capabilities

**Rendering policy clarification (2026-10-08):** Prefer readable native operators and collection expressions in both editor projections and exported code, using one authoritative backend. Specialize scalar comparisons when resolved types/cardinalities prove the native expression preserves behavior. Rune does define list, null and other operator behavior; JavaScript object identity or coercive equality must not silently replace it. Keep a narrowly justified helper only when faithful native lowering would be misleading or disproportionately obscure. Helper minimization does not broaden accepted foreign write-back. Validate generated behavior against the pinned execution corpus.

Separate three facts: **Rune parses/links**, **a target can display the model**, and **foreign edits can map back safely**. Never infer one from another.

TypeScript function display reuses the actual codegen worker output and `GeneratedFunc.fileContents`, including resolved inputs/output, aliases, conditions, nested assignments, cardinality and metadata semantics. Data-condition display comes from metadata recorded by the existing emitter while it calls the same authoritative transpiler. Do not reparse display text in isolation or invent a UI transpiler.

Python display needs a broader codegen projection backend, specified in the companion plan. It is a display/execution projection, not an expansion of the accepted reverse-edit subset. All current grammar expression kinds must be accounted for; helper-backed Python is acceptable when Rune semantics differ from native operators. Native functions remain explicit bindings, not fabricated implementations.

The existing TS/Python reverse lens can remain available as an explicit selected-expression editing action in the dialog, only for its proved subset. Validate parse-back and schema validity before a single source-range commit. Whole generated function bodies are not accepted as editable foreign source in this iteration. Failed generation reports its actual parse/link/generation diagnostic; read-only status is not an error.

Projection cache identity includes workspace generation, owning URI/revision, selected declaration/condition, dependency cohort/revision and generation options. Ignore stale async results. Never regenerate or reload the full closure once per operation or once per tab click when the valid worker snapshot already contains it.

## Shared scope

Resolve function inputs and output through core's `getFunctionSignature`, including inherited/dispatch signatures. Use the actual output identifier. Resolve aliases in grammar order. Data conditions receive own/inherited attributes, choices, enum values and imported callable references through the same authoritative scopes used by core/LSP, not an ad hoc name resolver in React.

## Constraints

- DRY is the primary correctness rule; reuse authoritative parse, source, scope and codegen paths.
- Runtime engines: `^22.22.2 || ^24.15.0 || >=26.0.0`; package manager: `pnpm@11.5.0`.
- No dependency upgrades or generated AST/schema edits are part of this redesign.
- New `packages/` source is MIT; new `apps/studio/` source is FSL-1.1-ALv2. Studio is source-available.
- Preserve dirty primary checkouts, attached peer edits, `.resources` and user browser tabs.
- Invalid drafts and unsupported reverse edits never silently become different Rune logic.
- Documentation and continuity changes travel with their implementation task.

## Acceptance and delivery

1. Editing any operation targets it correctly; multi-file locality and undo regressions pass.
2. The CDM ten-operation function has one implementation editor; aliases, paths, conditions and operations can be edited together.
3. The builder applies only to its captured expression; cancel, stale draft, read-only and workspace-switch cases are safe.
4. Data rules use the same editor and dialog with correct attribute scope and independent state.
5. Supported linked Rune functions/conditions produce complete TS and Python views without the old blanket refusal. Rendering coverage and reverse-edit coverage are tested separately.
6. Pinned compilation/execution tests, original-source locality checks and corpus reports establish the claims. Unknown grammar kinds fail a coverage gate instead of emitting placeholders.
7. Isolated browser tests confirm keyboard behavior, LSP lifecycle, narrow layouts and cosmetic alignment with Explore. Production validation follows an explicitly authorised merge/deployment; local passing tests alone are not production evidence.

Deliver a small correctness fix first, then the document/UI redesign and TypeScript projection, followed by the independently reviewable Python backend. Do not call the full redesign complete while Python display coverage is still missing.
