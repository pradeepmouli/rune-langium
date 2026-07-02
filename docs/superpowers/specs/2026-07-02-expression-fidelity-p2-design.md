# Expression Fidelity (P2) — Design

**Builds on:** B1 (`2026-06-30-native-expression-rendering-b1-design.md`, merged PR #358) and P1 (the corpus sweep + tree-equivalence invariant, PR #359). P2 of the post-B1 renderer-gap roadmap (P1–P6, ledger `.superpowers/sdd/b1-progress.md`).

## Problem

B1's structural-first `exprText` fires in exactly one real scenario: a node goes **dirty for a non-expression reason** (e.g. an attribute rename on a type), the whole node re-renders, and its **untouched** expression body goes through `renderExpression`. The output is semantically identical but fidelity-lossy:

- comments inside the body are dropped (the AST doesn't carry them),
- authored multi-line layout collapses to the renderer's normalized single line,
- `switch` — even at body root — renders single-line (the pre-B1 builder serializer emitted multi-line cases).

Edited bodies are already verbatim (`RawDsl`, the B1 store contract) and clean nodes are already byte-identical (B2 node-level CST reuse). The gap is only *unedited bodies inside dirty nodes*.

## Verified ground facts (checked against source, 2026-07-02)

1. `$cstRange` is stamped on **every** dehydrated node recursively, including all nested expression subtrees (`rune-store-hydrator.ts:62`).
2. `$cstText` is stamped only **selectively** — condition/operation/shortcut/postCondition parts + their immediate `.expression` (`preserve-cst-text.ts`), retained specifically because VE *display* components sit across a source-less serialization boundary and cannot slice offsets (their own doc comment says this).
3. The slicing machinery already exists: `cst-reuse-renderer.ts` closes over `originalSource` and calls `reuseSlice(originalSource, range)` for whole clean nodes. Expression bodies are the one place B2 did not extend it.
4. "Range present ⇒ body unedited" holds **structurally**: every store expression-edit path replaces the body wholesale with a rangeless `{ $type: 'RawDsl', text }` (B1 Task 4 fix; no in-place expression mutations exist). A range against the immutable original source cannot be "half-updated" — this design eliminates the dual-source-of-truth field class that caused the Task-4 hybrid bug rather than re-introducing it.

## Design — two-tier

### Tier 1: serialize path = range-slicing (the fidelity fix)

Extend the existing reuse-or-regenerate policy to expression bodies via the same IoC shape as `renderChild`:

- **render-core** (`rosetta-render-core.ts`): `renderNode` gains an optional third argument, `opts?: { renderExpr?: (expr: unknown) => string }`. The three body call sites (`renderCondition`, `renderOperation`, `renderShortcut`) call `opts?.renderExpr ?? exprText`. `exprText` (structural-first, CST-text fallback on throw) is unchanged and remains the default — render-core used standalone (no source available, e.g. programmatic graph → text) behaves exactly as today.
- **cst-reuse-renderer** (VE serialize layer, which owns `originalSource` + the dirty index): supplies `renderExpr`:
  1. `$type === 'RawDsl'` → `expr.text` verbatim (edited-pending-reparse; unchanged semantics),
  2. clean `$cstRange` present → slice `originalSource` by the range, routed through the cst-reuse layer's existing `normalizeReusedSlice` helper (as implemented) — interior bytes (comments, line breaks, content) are byte-identical; only continuation-line *leading indentation* is normalized, exactly as node-level child reuse already does, so indentation doesn't drift across successive edit passes,
  3. otherwise → `renderExpression(expr)` (structural; programmatic/rangeless nodes).
- The slice is of the **original** document text (same lifecycle as node-level reuse: ranges are valid per render pass; reparse re-stamps). No new staleness class.

Why range beats extending the `$cstText` stamps: one mechanism instead of two (unifies with B2's node reuse), no duplicated body strings in store/postMessage payloads, universal coverage (every expression has a range; `preserveCstText` only covers specific shapes), and no stamped-text dual truth on the render path.

### Tier 2: display path = unchanged

`preserveCstText` + `getExpressionDisplayText` (`$cstText` / RawDsl-aware) stay exactly as they are. Display preview fidelity is orthogonal to serialize fidelity, and threading per-namespace source into display components is deliberate scope creep we refuse (their own comment documents the boundary).

### Switch pretty-print (#6) — structural output only

`renderExpression` renders a **body-root** `SwitchOperation` with ≥2 cases multi-line (cases joined `,\n` + one indent level, matching the pre-B1 builder serializer's style); **nested** switches stay single-line (they are parenthesized by the P1 prec-0 rule, and multi-line-inside-parens interacts with `insertImplicitBrackets` on reparse — not worth the risk for a nested case no human formats that way). Applies wherever structural output is used: builder preview and rangeless renders.

**Acceptance gate:** the multi-line form must pass the P1 tree-equivalence + fixed-point invariants (hand corpus + 2870-snippet sweep). If implicit-bracket insertion mangles multi-line switch on reparse, fall back to single-line and record the finding — reparse-verified fidelity beats prettiness.

Mechanically: `renderExpression` gains a root-only formatting flag (e.g. `dispatch` tracks depth 0 for the switch case), NOT a public options surface — YAGNI.

## Non-goals

- No "normalize/format this body" user action (named here so its absence is a decision, not an oversight; a future format-document feature could call `renderExpression` explicitly).
- No comment *attachment* in the structural renderer (the pretty-printer project — rejected as Option B in brainstorming).
- No display-path source threading (Tier 2 above).
- `transpiler.ts` untouched (standing boundary).
- No change to `RawDsl`, the store contract, or `preserveCstText`.

## Testing

- **Unit (cst-reuse layer)**: a dirty node (sibling-field edit) with an unedited, comment-bearing, multi-line body → serialized output contains the body **byte-identical** (comments + layout survive). Same node with a RawDsl body → verbatim new text. Rangeless structural fallback still works.
- **Unit (render-core)**: `renderNode` without `opts` behaves byte-identically to today (regression); with a `renderExpr` stub, the three call sites route through it.
- **Round-trip**: the VE `editable-roundtrip` suite extended with a fixture: edit a sibling field on a construct whose body has comments; re-render; assert body bytes unchanged; reparse clean.
- **Switch pretty-print**: root switch ≥2 cases renders multi-line and passes fixed-point + tree-equivalence in the hand corpus; the full corpus sweep re-run green (it contains real multi-case switches).
- Full VE + codegen suites + both type-checks; codegen dist rebuild (render-core signature touched).

## Files

- Modify `packages/codegen/src/emit/rosetta/rosetta-render-core.ts` — `renderNode` opts param + 3 call-site routing (backward-compatible; default unchanged).
- Modify `packages/codegen/src/emit/rosetta/render-expression.ts` — root-only multi-line switch.
- Modify `packages/codegen/src/rosetta.ts` — export the `renderExpr` opts type.
- Modify `packages/visual-editor/src/serialize/cst-reuse-renderer.ts` — supply `renderExpr` (RawDsl → slice → structural).
- Tests per above (`packages/codegen/test/emit/rosetta/`, `packages/visual-editor/test/serialize/`).
