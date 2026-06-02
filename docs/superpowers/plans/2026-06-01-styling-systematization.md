<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Pradeep Mouli -->

# Styling & Theming Systematization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate styling duplication ("DRY by luck") across `design-tokens`,
`design-system`, `visual-editor`, and `apps/studio` by establishing one canonical
implementation per concept — type pills, selectors, tokens, theme palette, and
layout geometry.

**Architecture:** Two-tier token system (primitives + per-theme semantic
mappings); one canonical component per UI concept, promoted to the lowest package
that can own it (`design-system` for presentational, `visual-editor` for
DSL-domain); third-party substrates (react-flow, dockview) standardized-on and
themed, not absorbed.

**Tech Stack:** TypeScript 5.9 ESM, React 19, Tailwind CSS 4 (`@theme`), CVA,
`@xyflow/react`, `dockview-react`, CodeMirror 6, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-01-styling-systematization-design.md`

---

## How this plan is organized

Seven phases, each an **independently shippable PR / commit checkpoint**. The
order is by **risk and dependency**, not by spec slice number:

| Phase | Spec slice | Risk | Visible? |
| --- | --- | --- | --- |
| 1. Pills → one `<KindBadge>` | Slice 2 | LOW | ✅ headline |
| 2. CodeMirror syntax ← tokens | Slice 3 | LOW | minor |
| 3. Structure-view selectors canonical | Slice 4 | MED | ✅ |
| 4. Structure-node controls → design-system | Slice 5 | MED | ✅ |
| 5. Layout constants: one JS SSoT | Slice 7 | MED | enabler |
| 6. dockview → `design-system <DockLayout>` | Slice 6 | LOW-MED | no |
| 7. Token foundation (two-tier + spacing) | Slice 1 | HIGH | invisible |

**Why pills first, token foundation last:** the token refactor is the riskiest
(it ripples through the pinned `build.test.ts` snapshots and `no-undefined-vars`)
and **nothing depends on it** — `<Badge>` already reads the live `--color-data`
under the default daikonic theme. Leading with pills delivers the visible win and
proves the canonical-component pattern before the high-risk, invisible refactor.

**Phase 1 is fully bite-sized below.** Phases 2–7 are specified at task
granularity with exact files, canonical approach, key code, and verification;
each is expanded into bite-sized steps when it is reached (several depend on the
output of earlier phases — e.g. Phase 3's selectors compose Phase 1's
`<KindBadge>`). This is deliberate: planning Phase 7's exact token diffs now would
be guesswork before Phases 1–6 land.

---

## Conventions (all phases)

- **Commit hook:** prefix every commit with `SKIP_SIMPLE_GIT_HOOKS=1` (NOT
  `--no-verify`).
- **SPDX:** new files in `packages/` get `// SPDX-License-Identifier: MIT`; new
  files in `apps/studio/` get `// SPDX-License-Identifier: FSL-1.1-ALv2`.
- **Per-package validation:**
  - `pnpm --filter @rune-langium/visual-editor test`
  - `pnpm --filter @rune-langium/design-system test`
  - `pnpm --filter @rune-langium/studio test`
  - `pnpm --filter @rune-langium/design-tokens test`
  - `pnpm run type-check && pnpm run lint`
- **Branch per phase:** `feat/styling-p<N>-<short-name>`.

---

## Phase 1 — Pills → one canonical `<KindBadge>`

**Problem recap:** the model type pill is rendered four different ways with four
separate kind→style maps:

- `visual-editor/.../nodes/NodeKindBadge.tsx` — `<span class="rune-node-kind-badge
  rune-kind-badge--{kind}">` + `COMPACT_KIND_LABELS`. Consumers: `GenericNode`,
  `EnumNode`, `DataNode`, `ChoiceNode`, `ChoiceOptionRow`.
- `visual-editor/.../panels/NamespaceExplorerPanel.tsx` — `.studio-type-glyph`
  letter glyph via inline styles + `KIND_COLOR_VAR` (L89-98) + `KIND_LETTER`
  (L75-87) + `KIND_LABELS` (L100-109).
- `visual-editor/.../editors/TypeSelector.tsx` — `getKindBadgeClasses` /
  `getKindLabel` helpers (exported from `index.ts:38`).
- `visual-editor/.../panels/DetailPanel.tsx:88` — `design-system <Badge
  variant={kind}>` (the canonical-looking one).
- Hardcoded hex fallbacks in `visual-editor/src/styles.css:272-306`
  (`.rune-kind-badge--data { color: var(--color-data-text, #2a69ac) }` — a
  *third* color value that only shows if the var is undefined).

**Canonical design:** one `<KindBadge>` in `visual-editor`, wrapping
`design-system <Badge>` for color (token-backed CVA variants already exist in
`badge.tsx:34-46`), with a `shape` prop:

- `shape="label"` (default) → text pill (`Data`, `Choice`…) — replaces
  `NodeKindBadge` and the inspector `<Badge>`.
- `shape="glyph"` → compact single-letter box (`D`, `C`…) — replaces the
  structure-tree `.studio-type-glyph`, **keeping its compact shape but sourcing
  color from the same token classes** (kills the inline `KIND_COLOR_VAR` path).

Both shapes read color from the **same** `--color-{kind}` tokens via `<Badge>`'s
variant classes, so no kind color is defined twice.

> **Visual decision — CONFIRMED (user, 2026-06-01):** the **structure view**
> (React Flow canvas nodes) uses `shape="label"` (full name, e.g. "Data"); the
> **explorer tree** (`NamespaceExplorerPanel`) keeps `shape="glyph"` (compact
> letter, e.g. "D"). Shapes stay differentiated by surface; *color* is shared
> (both read `--color-{kind}`), so they cannot drift. Not an open question.

**Files:**
- Create: `packages/visual-editor/src/components/KindBadge.tsx`
- Create: `packages/visual-editor/test/components/KindBadge.test.tsx`
- Modify: `packages/visual-editor/src/index.ts` (export `KindBadge`)
- Modify: `packages/visual-editor/src/components/nodes/NodeKindBadge.tsx`
  (re-implement as thin `<KindBadge shape="label">` wrapper, or replace consumers)
- Modify: `packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx`
  (glyph → `<KindBadge shape="glyph">`; delete `KIND_COLOR_VAR`, `KIND_LETTER`,
  `KIND_LABELS`)
- Modify: `packages/visual-editor/src/components/panels/DetailPanel.tsx:88`
  (`<Badge variant={kind}>` → `<KindBadge kind={kind}>`)
- Modify: `packages/visual-editor/src/components/editors/TypeSelector.tsx`
  (`getKindLabel` re-exports from `KindBadge`; remove the duplicate map)
- Modify: `packages/visual-editor/src/styles.css` (delete `.rune-kind-badge--*`
  color rules L272-306; keep the `.rune-node-kind-badge { order: 2 }` layout rule)

### Task 1: Canonical kind maps + `<KindBadge>` component

- [ ] **Step 1: Write the failing test**

`packages/visual-editor/test/components/KindBadge.test.tsx`:

```tsx
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { KindBadge, KIND_LABEL, KIND_LETTER } from '../../src/components/KindBadge.js';

describe('KindBadge', () => {
  it('renders the label shape with the kind label text', () => {
    render(<KindBadge kind="data" />);
    expect(screen.getByText('Data')).toBeInTheDocument();
  });

  it('renders the glyph shape with the single-letter classifier', () => {
    render(<KindBadge kind="choice" shape="glyph" />);
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('applies the token-backed kind variant class (one color source)', () => {
    const { container } = render(<KindBadge kind="enum" />);
    // design-system Badge variant="enum" => `text-enum` utility (theme-token backed)
    expect(container.querySelector('.text-enum')).not.toBeNull();
  });

  it('exposes one canonical label + letter map for all TypeKinds', () => {
    expect(KIND_LABEL.func).toBe('Function');
    expect(KIND_LETTER.func).toBe('F');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/visual-editor test KindBadge`
Expected: FAIL — `Cannot find module '../../src/components/KindBadge.js'`.

- [ ] **Step 3: Write `KindBadge.tsx`**

`packages/visual-editor/src/components/KindBadge.tsx`:

```tsx
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * KindBadge — the single canonical type-kind pill.
 *
 * Wraps the design-system <Badge> (token-backed CVA variants) so color is
 * sourced once. `shape="label"` is the text pill used in the graph + inspector;
 * `shape="glyph"` is the compact single-letter box used in dense tree rows.
 * Replaces NodeKindBadge, NamespaceExplorerPanel's inline KIND_COLOR_VAR glyph,
 * and TypeSelector's getKindLabel.
 */
import * as React from 'react';
import { Badge } from '@rune-langium/design-system/ui/badge';
import { cn } from '@rune-langium/design-system/utils';
import type { TypeKind } from '../types.js';

/** Canonical kind → full label. The ONE source for kind labels. */
export const KIND_LABEL: Record<TypeKind, string> = {
  data: 'Data',
  choice: 'Choice',
  enum: 'Enum',
  func: 'Function',
  record: 'Record',
  typeAlias: 'Type Alias',
  basicType: 'Basic Type',
  annotation: 'Annotation'
};

/** Canonical kind → single-letter classifier for the compact glyph shape. */
export const KIND_LETTER: Record<TypeKind, string> = {
  data: 'D',
  choice: 'C',
  enum: 'E',
  func: 'F',
  record: 'R',
  typeAlias: 'A',
  basicType: 'B',
  annotation: '@'
};

export interface KindBadgeProps {
  kind: TypeKind;
  /** 'label' = text pill (graph/inspector); 'glyph' = compact letter box (tree). */
  shape?: 'label' | 'glyph';
  className?: string;
}

export function KindBadge({ kind, shape = 'label', className }: KindBadgeProps): React.ReactElement {
  if (shape === 'glyph') {
    // Compact square; color comes from the SAME Badge variant class set, so the
    // letter glyph and the label pill can never disagree on a kind's color.
    return (
      <Badge
        variant={kind}
        aria-label={KIND_LABEL[kind]}
        className={cn('rune-kind-glyph h-[18px] w-[18px] justify-center rounded-[5px] p-0 font-mono text-[10px] font-bold', className)}
      >
        {KIND_LETTER[kind]}
      </Badge>
    );
  }
  return (
    <Badge variant={kind} className={cn('rune-node-kind-badge', className)}>
      {KIND_LABEL[kind]}
    </Badge>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/visual-editor test KindBadge`
Expected: PASS (4 tests).

- [ ] **Step 5: Export from the package barrel**

Add to `packages/visual-editor/src/index.ts` (near the other component exports,
~L22):

```ts
export { KindBadge, KIND_LABEL, KIND_LETTER } from './components/KindBadge.js';
export type { KindBadgeProps } from './components/KindBadge.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/visual-editor/src/components/KindBadge.tsx \
        packages/visual-editor/test/components/KindBadge.test.tsx \
        packages/visual-editor/src/index.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(visual-editor): add canonical KindBadge (label + glyph shapes)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 2: Route the graph nodes through `KindBadge`

`NodeKindBadge` is consumed by `GenericNode`, `EnumNode`, `DataNode`,
`ChoiceNode`, `ChoiceOptionRow`. Re-implement it as a thin wrapper so consumers
need no change, then it can be deprecated.

- [ ] **Step 1: Update the existing NodeKindBadge test (or add one) asserting it delegates**

`packages/visual-editor/test/...` — add to the nearest node test (or create
`NodeKindBadge.test.tsx`):

```tsx
import { render, screen } from '@testing-library/react';
import { NodeKindBadge } from '../../src/components/nodes/NodeKindBadge.js';

it('NodeKindBadge delegates to KindBadge label shape', () => {
  const { container } = render(<NodeKindBadge kind="data" />);
  expect(screen.getByText('Data')).toBeInTheDocument();
  expect(container.querySelector('.rune-node-kind-badge')).not.toBeNull();
});
```

- [ ] **Step 2: Run to verify current behavior still passes** (it renders "Data" today)

Run: `pnpm --filter @rune-langium/visual-editor test NodeKindBadge`
Expected: PASS (delegation not yet in place but text matches).

- [ ] **Step 3: Re-implement `NodeKindBadge.tsx` as a delegating wrapper**

```tsx
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import * as React from 'react';
import { KindBadge } from '../KindBadge.js';
import type { TypeKind } from '../../types.js';

export interface NodeKindBadgeProps {
  kind: TypeKind;
  className?: string;
}

/** @deprecated Use <KindBadge>. Retained as a thin alias for existing nodes. */
export function NodeKindBadge({ kind, className }: NodeKindBadgeProps): React.ReactElement {
  return <KindBadge kind={kind} shape="label" className={className} />;
}
```

- [ ] **Step 4: Run node tests**

Run: `pnpm --filter @rune-langium/visual-editor test`
Expected: PASS (graph nodes now render the canonical pill; `Function` label
replaces the old `COMPACT_KIND_LABELS.func = 'Function'` — already identical).

- [ ] **Step 5: Commit**

```bash
git add packages/visual-editor/src/components/nodes/NodeKindBadge.tsx packages/visual-editor/test
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "refactor(visual-editor): NodeKindBadge delegates to KindBadge

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 3: Inspector `DetailPanel` → `KindBadge`

- [ ] **Step 1:** In `DetailPanel.tsx`, replace the import + call:
  - Remove `import { Badge } from '@rune-langium/design-system/ui/badge';` if
    `Badge` is otherwise unused (the "Reference Only" pill at L90 still uses
    `Badge variant="outline"` — keep that import if so).
  - Add `import { KindBadge } from '../KindBadge.js';`
  - Replace L88 `<Badge variant={kind as ...}>{kind}</Badge>` with
    `<KindBadge kind={kind as TypeKind} />`.
- [ ] **Step 2:** Run `pnpm --filter @rune-langium/visual-editor test` → PASS.
- [ ] **Step 3:** Commit (`refactor(visual-editor): inspector uses KindBadge`).

### Task 4: `TypeSelector` → consume canonical label map

- [ ] **Step 1:** In `TypeSelector.tsx`, replace the local `getKindLabel`
  implementation with a re-export from `KindBadge` (`export const getKindLabel =
  (k: TypeKind) => KIND_LABEL[k];`) so the public API in `index.ts:38` is
  preserved but the map is no longer duplicated. Keep `getKindBadgeClasses` only
  if a non-`KindBadge` caller still needs raw class strings; otherwise delete it
  and update callers to `<KindBadge>`.
- [ ] **Step 2:** Run `pnpm --filter @rune-langium/visual-editor test` → PASS.
- [ ] **Step 3:** Commit (`refactor(visual-editor): TypeSelector reuses canonical kind label`).

### Task 5: Structure tree glyph → `KindBadge shape="glyph"`

- [ ] **Step 1:** In `NamespaceExplorerPanel.tsx`:
  - Delete `KIND_COLOR_VAR` (L89-98), `KIND_LETTER` (L75-87), `KIND_LABELS`
    (L100-109).
  - Import `{ KindBadge, KIND_LABEL }` from `../KindBadge.js`.
  - Replace the `.studio-type-glyph` `<span style={{ color: KIND_COLOR_VAR…}}>`
    (L532-541) with `<KindBadge kind={row.typeKind} shape="glyph" />`.
  - Update the title string (L549) to use `KIND_LABEL[row.typeKind]`.
- [ ] **Step 2:** Run `pnpm --filter @rune-langium/visual-editor test` → PASS.
- [ ] **Step 3:** Visual check: tree glyph color now matches the graph/inspector
  pill color for the same kind (both read `--color-{kind}`).
- [ ] **Step 4:** Commit (`refactor(visual-editor): structure tree glyph uses KindBadge`).

### Task 6: Delete the hardcoded hex fallbacks

- [ ] **Step 1:** In `packages/visual-editor/src/styles.css`, delete the
  `.rune-kind-badge--data/choice/enum/func/record/typeAlias/basicType/annotation`
  rules (L272-306). Their color now comes from `<Badge>`'s variant classes. Keep
  `.rune-node-header .rune-node-kind-badge { order: 2 }` (L249-251) — that's
  layout, still referenced by the label pill.
- [ ] **Step 2:** Grep for any remaining `rune-kind-badge--` references:
  `rg "rune-kind-badge--" packages apps` → expect none in TSX (only the deleted
  CSS).
- [ ] **Step 3:** Run the studio `no-undefined-vars` gate (the deleted fallbacks
  were masking nothing now that Badge supplies color):
  `pnpm --filter @rune-langium/studio test no-undefined-vars` → PASS.
- [ ] **Step 4:** Run full suites:
  `pnpm --filter @rune-langium/visual-editor test && pnpm --filter @rune-langium/studio test`
  → PASS.
- [ ] **Step 5:** `pnpm run type-check && pnpm run lint` → clean.
- [ ] **Step 6:** Commit (`refactor(visual-editor): drop hardcoded kind-badge hex fallbacks`).

### Task 7: Phase 1 verification & PR

- [ ] Visual parity sweep: structure tree, graph node, inspector — same kind ⇒
  same color, sourced from `--color-{kind}` (verify under default daikonic theme,
  not `?theme=default`).
- [ ] Open PR `feat/styling-p1-kindbadge`; confirm CI green.

---

## Phase 2 — CodeMirror syntax palette ← tokens (Slice 3)

**Problem:** `apps/studio/src/lang/refactory-dark-theme.ts:14-112` hardcodes hex
(`#C792EA`, `#82AAFF`, `#00D4AA`…) that already lives in `tokens.json` `syntax.*`
and is emitted as `--syntax-*` CSS vars.

**Approach:** export the `syntax` group from `design-system/src/tokens.ts` (it
currently exports `colors`/`fonts`/`radii` only), then import it in
`refactory-dark-theme.ts` and replace the hardcoded `HighlightStyle` colors with
`syntax.keyword`, `syntax.type`, etc. CodeMirror's `HighlightStyle` needs JS
values (it builds a style object), so consume the TS token export, not the CSS
vars.

**Files:**
- Modify: `packages/design-system/src/tokens.ts` (add `export const syntax = { keyword: canonicalTokens.syntax.keyword, … }`)
- Modify: `apps/studio/src/lang/refactory-dark-theme.ts` (import `syntax`; replace hex in the `HighlightStyle` tag→color map)
- Test: `apps/studio/test/lang/refactory-dark-theme.test.ts` (assert the theme's keyword color equals `tokens.syntax.keyword`, proving no hardcode)

**Tasks (expand at execution):**
1. Add `syntax` to `tokens.ts`; unit-test it re-exports `tokens.json` values.
2. Write failing test asserting `refactoryDarkHighlight` uses `syntax.keyword`
   for the keyword tag.
3. Replace hardcoded hex in `refactory-dark-theme.ts` with `syntax.*`.
4. Run studio tests; visual spot-check editor highlighting; commit; PR.

**Verify:** editor syntax highlighting visually unchanged; `type-check`; studio suite.

---

## Phase 3 — Structure-view selectors canonical (Slice 4)

**Direction (per user):** the **structure-view** styling is canonical (opposite
of the pills). Promote the structure node's selectors to shared `visual-editor`
components; the inspector adopts them.

- Type selector: `editors/structure/TypePickerCell.tsx` + the
  `.rune-cell-type-chip` family is canonical; inspector `editors/TypeSelector.tsx`
  is reskinned to match.
- Cardinality selector: `editors/structure/CardinalityCell.tsx` is canonical;
  inspector `editors/CardinalityPicker.tsx` / `CardinalityEditor.tsx` adopt it.
- Graph cell chips adopt the same canonical components.

**Files (read at execution to produce exact diffs):**
`editors/structure/TypePickerCell.tsx`, `editors/structure/CardinalityCell.tsx`,
`editors/TypeSelector.tsx`, `editors/CardinalityPicker.tsx`,
`editors/CardinalityEditor.tsx`, plus the `.rune-cell-type-chip` rules in
`visual-editor/src/styles.css`.

**Tasks (expand at execution):**
1. Extract the structure type-chip into a shared `<TypeChip>` /
   `<CardinalityChip>` in `visual-editor/src/components/` (lift the canonical
   styling out of the structure-only CSS into a component + its class).
2. Reskin `TypeSelector`'s trigger and `CardinalityPicker` to render the shared
   chip; keep their dropdown/popover behavior.
3. Point graph cell chips at the shared component.
4. Tests: render parity (structure vs inspector vs graph produce the same chip
   markup/classes); existing editor suites stay green.

**Verify:** structure + graph + inspector visual parity; perf spot-check on large
models (canvas rendering); full visual-editor + studio suites.

**Note:** depends on Phase 1 (`KindBadge`) where the chip embeds a kind color.

---

## Phase 4 — Structure-node controls → design-system where duplicated (Slice 5)

**Approach:** where React Flow nodes (`DataNode`/`ChoiceNode`/`EnumNode`) roll
their own form controls that duplicate a `design-system` primitive
(`Input`/`Select`/`Checkbox`), adopt the primitive — **except** where the node
component is itself canonical (Phase 3's chips). Audit each node's inline
controls; replace only true duplicates.

**Files (read at execution):** `nodes/DataNode.tsx`, `nodes/ChoiceNode.tsx`,
`nodes/EnumNode.tsx`, `nodes/GroupContainerNode.tsx`, and the corresponding
`.rune-cell-*` input CSS.

**Tasks (expand at execution):**
1. Inventory inline controls per node vs the `design-system` equivalent.
2. For each true duplicate: write a render test, swap to the primitive, verify
   parity, commit.

**Verify:** node editing behavior unchanged; perf on large models; suites green.

---

## Phase 5 — Layout constants: one JS SSoT emitting CSS vars (Slice 7)

**Problem:** structure-view geometry is duplicated —
`visual-editor/src/layout/structure-layout.ts` `STRUCTURE_LAYOUT_CONSTANTS`
(`ROW_HEIGHT: 28`, `HEADER_HEIGHT`, `ROW_GAP`, `NODE_PADDING`, `COL_WIDTH`, …) and
`visual-editor/src/styles.css:879` `:root { --rune-row-height: 28px; … }`, kept in
sync by `test/layout/structure-css-ssot.test.ts`.

**Approach:** make `structure-layout.ts` the single source; **emit** the
`--rune-*` custom properties from it as inline style on the React Flow node
wrapper (or a small `<style>` injected once from the constants), so CSS derives
from JS. Retire `structure-css-ssot.test.ts` once a genuine SSoT exists.

**Files:** `layout/structure-layout.ts` (add a `STRUCTURE_LAYOUT_CSS_VARS` map
deriving `--rune-*` from the constants), the React Flow wrapper that mounts
structure nodes (apply the vars), `styles.css:879-917` (remove the hand-declared
geometry vars; keep the ornament vars that aren't layout-coupled), and delete
`test/layout/structure-css-ssot.test.ts`.

**Tasks (expand at execution):**
1. Add `STRUCTURE_LAYOUT_CSS_VARS` derived from `STRUCTURE_LAYOUT_CONSTANTS`;
   unit-test that `--rune-row-height` equals `${ROW_HEIGHT}px`.
2. Apply the vars at the structure-pane root; remove the `:root` geometry
   declarations from `styles.css`.
3. Delete the SSoT parity test (no longer two sources); run layout tests.
4. Visual parity: row heights, node boxes, edge anchoring; large-model check.

**Note:** this is the enabler for layout changes like two-line attribute rows —
afterward such a change is `ROW_HEIGHT` + the row's internal cell layout, not a
hand-synced edit across two files.

---

## Phase 6 — dockview → `design-system <DockLayout>` (Slice 6)

**Problem:** `dockview-react` is imported directly in 2 `apps/studio` files, with
its `.dockview-theme-abyss` theming (~400 lines, `styles.css:228-625`) in the
studio CSS blob — asymmetric with react-flow (already encapsulated in
`visual-editor`).

**Approach:** add a thin themed `<DockLayout>` primitive to `design-system` that
owns the `dockview-react` dependency and the `.dockview-theme-abyss` theming
(tokens only, no raw hex). Studio keeps **panel composition** (which panels,
their content) — app-specific, FSL-licensed.

**Files (read at execution):** the 2 studio dockview importers, the
`.dockview-theme-abyss` block in `apps/studio/src/styles.css`, and a new
`packages/design-system/src/ui/dock-layout.tsx` + its theme CSS partial.

**Tasks (expand at execution):**
1. Create `<DockLayout>` wrapping `DockviewReact` with the themed container;
   move the `.dockview-theme-abyss` rules into a `design-system` CSS partial
   (verify they reference only semantic tokens).
2. Repoint the 2 studio importers at `<DockLayout>`; keep panel registration in
   studio.
3. Verify dock chrome parity (tabs/sashes/groups); no-undefined-vars over the
   relocated theming; studio suite.

**Rationale honesty:** single consumer today → this is a
consistency/maintainability win (substrate symmetry + theming out of the studio
blob), not a reuse win. Smallest-value slice; sequence here.

---

## Phase 7 — Token foundation: two-tier palette + spacing (Slice 1)

**HIGH RISK — hard constraint: zero rendered-value change.** Daikonic is the
default theme (`App.tsx:531`), so capture daikonic's currently-computed values
*before* the refactor and assert the new output renders them byte-identically.

**Problem:** `tokens.json` `color` ≡ `color_dark`; `theme.css` `:root` ≡ `.dark`;
`daikonic.css` re-hardcodes hex + re-defines the kind palette; `space` (px) and
`spacing` (rem) duplicate one ladder; `build.test.ts:128-138` pins emitted values
(`--color-kind-data-base: #00D4AA`, `--space-1: 4px`).

**Approach (two-tier):**
1. **Tier 1 primitives** in `tokens.json`: add a `primitive` group with every raw
   swatch (`teal-500: #00D4AA`, `keppel-500: #41B8AA`, `sandy-500: #FA994A`,
   `vermilion-500: #F03630`, surfaces incl. daikonic's oklch, …).
2. **Tier 2 semantic** per theme: rewrite the `color.*` tree (and the daikonic
   block) so semantic tokens (`--color-kind-data-base`, `--background`, …)
   `var()` a primitive — zero raw hex.
3. **`build.ts`**: emit `:root` (shared base mapping) + delta-only theme blocks
   (`[data-theme="daikonic"]`, future `.light`) from the primitive palette;
   generate both `spacing` (rem) and `--space-N` (px) from one ladder. Replace
   `daikonic.css`'s palette override with the generated block (keep its brand
   flourishes — banded mark, wordmark tag).
4. Delete `color_dark` (identical dup) and the `.dark`-identical body.
5. Update `build.test.ts`: assert primitives (`--teal-500: #00D4AA`) AND the
   semantic mapping (`--color-kind-data-base: var(--teal-500)`); add a per-theme
   computed-value-parity assertion.

**Files:** `packages/design-tokens/src/tokens.json`,
`packages/design-tokens/src/build.ts`, `packages/design-tokens/tests/build.test.ts`,
`packages/design-system/src/theme.css`, `apps/studio/src/styles/daikonic.css`.

**Tasks (expand at execution — gated on a value-capture step):**
1. **Capture baseline:** script that reads the computed value of every semantic
   token under each theme (default + daikonic), snapshot to a fixture.
2. Introduce primitives; rebind semantic tokens; rewrite `build.ts` emitter.
3. Update snapshot tests; assert per-theme computed values match the captured
   baseline (zero rendered change).
4. Convert `daikonic.css` palette → generated delta block; keep brand flourishes.
5. Generate `--space-N` from the `spacing` ladder; run `no-undefined-vars`.
6. Full suites + visual review **under the default daikonic theme**; PR.

**Verify:** `design-tokens` snapshot + computed-parity tests; studio
`no-undefined-vars`; `no-literal-layout-px`; visual review of daikonic (default)
and `?theme=default`.

---

## Self-Review checklist (run before execution)

- [ ] **Spec coverage:** every spec slice maps to a phase (Slice 1→P7, 2→P1,
      3→P2, 4→P3, 5→P4, 6→P6, 7→P5). ✅
- [ ] **No placeholders in Phase 1** (the lead phase) — all code is complete.
- [ ] **Type consistency:** `TypeKind` (8 members) used identically across
      `KindBadge`, `NodeKindBadge`, `NamespaceExplorerPanel`; `KIND_LABEL` /
      `KIND_LETTER` are the single maps.
- [ ] **Later phases** are task-level by design (dependency-gated); each names
      exact files + verification and is expanded just-in-time.
