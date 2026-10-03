# design-sync notes — @rune-langium/design-system → claude.ai/design

Project: "Daikonic Studio Components" (`projectId` in config.json). Package shape (no Storybook).

## Build
- From the REPO ROOT (preview discovery resolves `.design-sync/previews` against cwd):
  1. `pnpm -F "@rune-langium/design-system..." build` (tsc → `packages/design-system/dist/`)
  2. `.ds-sync/node_modules/.bin/tailwindcss -i .design-sync/tailwind.css -o packages/design-system/dist/ds-sync.css`
  3. `node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules packages/design-system/node_modules --entry ./packages/design-system/dist/ui/index.js --out ./ds-bundle`
- Converter deps live in `.ds-sync/` (npm, isolated): esbuild ts-morph @types/react `@tailwindcss/cli@4.3.3` `tailwindcss@4.3.3` tw-animate-css `playwright@1.63.0`.
  `.design-sync/node_modules` → `../.ds-sync/node_modules` symlink (gitignored, recreate per clone) so `@import 'tailwindcss'` in `.design-sync/tailwind.css` resolves.
- playwright 1.63.0 pins chromium-1243 (the locally cached build); the repo's own playwright-core 1.62.1 pins 1234.
- Package needed `"types": "./dist/ui/index.d.ts"` (converter reads `types` to find the .d.ts barrel; `exports` still wins for TS so workspace resolution is unchanged) and the `ui/index` barrel was missing number-chiclet + row-glyph.

## Styling
- Components are Tailwind v4 utility-class styled; the DS ships only source CSS (`theme.css` with `@theme inline`). `.design-sync/tailwind.css` mirrors `apps/studio/src/app.css`'s DS layer (tailwind → tw-animate-css → theme.css → dock-theme.css) and `@source`s the DS src + `.design-sync/previews` → compiled `dist/ds-sync.css` = `cfg.cssEntry` (must live inside the package dir).
- `@import 'tailwindcss' source(none)` — the CLI otherwise auto-scans the whole repo (cwd) and ships Studio/docs-only classes (was the source of stray `bg-[var(--color-brand-500)]`, `bg-gray-500`, …).
- `@source inline(...)` safelist guarantees the design-agent vocabulary documented in `conventions.md` (layout/spacing/sizing/semantic-token colors). Keep the two in sync; the safelist color matrix is deliberately trimmed (full opacity×state cross product = +490KB).
- Brand fonts (Inter / JetBrains Mono / Outfit) load via the same Google Fonts `@import url(...)` as `apps/studio/index.html:9`.
- Studio hardcodes `<html class="dark">`; the only shipped palette is dark Daikonic (midnight-green surfaces, sandy-brown primary, keppel-teal secondary). User (2026-09-29): light mode / alternative palettes are welcome but not built yet — do not invent one; keep designs token-driven.
- Preview card shell forces `body{background:#fff}`; every authored preview imports `./_studio-dark` (side effect: `html.dark` + body bg/fg tokens) so portaled overlays inherit the theme. The import is stripped from `.prompt.md` examples.

## Previews
- Story source: the prod-ux journeys (`apps/studio/test/prod-ux/journeys/j01..j18`) — each preview composes the component the way Studio uses it in that flow (user directive). Port JSX from the Studio component that the journey exercises.
- 31 roots authored; 72 subparts (DialogContent, SelectItem, …) ship floor cards by design (shown composed inside their parent's card).
- Overlays use `cardMode: single` + viewport overrides.

## Composition gotchas (from preview waves)
- base-ui, not Radix: `DropdownMenuLabel` must sit inside `DropdownMenuGroup` or the whole menu throws (blank card).
- `Heading` needs numeric `level` (1-4); `Avatar` needs `AvatarFallback` child; `RowGlyph` needs `variant`.
- `AlertDescription` is a CSS grid: wrap inline text + `<code>` in a `<p>` or each inline piece becomes a row.
- `Form` = react-hook-form `FormProvider` only (no FormField/FormItem) — compose `useForm` + `Controller` + `Field*`.
- `ToastViewport` is `fixed bottom-0`; previews pass `className="top-0 bottom-auto"`; toasts seeded via `useToastManager().add({timeout:0})` inside `ToastProvider`.
- cmdk `CommandInput` ignores `defaultValue` (use `value`).
- Never put `${...}` inside template-literal code samples in previews (ReferenceError at capture).
- Select stories use default `item-aligned`; `position="popper"` sets the list to `h-(--anchor-height)` (only ~1 row visible) — DS bug, unfixed, needs base-ui investigation.

## DS fixes made during this sync (2026-09-29)
- `CommandItem`: `data-disabled:` → `data-[disabled=true]:` (cmdk renders `data-disabled="false"` on every item, so all items were 50% opacity + pointer-events-none).
- `SelectItem` highlight: `text-primary-foreground` → `text-accent-foreground` (dark-on-dark contrast).

## Scope follow-ups
- Next phase (user-approved): add `@rune-langium/visual-editor` presentational pieces (KindBadge, NodeKindBadge, TypeHeader, GraphLegend, CardinalityPicker, TypeSelector, graph nodes w/ sample data) to this same project via extraEntries + VE styles.css. Studio (FSL app) components stay out; its chrome only informs conventions.

## Known render warns
- `[RENDER_THIN]` Dialog / InteractiveDialog: 0px measured height because content portals to body with fixed positioning — screenshots verified rendering correctly (benign).
- Review/capture cells are a fixed ~670x520 frame; compact components (Separator, IconButtonGroup, AppSwitcher, Kbd) sit top-left in empty dark space — cosmetic.
- Disabled primary Button label is low-contrast on the dark surface (DS design choice, opacity 0.5) — not changed.
- `[TOKENS_MISSING]` ~15: `--type-chip-bg/-fg`, `--rune-chip-padding-*` (set inline by TypeChip/chip components) and `--rune-header-height`, `--rune-node-padding`, `--rune-col-width`, `--rune-row-*` (set at runtime by visual-editor `layout/structure-layout.ts`). Expected.
- `[DOCS_UNMAPPED]` for the 5 VE components — prompt.md synthesized from dtsPropsFor + JSDoc + previews. Expected.

## Re-sync risks
- The first sync (2026-09-29) was built from a branch where `Command` still wrapped cmdk; master has since migrated it to base-ui `Combobox` (65bb9f09). Same export names, but re-verify `previews/Command.tsx` (and its grade) on the next sync. The `CommandItem` `data-disabled` fix made during the sync is moot on master (base-ui only sets the attribute when disabled).
- `cfg.dtsPropsFor` for the 5 VE components duplicates their source prop interfaces — re-diff against `packages/visual-editor/src/components/**` on every sync.
- Google Fonts URL duplicated from `apps/studio/index.html` — keep in sync.
- `.design-sync/tailwind.css` import order duplicates `apps/studio/src/app.css`'s DS layer — if Studio adds a DS-level stylesheet, add it here too.
- Utility classes only exist if DS src / VE components / previews / the safelist use them; arbitrary values (`w-[480px]`) only if already used. conventions.md tells the agent this — re-validate its class list against `_ds_bundle.css` on every sync.
- Grades are keyed on a contract that includes global config (adding VE dtsPropsFor/extraEntries cleared every DS grade once) — expect a one-time regrade when config shape changes.
