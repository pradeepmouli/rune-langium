<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Pradeep Mouli -->

# Styling & Theming Systematization — Design

- **Date:** 2026-06-01
- **Status:** Approved direction; pending spec review
- **Scope:** `packages/design-tokens`, `packages/design-system`, `packages/visual-editor`, `apps/studio`
- **Author:** Pradeep Mouli (with Claude)

## Problem

The studio's styling spans four mechanisms — `design-tokens` (`tokens.json`),
`design-system` (`theme.css` + CVA components), `visual-editor` (its own
`styles.css` + canvas nodes), and `apps/studio` (Tailwind 4 + 2.6k-line
`styles.css` + `daikonic.css`). The token *pipeline* is actually sound
(`tokens.json → tokens.css → theme.css @theme → consumers`), but **DRY breaks
in three concrete ways**, and the inconsistency is not merely cosmetic — values
already disagree across files.

### The headline: "consistency by luck" has already failed

The data-kind color is defined **three times, with three different values**:

| Source | Value | Status |
| --- | --- | --- |
| `design-tokens/src/tokens.json` (`color.kind.data.base`) | `#00D4AA` | The supposed source of truth — **dead under the default theme** |
| `apps/studio/src/styles/daikonic.css:58` (`--color-data`) | `#41B8AA` | **What actually renders** |
| `packages/visual-editor/src/styles.css:274` (fallback) | `#2a69ac` | A *third* value; surfaces only if the var goes undefined |

`apps/studio/src/App.tsx:531` resolves the theme as
`queryTheme ?? stored ?? 'daikonic'` — **daikonic is the default**, so the
"canonical" token file's kind colors never render in production. Any plan that
collapses toward `tokens.json`'s kind values without accounting for this would
recolor every pill in the app.

### The three DRY violations

1. **The palette is maintained in multiple files with hardcoded hex.**
   `tokens.json` `color` ≡ `color_dark` are byte-identical;
   `theme.css` `:root` ≡ `.dark` are byte-identical; `daikonic.css` re-hardcodes
   raw hex *and* re-defines the kind palette; `visual-editor/styles.css` carries
   hardcoded hex fallbacks. Same value, many homes, kept in sync by hand.

2. **No shared component layer for recurring concepts.** The model **type pill**
   is implemented three incompatible ways for the same concept:

   | Surface | File | Implementation |
   | --- | --- | --- |
   | Structure tree | `visual-editor/.../NamespaceExplorerPanel.tsx:535` | inline styles + `KIND_COLOR_VAR` + `color-mix()` |
   | Graph node | `visual-editor/.../NodeKindBadge.tsx:24` → `styles.css:272` | CSS classes `.rune-kind-badge--*` **+ hardcoded hex fallbacks** |
   | Inspector | `visual-editor/.../DetailPanel.tsx:88` | `design-system` `<Badge variant={kind}>` ✅ |

   `design-system/ui/badge.tsx:34-46` already carries every kind variant,
   token-backed, with a comment stating its intent is to match the Structure
   View. The canonical pill exists; two surfaces never adopted it.

3. **Two parallel spacing scales describe one ladder in two units.**
   `tokens.json` `space` (px) is consumed by raw CSS as `var(--space-N)` (46
   refs across studio + visual-editor `styles.css`, enforced by the
   `no-literal-layout-px.mjs` stylelint rule); `spacing` (rem) feeds Tailwind's
   generated `p-N`/`gap-N` utilities (~478 usages). `space-2 = 8px` and
   `spacing-2 = 0.5rem = 8px` agree only because someone keeps them aligned.

4. **CodeMirror's syntax palette is a hardcoded duplicate.**
   `apps/studio/src/lang/refactory-dark-theme.ts:14-112` hardcodes hex that
   already lives in `tokens.json` `syntax.*`.

## Goals

- **One value, one home.** Every color/spacing/radius value is defined exactly
  once and referenced everywhere else — no value can drift, even by accident.
- **A theme is a mapping, not a copy.** Adding/altering a theme means editing a
  thin set of semantic→primitive bindings, never re-stating a palette.
- **One implementation per UI concept.** A type pill, a type-navigator button,
  a form control — each has a single canonical implementation that every surface
  imports.
- **No rendered-value change in the refactor slices.** Slice 1 preserves exactly
  what users see today (daikonic by default); it only restructures the source.

## Non-Goals

- Designing a light theme now (the axis is *preserved* for it, not built).
- Rewriting the 2.6k-line studio `styles.css` wholesale — only the parts that
  duplicate a canonical concept.
- Touching React Flow's pan/zoom internals or CodeMirror's editing internals.

## Architecture

### 1. Two-tier token system (resolves the multi-theme question)

> **A theme is nothing but a set of semantic→primitive bindings.**

- **Tier 1 — Primitives (the palette).** Raw swatches, theme-independent, one
  home in `tokens.json`, named by *what they are*, never *where they're used*:
  `teal-500: #00D4AA`, `keppel-500: #41B8AA`, `sandy-500: #FA994A`,
  `vermilion-500: #F03630`, surfaces, etc. **Every brand color the product owns,
  including daikonic's**, becomes a primitive here.
- **Tier 2 — Semantic tokens (the theme).** `--background`, `--primary`,
  `--color-data` only ever `var()` a primitive — **zero raw hex**. Each theme is
  one block of these bindings.
- **Components only ever touch Tier 2.** A pill is `bg-data/15 text-data`; it
  cannot know or care which primitive backs `--data` today.

**Emitter change (`design-tokens/src/build.ts`).** The emitter already writes a
`:root` block plus a `[data-theme="dark"]` block (today fed by the identical
`color_dark`, so it's a no-op). Generalize it to emit, from one primitive
palette:

- `:root` — the shared/base semantic mapping (currently the dark-valued default,
  a.k.a. "Refactory Dark").
- `[data-theme="daikonic"]`, future `.light`/`[data-theme="…"]` — **delta-only**
  blocks listing *only* the semantic tokens that differ from `:root`.

This is the "keep the light/dark axis, derive rather than duplicate" decision:
`:root` holds shared values; theme blocks hold deltas; no two hand-maintained
copies of an identical palette ever exist. `daikonic.css`'s hand-written
`[data-theme='daikonic']` palette override is replaced by the emitter's
generated, primitive-referencing block (its non-palette brand flourishes — the
banded mark, the wordmark tag — stay in `daikonic.css`).

### 2. Spacing: one ladder, two generated outputs (same mechanism)

Both spacing consumers must survive (raw CSS needs `var(--space-N)`; Tailwind
needs the `spacing` group), so we keep one **canonical ladder** in `tokens.json`
and have `build.ts` **generate both** representations from it: the rem `spacing`
group (Tailwind keeps emitting `p-N`/`gap-N`) and the `--space-N` px custom
properties (raw CSS keeps resolving `var(--space-N)`). `p-2` and
`var(--space-2)` become equal *by construction*. The existing
`no-literal-layout-px.mjs` stylelint rule continues to protect the output.

### 3. Component canonicalization (bidirectional)

> **DRY = one implementation per concept, promoted to a shared location —
> whichever surface currently has the best one wins.**

Canonicalization direction is chosen **per concept**, not per package: sometimes
the `design-system` primitive is canonical; sometimes a studio/structure
component (e.g. the type-navigator button) is the best implementation and is
*promoted down* into the shared layer for the graph/inspector to adopt.

**Where canonical components live** — split by domain-awareness, preserving the
`design-system ← visual-editor ← studio` dependency DAG and the MIT licensing of
both packages:

- **`design-system` (MIT, bottom):** purely presentational primitives that know
  nothing about Rune DSL — `Badge`, `Input`, `Select`, `Button`, `Field`.
- **`visual-editor` (MIT, middle):** components that understand DSL model
  concepts (kinds, types, navigation) — `<KindBadge kind>`, the promoted
  type-navigator button. They compose `design-system` primitives + domain logic.
- **`studio` (top):** imports both; promotes its best domain components *down*
  into `visual-editor` rather than keeping them FSL-trapped.

The test: *"does this component understand DSL model concepts?"* If yes →
`visual-editor`; if it's just pixels → `design-system`. `<Badge>` stays generic
(its kind variant names are just color bindings); the `TypeKind → variant`
mapping lives in `visual-editor`'s `<KindBadge>`.

### 3a. Layout constants are a third token category (structure view)

The structure view is a React Flow canvas, so its row/node geometry is
**dual-sourced**: `packages/visual-editor/src/layout/structure-layout.ts`
(`STRUCTURE_LAYOUT_CONSTANTS` — `ROW_HEIGHT: 28`, `HEADER_HEIGHT`, `ROW_GAP`,
`NODE_PADDING`…) holds the JS numbers React Flow needs to position nodes
absolutely, and `visual-editor/src/styles.css:879` re-declares the same values
as `--rune-*` CSS custom properties. `test/layout/structure-css-ssot.test.ts`
exists *only* to fail CI when the two drift — a guard around a duplication, not a
single source of truth.

**Fix:** make `structure-layout.ts` the canonical source and **emit** the
`--rune-*` CSS variables from it (inject as inline custom properties on the React
Flow node wrapper), so the values exist once in JS and flow to CSS by
construction. The SSoT *test* then becomes unnecessary because a genuine SSoT
exists. This is the same "one source, generate the other representation" pattern
as spacing — applied to layout geometry instead of the design-tokens pipeline
(these constants are visual-editor-internal, not part of `tokens.json`).

Note: "the structure view" has **two** row renderers — the canvas nodes
(geometry above) and the virtualized namespace-explorer outline tree
(`hooks/useVirtualTree.ts` `TYPE_ROW_HEIGHT: 28` + `.ns-*` CSS in studio's
`styles.css`). Same "type/attribute row" concept, two implementations; reconcile
where practical, but the canvas renderer is the priority (it carries the JS↔CSS
duplication).

### 4. Substrates vs. canonical components

Two third-party *engines* are foundations of the studio, but they are
**standardized on and themed**, not absorbed into `design-system`:

- **`@xyflow/react` (react-flow)** — canvas engine for the graph/structure
  nodes. Owns geometry (pan/zoom/handles). Already cleanly encapsulated: **19
  importers, all in `visual-editor`; zero in studio** (studio consumes
  `StructureView`). This is the model the dockview work mirrors.
- **`dockview-react`** — panel/docking layout engine. Owns tab/group/sash
  chrome. Currently **leaks**: **2 importers, both in `apps/studio`**, with its
  `.dockview-theme-abyss` theming (~400 lines) in studio's `styles.css`.

**Rule:** substrate references live behind a canonical wrapper, and substrate
theming may consume **only semantic tokens, never raw hex** — same constraint as
every other surface. react-flow already satisfies this (encapsulated in
`visual-editor`, the DSL-canvas package, because the canvas content *is*
domain-specific). dockview does not, and is generic chrome, so its wrapper
belongs in `design-system` (see Slice 6). The substrate stays the substrate; the
*content rendered inside* it (node pills, tab badges, type chips) routes through
the canonical components above, so a react-flow node pill and a dockview tab
badge become the *same* component reading the *same* tokens.

## Build Sequence (slices)

Each slice is independently shippable and reviewable. Slice 1 is
invisible-by-design; the visible consolidation lands in slices 2 & 4.

**Sequencing note:** the numbering is logical, not a hard dependency order.
Slice 1 (token foundation) is **not a prerequisite** for the component slices —
`<Badge>` and friends already read the live semantic tokens (`--color-data`
resolves under the default daikonic theme today). Slice 1 is the riskiest and
invisible-by-design, so **recommended implementation order leads with Slice 2**
(pills — low-risk, the headline pain), proving the canonical-component pattern
before the high-risk token-tier refactor. Slices 2, 3, 4 operate on the current
token layer; Slice 1 can land whenever token-DRY is the focus.

### Slice 1 — Token foundation (color tiers + spacing generation)

- **Do:** Restructure `tokens.json` into Tier-1 primitives + Tier-2 semantic
  blocks. Promote daikonic's swatches into primitives. Rewrite `build.ts` to
  emit `:root` + delta-only theme blocks and to generate both `spacing` (rem)
  and `--space-N` (px) from one ladder. Replace `daikonic.css`'s palette
  override with the generated block (keep its brand flourishes). Delete the
  `color_dark` / `.dark`-identical duplications.
- **Canonical:** `tokens.json` primitives.
- **Risk:** HIGH — must preserve every rendered value. Daikonic is default;
  capture its currently-computed values first and assert the new output renders
  them identically.
- **Verify:** Update `packages/design-tokens/tests/build.test.ts` snapshot
  intentionally; add a test asserting computed semantic values per theme are
  unchanged; run the studio `no-undefined-vars` gate (FR-025); visual spot-check
  daikonic default + `?theme=default`.

### Slice 2 — Type pills → one `<KindBadge>`

- **Do:** Add `visual-editor/.../KindBadge.tsx` wrapping `design-system <Badge>`
  with the `TypeKind → variant` map. Replace `NamespaceExplorerPanel.tsx`'s
  inline-style pill and `NodeKindBadge.tsx`'s CSS-class pill with it. Delete the
  `.rune-kind-badge--*` **hardcoded hex fallbacks** in `visual-editor/styles.css`
  (the no-undefined-vars gate makes them unnecessary and turns silent drift into
  a test failure). Apply to the **graph view** as well.
- **Canonical:** `design-system <Badge>` (presentational) + `visual-editor
  <KindBadge>` (domain).
- **Risk:** LOW — primitive exists and is already token-backed; all three pills
  become identical by construction. Note: this *picks* Badge's look as the one
  truth; the three current looks differ slightly, so it's a deliberate visual
  decision, not a pure refactor.
- **Verify:** Visual parity across structure/graph/inspector; existing
  visual-editor + studio test suites.

### Slice 3 — CodeMirror syntax palette ← tokens

- **Do:** Derive `refactory-dark-theme.ts`'s syntax colors from `tokens.json`
  `syntax.*` (import the generated TS tokens) instead of hardcoding hex.
- **Risk:** LOW. **Verify:** editor syntax-highlight spot-check; type-check.

### Slice 4 — Promote structure-view selectors → canonical

- **Do:** Promote the structure node's editable controls into shared
  `visual-editor` components, using the **structure-view styling as canonical**
  (per user direction — the *opposite* direction from the pills):
  - **Type selector:** `editors/structure/TypePickerCell.tsx` +
    `.rune-cell-type-chip` family is canonical; the inspector's
    `editors/TypeSelector.tsx` is reskinned to adopt it.
  - **Cardinality selector:** `editors/structure/CardinalityCell.tsx` is
    canonical; the inspector's `editors/CardinalityPicker.tsx` /
    `CardinalityEditor.tsx` adopt it.
  - Graph cell chips adopt the same canonical components.
- **Canonical:** the structure-node selectors (structure styling wins).
- **Risk:** MEDIUM — touches canvas node rendering. **Verify:** structure +
  graph + inspector parity; perf spot-check on large models.

### Slice 5 — Structure-node controls → design-system where duplicated

- **Do:** Where React Flow nodes (`DataNode`/`ChoiceNode`) roll their own form
  controls that duplicate a `design-system` primitive, adopt the primitive —
  *except* where the node component is itself canonical (slice 4).
- **Risk:** MEDIUM — canvas rendering. **Verify:** parity + perf.

### Slice 6 — Encapsulate dockview behind `design-system <DockLayout>`

- **Do:** Add a thin, themed `<DockLayout>` primitive to `design-system` that
  owns the `dockview-react` dependency and relocates the `.dockview-theme-abyss`
  theming out of studio's `styles.css` into the canonical layer (tokens only, no
  raw hex). Studio keeps the **panel composition** (which panels, their content)
  — that is app-specific and FSL-licensed. react-flow needs no equivalent slice:
  it is already encapsulated in `visual-editor`.
- **Canonical:** `design-system <DockLayout>` (substrate wrapper + theming).
- **Risk:** LOW-MEDIUM — mechanical move; risk is theming regressions in the
  relocation.
- **Rationale (honest):** dockview has a single consumer (studio), so this is a
  *consistency/maintainability* win (substrate symmetry with react-flow +
  theming out of the studio CSS blob), **not** a reuse win. Smaller-value slice;
  sequence last.
- **Verify:** visual parity of the dock chrome (tabs/sashes/groups); studio
  suite; no-undefined-vars gate over the relocated theming.

### Slice 7 — Structure layout constants: one JS SSoT emitting CSS vars

- **Do:** Make `structure-layout.ts`'s `STRUCTURE_LAYOUT_CONSTANTS` the single
  source for structure-view geometry; emit the `--rune-*` CSS custom properties
  from it (inline custom properties on the React Flow node wrapper) instead of
  re-declaring them in `styles.css:879`. Retire
  `test/layout/structure-css-ssot.test.ts` once a genuine SSoT exists (it guards
  a duplication that no longer exists). Optionally reconcile the namespace-tree
  renderer's `TYPE_ROW_HEIGHT` against the same source.
- **Canonical:** `structure-layout.ts` (JS), CSS derived.
- **Risk:** MEDIUM — geometry; an emission bug shifts every node. **Verify:**
  structure-layout unit tests; visual parity (row heights, node boxes, edge
  anchoring) before/after; large-model spot-check.
- **Note:** This is the *enabler* for layout changes like two-line attribute
  rows — once geometry has a real SSoT, such a change is `ROW_HEIGHT` + the row's
  internal cell layout, not a hand-synced edit across two files.

## Testing Strategy

- `design-tokens/tests/build.test.ts` — snapshot of emitted CSS (updated
  intentionally in slice 1) + a new per-theme computed-value-parity assertion.
- Studio `no-undefined-vars` quality gate (FR-025) — every `var(--…)` resolves;
  becomes the safety net once hardcoded fallbacks are deleted.
- `no-literal-layout-px.mjs` stylelint rule — keeps spacing on tokens.
- Package suites: `pnpm --filter @rune-langium/design-tokens test`,
  `--filter @rune-langium/design-system test`,
  `--filter @rune-langium/visual-editor test`, studio suite.
- Visual parity: daikonic (default) + `?theme=default`, structure vs graph vs
  inspector pills.

## Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Slice 1 recolors the app | Daikonic is default — capture currently-rendered computed values *before* refactor; assert byte-identical rendered output per theme; review under default theme, not `?theme=default`. |
| Deleting hardcoded fallbacks breaks an unthemed mount | The no-undefined-vars gate already asserts every var resolves; fallbacks masked breakage rather than preventing it. |
| Picking Badge's look changes pill appearance | Acknowledge as an intentional visual decision in slice 2; get sign-off on the chosen look. |
| Spacing scale change shifts layout | Generate both outputs from the *current* values; `p-2`/`var(--space-2)` unchanged; stylelint + snapshot guard. |
| Canvas-node slices (4, 5) regress perf | Keep them as separate, independently-reviewed slices; perf spot-check on large models. |
