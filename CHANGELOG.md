# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Structure View** — focused-type structural visualization for Data, Choice, and Enum types (spec 020). Data and Choice roots are fully interactive; Enum roots render a read-only value list (Phase 14e/A). The unsupported-root empty state now fires only when the focused type id is missing from the workspace (deleted/renamed type):
  - 4th peer pane in `CenterStackPanel` alongside Graph / Source / Inspector (toggle on/off via the pane-switcher pill; defaults to inactive). Phase 7.5 deleted `VisualPreviewPanel.tsx`; `CenterStackPanel` became the unified 4-pane host (the spec's original Radix Tabs inside `VisualPreviewPanel` design was superseded).
  - Adapter walks the focused type's structure with inheritance and type-reference expansion, honoring a per-instance expansion map (Phase 14d — XmlSpy / Altova UModel / Liquid Studio / Oxygen XML convention) so duplicate type occurrences track expansion independently
  - React Flow rendering with structure-variant `DataNode`, `ChoiceNode`, `EnumNode` (read-only terminal), and `GroupContainerNode` (base-type wrap). Decorative Handles gated to graph variant only (Phase 14b — structure variant has no edges, so no handles)
  - Inline cell editors (`NameCell`, `CardinalityCell`, `TypePickerCell`) wired into the mounted `StructureView` via `cellComponents`, editing through existing editor-store actions with no parallel mutation layer. `InheritanceCell` is built and unit-tested but not wired into `StructureView` (requires extending `GroupContainerNode`'s prop API — tracked follow-up, currently no GitHub issue)
  - Identity-preserving node merge at the React Flow boundary (Phase 14c, Approach B) — single-cell edits re-render ≤1 DataNode instead of every visible node
  - SSoT layout constants bridged from `STRUCTURE_LAYOUT_CONSTANTS` to `--rune-*` CSS custom props with a stylelint custom rule (`rune/no-literal-layout-px`) guarding drift
- **Cross-pane drag-drop palette** for type-refs (`application/x-rune-type-ref` MIME, dual-MIME contract):
  - `NamespaceExplorerPanel` becomes the drag source (single-click marks → arrow; navigation uses a dedicated nav button — hover-visible `ChevronRight` — that replaced the originally-planned double-click navigate after Phase 13 redesign; HTML5 draggable rows)
  - `TypePickerCell` accepts type-ref drops on Structure View attribute-type cells; Choice arms also accept TypePickerCell drops (Phase 14e/B); `InheritanceCell` accepts drops in isolation but is not yet wired into the mounted Structure View (see above)
  - `SourceEditor` (CodeMirror) accepts type-ref drops, inserting `${namespaceUri}.${typeName}` at the drop position (read-only files are excluded)
- **Editor store actions** for in-place structural edits: `renameAttribute`, `updateAttributeType`, `updateCardinality`, `setInheritance` (all recorded in zundo history; both views share the same mutation surface)
- Visual tightening pass — flat node chrome, `--radius-md` rounded corners, per-kind type-chip + cardinality-pill cells, drop-over outline states (all mapped to design-system + rune SSoT tokens; standalone consumers preserved via `var()` fallbacks)
- Studio UX audit doc at `docs/superpowers/notes/2026-05-16-studio-ux-audit.md` (34-row punch list across 5 primary flows; surfaced the Phase 7 integration miss that PR #185 fixed by deleting `VisualPreviewPanel.tsx` and giving `CenterStackPanel` a 4th `renderStructure` slot)
- E2E Playwright spec scaffold (`apps/studio/test/e2e/structure-view.spec.ts`) — empty-state smoke test + 5 skipped fixture-gated tests + 1 skipped visual snapshot
- **Initial project setup** with TypeScript, Changesets, GitHub Actions CI/CD, pre-commit hooks (simple-git-hooks), Dependabot, oxlint/oxfmt, Vitest, AGENTS.md, MCP server configuration

### Changed
- `NamespaceExplorerPanel` single-click semantics: was "navigate to type"; now "mark as active drag source". Navigation moved to a dedicated hover-visible nav button (`ChevronRight`) on each row — the originally-planned double-click navigate was dropped in the Phase 13 redesign because it raced with single-click drag-source marking. Updated 5 affected Playwright specs accordingly (including `namespace-explorer.spec.ts` which used a stale `.ns-type__name` selector removed in a prior redesign).
- **Structure View selection sync** (e2e-batch #3): Structure tree node click now writes to the shared `useEditorStore.selectedNodeId` so Graph / Source / Inspector reflect the selection. Implements the third writer in spec §7 (Structure row click). Source-cursor → selection bridge remains deferred.
- **Drag-source row indicator** (e2e-batch #5): the `→` glyph that competed visually with the hover-visible navigate ChevronRight was replaced with a left-edge color stripe + tinted background gradient on `.studio-type-row--drag-source`. State moves from a separate aria-labeled `<span>` to the row's own `aria-label`. The only arrow icon on each row is now the navigate chevron.
- **Per-node Structure rows-column width** (e2e-batch #12): was a globally-fixed `COL_WIDTH = 260` which clipped most CDM type names. Now content-estimated per node via `estimateRowsColWidth(rows)` with floor `COL_WIDTH = 320` and cap `COL_WIDTH_MAX = 600`. Renderers read `data.rowsColWidth` and set inline `style.width` on `.rune-node-rows`; layout's placement functions use the same per-node width for child x-offset so expansion children align with the right edge of the actual content column.
- 51 mechanical react-doctor cleanup fixes across design-system, visual-editor, and studio (redundant ARIA roles, EMPTY_* module constants for stable memo references, real keys replacing array-index keys with index disambiguators for non-unique values, design-no-redundant-size/padding-axes shorthand)
- Tightened stylelint custom rule `rune/no-literal-layout-px` to only exempt `var(--rune-*, ...)` SSoT references (design-system tokens on layout-coupled properties of `.rune-*` selectors are correctly flagged again, preventing drift from `STRUCTURE_LAYOUT_CONSTANTS`)

### Deprecated
- None

### Removed
- **Visibility toggles on NamespaceExplorer namespace headers** (e2e-batch #4): the per-namespace `Eye`/`EyeOff` button was removed. Visibility is a Graph-only concept managed via the Graph filter menu; the underlying `useEditorStore.toggleNamespace` action remains for the Graph view's internal use.

### Fixed
- **Curated entries show no detail in Structure / Inspector / Graph node body / namespace tree** (post-020 follow-up): curated CDM/FpML nodes hydrate without a Langium AST `$type` (they carry `data.typeKind` and the React Flow `node.type` instead), and nine production-code call sites indexed `AST_TYPE_TO_NODE_TYPE[d.$type] ?? 'data'` directly — silently degrading every curated enum / choice / func / record entry to `'data'`. Panels then looked for `attributes` that don't exist on those kinds and rendered empty. The previous e2e-batch #1 fix patched only `selectedNodeType` and `graphNodesToAdapterDocument`. Centralised the fallback into a new `resolveNodeKind(nodeOrData)` helper in `model-helpers.ts` with the canonical chain (`data.$type → data.typeKind → node.type → 'data'`), migrated all nine sites (DetailPanel ×2, EditorFormPanel, GenericNode, namespace-tree, useInheritedMembers, ast-to-model ×2, EditorPage availableTypes), exported the helper from the package barrel, and added a vitest regression guard that fails if a future addition re-introduces the raw pattern outside `model-helpers.ts` and `editor-store.ts`.
- **NamespaceExplorer UX clarity** (post-020 follow-up): the type-name span carried `hover:underline` (visual hyperlink affordance) but clicking it only marked the row as the drag source — single-click navigation lived on a hover-only ChevronRight that read as "unresponsive" because it wasn't visible at rest. The name is now a dedicated `<button>` (data-testid `ns-type-name-…`) that navigates on click, matching its visual contract. The chevron is now persistently visible at `opacity-30` (full opacity on hover/focus) instead of being hidden until hover. Dimmed (graph-hidden) rows get an expanded `title` explaining "hidden in graph (toggle visibility in the graph filter menu)" so users understand why the row is dim instead of guessing. The row body keeps its single-purpose drag-source-mark semantics, so the drag-source contract from e2e-batch #5 is unchanged.
- **Structure View empty-state for unsupported kinds** (e2e-batch #10): selecting a Function/TypeAlias/Record/Annotation row no longer shows the generic "Select a type" prompt with no explanation. New empty-state branch (`structure-unsupported-kind-state`) names the kind and directs the user to pick Data/Choice/Enum.
- **Structure pane sizing** (e2e-batch #2): `CenterStackPanel` pane flex-basis was `0%` which prevented child content from growing past the equal split. Now `flex: <grow> 1 0` + explicit `minWidth: 0; minHeight: 0` so panes can shrink genuinely (an earlier revision added a `minInlineSize: 280px` × pane-count guard which Codex caught as clipping panes on narrow laptops; removed).
- **`selectedNodeType` derivation for curated-loaded nodes** (e2e-batch #1): was reading only `data.$type`, which is absent on some curated hydration paths. Now falls through `data.$type → data.typeKind → node.type` so curated bundles route correctly through the `structureFocusedTypeId` gate (Structure pane was empty for all curated types because of this).
- **LSP-unreachable error message** (e2e-batch #7): was constructed from `config.lspSessionUrl`, which can be the dev default (`localhost:5173`) when `VITE_DEV_MODE` leaks into a prod build. Now uses `window.location.origin + /api/lsp/session` — the actual fetch URL.
- **Production sourcemap availability** (e2e-batch #9): `vite.config.ts` `build.sourcemap` set to `'hidden'` so crash reports + DevTools "Load source map" can symbolicate (previously prod TypeErrors at minified `index-*.js:11247` were undebuggable).
- **Structure text size** (e2e-batch #13): was inheriting `--text-sm` (14px); scoped to `--text-xs` (12px) on `.rune-node-data--structure`, `.rune-node-choice--structure`, and `.rune-node-enum--structure` (the enum selector was missing from an earlier revision; Copilot caught) so dense schemas fit more rows per viewport.
- **Namespace header drag-drop discoverability** (e2e-batch #11): added hover-only `⋮⋮` grip glyph with `title` attribute pointing users to per-type drag affordance.
- **Per-node Structure row width includes header text** (e2e-batch #12 follow-up): `estimateRowsColWidth` originally considered ROW content only; long type names like `AdjustableOrAdjustedOrRelativeDate` in the node header clipped with ellipsis even when row text was short. Header-name parameter added to the estimator and threaded through every call site (`sizeData` / `sizeChoice` / `sizeEnum` / `sizeBase`). Placement functions (`placeDataChildren` / `placeChoiceChildren` / `placeBaseChildren`) now use `sz.rowsColWidth` (not the global `COL_WIDTH`) for child x-offset so expansion children land flush against the actual content column. GroupContainerNode's base-rows DOM container reads `data.rowsColWidth` so long inherited rows don't bleed into the right expansion gutter.
- **`LoadedModelBadge` shows "loading…" while curated files hydrate** (e2e-batch follow-up): replaced the misleading `(0 files)` flash with `(loading…)` while `model.source.archiveUrl` is set and `files.length === 0`. After 30s without hydration the chip switches to `(load failed — unload to retry)` so a silent /api/parse failure doesn't leave the user stuck. Also fixes `(1 files)` → `(1 file)` pluralization.
- **`graphNodesToAdapterDocument` recognizes curated fallback nodes** (e2e-batch #1 follow-up): the projection used to filter on `data.$type` alone, dropping curated nodes whose `$type` was undefined even though `selectedNodeType` recognized them via `data.typeKind`/`node.type` fallback. Adapter now applies the same fallback so Structure View sees the same set of nodes the gate forwards to it.
- **Structure View `onNodeClick` skips synthetic base wrapper nodes** (e2e-batch #3 follow-up): clicking a `GroupContainerNode` (`type === 'structureBase'`) used to write the synthetic wrapper id (`...::__base::...`) into `selectedNodeId`, breaking cross-pane sync because no real graph node has that id. Now gated; clicks on the actual base type / derived type nodes inside the wrapper still update selection normally.

### Added (e2e-batch follow-ups)
- **Workspace topbar dropdown** (`apps/studio/src/pages/EditorPage.tsx`): the workspace button in the EditorPage header now opens a Popover with `SWITCH TO` recents, `+ New workspace`, and `↩ Close workspace` actions. Replaces a bare close button whose `ChevronDown` icon promised a menu but only fired close. Recents loaded lazily on menu open, filtered to exclude the current workspace.
- **`seed:local` script** (`apps/curated-mirror-worker/scripts/seed-local-curated-mirror.ts`): writes tiny CDM/FpML/rune-dsl fixture archives (source `.tar.gz` + parsed `.serialized.json.gz` + `manifest.json`) into local miniflare R2 so `pnpm dev:full` can exercise the full curated → /api/parse → explorer flow without a deployed CF Worker.
- **`dev:full` orchestrator** (`apps/studio/package.json`): one command boots vite (5173) + lsp-worker (8790) + curated-mirror-worker (8789) + wrangler pages dev (8788). `predev:full` runs `pnpm build` so wrangler's `env.ASSETS.fetch` serves fresh dist at startup. Studio README documents the three workflow modes (UI-only / pages-only / full stack).

### Changed (e2e-batch follow-ups)
- **`WorkspaceSwitcher` visual treatment** (`apps/studio/src/components/WorkspaceSwitcher.tsx`): rows render as cards with a kind badge (`BROWSER` / `FOLDER` / `GIT`), relative timestamp (`"5 minutes ago"`), and hover-revealed delete button — matching the `LOADED MODELS` / `REFERENCE MODELS` section pattern. Empty-state copy improved.

### Security
- None

## [0.1.0] - 2025-12-19

### Added
- Initial release
- TypeScript project template
- Basic project structure
