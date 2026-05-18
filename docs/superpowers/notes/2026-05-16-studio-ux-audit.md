# Studio UX Audit — 2026-05-16

## Executive summary

The studio's start-page and Inspector / Diagnostics surfaces are above
average — Daikonic visual hierarchy reads cleanly, error copy is
specific and actionable (CuratedLoadErrorPanel, LspConnectionBadge), and
the Inspector empty state is friendly. Three problems stand out:

1. ~~**The Phase 7 Structure View tab is dead code in production.**~~ **RESOLVED 2026-05-16 (PR #185, Phase 7.5).** `VisualPreviewPanel.tsx` was deleted; `CenterStackPanel` gained a 4th `renderStructure` slot, and `EditorPage` wires the Structure View into it. The pane is reachable via the pane-switcher pill. Original finding: `VisualPreviewPanel.tsx` with a `Tabs` switch was being shadowed by an `EditorPage` override of `workspace.visualPreview`.
2. ~~**The Phase 8 NamespaceExplorer drag-source affordance is also missing.**~~ **RESOLVED 2026-05-16 (PR #186 + later Phase 13 redesign).** `NamespaceExplorerPanel` now implements `draggable` rows + dual-MIME `handleDragStart` payload + single-click drag-source marking (`isDragSource` → `→` arrow). Navigation moved from double-click to a dedicated hover-visible nav button after the Phase 13 redesign (per `feedback_internal_review_loop_limits` reasoning — double-click was racy with single-click drag-source marking). Original finding: `onClick={onSelectNode}` only, no drag wiring.
3. **The topbar contains four visible affordances that do nothing.** Cmd-K search input (no `onClick`), Validate button (no `onClick`), Share button (no `onClick`), and the PM avatar (no `onClick`). All three Activity Bar disabled buttons (Graph, Search, Notifications) plus two stub handlers (`onModelsClick={() => {}}`, `onSettingsClick={() => {}}`) compound the problem. Users will click these and nothing will happen — silently failing affordances erode trust faster than missing features.

Beyond those three, the codebase is well-organised. Most findings below
are polish, not architectural.

## Primary flow walkthroughs

### Flow 1: First-run / onboarding

**What the user sees:** `App.tsx:698-723` — centred FileLoader with
heading "Load Rune DSL Models", primary "New blank workspace", secondary
"Select Files / Select Folder / Open from GitHub", then
WorkspaceSwitcher (recents) and ModelLoader (curated archives) below.

**Friction points:**
- `App.tsx:151` — heading "Load Rune DSL Models" is product-jargon-heavy
  for a first-time visitor. No "What is Rune DSL?" link, no example,
  no "Try a sample" path. ModelLoader does provide curated archives,
  but they're at the bottom and look like reference-model addons, not
  "click me to see the studio in action." **Severity: High.**
  Direction: hoist one curated bundle (e.g. CDM) into a "Try a sample"
  CTA above the secondary buttons; add a one-line "Rune DSL is a typed
  domain modeling language…" subhead.
- `App.tsx:154` — body copy "Start a new file, or drag and drop existing
  .rosetta files here" — but the drop zone has no visible dashed
  border outside the dragenter state. New users won't know where to
  drop. **Severity: Med.** Direction: render a faint dashed outline in
  the idle state too, or rephrase to "click the buttons below" since
  drag-drop currently has no permanent affordance.
- `FileLoader.tsx:191-194` — "Open from GitHub repository…" only renders
  if `config.githubAuthEnabled && createGitBackedWorkspace` both true.
  That is correct, but there's no fallback text when GitHub is disabled
  in this deployment ("GitHub clone is not available in this build")
  — silent omissions are confusing. **Severity: Low.**
- The boot spinner (`App.tsx:681-688`) renders "Loading…" with no
  context; users on a slow connection will wonder what's loading. The
  `checking` state is brief but the `restoring` state can take seconds
  on large workspaces. **Severity: Low.**

### Flow 2: Workspace open

**What the user sees:** WorkspaceSwitcher list of recents → click to
restore → spinner "Restoring workspace…" → editor mounts.

**Friction points:**
- `WorkspaceSwitcher.tsx:46-58` — recents are an unstyled `<ul>` with
  zero hover state, no created/modified timestamp, no kind icon (just
  parenthesised text). Compared to the polished start page below it,
  this section looks like an unfinished placeholder. **Severity: High.**
  Direction: use the same `Button variant="ghost"` + Card pattern as
  the rest of the start page; show kind as a tinted badge; add
  "opened 2h ago" relative time. (`KIND_LABEL` already exists at
  line 20.)
- `WorkspaceSwitcher.tsx:34` — uses raw `window.confirm` for delete.
  Inconsistent with the rest of the studio (which uses Radix Dialog
  via design-system). **Severity: Med.** Direction: replace with
  Radix `AlertDialog`.
- `WorkspaceSwitcher.tsx:53-55` — delete button is unlabelled "×". With
  multiple workspaces this becomes a row of identical X buttons; only
  `aria-label` distinguishes them. **Severity: Low** (a11y covered).
- `App.tsx:742-751` — `bootState === 'restored' && userFiles.length === 0`
  shows "Workspace ready." dead-end with no action buttons. The reset
  handler returns to start (`handleReset`, App.tsx:460), but a user
  who restored an empty workspace has no obvious "Close / load files"
  path. **Severity: Med.** Direction: surface a "+ Load files" or
  "Close workspace" button alongside the placeholder copy.

### Flow 3: Type editing

**What the user sees:** Topbar (brand + workspace + tabs + tools) →
ActivityBar (left rail) → DockShell with CenterStackPanel
(Graph/Source/Inspector pane-switch) → ProblemsPanel below → footer.

**Friction points:**
- ~~`EditorPage.tsx:1309` + `DockShell.tsx:105` — **the Phase 7 Structure
  tab is shadowed**.~~ **RESOLVED 2026-05-16 (PR #185, Phase 7.5):** the
  CenterStackPanel-fold direction was taken; `VisualPreviewPanel.tsx`
  was deleted; Structure is now a 4th peer pane.
- ~~`NamespaceExplorerPanel.tsx:341, 156` — **Phase 8 drag-source semantics
  not shipped.**~~ **RESOLVED 2026-05-16 (PR #186):** `draggable`,
  `onDragStart→setDragSource` (dual-MIME payload), and single-click
  drag-source marking shipped. Navigation moved from double-click to a
  dedicated hover-visible nav button after Phase 13 redesign.
  (TypePickerCell, InheritanceCell) but the source side is unwired.
  **Severity: Critical** (Phase 8 surface broken or never shipped).
  Direction: add `draggable=true`, `onDragStart` calling
  `setDragSource(payload)`, `onDoubleClick={onSelectNode}`, and a
  per-row `→` indicator when `dragSource?.id === row.nodeId`.
- `EditorPage.tsx:1370-1376` — Cmd-K search trigger renders no handler.
  Clicking does nothing; tabbing onto it gives no focus indicator
  beyond browser default. **Severity: High.** Direction: at minimum
  wire a toast "Coming soon" or hide the button until implemented;
  shipping a non-functional Cmd-K teaches users not to try keyboard
  shortcuts.
- `EditorPage.tsx:1378-1393` — `Validate` and `Share` toolbar buttons
  have no `onClick`. **Severity: High.** (Same fix.)
- `EditorPage.tsx:1399-1405` — Avatar "PM" hardcoded — there's no
  account system, and clicking does nothing. **Severity: Med.**
- `EditorPage.tsx:1409` — `ActivityBar onModelsClick={() => {}}
  onSettingsClick={() => {}}`. Models and Settings rail buttons appear
  enabled, do nothing on click. **Severity: High.** Direction: gate
  with a "Coming soon" toast or disable via the `disabled` attribute
  already used for Graph/Search/Notifications.
- `CenterStackPanel.tsx:108-125` — the pane-switch pill is the *only*
  way to add/remove panes in the central stack. Discoverability is
  fine, but there's no keyboard shortcut and no way to know it exists
  on first load (users default to pressing all three so layout starts
  with side-by-side cramming). **Severity: Med.** Direction: surface
  a one-time onboarding hint or default to single-pane on first
  visit, with a "press G/S/I to toggle" tip.
- `EditorPage.tsx:1088-1093` — `DiagnosticsPanel.onNavigate(uri, line, char)`
  is called with the full signature, but EditorPage's handler ignores
  `line` and `character`. Click-to-navigate jumps to the file but
  *not the line*. **Severity: High** (silent loss of behaviour).
  Direction: pass `(uri, line, character)` through and call
  `sourceEditorRef.current?.revealPosition({ line, character }, file.path)`.
- `EditorPage.tsx:870` — `useDiagnosticsStore()` is called without a
  selector, so the panel re-renders on every diagnostic-store update
  including unrelated state slices. **Severity: Low (perf).**
- `EditorPage.tsx:1373-1377` — the Cmd-K placeholder shows `⌘K` even
  on non-mac browsers. The keyboard.ts dispatcher correctly checks
  both ctrlKey and metaKey, but the visible label doesn't adapt.
  **Severity: Low.**
- `EditorPage.tsx:1162` — graph canvas has no empty state. If
  `storeNodes.length === 0` the React Flow canvas is silent grey.
  **Severity: Med.** Direction: "Select a file or load a model to
  see the graph" overlay.

### Flow 4: Code generation

**What the user sees:** Toolbar Download icon or Generate pill →
`ExportDialog` opens with language Select, Generate button, then
either generated-file preview or actionable error.

**Friction points:**
- `EditorPage.tsx:1387-1397` — both the icon `Download` button and the
  pill `Generate` button open the same dialog. Two ways to do the same
  thing is fine, but they're stylistically inconsistent (icon vs label
  + accent colour) and crowded into the top-right. **Severity: Low.**
- `ExportDialog.tsx:83` — language defaults to `'java'`. For browser-
  first users this is a strange default; TypeScript or JSON Schema is
  likely more useful. **Severity: Low.**
- `ExportDialog.tsx:124-194` — Generate is gated by language + files;
  there's no visible "compute time may be 5-15s for cold start" hint
  ahead of the click. The README mentions it, the dialog doesn't.
  **Severity: Med.** Direction: surface "First generation can take
  ~15s (cold start). Subsequent generations are faster." beneath the
  language Select.
- `ExportDialog.tsx:274-298` — service-unavailable warning renders
  correctly and provides actionable hints; this is well done.
- The generated-file preview tree (not shown in this audit but
  inferred from `CodegenTargetsTable.tsx`) likely needs a "copy to
  clipboard" affordance per file. Worth confirming live.
- `EditorPage.tsx:949-959` — `validateModelForExport` returns warnings
  including "Model has N error(s)…" but a stuck cursor on this is
  that it doesn't *block* generation, only warns. For a new user who
  doesn't read the alert, this generates broken code silently.
  **Severity: Med.** Direction: when errors > 0, require an explicit
  "Generate anyway" toggle.

### Flow 5: Failure states

**What the user sees:** Toasts for workspace errors; LSP badge in
footer for transport issues; CuratedLoadErrorPanel for archive
failures; in-dialog alerts for codegen failures.

**Friction points:**
- `App.tsx:158-184` — toast for every error uses `variant: 'destructive'`
  + 5s duration. There's no "what should I do?" hint in the messages
  (e.g. "Workspace restore failed; showing the start page instead" —
  good — but "Failed to delete the selected workspace" gives no next
  step). **Severity: Med.** Direction: each `reportWorkspaceError`
  caller should include a 1-clause hint ("…retry in a moment" /
  "…clear site data if this persists").
- `LspConnectionBadge.tsx:36-46` — silent in production on success,
  green dot in dev. Good. But the badge's "Retry" link is a plain
  underlined button; users have no sense that retry might take a few
  seconds. **Severity: Low.** Direction: show a spinner during
  `state.status === 'connecting'` after retry click.
- `App.tsx:430-450` — OPFS write failures are swallowed into a toast
  with no quota indicator. On `QuotaExceededError` the user has no
  idea their data isn't persisting. **Severity: High.** Direction:
  detect `DOMException.name === 'QuotaExceededError'` and surface
  a dedicated panel with "Storage full — remove old workspaces"
  action (CuratedLoadErrorPanel already has the `storage_quota` copy
  to reuse).
- `App.tsx:442-446` — debounced reparse on every keystroke; on parse
  failure, the toast says "keeping the last valid graph" — good
  graceful degradation. However, the user has no indication *when
  the graph is stale*; the graph still shows the previous parse.
  **Severity: Med.** Direction: dim the graph or show a "graph
  reflects last valid parse" pill when the most recent reparse
  failed.
- `EditorPage.tsx:602-606` — codegen-worker startup failure surfaces
  through `handlePreviewWorkerFailure` → `receivePreviewStale`. But
  the preview panel only shows the failure when a preview is
  attempted. If the worker fails *and the user never triggers a
  preview*, they never know. **Severity: Low.**

## Cross-cutting findings

- **Empty states are inconsistent.** `FileTreePanel.tsx:11` and
  `EditorPanel.tsx:33` render bare lists with no empty copy;
  `InspectorPanel.tsx:20` has a friendly one; `DiagnosticsPanel.tsx:152`
  has a polished one with icon + sub-copy. Standardise on the
  DiagnosticsPanel pattern.
- **Toast duration is too short for actionable errors.** 4-5s default
  (`App.tsx:172, 182`) drops the message before slower readers can
  parse it. WAI suggests ≥10s for destructive variant. **Severity: Med.**
- **Avatar/account is a Chekhov's gun.** Topbar suggests authentication
  exists (`EditorPage.tsx:1399`); nothing else in the studio does.
  Either remove or hide behind a feature flag.
- **Number of click-target stubs.** Counted ≥9 visible affordances that
  do nothing (Cmd-K, Validate, Share, Avatar, Notifications, Graph
  rail, Search rail, Models rail no-op, Settings rail no-op). For a
  studio that markets itself as "production-ready," this density of
  dead clicks reads as alpha. **Severity: High** in aggregate.
- **Keyboard shortcut help is invisible.** `keyboard.ts:35-68` defines
  9 shortcuts; nothing in the UI surfaces them (no `?` overlay, no
  Cmd-K palette). Users will never discover Alt+Cmd+Arrow panel nav.
  **Severity: Med.**
- **Status bar duplication.** `StatusBar.tsx` exists but
  `EditorPage.tsx:1421-1434` builds its own footer instead — two
  status-bar implementations diverging. The footer renders 5+ pieces
  of state (model count, modified count, selected node, err/warn,
  LSP badge × 2 — both `LspConnectionBadge` and `ConnectionStatus`,
  showing similar info). **Severity: Med.** Direction: remove the
  duplicate `LspConnectionBadge` + `ConnectionStatus` pair; pick one.
- **`react-doctor`-flagged effect at `EditorPage.tsx:467-475`** —
  side-effect with no cleanup. Confirmed intentional in comment.
- **Performance:** the namespace tree at
  `NamespaceExplorerPanel.tsx:106` initialises `treeExpanded` with all
  namespaces expanded on every mount of a different node set.
  Workspaces with 100+ namespaces (CDM corpus) will render hundreds of
  rows on first paint. Virtualization mitigates rendering, but the
  initial `Set` allocation + tree flatten on every keystroke
  (`flatRows` recomputes when `searchQuery` changes — that's fine)
  could be optimised with `useDeferredValue` on `searchQuery`.
  **Severity: Low.**
- **a11y:** `EditorPage.tsx:1373` Cmd-K button uses `aria-label="Search"`
  but has no role / no command palette semantics; screen readers
  announce a button that does nothing.
- **a11y:** `ActivityBar.tsx:36` button has `aria-pressed="true"` as a
  string literal that never changes — should be a boolean reflecting
  actual state.
- **Color contrast — likely OK but worth verifying live**: muted-foreground
  on bg-card; the `text-[11px]` body copy in several panels may fall
  below WCAG AA 4.5:1 on bg-card/40 backgrounds.

## Phase 7/8 specific

### Structure View tab affordance
The Phase 7 Tabs container (`VisualPreviewPanel.tsx:158-175`) is
unreachable in production because `EditorPage.tsx:1309` overrides
`workspace.visualPreview` with `VisualPreviewPanelMounted`
(`CenterStackPanel`). Verify with the running app — but static
analysis is unambiguous. If the design intent was to keep the Graph
inside a `CenterStackPanel` pane and the Structure view inside a
peer pane, the Tabs UI is the wrong shape. If the intent was
Graph/Structure tabs, then the override needs to fold Structure into
`renderGraphPane`.

### Drag-source learnability (the click-semantics change)
Per spec (`structure-view-design.md:41`) and the existing drop-side
plumbing (`useTypeRefDrop` consumed in TypePickerCell /
InheritanceCell), the Namespace Explorer should:
- Mark single-click → set drag source (visual → arrow on hover row)
- Mark double-click → navigate
- Make rows `draggable`, setting `application/x-rune-type-ref`
  MIME on `dragstart`

None of this is in `NamespaceExplorerPanel.tsx`. The store APIs
exist (`useStructureViewStore.setDragSource`, line 183). The
drop-side handlers exist. The source side never shipped — or was
reverted.

**Friction in the wild (if shipped as designed):**
- Click-semantics change without an in-app announcement: existing
  users who learned "click = navigate" will hit "click = drag arm"
  silently. **Direction:** ship with a one-time toast or pulse-arrow
  affordance that decays after first successful drag.
- The → arrow needs strong contrast — a thin secondary-colour arrow
  in a virtualised row will get lost. **Direction:** use the same
  selected-pip pattern (`studio-type-pip`) already in
  TypeItemRow:343.
- Long-press on touch / accessibility-pointer needs equivalent.
  Spec doesn't address. **Verify live.**

### → arrow visibility
Not visible because the source-side code doesn't exist.

## Triaged punch list

| Severity | Flow | Location | Issue | Suggested wedge |
|---|---|---|---|---|
| ~~Critical~~ **RESOLVED** | Type editing | EditorPage.tsx:1309 | ~~Phase 7 Structure tab shadowed by `VisualPreviewPanelMounted` override~~ Fixed in PR #185 — `CenterStackPanel` now hosts Structure as 4th pane; `VisualPreviewPanel.tsx` deleted |
| ~~Critical~~ **RESOLVED** | Type editing | NamespaceExplorerPanel.tsx:341 | ~~Phase 8 single-click drag-source / double-click nav not implemented~~ Fixed in PR #186 — `draggable` + dual-MIME `dragStart` + single-click drag-source mark; navigation via hover-visible nav button (replaced double-click in Phase 13) |
| High | First-run | App.tsx:705-723 | No "Try a sample" path; curated archives buried below recents | Hoist one sample bundle as primary above secondary buttons |
| High | Workspace open | WorkspaceSwitcher.tsx:46-58 | Recents are unstyled `<ul>` with no timestamps, kind icons, or hover state | Restyle with shadcn Card + relative time + kind badges |
| High | Type editing | EditorPage.tsx:1373-1393 | Cmd-K, Validate, Share toolbar buttons have no onClick | Either wire stubs to "Coming soon" toast or hide |
| High | Type editing | EditorPage.tsx:1409 | ActivityBar Models/Settings rail buttons no-op | Disable with `disabled` attribute or wire to existing surfaces |
| High | Type editing | EditorPage.tsx:1088-1093 | DiagnosticsPanel click-to-navigate drops line/column | Forward `(uri, line, character)` to `revealPosition` |
| High | Failure | App.tsx:430-450 | OPFS QuotaExceededError swallowed into toast | Dedicated quota panel with "remove old workspaces" action |
| Med | First-run | FileLoader.tsx:127-156 | Drop zone has no idle-state visual affordance | Faint dashed outline always visible, or rephrase copy |
| Med | First-run | FileLoader.tsx:191-194 | Silent omission when GitHub flow disabled | Show muted "(unavailable in this build)" hint |
| Med | First-run | App.tsx:151 | Heading "Load Rune DSL Models" assumes prior knowledge | Add one-line subhead explaining Rune DSL |
| Med | Workspace open | WorkspaceSwitcher.tsx:34 | Uses raw `window.confirm` for delete | Replace with Radix AlertDialog |
| Med | Workspace open | App.tsx:742-751 | "Workspace ready." dead-end when restored workspace has zero files | Add action buttons |
| Med | Type editing | CenterStackPanel.tsx:108-125 | Pane-switch has no shortcut, no onboarding | One-time tip / default-single-pane |
| Med | Type editing | EditorPage.tsx:1162 | Graph canvas has no empty state | Overlay copy when no nodes |
| Med | Codegen | EditorPage.tsx:949-959 | Errors warn but don't gate generation | Require "Generate anyway" when errors > 0 |
| Med | Codegen | ExportDialog.tsx:124-194 | No cold-start hint before Generate click | Inline "first run ~15s" hint |
| Med | Failure | App.tsx:158-184 | Toast messages lack "next step" hints | Add 1-clause action per error |
| Med | Failure | App.tsx:442-446 | Graph stays stale on parse failure with no indication | Pill / dim graph when last parse failed |
| Med | Cross-cutting | App.tsx:172, 182 | Toast 4-5s drops destructive messages too fast | ≥10s for destructive variant |
| Med | Cross-cutting | EditorPage.tsx:1421-1434 vs StatusBar.tsx | Two status-bar impls, duplicate LSP indicators | Pick one; remove duplicate |
| Med | Cross-cutting | keyboard.ts | 9 shortcuts not surfaced in UI | `?` overlay or palette |
| Med | Cross-cutting | EditorPage.tsx:1399-1405 | Avatar suggests auth where none exists | Remove or feature-flag |
| Low | First-run | App.tsx:681-688 | Boot spinner generic "Loading…" | Add what's loading |
| Low | Workspace open | WorkspaceSwitcher.tsx:53 | Delete "×" unlabelled visually | aria-label exists; consider trash icon |
| Low | Type editing | EditorPage.tsx:870 | `useDiagnosticsStore()` no selector | Add selector |
| Low | Type editing | EditorPage.tsx:1373-1376 | `⌘K` label hardcoded for mac | Detect platform |
| Low | Codegen | EditorPage.tsx:1387-1397 | Download icon + Generate pill duplicate | Consolidate |
| Low | Codegen | ExportDialog.tsx:83 | Default language `java` | TypeScript default |
| Low | Failure | EditorPage.tsx:602-606 | Worker startup failure invisible until preview attempted | Surface immediately |
| Low | Failure | LspConnectionBadge.tsx | Retry has no in-flight feedback | Spinner during reconnect |
| Low | Cross-cutting | NamespaceExplorerPanel.tsx:106 | `treeExpanded` allocates full set on every mount | `useDeferredValue` on searchQuery |
| Low | a11y | ActivityBar.tsx:36 | `aria-pressed="true"` always literal | Reflect actual state |
| Low | a11y | EditorPage.tsx:1373 | Cmd-K button has button role + no command semantics | Either implement or remove |

## What I'd validate live

- **Confirm the Structure View tab is actually unreachable.** I'm
  reading the override in EditorPage:1309 as shadowing the default
  VisualPreviewPanel, but I haven't verified at runtime that the
  Tabs shell never reaches DOM. Possible the override calls into it
  indirectly that I missed. **If false**, downgrade the Critical
  finding to Med.
- **Confirm NamespaceExplorerPanel has no out-of-tree wrapper** that
  adds drag handlers. Studio could be using a HOC or wrapper that
  the source-level audit missed. Run the app, single-click a row,
  inspect dataTransfer in a dragstart listener.
- **Empty-state copy actually appears above the fold on a 13-inch
  laptop.** App.tsx:705 uses `h-full px-8 py-12 gap-8` flex column —
  with FileLoader (heading + buttons), WorkspaceSwitcher, and
  ModelLoader, the column likely exceeds 800px and the curated
  archives row drops below the fold on a 13" MBP @ 1440×900. Worth
  measuring.
- **Tab strip overflow.** `EditorPage.tsx:177-208` renders tabs in
  flex with no overflow handling. With 20+ tabs (common for CDM
  work) tabs probably wrap or push the rest of the topbar off-screen.
  Try opening a corpus with 30 files.
- **Pane-switch state on resize.** `CenterStackPanel.tsx:40` uses
  `useState` for fractions — on window resize, fractions may exceed
  min-px bounds and cause weird layout. Confirm by dragging window
  width down.
- **Cold-start codegen actually shows the "warming up" message.**
  ExportDialog.tsx:242-249 handles 5xx, but the Worker may return
  502 with a different `body.error`. Worth one cold-start round
  trip.
- **OPFS quota error path.** Hard to test without a real quota
  exhaustion. Could be simulated by mocking `navigator.storage.estimate`
  but ultimately needs a real reproduction.
- **Daikonic theme contrast on `text-[11px] text-muted-foreground`
  inside `bg-card/40`.** Several panels (NamespaceExplorerPanel:151,
  StatusBar) use this combo; needs a contrast-ratio check.
- **Phase 8 drag → drop on TypePickerCell** — `useTypeRefDrop`
  exists, but I didn't verify it accepts the MIME the explorer
  would have set. Worth a live drag round-trip once the source side
  ships.
