# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Structure View** — focused-type structural visualization for Data types (spec 020); Choice and Enum types are referenced within Data structures but select-as-root shows the unsupported-root empty state:
  - 4th peer pane in `CenterStackPanel` alongside Graph / Source / Inspector (toggle on/off via the pane-switcher pill; defaults to inactive)
  - Adapter walks the focused Data type's structure with inheritance and type-reference expansion, honoring an expansion map for click-to-expand semantics
  - React Flow rendering with structure-variant `DataNode`, `ChoiceNode`, and `GroupContainerNode` (base-type wrap), per-row Handles for containment edges
  - Inline cell editors (`NameCell`, `CardinalityCell`, `TypePickerCell`) wired into the mounted `StructureView` via `cellComponents`, editing through existing editor-store actions with no parallel mutation layer; `InheritanceCell` is built and unit-tested but not yet wired into `StructureView` (requires extending `GroupContainerNode`'s prop API — tracked as a follow-up)
  - SSoT layout constants bridged from `STRUCTURE_LAYOUT_CONSTANTS` to `--rune-*` CSS custom props with a stylelint custom rule (`rune/no-literal-layout-px`) guarding drift
- **Cross-pane drag-drop palette** for type-refs (`application/x-rune-type-ref` MIME, dual-MIME contract):
  - `NamespaceExplorerPanel` becomes the drag source (single-click marks → arrow; double-click navigates; HTML5 draggable rows)
  - `TypePickerCell` accepts type-ref drops on Structure View attribute-type cells; `InheritanceCell` accepts drops in isolation but is not yet wired into the mounted Structure View (see above)
  - `SourceEditor` (CodeMirror) accepts type-ref drops, inserting `${namespaceUri}.${typeName}` at the drop position (read-only files are excluded)
- **Editor store actions** for in-place structural edits: `renameAttribute`, `updateAttributeType`, `updateCardinality`, `setInheritance` (all recorded in zundo history; both views share the same mutation surface)
- Visual tightening pass — flat node chrome, 8px radius, per-kind type-chip + cardinality-pill cells, drop-over outline states (all mapped to design-system + rune SSoT tokens; standalone consumers preserved via `var()` fallbacks)
- Studio UX audit doc at `docs/superpowers/notes/2026-05-16-studio-ux-audit.md` (34-row punch list across 5 primary flows; surfaced the Phase 7 integration miss that PR #185 fixed)
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
- **Structure View empty-state for unsupported kinds** (e2e-batch #10): selecting a Function/TypeAlias/Record/Annotation row no longer shows the generic "Select a type" prompt with no explanation. New empty-state branch (`structure-unsupported-kind-state`) names the kind and directs the user to pick Data/Choice/Enum.
- **Structure pane sizing** (e2e-batch #2): `CenterStackPanel` pane flex-basis was `0%` which prevented child content from growing past the equal split. Now `flex: <grow> 1 0` + explicit `minWidth: 0; minHeight: 0` + `minInlineSize: 280px` when multi-pane so panes don't squash below usability.
- **`selectedNodeType` derivation for curated-loaded nodes** (e2e-batch #1): was reading only `data.$type`, which is absent on some curated hydration paths. Now falls through `data.$type → data.typeKind → node.type` so curated bundles route correctly through the `structureFocusedTypeId` gate (Structure pane was empty for all curated types because of this).
- **LSP-unreachable error message** (e2e-batch #7): was constructed from `config.lspSessionUrl`, which can be the dev default (`localhost:5173`) when `VITE_DEV_MODE` leaks into a prod build. Now uses `window.location.origin + /api/lsp/session` — the actual fetch URL.
- **Production sourcemap availability** (e2e-batch #9): `vite.config.ts` `build.sourcemap` set to `'hidden'` so crash reports + DevTools "Load source map" can symbolicate (previously prod TypeErrors at minified `index-*.js:11247` were undebuggable).
- **Structure text size** (e2e-batch #13): was inheriting `--text-sm` (14px); scoped to `--text-xs` (12px) on `.rune-node-data--structure` and `.rune-node-choice--structure` so dense schemas fit more rows per viewport.
- **Namespace header drag-drop discoverability** (e2e-batch #11): added hover-only `⋮⋮` grip glyph with `title` attribute pointing users to per-type drag affordance.

### Security
- None

## [0.1.0] - 2025-12-19

### Added
- Initial release
- TypeScript project template
- Basic project structure
