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
