# Visual-Editor Fallback Removal Plan

> Removes the `var(--token, #fallback)` pattern from `packages/visual-editor/src/styles.css`
> (226 occurrences) so a token has exactly ONE canonical value — killing the divergent-fallback
> inconsistency the user flagged ("it's just a way to end up with inconsistency").

**Goal:** Every `var(--token)` in visual-editor resolves to a single canonical value sourced from
the design-system token SSoT; no inline fallbacks; standalone rendering mirrors the design-system
brand palette (user decision: "Mirror design-system brand").

**Branch:** `chore/visual-editor-fallback-removal` (off master, after #289 lands or stacked).

---

## Why (the smoking gun)

visual-editor's `styles.css` carried 226 `var(--token, #fallback)`, and the same token had
*divergent* fallbacks — two whole palettes merged by accident:

| Token | Fallback A (brand) | Fallback B (bootstrap) |
|---|---|---|
| `--color-data` | `#00D4AA` | `#4299e1` |
| `--color-choice` | `#E8913A` | `#ed8936` |
| `--color-enum` | `#8B7BF4` | `#48bb78` |

If a token ever went undefined, elements rendered *different colors*. Wrong radius fallbacks were
also found (`var(--radius-sm, 3px)` when `--radius-sm` = 4px).

## Architecture (decided)

- ve `styles.css` is **plain CSS** — build just `cp`s it (no Tailwind/PostCSS pass), and ve uses
  only hand-written `.rune-*` classes with `var()` (no Tailwind utilities). So importing
  design-system's token CSS works for the **values** (`:root{}` decls are plain CSS; the `@theme`
  at-rules ve doesn't need are ignored by browsers). Bundlers dedupe the import when embedded in
  studio (studio already imports `theme.css`).
- **DRY:** import the canonical CSS rather than echo 200+ values into a ve `:root` (that would just
  relocate the duplication).

## Token cross-reference (verified)

ve references **81** distinct tokens. **58** are defined by `design-system/theme.css`(+`tokens.css`)
→ resolved by the import. **23** are ve-own:
- `--rune-*` (layout/ornament): already defined via JS `STRUCTURE_LAYOUT_CSS_VARS` + ve `:root`
  (line ~901). Keep defs; just strip their `, fallback` parts (e.g. `var(--space-2, 8px)` →
  `var(--space-2)`).
- 6 ve-specific graph colors with NO canonical home today (fallback-only):
  `--color-base-type`, `--color-base-type-bg`, `--color-error`, `--color-error-bg`,
  `--color-error-text`, `--node-accent`.
- `--radix-select-content-available-height`: **DEAD** — Radix leftover; project migrated to
  base-ui. REMOVE (not preserve). Only use: `styles.css:278`
  `max-height: min(24rem, var(--radix-select-content-available-height))` → `max-height: 24rem`.

## ve-specific color mapping (user: "the existing pill colors")

Map to existing design-system tokens, do NOT invent values:
- `--color-error` → `var(--color-status-error)`  (DS: `oklch(0.6949 0.1952 26.32)`)
- `--color-error-text` → `var(--color-status-error)`
- `--color-error-bg` → `color-mix(in oklch, var(--color-status-error) 8%, transparent)` (or a
  `--color-destructive` subtle tint if one exists)
- `--color-base-type*` → **OPEN: which existing pill?** base-type is the inheritance-wrapper color
  (historically gold `#d4a017`). DS has no `--color-kind-base-type`. Closest existing pill colors:
  `--color-status-warning` / `--color-kind-choice-*` (amber, `oklch 0.7321 0.1441 61.66`) — but
  choice already uses that hue. NEEDS user pick before strip.
- `--node-accent` → keep ve-local (glass accent, defaults to `--primary`); user didn't object.

## Build sequence

1. Branch off master.
2. `styles.css`: add `@import '@rune-langium/design-system/theme.css';` at top (after the header
   comment, before the first rule).
3. Replace the ve-specific color tokens' canonical home: add a small `:root` block (or inline the
   `var(--color-status-*)` mapping) per the mapping above once base-type is settled.
4. `styles.css:278`: drop the dead radix var → `max-height: 24rem;`.
5. Strip all remaining inline fallbacks → bare `var(--token)`. Includes nested
   (`var(--card, var(--background, #181824))` → `var(--card)`). Mechanical but verify each
   multi-line `var()` (some span lines). Do NOT touch `color-mix(... transparent ...)` 2nd args
   (those are not token fallbacks).
6. Update the header comment (lines 1-7) — no longer "light-theme fallbacks"; now "tokens resolve
   from design-system/theme.css; embedded studio overrides via daikonic".

## Verification

- `pnpm --filter @rune-langium/visual-editor run lint:css` (stylelint — the new `rune/no-raw-color`
  rule should now find FEWER raw colors, and no `var(...,#hex)` fallbacks).
- `pnpm --filter @rune-langium/visual-editor test` (1074 pass; structure-css-ssot.test.ts asserts
  `--rune-*` parity — must stay green).
- `pnpm --filter @rune-langium/studio test` (887 pass).
- Build studio, **visually verify** the graph: data/choice/enum/func/base-type node colors, error
  rows, cardinality pills, edge labels, glass node accents — at the mount site (per
  `feedback_verify_integration_site`). Confirm NO color regressed vs master.
- Grep assert zero remaining fallbacks: `rg 'var\(--[a-z0-9-]+,\s*[^)]' src/styles.css` → only
  legitimate non-token `var()` 2nd-args, if any.
