# Style Override Cleanup — Audit + Plan

> **Status:** Audit complete (2026-06-03). Cleanup pending. Follows the completed
> styling-systematization arc (P1–P7, all merged) — now that tokens + shared
> components are centralized, this scrubs page-/panel-/local-level overrides that
> duplicate or fight them.

**Scope audited:** `apps/studio/src/styles.css` (2255 lines),
`apps/studio/src/styles/daikonic.css` (144), `packages/visual-editor/src/styles.css`
(1515), and component-level `style={{…}}` / arbitrary-value `className` overrides.

**Overall health: mostly clean.** The token bridge is solid; visual-editor's ~111
`var(--token, #fallback)` hardcodes are the intentional standalone-fallback pattern
(MIT package must render without the studio theme) — NOT debt. Real debt concentrates
in: the glass-morphism block, a couple of legacy off-palette color sections, and two
token-name bugs.

---

## ⚠️ Verification corrections (audit agent made 1 false positive — verify before removing)

The audit was produced by a sub-agent. Independent spot-checks found **3 of 4 top
claims true, 1 FALSE**:

- ✅ `var(--warning …)` / `var(--info …)` are **undefined tokens** — real bug (see below).
- ❌ **`body[data-studio-app='true']` (styles.css:29-31) is NOT dead — DO NOT remove.**
  The agent claimed the attribute is never set; in fact `apps/studio/src/App.tsx:519`
  does `document.body.setAttribute('data-studio-app', 'true')`. The rule is LIVE (sets
  the studio body font). The agent was misled by `rg`'s match-highlighting corrupting
  the attribute name in its output. **Lesson: use `rg --color=never` (or `grep` on
  piped output) — rg highlight-mangling produced this false positive; re-verify EVERY
  "dead rule" / "duplicate" claim with a clean grep before deleting.**

---

## Glass morphism — where it's used (the biggest debt cluster)

Frosted-glass chrome, applied in exactly 3 live spots:

| Class | Applied at | Surface |
|---|---|---|
| `.glass-header` | `App.tsx:990` | studio top header bar |
| `.glass-toolbar` | `ExplorePerspective.tsx:1478` | editor-perspective toolbar |
| `.glass-statusbar` | `ExplorePerspective.tsx:2046` | status bar / footer |
| `.glass-surface` | **(nowhere)** | **DEAD** — defined styles.css:1766, referenced by no TSX/CSS → remove |

Each live class = a raw `oklch(0.14–0.16 0.02 280 / 0.7–0.8)` background + `backdrop-filter:
blur(12–20px)`. `.glass-toolbar` additionally has the `[data-slot='button']` override
block (styles.css ~1796-1861) using `!important` to fight Button's CVA utilities.

The glass hue (280, lightness 0.14–0.16) is NOT identical to any surface token, and
daikonic overrides `--background` to a different value — so naive tokenization risks a
visible shift. **Glass needs a visual baseline gate** + a keep-vs-token decision
(likely: introduce `--glass-bg-*` tokens in daikonic.css to preserve the material tuning).

---

## TOKENIZE — hardcoded values with centralized equivalents

### Real bugs (undefined token names — wrong color renders today)
| file:line | current | fix | note |
|---|---|---|---|
| visual-editor/styles.css:1476 | `var(--warning, #ecc94b)` | `var(--color-warning, #ecc94b)` | `--warning` undefined → warn diagnostic border shows the hardcoded `#ecc94b`, not the theme color. The SAME file uses `--color-warning` correctly at line 881. |
| visual-editor/styles.css:1481 | `var(--info, #63b3ed)` | `var(--color-info, #63b3ed)` | same — `--info` undefined. |

### Off-palette legacy colors (wrong under daikonic)
| file:line | current | fix | risk |
|---|---|---|---|
| styles.css:1010 | `rgba(51,65,85,0.3)` (slate) on `.ns-row` separator | `var(--border)` | LOW |
| styles.css:1024 | `rgba(59,130,246,0.1)` (blue-500) `.ns-row__header:hover` | `color-mix(in oklch, var(--primary) 10%, transparent)` or `var(--accent)` | MED — blue→teal shift (the point) |
| styles.css:1028 | `rgba(59,130,246,0.05)` `.ns-row__header--visible` | `color-mix(in oklch, var(--primary) 5%, transparent)` | MED |
| styles.css:1093 | `rgba(59,130,246,0.08)` `.ns-type:hover` | `var(--accent)` | MED |

### Component-level JS color constants (bypass the kind tokens + daikonic retune)
| file:line | current | fix | risk |
|---|---|---|---|
| GraphFilterMenu.tsx:22-37 | `color: '#00D4AA' / '#E8913A' / '#8B7BF4' / '#82AAFF'` for NODE_KINDS/EDGE_KINDS | use `'var(--color-data)'` etc. as the inline-style color string (resolves in inline styles; updates on theme change). Note the dot uses the color for both fill and `border: 1.5px solid ${color}` — switch to separate style props. | MED |

### Raw `#ffffff` → semantic
| styles.css:1668 `.rune-type-creator__submit` `color:#ffffff` → `var(--primary-foreground)` | LOW |
| visual-editor/styles.css:626 `.rune-toolbar-button-active` `color:#ffffff` → `var(--primary-foreground)` | LOW |

### rgba→oklch syntax consistency (pure syntax, zero visual change)
~15 `rgba(255,255,255,…)` / `rgba(0,0,0,…)` depth-cue shadows + gloss in both files →
`oklch(1 0 0 / …)` / `oklch(0 0 0 / …)`. Low value, do opportunistically.

---

## PUSH-TO-COMPONENT — overrides that re-style shared components

(Decision per item: app-specific brand tweak = keep; generally-applicable = push into
the design-system component so all consumers benefit.)

| file:lines | overrides | lean |
|---|---|---|
| styles.css:162-218 | `[data-slot='button']` — adds cursor/transition/hover-lift (generally applicable) + resizes default/sm/xs density (studio preference) | **split**: push cursor+transition+lift to `Button.tsx`; keep density as studio-scoped or add a `data-density='compact'` Button variant |
| styles.css:1796-1861 | `.glass-toolbar [data-slot='button']` — 13 `!important` rules re-styling Button for the glass surface | **keep as surface-context** (not a Button concern), but kill `!important` via a cascade layer / higher-specificity selector instead |
| styles.css:1739-1744 | `[data-slot='panel-header']` glass bg — UNSCOPED (no `.studio-app`) | **scope to `.studio-app`** (1-char fix; protects future design-system PanelHeader consumers) |
| styles.css:2117-2133 | `.studio-insp-tabs [data-slot='tabs-trigger']` — height 28px / font 12px / active underline | **add a `size='sm'`/`compact` Tabs variant** in design-system (recurs in dense panels) |
| styles.css:1707-1756 | `[data-slot='*-form'] input` dark-theme bg/border/focus | likely **DEDUP** — the shared Input already sets `bg-background border-input` in dark; verify it's covered, then remove |

---

## DEDUP / REMOVE — (RE-VERIFY each with clean grep first)

| file:lines | claim | action | verified? |
|---|---|---|---|
| styles.css:1766 | `.glass-surface` defined, used nowhere | remove | ✅ confirmed dead |
| styles.css:1223-1241 | `.studio-source-view__content::-webkit-scrollbar` re-declares the global `*::-webkit-scrollbar` (80-99) | remove | ⚠️ re-verify values match |
| styles.css:29-31 | `body[data-studio-app]` font rule | **KEEP — NOT dead** (App.tsx:519 sets it) | ❌ agent was wrong |
| styles.css:134-160 | `.studio-app` font-family + h1-h6 overrides may duplicate `theme.css @layer base body` | dedup IF the base layer resolves first (mind Radix portals rendering outside `.studio-app`) | ⚠️ needs font-cascade test |
| glass button blocks | `transition: all 0.2s` (animates layout props) | → explicit property list | LOW |

---

## KEEP (aggregate — do not touch)
- ~111 `var(--x, #fallback)` in visual-editor — intentional standalone fallbacks.
- All daikonic.css `[data-theme='daikonic']` token overrides + brand flourishes (banded
  mark, wordmark, primary-button glow) — the brand retune.
- `--rune-*` structure-layout geometry (JS-emitted SSoT) and `--rune-chip-*` ornament
  constants — separate SSoT.
- Commented intentional opacity divergences (`:disabled` at 0.3/0.35/0.5 vs 0.4 baseline).

---

## Recommended execution order (gated)

**Phase 1 — verified bug fixes (small intentional visual correction, no regression risk):**
1. `--warning`→`--color-warning`, `--info`→`--color-info` (visual-editor:1476,1481). Note:
   this CHANGES the warn/info diagnostic border from the hardcoded hex to the theme color —
   that's the fix. Confirm the daikonic warn/info colors look right.

**Phase 2 — off-palette tokenization (light visual check):**
2. ns-explorer blues/slate (styles.css:1010,1024,1028,1093) → tokens. Blue→teal is the intent.
3. GraphFilterMenu.tsx JS hex → `var(--color-*)` strings.
4. `#ffffff`→`--primary-foreground` (2 spots). glass border `oklch(1 0 0/0.06)`→`var(--border)`.

**Phase 3 — DEDUP (re-verify EACH claim with clean grep, then remove):**
5. `.glass-surface` (dead, confirmed). Scrollbar dup block. `transition: all` fixes.
6. Font-cascade dedup — only with a Radix-portal font test.

**Phase 4 — visual-baseline-gated:**
7. Glass background tokenization (introduce `--glass-bg-*` tokens; pixel-compare before/after).
8. `[data-slot='button']` density + glass `!important` cleanup (snapshot all buttons first).
9. Tabs `size='sm'` variant + push the generally-applicable Button rules into `Button.tsx`.

**Method for every phase:** capture a live computed-value + screenshot baseline under
daikonic BEFORE, change, re-capture, DIFF. Phases 1-2 have intended (documented) visual
changes; Phases 3-4 must be byte-identical except where explicitly noted.

## Open judgment calls (human decision)
- **Glass teal** `oklch(0.78 0.17 168)` ≈ but ≠ `--color-accent-base` — keep a `--glass-accent`
  material token, or accept the drift and use the accent token? (lean: keep material token)
- **Button density overrides** — push a `compact` variant into Button, or keep studio-local?
- **Tabs compact** — promote to a design-system Tabs size, or keep inspector-scoped?
