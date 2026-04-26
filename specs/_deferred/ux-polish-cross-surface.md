# Deferred Feature Scope: Cross-Surface UX Polish + Studio Layout Regressions

**Status**: Deferred — not yet a feature branch.
**Origin**: Post-merge audit of feature `012-studio-workspace-ux` against
spec.md SC-007 ("an outside reviewer comparing screenshots of equivalent
UI primitives across the landing site, docs, and Studio identifies them
as 'the same product' without prompting"). The audit, run by a
research agent driving Playwright against the production deploy at
`https://www.daikonic.dev/`, found that SC-007 is **not achieved** and
that Studio has several visible polish regressions on top.

When ready, hand the **Intent Summary** below to `/speckit.specify` to
turn this into a numbered feature.

Artefacts: screenshots saved at
`.playwright-mcp/ux-audit/{01..09}-*.png`.

---

## Intent Summary

**Feature**: Make Studio, the landing site, and the docs site visually
indistinguishable as one product, AND fix the six release-blocking
Studio polish regressions that the 012 ship surfaced.

**Problem being solved**:
- SC-007 from feature 012 says the three surfaces should read as "the
  same product." Today they do not — the Studio body font is *Inter*
  while landing and docs use *Outfit*, three different primary-button
  shapes coexist, and the Studio `secondary` Button variant is solid
  amber so empty-state CTAs visually outrank the actual primary CTA.
- `dockview-react/dist/styles/dockview.css` is **never imported** in
  Studio. Panel chrome falls back to unstyled DOM in production —
  panel labels render as raw `workspace.fileTree`, `workspace.editor`,
  `workspace.problems`, etc. as literal text in the page flow.
- Studio's hand-rolled CSS in `apps/studio/src/styles.css` references
  custom properties (`--space-1`…`--space-10`, `--text-md`,
  `--sidebar-width`, `--text-secondary`) that **are never defined**.
  ~30 padding/gap declarations silently collapse to `0`, producing
  the "muddled layout" the user reported.
- Each surface ships its own copy of brand tokens — landing inlines
  them in `site/index.html`, docs sets `--rune-*` in
  `apps/docs/.vitepress/theme/custom.css`, Studio uses
  `--background`/`--primary` from `packages/design-system/src/theme.css`.
  Palette and typography drift only by accident; a future re-skin
  would require touching three files and remembering all three.

**Chosen approach**:
1. Promote the existing `@rune-langium/design-tokens` package to be
   the **single source of truth** for fonts, colors, syntax tokens,
   spacing, radii, focus rings, and shadows.
2. Have the design-system, the landing site (`site/index.html`), and
   the docs site (`apps/docs/.vitepress/theme/custom.css`) all
   consume the tokens (CSS-variables) instead of redeclaring them.
3. Standardise primary + secondary button shape across surfaces.
4. Define the spacing scale (`--space-*`), text scale (`--text-md`),
   sidebar width family, and `--text-secondary` alias inside
   `theme.css` so the existing Studio CSS just starts working.
5. Import `dockview-react`'s stylesheet, pick one dockview theme
   class, and rename panel display titles to user-facing strings.
6. Sweep the seventeen smaller polish items (focus-ring uniformity,
   diagnostic colors, scrollbar, brand-mark size, etc.).

**Success criteria**:
- [ ] SC-007 (from feature 012) finally passes: a designer screenshot
      review of landing / docs / Studio at 1280×800 and 1440×900
      cannot identify the three as different products.
- [ ] No CSS rule in `apps/studio/src/styles.css` references an
      undefined custom property. `grep -rn "var(--space-" apps/studio`
      returns only references whose definitions exist in
      `theme.css` (or its imports).
- [ ] Every dockview panel renders with intended chrome (visible
      tab strip, sash handles, group separators) at 1440×900.
      Panel display titles show user-facing strings, not registry IDs.
- [ ] Both Studio's `Button variant="secondary"` and the
      empty-state CTAs follow the landing's transparent + bordered
      styling. The `New` button is the only solid CTA on the page.
- [ ] `axe-core` still passes the `studio-a11y` CI gate. (No
      regressions from the focus-ring reshuffle.)
- [ ] Public Studio chrome contains no developer-mode strings. The
      status bar's "start the external server on ws://localhost:3001"
      message is replaced with a user-facing fallback copy and the
      `localhost:3001` URL is gated behind a developer-mode flag.

**Out of scope (explicit)**:
- A visual redesign. This is a *consistency* feature, not a
  rebrand. Pixel parity with the existing landing-site palette is
  the bar.
- Adding new components. We only re-skin / restyle existing ones.
- Migrating Studio off Tailwind 4 or off the existing
  `@rune-langium/design-system` ui primitives.
- Performance work, except where a polish change incidentally
  removes a `transition: all` or stops over-eager re-renders.
- The deferred Inspector form migration (`?z2f`) — separate spec at
  `specs/_deferred/inspector-z2f-migration.md`.
- The `apps/studio/src/components/EditorPage.tsx` toolbar overhaul
  beyond the visual grouping fix below; a real redesign is a
  separate spec.

**Open questions for the spec**:
- Which surface holds the *canonical* button shape? The audit
  recommends landing's `radius-md = 8px`, height 40px, weight 600;
  the docs use a 20px pill, the design-system uses 6px. Pick one
  before `/speckit.plan`.
- Should the design-tokens package emit a runtime-loadable
  `brand.css` that landing's `<head>` and the VitePress theme
  `<link>` to (one round-trip on first paint), or should each
  surface continue to inline a small subset of variables and
  consume the full set only at build time? The audit recommends a
  shared `brand.css` for one source of truth.
- The `dockview-theme-light` vs `dockview-theme-abyss` decision —
  abyss matches the dark palette but the Studio shell currently
  applies *both* class names. Pick one and assert it via a test.
- How aggressive should the syntax-color extraction be? Today the
  same seven hex values exist in landing's inline `<style>`, the
  docs' Shiki theme override, and Studio's CodeMirror theme. The
  cleanest fix is one source, but it's a three-place edit.

---

## Findings — drop-in checklist

References use `file:line`. Severity matches the audit.

### Critical (block release)

- [ ] **C1 — Studio body font is Inter, not Outfit.**
  - Fix: `packages/design-system/src/theme.css:233` — change `body`'s
    `font-family` from `var(--font-sans)` to `var(--font-display)`,
    OR change `--font-sans` itself to `'Outfit'`.
  - Verify via Playwright: `getComputedStyle(body).fontFamily` matches
    landing.

- [ ] **C2 — `Button variant="secondary"` is solid amber.**
  - Fix: `packages/design-system/src/ui/button.tsx:20` —
    `secondary` variant should be
    `bg-transparent border border-input/70 hover:bg-muted text-foreground`,
    matching landing's `.btn-secondary`.
  - Verify: `apps/studio/src/components/FileLoader.tsx:124,127` no
    longer renders amber.

- [ ] **C3 — `dockview-react` stylesheet is never imported.**
  - Fix: `apps/studio/src/main.tsx` (or `apps/studio/src/styles.css`
    via `@import`) — `import 'dockview-react/dist/styles/dockview.css'`.
  - Pick **one** theme class (`dockview-theme-abyss` matches the
    dark palette) and remove the conflicting application of
    `dockview-theme-light` (search the shell + DockShell).
  - Verify: panel tabs render with visible tab strip + sash handles
    at production deploy. Panel titles no longer leak as raw text.

- [ ] **C4 — Three different primary-button shapes.**
  - Decide: pick landing's `8px radius / 40px height / weight 600`
    (audit recommendation).
  - Fix in three places:
    - `site/index.html:47` — `.btn-primary` already at 8px.
    - `apps/docs/.vitepress/theme/custom.css:68-74` — re-style
      `.VPButton.brand` to `border-radius: 8px; height: 40px;
      font-weight: 600;`.
    - `packages/design-system/src/theme.css:137` — bump `--radius`
      so the design-system Button variants pick it up; OR override
      the Button CVA `default` height to 40 / weight 600.
  - Verify: side-by-side screenshot of the three surfaces shows
    indistinguishable buttons.

### Important (this sprint)

- [ ] **I1 — Studio CSS uses ~30 undefined custom properties.**
  - `--space-1` … `--space-10` (used 30+ times in
    `apps/studio/src/styles.css`)
  - `--text-md` (`styles.css:89, 175, 540`)
  - `--sidebar-width` / `--sidebar-min-width` /
    `--sidebar-max-width` (used in `EditorPage.tsx:736`)
  - `--text-secondary` (`styles.css:831`)
  - Fix: define them all in `packages/design-system/src/theme.css`:
    ```css
    --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
    --space-5: 20px; --space-6: 24px; --space-7: 28px; --space-8: 32px;
    --space-9: 36px; --space-10: 40px;
    --text-md: 0.9375rem;
    --sidebar-width: 280px;
    --sidebar-min-width: 220px;
    --sidebar-max-width: 360px;
    --text-secondary: var(--muted-foreground);
    ```
  - Verify: live computed style on `.studio-links nav` shows
    `gap: 16px`, not `gap: normal`. Live computed `padding` on
    `.ns-explorer__header` is non-zero.

- [ ] **I2 — Panel display titles show registry IDs.**
  - Fix: `apps/studio/src/shell/layout-factory.ts` — add a
    `PANEL_TITLES: Record<PanelComponentName, string>` map
    (`Files`, `Editor`, `Problems`, `Output`, `Preview`,
    `Inspector`) and pass `title` on every `addPanel` call in
    `apps/studio/src/shell/dockview-bridge.ts:108-141`.

- [ ] **I3 — Empty-state layout is muddled.**
  - Fix: `apps/studio/src/components/FileLoader.tsx` and
    `apps/studio/src/components/ModelLoader.tsx`:
    - Wrap the entire empty-state column in one `<section>` with
      `gap-8`, vertically centred.
    - Drop the `border-t` divider above "Reference Models"
      (`App.tsx:184`) — don't separate things that belong together.
    - Restyle the "+ Load from custom URL" link
      (`ModelLoader.tsx:191-194`) as a proper text-button.
    - Promote the "Load Rune DSL Models" heading to
      `text-3xl font-display tracking-tight`.
  - Verify with `08-studio-1280-empty.png` baseline.

- [ ] **I4 — Status bar leaks `ws://localhost:3001` to public users.**
  - Surface fix: `apps/studio/src/components/ConnectionStatus.tsx`
    (or the relevant message catalogue) — replace the dev message
    with `Editor running offline — language services unavailable.`
    Hide the host:port string unless `studioConfig.developerMode`
    is true (which it never is in production).
  - **Underlying issue likely deeper.** The fact that the public
    Studio reports "LSP server unavailable" *at all* is suspicious.
    The transport-provider design (per `apps/studio/README.md`) is:
    1. Try WebSocket → `ws://localhost:3001`
    2. Retry up to 3× with exponential backoff
    3. **Fall back** to embedded SharedWorker/Worker running Langium
       in-browser — which has no localhost dependency.
    If the user is seeing the localhost message in production, step 3
    is not engaging. Check:
    - `apps/studio/src/services/transport-provider.ts` — confirm the
      production build actually reaches the worker-fallback branch
      and that `lsp-worker.ts` is being bundled by Vite (not
      tree-shaken).
    - `apps/studio/src/workers/lsp-worker.ts` — verify the worker
      can resolve `@rune-langium/lsp-server` at runtime under the
      `/rune-studio/studio/` base path (the `?worker` import URL
      gets rewritten by Vite at build time).
    - The CSP at the daikonic.dev origin — `worker-src 'self'` must
      be present, otherwise the worker fails to spawn silently.
    - The console of a fresh Chrome session at the production URL —
      look for "Failed to load worker" or "module specifier" errors.
    Until step 3 actually engages in production, the copy fix above
    is misleading: users would still get a non-functional editor;
    we'd just hide the real cause.

- [ ] **I5 — Focus ring is inconsistent within Studio.**
  - Studio Button uses `focus-visible:ring-[3px]`
    (`button.tsx:11`); Studio's hand-rolled inputs use
    `outline: 2px solid` + `outline-offset: 1px`
    (`styles.css:451-457`).
  - Fix: standardise on `outline: 2px solid var(--ring);
    outline-offset: 2px` everywhere. Update both rules; remove
    `focus-visible:ring-*` from the Button CVA.
  - Add the same rule to `site/index.html` (currently no
    `:focus-visible` block) and to `apps/docs/.vitepress/theme/custom.css`.

- [ ] **I6 — Studio nav links lack uppercase / letter-spacing.**
  - Fix: `apps/studio/src/styles.css:350-365` — `.studio-links`
    becomes `gap: var(--space-8); display: flex;`. `.studio-links a`
    becomes `font-size: 13px; font-weight: 500; text-transform:
    uppercase; letter-spacing: 0.04em;` so it matches landing's
    `nav` (`site/index.html:37`) and docs' nav (`custom.css:237-243`).

- [ ] **I7 — Toolbar mixes panel-toggles, layout-actions, and filters
    with no separators.**
  - Fix: `apps/studio/src/pages/EditorPage.tsx:639-694` — group
    buttons with `<Separator orientation="vertical" />` from the
    design-system, OR convert the panel-toggle group to a
    `<ToggleGroup>` so they share the `aria-pressed` semantic and
    the visual treatment matches.

### Polish (when convenient)

- [ ] **P1 — Empty-state heading scale.**
  `apps/studio/src/components/FileLoader.tsx:93` —
  bump `text-2xl font-semibold` to `text-3xl font-display
  tracking-tight font-semibold`. Already covered by I3 but worth
  pinning here.

- [ ] **P2 — Code-block / syntax-color triplication.**
  Same seven hex tokens (`#C792EA`, `#00D4AA`, `#82AAFF`,
  `#C3E88D`, `#5C5C6A`, `#E8913A`, `#8A8A96`) live in
  `site/index.html:94-95`, the VitePress Shiki override, and
  `theme.css:124-131`. Move all three to a single source — most
  natural is `packages/design-tokens/src/tokens.json` under a
  `syntax` namespace.

- [ ] **P3 — Surface hex values copied across three files.**
  All three resolve to `#0C0C14` body / `#181824` cards by hand-copy:
  - `site/index.html:19` (`--bg-primary: #0C0C14`)
  - `apps/docs/.vitepress/theme/custom.css:17`
    (`--rune-bg-primary: #0C0C14`)
  - `theme.css:143` (`--background: oklch(0.12 0.02 280)`)
  Fix: publish a tiny `@rune-langium/design-system/brand.css` (or
  `@rune-langium/design-tokens/dist/brand.css`) and `<link>` it
  from the landing `<head>` and `import` it from the VitePress
  theme entry.

- [ ] **P4 — Scrollbar styling absent in dock panels.**
  Studio styles `.ns-explorer__tree` only (`styles.css:255-269`).
  Add a global rule in `theme.css`:
  ```css
  * { scrollbar-width: thin; scrollbar-color: var(--muted) transparent; }
  ```

- [ ] **P5 — Diagnostic colors hard-coded.**
  `styles.css:835-851` uses raw hex (`#FF6058`, `#E8913A`,
  `#00D4AA`) for `.diagnostic-error/warning/info`. Same triplet
  exists in `tokens.ts:39-44` (`status` colors). Replace with
  `color: var(--destructive); background: oklch(from var(--destructive)
  l c h / 0.06); border-left-color: var(--destructive);` and
  equivalents for `warning`/`info`.

- [ ] **P6 — Brand-mark size differs by 2px between landing + Studio.**
  - `site/index.html:34` (`.nav-mark`): 28×28, 6px radius.
  - `apps/studio/src/styles.css:792-806` (`.studio-brand__mark`):
    26×26, 6px radius.
  Fix: make Studio match landing — 28×28, 6px radius, identical
  border. (Docs hero mark at 120×120 is a separate sized variant
  and stays.)

- [ ] **P7 — Status-bar icon size inconsistency.**
  `EditorPage.tsx:846-862` uses `w-3 h-3` (12px) while the
  toolbar uses `w-3.5 h-3.5` (14px). Standardise on 14px inside
  chrome.

- [ ] **P8 — `glass-toolbar` `!important` overrides + `transition:
    all` produce laggy focus ring.**
  Fix: `apps/studio/src/styles.css:707-783` — narrow `transition:
  all 0.2s` to `transition: background-color, border-color, color,
  transform, box-shadow 0.2s`. Don't animate `outline`.

---

## Carried context

When this is picked up, also re-run the daily probe cron
(`7ff49f3e`) — once the production deploy carries the C-fixes plus the
design-token wiring, screenshot the three surfaces side-by-side at
1280×800 and 1440×900 and attach to the merge PR. SC-007 is the gate.

---

## Pre-spec checklist

When picking this up:

1. Run `/speckit.clarify` first against this doc — the four open
   questions need decisions before `/speckit.plan` can produce a
   sane build order.
2. Re-run the audit Playwright script against the production deploy
   to confirm none of the regressions have been silently fixed in the
   interim.
3. Verify `@rune-langium/design-tokens` is on `^0.2.x` or higher (its
   `.d.ts` is fully typed per a previous fix in feature 012); if the
   token tree needs new keys (`syntax.*`, spacing scale), add them
   to `tokens.json` first and re-run the build.
4. Add a `studio-visual` Playwright test that screenshots the
   start-page button row and asserts the computed `font-family` and
   `border-radius` match landing's `.btn-primary` — pin the
   regression so the *next* SC-007 violation fails CI.
