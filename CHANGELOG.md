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
- `NamespaceExplorerPanel` single-click semantics: was "navigate to type"; now "mark as active drag source". Double-click navigates. Updated 5 affected Playwright specs accordingly (including `namespace-explorer.spec.ts` which used a stale `.ns-type__name` selector removed in a prior redesign).
- 51 mechanical react-doctor cleanup fixes across design-system, visual-editor, and studio (redundant ARIA roles, EMPTY_* module constants for stable memo references, real keys replacing array-index keys with index disambiguators for non-unique values, design-no-redundant-size/padding-axes shorthand)
- Tightened stylelint custom rule `rune/no-literal-layout-px` to only exempt `var(--rune-*, ...)` SSoT references (design-system tokens on layout-coupled properties of `.rune-*` selectors are correctly flagged again, preventing drift from `STRUCTURE_LAYOUT_CONSTANTS`)

### Deprecated
- None

### Removed
- None

### Fixed
- None

### Security
- None

## [0.1.0] - 2025-12-19

### Added
- Initial release
- TypeScript project template
- Basic project structure
