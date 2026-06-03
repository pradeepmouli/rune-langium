# Radius + Spacing Consistency Scrub — findings & plan

> Extends the "one canonical value, no divergence" principle (done for colors in #290)
> to corner-radius and spacing across `apps/studio/src/styles.css` +
> `packages/visual-editor/src/styles.css`. User approved: "Full scrub + lint enforcement"
> and wants it to double as "a little polish". Branch: `chore/radius-spacing-scrub`.

## ⚠️ KEY FINDING — the radius TOKEN SYSTEM is self-contradictory

There are **two radius ladders** shipping in the bundle, and they DISAGREE:

| token | tokens.css (`:root`, primitive) | theme.css (`@theme inline`, shadcn bridge, `--radius:8px`) |
|---|---|---|
| `--radius-sm` | `0.25rem` = 4px | `calc(--radius - 4px)` = 4px |
| `--radius-md` | **8px** | **`calc(--radius - 2px)` = 6px** |
| `--radius-lg` | **0.75rem = 12px** | **`var(--radius)` = 8px** |
| `--radius-xl` | (none) | `calc(--radius + 4px)` = 12px |
| `--radius-full`| 9999px | (none) |

**Cascade winner (verified in built bundle by document order — last equal-specificity
`:root` wins):** the tokens.css copy is LAST, so **hand-written `var(--radius-md)` = 8px,
`var(--radius-lg)` = 12px**. BUT Tailwind's `rounded-md`/`rounded-lg` UTILITIES use the
`@theme inline` values (6px/8px) because `@theme inline` inlines into utilities. So
**`var(--radius-lg)` (12px) and `rounded-lg` (8px) render different corners today.** That
is the root inconsistency — fix it before normalizing literals, or you normalize onto a
contradiction.

## The literal drift (what to normalize once the ladder is settled)

~13 distinct radii across studio+ve: `1.5 / 2 / 3 / 4 / 5 / 6 / 7 / 8 / 9 / 12 / 999 / 9999`.
Usage (selector → value): tiny pips/glyphs/chevrons = 2px (intentionally tight → needs an
`xs` rung); chips/cards = 3–4px; type-reference picker/navbox, panel-action, badges, chiclets
= 6–9px; cards (`.rune-node`) = `var(--radius-lg)` = 12px; tabs top = `6px 6px 0 0`; one
stray `1.5px`. `999px` should be `9999px` (`--radius-full`).

## Decision needed (the polish): pick ONE coherent scale

Both resolutions nudge SOME corners (the system can't be kept pixel-identical because it's
contradictory). Candidate scales (add `--radius-xs: 2px` either way):

- **Unify on shadcn `--radius`-driven (sm4/md6/lg8/xl12):** makes `var(--radius-*)` AGREE
  with Tailwind `rounded-*` utilities (big win). Fits existing 6/8/12 literals EXACTLY. But
  `var(--radius-lg)` consumers (`.rune-node` cards) go 12→8 (visibly tighter) unless remapped
  to `--radius-xl`.
- **Unify on tokens.css primitive (sm4/md8/lg12):** keeps cards at 12 (current/"modern"
  preference per ve code comment), but orphans the 6px literals (→ md8, +2) and still leaves
  Tailwind utilities on a different scale unless those are realigned too.

Recommended: shadcn-driven scale (standard, unifies CSS-vars + utilities), with `.rune-node`
& other intentional-12 cards remapped to `--radius-xl` so the card corner is preserved. Set
`--radius` as the single knob (user: "we can change it later" — true, it's one value).

## Build sequence (once scale chosen)

1. design-system: resolve the dual ladder to ONE definition (retire the conflicting set), add
   `--radius-xs`. Keep `--radius` as the single tunable knob.
2. Normalize every literal `border-radius` in studio+ve → `var(--radius-*)` per the chosen map.
   `1.5px`→xs, `999px`→full. Multi-value (`6px 6px 0 0`) → `var(--radius-md) var(--radius-md) 0 0`.
3. Border-width: stray `1.5px` → `1px`.
4. SPACING (2px-grain): the off-ladder padding (5/6/7/10/14) is mostly INTENTIONAL tight-chrome
   tuning (kbd `1px 5px`, badge `0 6px`, breadcrumb `6px 10px`). Coarse-rounding to the 4-step
   `--space-*` ladder would visibly fatten/pinch chips — DON'T. Instead introduce a 2px-granular
   step (or component padding tokens) so 6/10/14 become real tokens with NO pixel shift; only
   the odd 5/7 nudge 1px. Tokenize all padding/margin → `var(--space-*)`.
5. Stylelint: extend `packages/visual-editor/stylelint-plugins/` enforcement so raw
   `border-radius` + off-ladder spacing are flagged across studio + ve (today
   `rune/no-literal-layout-px` only guards ve `.rune-*` layout classes). This is the
   "make it stick" step.

## Verification

lint:css (ve + studio), ve 1074 tests, studio 887 tests, studio build exit 0, and **visual
sign-off at the mount sites** (cards, chips, badges, tabs, panels) — radius shifts ARE visible
this time, unlike the color SSoT work. Confirm `var(--radius-lg)`-vs-`rounded-lg` no longer
diverge.

## Status

Branch `chore/radius-spacing-scrub` created off master; NO code edits yet (investigation only).
Two prior scrub PRs merged this session: #289 (source-exports infra) + #290 (color-fallback
removal). This radius/spacing work is scoped and ready; it needs the scale decision above +
visual verification, so it's best executed deliberately (with the studio running to eyeball),
not blind.
