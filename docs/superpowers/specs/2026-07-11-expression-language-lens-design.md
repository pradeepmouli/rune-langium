# Feature Specification: Expression Language Lens

**Feature Branch**: `020-expression-language-lens`
**Created**: 2026-05-29
**Revised**: 2026-07-04 (against HEAD `720f8c6`: PRs #363–#372. The transpiler-parity work (#364–#367) closed the TS expression-coverage gap that defined the lens's day-one read-only boundary — `ThenOperation`, `SwitchOperation`, `ToEnumOperation`, `RosettaOnlyExistsExpression` and ~12 more now transpile; transpiler grew 1,178 → 1,600 lines with 70 dispatch branches. PR #371 added a schema-validity gate to `cst-reuse-renderer` — a new, load-bearing integration constraint for lens write-back. Corpus test ceilings not yet ratcheted.)
**Status**: Draft
**Input**: Let studio users read and write Rune `condition` and `func` expressions in a language they are already comfortable with (TypeScript first; Python later) while the canonical stored form remains pure Rune. The foreign language is a *view/edit lens*, never a persisted form. The defining contract is a total bijection over a defined expression subset, with hard refusal — never silent degradation — outside it.

## Context and Scope Boundary

This feature is **deliberately separate** from inbound code generation (spec 019). The two have opposite loss tolerances and must not share a contract:

- **Inbound import (019)** is one-way and *allowed to be lossy*: it may emit a stub plus a diagnostic for source constructs outside its supported subset, because the user runs it once and hand-fixes the result.
- **The language lens (this spec)** is *not allowed to be lossy*. A user who writes a TypeScript expression, switches to the Rune view, and finds their logic silently degraded would (correctly) stop trusting the tool. The lens must round-trip its supported subset perfectly and **refuse** anything outside it, inline, before it can become canonical.

Because of this, the lens is a stricter contract than import, not a looser one.

### Canonical Form Is Always Pure Rune

The stored source of truth for every expression is, and remains, Rune DSL text in the `.rune` file. TypeScript (and later Python) are **pure projections with no persistence**. The model never stores a foreign-language expression. This single decision removes the hard half of the problem: no merge between languages, no mixed-language storage, no "which view is authoritative" reconciliation. The only invariants to defend are *projection fidelity* and *write-back validity*.

## Layering (REVISED ×2) — Follow the Repo's Established Pattern

The first draft placed the feature under the studio (FSL). The second revision argued the transpiler belongs in `@rune-langium/core`. The repo has since made its own layering decision, and it is better than either: **direction-specific rendering lives in `@rune-langium/codegen` behind a browser-safe subpath; parsing and the AST live in core.** As of HEAD `b3434b9`:

- `@rune-langium/codegen/rosetta` (a dedicated package subpath with **no fs/ExcelJS/generator imports** — explicitly browser-hot-path safe) exports `renderExpression`, `renderNode`, `renderModel`: the full AST→Rosetta renderer.
- `@rune-langium/core` exports `parseExpression`: expression-granularity parsing.
- `packages/codegen/src/expr/transpiler.ts` remains the Rune-AST→TypeScript direction.

So codegen already hosts **both existing directions of expression translation** (Rune→TS via `transpiler.ts`, Rune-AST→Rune-text via `render-expression.ts`), with core supplying the parse side. The lens's one genuinely new direction — **TS→Rune-AST parse-back with subset validation** — belongs beside them. Placing it in core, as the previous revision argued, would split the bijection across two packages for no consumer benefit: codegen is equally consumable by the CLI, the inbound importer (019), and the studio, and it is where the sibling machinery and its test corpus already live.

Corrected three-layer split:

| Layer | Package | License | Contents |
|---|---|---|---|
| **Lens bijection** | `@rune-langium/codegen` (new `lens/` beside `emit/rosetta/` and `expr/`) | **MIT** | The subset `S` definition; `render-ts` (projection, may reuse `transpiler.ts`); `parse-ts` + subset check (parse-back, refusal); round-trip tests following the fixed-point + tree-equivalence pattern already established in `test/emit/rosetta/`. Exposed via a browser-safe subpath like `./rosetta`. |
| **Write-back / locality** | `@rune-langium/visual-editor` | MIT | **Already implemented**: `serialize/cst-reuse-renderer.ts` + `serialize/dirty-paths.ts` (see Write-Back below). The lens does not build write-back; it *feeds* it — a lens edit becomes a dirty expression subtree. |
| **Lens UX** | studio app | FSL-1.1-ALv2 | The language toggle, the Monaco-backed projection editor, inline refusal diagnostics. The only studio-side part — and it is thin. |

### Why the lens targets the Langium AST, not `ExpressionNode`

`ExpressionNode` is a UI-oriented IR owned by the visual editor; the Langium AST (`RosettaExpression` and subtypes) is the canonical representation. Targeting the AST makes the bijection usable headlessly by the CLI, the inbound importer, and the language server. This is no longer just an argument — it is how the shipped renderer works: `render-expression.ts` dispatches on `$type` and reads only `$type`, data fields, and `$refText`, so it **works identically on live parser output and `Dehydrated<T>` nodes**. The lens's `render-ts`/`parse-ts` adopt the same input-tolerance contract, which is what lets the same code serve the worker-boundary (dehydrated) and language-server (live) callers without a bridge layer.

## The Central Contract

For the supported expression subset `S`:

1. **Faithful projection (Rune → TS)**: every Rune expression in `S` renders to TypeScript a competent reader would agree is semantically equivalent under Rune's evaluation semantics.
2. **Total parse-back (TS → Rune)**: every TypeScript buffer the lens *accepts* maps to exactly one Rune expression AST. No accepted TS input fails to produce canonical Rune.
3. **Hard refusal outside `S`**: TypeScript the lens cannot faithfully represent is rejected inline, with a clear reason, *before* it is committed. Never coerced, approximated, or stubbed.
4. **Edit locality on write-back**: editing expression *A* through the lens leaves every other expression in the `.rune` file **byte-unchanged**. The stability guarantee is on the Rune side, at the granularity of the individual expression.

The acceptance bar for the whole feature is points 1–4 holding over `S`, with `S` drawn at the semantic-equivalence boundary (§4), not at "what looks translatable."

## Repo State as of HEAD `b3434b9` (2026-07-02) — Verified

This revision re-checked every surface the spec depends on after the AST→Rosetta renderer landed (PR #359, `feat/expression-corpus-sweep`, and predecessors). The previous revision's central risk finding is **resolved by implementation**:

- **The full AST→Rosetta expression renderer now exists**: `packages/codegen/src/emit/rosetta/render-expression.ts` (512 lines as of 2026-07-11 — grown from the 336 lines cited at HEAD `b3434b9`; re-skim before Phase 1 starts since #363–#372 likely added `$type` cases the lens dispatch will need to mirror), exported via the browser-safe `@rune-langium/codegen/rosetta` subpath. Per-`$type` dispatch mirroring `transpiler.ts`, covering the full expression grammar: literals, symbol/super refs, list literals, arithmetic/logical/equality/comparison, contains/disjoint/default/join, feature calls (incl. deep `->>`), exists/absent/only-exists (with modifiers), to-enum, then, choice, switch, with-meta, as-key, conditionals, and constructor expressions. Precedence is grammar-verified with side-aware wrapping (tier-7 non-associativity handled explicitly), and reserved-keyword identifiers round-trip via `^`-escaping. Unknown `$type`s **throw `UnsupportedExpressionError`** — the caller decides the fallback.
- **The structural renderer now renders expression bodies from the node, with CST fallback.** `rosetta-render-core.ts` (`renderNode`/`renderModel`) covers Data, Attribute, Choice, Enumeration, **Condition, Function, Operation, Shortcut, TypeAlias, TypeParameter, AnnotationRef, and all three synonym kinds**. `renderCondition` calls `exprText` = `renderExpression` first, falling back to `$cstText`/`$cstNode.text` only on `UnsupportedExpressionError` ("fallback-not-corrupt" invariant, learned from PR #357). **The old `rosetta-serializer.ts` with its `True` stubs is deleted from core.** The previous revision's warning about the stub-and-lose path is obsolete.
- **Locality-preserving write-back is implemented, in visual-editor**: `serialize/cst-reuse-renderer.ts` + `serialize/dirty-paths.ts`. Per node: if the subtree is clean (has a `$cstRange`, no pending edit patch at/under it), **slice the original bytes**; else regenerate via render-core, recursing so each child independently reuses-if-clean. Dirtiness is derived from the Mutative `pendingEditPatches` (granular and whole-node paths, bidirectional prefix matching). It handles deleted-element ranges, forced-dirty nodes (edge-carried edits like `extends`), and relative-indent normalization to prevent byte drift. It **replaced** `serializeModel + mergeSerializedIntoSource` and is wired into the live save path (`useModelSourceSync.ts` → `renderNamespace`). Untouched content is never re-rendered — this *is* the spec's contract point 4, shipped.
- **The round-trip test oracle this spec called for already exists, for the Rune→Rune direction**: `expression-roundtrip.test.ts` (hand-curated corpus: parse → render → reparse → re-render → byte-identical fixed point **plus** `treesEquivalent` structural check — added after a nested-switch comma-ambiguity bug passed the text check while corrupting tree shape) and `expression-corpus-sweep.test.ts` (the same fixed-point property swept over **every expression body in the real CDM / rune-dsl / rune-fpml corpora** under `.resources/`). Plus render-condition/function/typealias unit tests and visual-editor locality tests (`editable-roundtrip`, `cst-reuse-cascade`, `deletion`, `inheritance-edge`, `dirty-paths`).
- **`parseExpression` is exported from core** (`api/parse-expression.ts`) — expression-granularity parsing of Rune snippets, used by the corpus tests. The Rune side of the lens bijection (`Rune text ⇄ RosettaExpression`) is therefore complete in both directions today.
- **The TS expression-coverage gap has since been closed at the transpiler level** (PRs #364–#367, post-dating the previous revision): `transpileThenOperation`, `SwitchOperation` + `RosettaSuperCall`, `ToEnumOperation`, `RosettaOnlyExistsExpression` (tuple form), 14 further mechanical cases (W1 tiers 1–3), Choice emission across walker/ts/zod (W2), Data-extends-Choice (`runeExtendChoice`), cross-namespace inheritance fixes, and func-scope alias resolution in exists/absent conditions (the `unknown-attribute` class). The transpiler is now 1,600 lines / 70 dispatch branches. **Caveat**: `us12-cdm-corpus.test.ts` ceilings are unratcheted (`< 700` TS / `< 20` Zod, comments still "current: ~617 / ~9") and the CDM corpus is not in-repo, so the *measured* post-parity diagnostic count is unverified. The consequence for the lens is inverted from the previous revision: the day-one read-only boundary of `S` is no longer set by missing TS projections — it is set almost entirely by **reversibility** (which emitted TS forms parse back deterministically), which is the correct boundary per this spec's own contract.
- **NEW integration constraint — the schema-validity gate (PR #371).** `cst-reuse-renderer` now `safeParse`s every dirty node against its `$type`'s generated Zod schema *before* structural rendering. A node that fails the schema **silently falls back to its CST slice** (or is skipped if it has no `$cstRange`) — by design, because mid-edit invalid nodes are the normal live-apply case, and the warning is dev-gated. For the lens this cuts both ways: (a) a lens-committed expression node that doesn't satisfy its `$type` schema will not render — the edit silently *doesn't take*, which for the lens (whose commits are complete, parsed expressions, never mid-edit fragments) would be a bug masquerading as a no-op; (b) nodes containing `RawDsl` leaves bypass the gate (`hasRawDslExpression`), which is the escape hatch the lens must *not* rely on, since RawDsl is the lossy path. Lens commit therefore gains a hard precondition: the parsed `RosettaExpression` must round-trip its own generated schema before being written to the store, and a failed parse there is a refusal, not a fallback.
- **Synonym-body rendering is corpus-validated (PR #363)** — full `RosettaMetaSynonymValue` surface including maps, with a synonym corpus sweep. Not lens-relevant directly, but it hardens the render path the lens shares.
- **The injection point is unchanged**: `renderExpressionEditor?(props)` remains threaded through the form components. No lens or import commits have landed; the lens remains greenfield.

## What Already Exists (Host Surface)

- `packages/core` — `parse()`, `parseExpression()`, the `RosettaExpression` AST, `preserveCstText`.
- `@rune-langium/codegen/rosetta` — `renderExpression` / `renderNode` / `renderModel`: the shipped AST→Rosetta renderer (browser-safe subpath). **The new lens module lands beside it** (`packages/codegen/src/lens/`).
- `packages/visual-editor/src/serialize/` — `cst-reuse-renderer` + `dirty-paths`: shipped locality write-back on the live save path.
- `packages/visual-editor/src/adapters/parse-expression.ts` — Rune text → `ExpressionNode`; emits `Unsupported` for un-modelable text.
- `packages/visual-editor/src/adapters/expression-node-to-dsl.ts` — `ExpressionNode` → Rune DSL, precedence-aware.
- `packages/visual-editor/src/adapters/ast-to-expression-node.ts` — core AST → `ExpressionNode` (the existing half of the bridge).
- `ExpressionEditorSlotProps` + `renderExpressionEditor?(props)` — the slot the lens UX renders into; confirmed wired through 8 call sites including `ExpressionBuilder.tsx` and `EditorFormPanel.tsx`.

> **Correction (2026-07-11)**: an earlier revision of this doc listed `packages/visual-editor/src/adapters/cst-utils.ts` here as shipped source-range-reconstruction machinery. That file was deleted 2026-07-01 as dead code with zero importers (`1192af0f`, one day before this doc's cited HEAD) — it never actually backed anything the lens can rely on. Whatever `$cstRange` handling the lens needs today lives directly in `serialize/cst-reuse-renderer.ts` and `serialize/dirty-paths.ts` (confirmed: both reference `$cstRange` directly) and in `hooks/useModelSourceSync.ts`. This is exactly the surface Open Question 1 (stale-`$cstRange` hygiene) needs to inspect — there is no separate adapter to read first.

The lens introduces no parallel expression model. It adds a *language adapter* (`RosettaExpression ⇄ TypeScript`) in `codegen/lens`, beside the shipped Rune renderer, over the one canonical AST.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Read a Rune condition as TypeScript (Priority: P1)

A TypeScript-native quant opens a type with a `condition` block. In the expression editor they toggle the language to "TypeScript." The Rune expression (`value >= 0 and currency exists`) renders as a familiar TS predicate (`value >= 0 && currency != null`). Toggling back to Rune shows the original, byte-for-byte unchanged.

**Why this priority**: Read-only projection is the smaller, safer half and delivers most of the comprehension value alone. It exercises contract point 1 (faithful projection) and point 4 (locality, trivially) without taking on parse-back risk. Shipping read-only first de-risks the write path.

**Independent Test**: For a corpus of Rune expressions in `S`, render each to TypeScript via the core transpiler, then render the same Rune expression to Rune DSL via the existing serializer. Assert the Rune serialization is unaffected by the lens (no shared mutable state) and each TS projection parses as valid TypeScript matching a golden expectation.

**Acceptance Scenarios**:

1. **Given** a Rune condition `value >= 0`, **When** rendered as TypeScript, **Then** the output is `value >= 0`.
2. **Given** `currency exists`, **When** rendered as TypeScript, **Then** it expresses presence (`currency != null`) per the documented mapping.
3. **Given** `a and (b or c)`, **When** rendered as TypeScript, **Then** precedence/parenthesization are preserved (`a && (b || c)`).
4. **Given** an expression **outside** `S`, **When** the user toggles to TypeScript, **Then** the lens shows **read-only Rune** with a non-blocking notice that this expression can't be shown in TypeScript — it does **not** show an approximate or partial TS rendering.

---

### User Story 2 — Write a Rune condition in TypeScript (Priority: P1)

The user edits in TypeScript mode: `value >= 0 && currency != null` → `value > 0 && currency != null`. On commit (blur / explicit apply), the lens parses the TS, confirms it is within `S`, converts to canonical Rune, and writes back `value > 0 and currency exists`. No other expression in the file is touched.

**Why this priority**: This is the feature's core value — authoring in one's own language. P1 alongside US1 because read-only without write is a demo, not the product. It carries contract points 2, 3, and 4 — the hard ones.

**Independent Test**: For a corpus of TS expressions in `S`, parse each through the core transpiler to canonical Rune, write it into a multi-expression `.rune` fixture at a known location, and assert: (a) the target expression equals the expected Rune, (b) every other expression in the file is byte-identical, (c) re-parsing and re-rendering the edited expression to TS yields the input (round-trip identity over `S`).

**Acceptance Scenarios**:

1. **Given** TypeScript `value > 0`, **When** committed, **Then** canonical Rune `value > 0` is written.
2. **Given** TypeScript `currency != null`, **When** committed, **Then** canonical Rune uses the presence idiom (`currency exists`).
3. **Given** TypeScript outside `S` (`value.toFixed(2)`, an assignment, a side-effecting call, an unsupported reference), **When** the user attempts to commit, **Then** the commit is **blocked** with an inline error identifying the offending construct, and canonical Rune is **unchanged**.
4. **Given** a syntactically invalid TS buffer, **When** committing, **Then** the lens reports the parse error inline and does not modify canonical Rune.
5. **Given** a successful edit to expression *A* among several, **When** written back, **Then** expressions *B…N* are byte-identical to their pre-edit form (edit locality).

---

### User Story 3 — Write a Rune function body in TypeScript (Priority: P2)

A user authoring a `func` writes the output logic in TypeScript: `output = principal * rate`. The lens converts it to canonical Rune function-body form. Function bodies extend `S` beyond boolean conditions to assignment and the pure operations Rune supports, but stay within the *pure, declarative* envelope — no mutation, no side effects, single `output`.

**Why this priority**: Natural, requested extension once conditions work; reuses the same core transpiler. P2 because the subset is wider (assignment, `alias` bindings, list ops) and the imperative-vs-pure mismatch is sharper, so it needs the condition path proven first. `preserveCstText` already walks function operations/shortcuts/postconditions, so per-expression locality for functions has the same foundation as conditions.

**Independent Test**: Round-trip a corpus of Rune `func` bodies (from the pure-expression subset our own outbound Rune→TS emitter produces) through `Rune func → TS → Rune func`, asserting identity. Separately, attempt to commit imperative TS (loops, mutation, multiple non-output assignments) and assert refusal.

**Acceptance Scenarios**:

1. **Given** a Rune func body `output: principal * rate`, **When** rendered as TS, **Then** it shows as an `output =` assignment per the documented mapping.
2. **Given** TS `output = principal * rate`, **When** committed, **Then** canonical Rune func-body assignment is written.
3. **Given** TS with a loop, mutation, or assignment to anything other than `output`, **When** committing, **Then** refusal with inline reason; canonical Rune unchanged.
4. **Given** a Rune func body using an operation with no TS-subset equivalent, **When** toggling to TS, **Then** read-only Rune + "not representable in TypeScript" notice (never a partial rendering).

> **Phase 2 note**: the function-body lens described by this user story shipped as a byproduct of Phase 1's generic `renderExpressionEditor` wiring in `ExplorePerspective.tsx` — `FunctionForm` already threaded each operation's/alias's bare RHS expression text through the same slot `ConditionSection` uses, so no new UI code was needed. Phase 2 *verified* (did not build) this: see `docs/superpowers/plans/2026-07-12-expression-language-lens-phase2.md` Task 4 (`FunctionForm.test.tsx`'s `renderExpressionEditor` slot-contract tests) and Tasks 1–2 (the TS-lens correctness bugs for function operation/shortcut bodies) and Task 3 (`updateExpression`'s function branch).

---

### User Story 4 — Python lens (Priority: P3)

A Python-thinking quant reads/writes the same expressions in a Python projection. Identical contract, different surface language. Deferred to P3: it doubles the projection/parse-back surface and Python's looser syntax widens refusal-detection; it should follow once the TS lens has proven the bijection machinery.

**Acceptance Scenarios**:

1. **Given** the TS lens shipped and the `LanguageLens` interface stable, **When** a Python adapter is added, **Then** it implements the same `render` / `parse` interface over the **same core AST**, no change to the canonical pipeline.
2. **Given** Python within `S`, **When** committed, **Then** canonical Rune is written and round-trips.
3. **Given** Python outside `S`, **When** committed, **Then** refusal with inline reason; canonical Rune unchanged.

---

## Technical Design

### Architecture: A Language Adapter Over the Canonical AST

```
                 ┌───────────────────────────────────┐
   .rune text ── │ core: parse() / parseExpression() │ ──▶ RosettaExpression (canonical AST)
                 └───────────────────────────────────┘        │
                 ┌───────────────────────────────────┐        │
   .rune text ◀──│ codegen/rosetta: renderExpression │ ◀──────┤   canonical (always Rune)
                 │           [SHIPPED]               │        │
                 └───────────────────────────────────┘        │
                                                               │
   ══ LENS ADAPTER (new, codegen/lens, MIT) ═══════════════════┼═══════════
                 ┌───────────────────────────────────┐        │
     TS text  ◀──│ renderTs(RosettaExpression)       │ ◀──────┤   projection (null if ∉ S)
                 └───────────────────────────────────┘        │
                 ┌───────────────────────────────────┐        │
     TS text  ── │ parseTs(text) → LensResult        │ ──────▶┘   parse-back (or refusal)
                 └───────────────────────────────────┘
                                                               │
   ── write-back (SHIPPED, visual-editor) ─────────────────────┘
        lens commit → editor-store patch → dirty-paths →
        cst-reuse-renderer (clean subtrees byte-sliced,
        dirty expression regenerated via renderExpression)
```

The canonical path is complete in both directions today (`parseExpression` in, `renderExpression` out, corpus-validated fixed point). The lens adds only the TS pair. Because both languages route through one AST, there is exactly one canonical form and the lens cannot mint a competing one.

### Module Structure

```
packages/codegen/src/lens/                 # NEW — MIT, beside emit/rosetta/ and expr/
├── index.ts                               # LanguageLens registry + public API (browser-safe subpath, like ./rosetta)
├── language-lens.ts                       # LanguageLens<L> interface
├── subset.ts                              # supported RosettaExpression subset S (single source of truth)
├── typescript/
│   ├── render-ts.ts                       # RosettaExpression → TS text (projection; reuse/wrap expr/transpiler.ts)
│   ├── parse-ts.ts                        # TS text → LensResult (parse-back)
│   └── ts-subset-check.ts                 # TS AST → in-S? with precise refusal reasons
└── python/                                # P3, same shape
    ├── render-py.ts
    ├── parse-py.ts
    └── py-subset-check.ts

# ALREADY SHIPPED — the lens consumes, does not build:
#   @rune-langium/codegen/rosetta          renderExpression / renderNode / renderModel
#   @rune-langium/core                     parseExpression
#   packages/visual-editor/src/serialize/  cst-reuse-renderer + dirty-paths (locality write-back)

apps/studio/src/.../<expression slot>      # NEW — FSL, thin
└── LanguageLensEditor.tsx                 # toggle + Monaco projection + inline diagnostics
```

The previously-planned `serialize-expression.ts` and `write-back.ts` are **deleted from this spec** — they shipped as `renderExpression` and `cst-reuse-renderer` respectively. The previously-planned `lens-bridge` is unnecessary: the shipped renderer's input-tolerance pattern (read only `$type`/data/`$refText`; work on live and `Dehydrated<T>` nodes alike) means the lens adapters accept store nodes directly.

### The `LanguageLens` Interface

```typescript
interface LanguageLens<L extends string> {
  readonly language: L;                          // 'typescript' | 'python'

  /** Faithful projection. null ⟺ node ∉ S (caller falls back to read-only Rune).
   *  Never approximates. */
  render(node: RosettaExpression): string | null;

  /** Total parse-back over accepted input: a canonical RosettaExpression
   *  or a precise refusal — never a degraded node. */
  parse(text: string): LensResult;
}

type LensResult =
  | { ok: true; node: RosettaExpression }
  | { ok: false; reason: RefusalReason };        // syntax error | out-of-subset construct + location
```

`render` returning `null` enforces contract point 1 (no lossy projection). `parse` returning a `RefusalReason` enforces point 3 (no degraded node).

### The Subset `S` — Drawn at the Semantic-Equivalence Boundary

`S` is defined once, in `core/.../subset.ts`, as the `RosettaExpression` shapes for which a documented TS rendering is *semantically equivalent under Rune's evaluation semantics*, not merely syntactically similar. Initial `S`:

| Rune construct (AST) | In `S`? | TS projection | Notes |
|---|---|---|---|
| `RosettaBinaryOperation` `= <> < <= > >=` | ✅ | `=== !== < <= > >=` | `=`→`===`, `<>`→`!==` |
| `RosettaBinaryOperation` `and` / `or` | ✅ | `&&` / `\|\|` | precedence preserved |
| logical negation | ✅ | `!` | |
| `RosettaExistsExpression` | ✅ | `x != null` | presence idiom (documented) |
| absent | ✅ | `x == null` | |
| numeric / string / boolean literal | ✅ | literal | |
| enum value reference | ✅ | member access | |
| `RosettaFeatureCall` path `a -> b` | ✅ | `a?.b` | `?.` mirrors Rune optional-propagation |
| arithmetic `+ - * /` | ✅ | same | numeric only |
| grouping | ✅ | parens | |
| `count` | ✅ (cond) | `.length` after presence guard | conditions first |
| `one-of` / `choice` | ✅ (cond) | recognised helper call | round-trips to native condition |
| `output =` assignment | ✅ (func, US3) | `output = expr` | single output only |
| `filter` / `map` / `extract` | ⏳ (func, later) | array methods | semantic-match subset only |
| `reduce` / fold / complex aggregation | ❌ initially | — | read-only Rune + notice |
| side effects / mutation / loops | ❌ (always) | — | refused on write |
| library/runtime calls w/o Rune equivalent | ❌ | — | refused on write |

Guiding rule, stated in `subset.ts` and enforced by tests: **a narrow subset that never lies beats a wide one that sometimes degrades.** Widening `S` is a deliberate, test-backed act.

#### Semantic landmines `S` is drawn around (not over)

- **Truthiness**: JS `if (x)` is falsy for `0`/`''`/`false`; Rune presence is about existence. The lens maps `exists` to `!= null`, not to truthiness, and refuses bare truthiness coercions with no Rune meaning.
- **Three-valued / optional propagation**: Rune path navigation over optionals propagates absence. Projection uses `?.`; parse-back accepts only `?.` chains, not unguarded `.` that would imply different null semantics.
- **List semantics**: Rune list ops aren't 1:1 with JS array methods (cardinality, flattening). Only provably-coincident ops are in `S`; the rest are read-only.

### Write-Back and Edit Locality (Contract Point 4) — SHIPPED; the lens integrates, it does not build

Both halves the previous revision flagged as missing now exist:

- **The expression emitter exists**: `renderExpression` (`@rune-langium/codegen/rosetta`) emits canonical Rune text for a single `RosettaExpression`, corpus-validated against every expression body in CDM/rune-dsl/rune-fpml with a fixed-point **and tree-equivalence** guarantee.
- **Locality-preserving rendering exists**: `cst-reuse-renderer.ts` renders a namespace by **slicing original bytes for every clean subtree** (`$cstRange` present, no pending edit patch at or under it) and regenerating only dirty subtrees via render-core. Dirtiness comes from the editor store's Mutative `pendingEditPatches` (`dirty-paths.ts`). It is wired into the live save path (`useModelSourceSync`). *Untouched content is never re-rendered* — contract point 4, already enforced by `editable-roundtrip` / `cst-reuse-cascade` tests.

The lens write-back is therefore an **integration**, not a mechanism:

1. `parseTs(text)` → `RosettaExpression` (or refusal → abort; nothing dirties).
2. Commit the new expression node into the editor store at the condition/operation's data path — exactly as the structured `ExpressionBuilder` commits today. This produces a granular `pendingEditPatch` at that path.
3. `cst-reuse-renderer` does the rest on save: the edited expression's subtree is dirty → regenerated via `renderNode`→`renderExpression`; every sibling is clean → byte-sliced from the original source.

The lens must **not** invent a parallel splice path. Its one write-side obligation is that a lens commit produces the same store-patch shape as a builder commit, so `dirty-paths` sees it identically. Locality then holds by the same tests that already guard builder edits.

> **Residual check (much smaller than the old spike)**: confirm the dehydrated expression node a lens commit writes carries no stale `$cstRange` — otherwise the reuse renderer could slice the *old* bytes for the *new* expression. The editor store's existing expression-commit path (which updates `$cstText`) is the reference; the lens follows it. (Open question 1.)

### UI Surface (studio, FSL — thin)

An alternative renderer for the existing `renderExpressionEditor?(props)` slot — no new panel/perspective. Within the slot:

- A **language toggle** (Rune / TypeScript [/ Python]) on the editor header.
- In a foreign mode: a Monaco editor showing the core projection, with inline diagnostics for refusal/parse errors from the core `LensResult`.
- When the current expression is **outside `S`**: the toggle shows the foreign language **disabled/read-only with a notice**; the editor stays in Rune. The toggle never yields a lossy view.
- Commit: explicit apply or blur; refusal blocks commit and surfaces the reason at the offending location; canonical Rune mutates only on a clean, in-subset parse.

Default language / per-user preference is a studio setting; canonical storage is unaffected.

## MVP Definition

**US1 + US2 for TypeScript, conditions only**, with `S` as the initial table (excluding func-only and deferred rows). This proves all four contract points on the smaller boolean surface, establishes the core `LanguageLens` interface, the subset definition, the projection/parse-back/refusal machinery, and the core range-targeted write-back. Functions (US3) and Python (US4) are additive. Read-only (US1) may ship ahead of write (US2) as an internal de-risking milestone, but the MVP delivers write.

## Implementation Phases

Materially shortened versus the previous revision: steps 4 and 6 of the old plan (expression emitter; write-back; IR bridge) shipped independently as `renderExpression`, `cst-reuse-renderer`/`dirty-paths`, and the input-tolerant node contract. What remains is the TS half of the bijection plus thin UI.

### Phase 1: TypeScript condition lens (MVP)

1. **codegen/lens**: `LanguageLens` interface; `subset.ts` (single source of truth for `S`). Seeding has changed since the parity work (#364–#367): `transpiler.ts` coverage no longer meaningfully constrains `S` — nearly every expression `$type` now has a TS emission. `S` is instead seeded by **auditing each emitted TS form for deterministic parse-back**: constructs whose transpiled shape is reversible (comparisons, boolean ops, exists/absent, arithmetic, paths) enter `S`; constructs whose transpiled shape is an irreversible lowering (e.g. a then-chain flattened to nested arrows/IIFEs, switch lowered to ternary cascades) start **read-only** even though they transpile — reversibility, not coverage, is now the sole boundary, which is what this spec's contract said the boundary should be all along.
2. **codegen/lens**: `render-ts.ts` over `S` — wrap/reuse `expr/transpiler.ts` where its output is reversible; return `null` outside `S`. (Resolves old open question 6 in the "reuse, constrained to the reversible subset" direction.)
3. **codegen/lens**: `parse-ts.ts` + `ts-subset-check.ts` — parse TS (`typescript` compiler API), validate against `S`, return `LensResult`.
4. **codegen/lens tests**: adopt the shipped fixed-point + `treesEquivalent` pattern from `test/emit/rosetta/`, extended to the two-language cycle: `Rune → TS → Rune` fixed point over `S` (via `parseExpression` + `renderExpression`), plus a refusal corpus. Sweep the same `.resources/` corpora: every corpus expression must either round-trip through TS or be classified read-only — no third outcome.
5. **store-commit integration**: a lens commit writes the parsed expression node through the same editor-store path as an `ExpressionBuilder` commit (same patch shape → same `dirty-paths` behavior → `cst-reuse-renderer` locality applies unchanged). Two preconditions, both testable in isolation: (a) the stale-`$cstRange` question (open question 1); (b) **the schema-validity gate (#371)**: the committed node must `safeParse` against its `$type`'s generated schema, or the renderer silently CST-falls-back and the edit doesn't take. The lens validates schema-conformance *at parse-back time* and treats failure as a refusal — never as a silent fallback, and never via the `RawDsl` bypass.
6. **studio (FSL)**: toggle in the expression slot, Monaco projection editor, inline refusal diagnostics, read-only fallback + notice outside `S`.

### Phase 2: Function-body lens (US3)

7. Extend `S` with `output =` assignment and semantically-clean pure ops; keep imperative TS firmly refused. `renderFunction`/`renderOperation` already emit the Rune side.
8. Round-trip `Rune func → TS → Rune func` over the pure subset (oracle: our own outbound Rune→TS emitter output).

### Phase 3: Python lens (US4)

9. `codegen/lens/python/` implementing the same interface over the same AST.

## Open Questions / NEEDS CLARIFICATION

**Resolved by implementation since the last revision** (kept for the record):
- ~~The missing Rune expression emitter~~ → shipped as `renderExpression` (`@rune-langium/codegen/rosetta`), corpus-validated with fixed-point + tree-equivalence tests.
- ~~`rosetta-serializer` `True`-stub hazard~~ → that serializer is deleted; `renderCondition` renders bodies via `renderExpression` with a CST-text fallback ("fallback-not-corrupt").
- ~~Range-splice write-back design~~ → superseded by `cst-reuse-renderer` + `dirty-paths`: clean subtrees byte-sliced, dirty subtrees regenerated, wired into the live save path with its own locality test suite.
- ~~Transpiler reuse question~~ → resolved in the "reuse, constrained to the reversible subset" direction: `render-ts` wraps `expr/transpiler.ts` where reversible; the corpus-sweep gap list (`ThenOperation`, `SwitchOperation`, `ToEnumOperation`, `RosettaOnlyExistsExpression`) supplies the initial read-only boundary.

**Resolved by Phase 2** (`docs/superpowers/plans/2026-07-12-expression-language-lens-phase2.md`):
- ~~Undo/redo is assumed, not verified~~ → Task 3 added explicit coverage for `updateExpression`'s `RosettaFunction` branch: create-when-empty and undo/redo, both confirmed already working correctly against production code (no production changes were needed). Toggle-to-TS/edit/commit/undo was exercised at the store level via the same patch-shape path an `ExpressionBuilder` commit uses.

**Still open:**

1. **Lens-committed node hygiene — stale `$cstRange` AND schema conformance**: a lens-committed node must not carry the *old* expression's `$cstRange` (or `cst-reuse-renderer` byte-slices the pre-edit text) and must pass its `$type`'s generated Zod schema (or the #371 gate silently CST-falls-back and the edit doesn't take — dev-gated warn only). Both failure modes present identically to the user: the edit appears to be ignored. Confirm the editor store's existing expression-commit path handles both, and add lens-path regression tests for each.
2. **Corpus ceilings need ratcheting before `S` is sized**: `us12-cdm-corpus.test.ts` still asserts `< 700` / `< 20` with stale "current: ~617 / ~9" comments, while the parity PRs almost certainly collapsed those counts. Run the corpus, record the real numbers, tighten the gates — the residual diagnostic list is also the honest list of expression types that *still* lack TS emission, which feeds the `S` audit in Phase 1.
3. **`exists` projection round-trip**: `currency exists` → `currency != null` → parse-back must return an `RosettaExistsExpression`, not an equality node. Rune has no null literal, so `!= null` is unambiguous — document the idiom in `subset.ts`.
4. **`count` / `one-of` in conditions**: confirm the TS projection of `count` and the `runeCheckOneOf` helper shape parses back deterministically, or restrict these to read-only in the MVP per "refuse, don't degrade."
5. **Monaco language services**: the lens's identifiers are Rune attribute paths, not real TS symbols. MVP: syntax highlighting + our own diagnostics from `LensResult`; no TS type-checking against a fake type environment.
6. **Keyword-collision identifiers in the TS view**: the Rune renderer round-trips reserved-word names via `^`-escaping (`^type`). The TS projection needs its own policy for such names (they are legal TS identifiers, so the escape is only needed Rune-side) — and parse-back must re-apply the escape. Small, but it is a real corpus finding, not hypothetical.

**Added by self-review (2026-07-11), before this moves to planning:**

7. **`parse-ts.ts` bundle-size risk is unaddressed.** `codegen/lens` must ship through the same browser-safe subpath discipline as `rosetta.ts`, but "browser-safe" there means *no Node built-ins* (fs/ExcelJS/generator) — it says nothing about bundle weight, and the full TypeScript compiler API is not free even used parser-only (no type-checker). Studio already ships Monaco, so *some* size budget exists, but Phase 1 needs an explicit spike: measure the parser-only import cost (e.g. `typescript/lib/typescript.js` tree-shaken to `createSourceFile`/`forEachChild`, or a lighter alternative like `@typescript-eslint/typescript-estree`'s parser or `acorn` with a TS dialect) before committing to "the `typescript` compiler API" as stated fact in Phase 1 step 3.
8. ~~**Undo/redo is assumed, not verified.**~~ Resolved by Phase 2 — see "Resolved by Phase 2" above.
9. **`RefusalReason`'s `location` is untyped.** The interface sketch (`{ ok: false; reason: RefusalReason }`) doesn't specify what coordinate space "location" uses — TS source offsets, line/col, or a range into the *edited* buffer vs. the *original* Rune text. Monaco needs a concrete `{ line, column }` or offset range to place an inline diagnostic; this must be pinned down in Phase 1 step 3's design, not left to the implementer to invent per open question 5's Monaco integration.
10. **No rollback/kill-switch story.** The feature's entire trust thesis is "refuse, don't degrade" — one bad in-`S` round-trip discovered in production after Phase 1 ships would cost exactly the trust the design is built to protect. The plan should include a cheap way to disable the language toggle (a studio feature flag, not a full revert) so a corpus gap found post-release can be muted immediately while it's fixed, rather than requiring a hotfix release.

## Strategic Notes

### Continuous Adoption Ergonomics, Not a One-Time Migration

The inbound importer (019) lowers the cost of *getting into* Rune once. The lens lowers the cost of *living in* Rune every day — a TS-native quant never has to learn Rune's expression syntax to read or write conditions and functions, and the model stays canonical Rune. It pays off on every edit, attacking the same core adoption barrier from the editing side.

### Why "Refuse, Don't Degrade" Is the Whole Game

Trust is binary. "These constructs work in the TS view, the rest I write in Rune" keeps a user on the lens indefinitely. Silent degradation *once* loses every subsequent toggle. The narrow-but-honest subset is the design, not a limitation; `S` widens only with a proven bijection and a refusal test for its boundary.

### Canonical-Rune-Only + Core Layering Is What Makes This Buildable

Forbidding foreign-language persistence avoids the multi-source-of-truth quagmire. Routing both languages through the canonical AST means one canonical form, one subset, and stateless projections reused by the lens, the importer, and any CLI. The hard engineering the earlier drafts worried about has narrowed to one piece: the Rune-side emitter and the locality write-back both shipped independently (`renderExpression` with corpus-validated fixed-point + tree-equivalence guarantees; `cst-reuse-renderer` with its own locality test suite on the live save path). What remains is the reversible TS pair (`render-ts`/`parse-ts`) plus subset enforcement — bounded, test-first, with the test pattern already established in-repo.

### Relationship to the Visual Expression Builder

The studio already has a structured `ExpressionBuilder` over `ExpressionNode`. The lens is the *text* counterpart to that *structured* editor: both edit the same canonical AST (the builder via the bridge), neither owns the canonical form. A user can move between the visual builder, the Rune text, and the TS/Python lens — three views, one truth.

### Licensing

The lens bijection (subset, `render-ts`, `parse-ts`) is **MIT** in `@rune-langium/codegen`, beside the shipped `rosetta` renderer and the `expr` transpiler it builds on; the shipped write-back machinery is **MIT** in visual-editor; only the toggle/Monaco/diagnostics UX is **FSL-1.1-ALv2** in the studio. The split mirrors the boundary the repo has now established in practice: reusable expression machinery is MIT behind browser-safe subpaths, the differentiated studio experience is FSL.
