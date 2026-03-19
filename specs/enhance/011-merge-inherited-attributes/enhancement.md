# Enhancement: Merge Inherited Members Into Main Editor Lists

**Enhancement ID**: enhance-011
**Branch**: `enhance/011-merge-inherited-attributes`
**Created**: 2026-03-19
**Priority**: [ ] High | [x] Medium | [ ] Low
**Component**: visual-editor editor panel for data types and enumerations
**Status**: [x] Planned | [ ] In Progress | [ ] Complete

## Input
User description: "merge inherited attributes/enum values into main attribute/enum value list in editor panel"

## Overview
The editor panel currently shows local attributes and enum values in the main editable list, while inherited members appear separately in a collapsible inherited section. This enhancement merges inherited attributes and enum values into the main list so the full effective surface is visible in one place, while preserving clear provenance for inherited entries and allowing inline edits to promote inherited members into local overrides.

## Clarifications
### Session 2026-03-19
- Q: When a local member and inherited member share the same name, how should the merged list behave? → A: Local member shadows the inherited duplicate; show only the local row, optionally marked as an override.
- Q: What ordering should the merged list use for local and inherited rows? → A: Show local rows first, then inherited rows ordered from nearest ancestor to farthest ancestor.
- Q: How should ancestor provenance be shown for inherited rows in the merged list? → A: Keep one flat merged list and show the source ancestor on each inherited row.
- Q: Should users be allowed to edit inherited members directly in the merged list? → A: Yes. Inline edits on inherited members should automatically create local overrides, after which the edited row behaves as the effective local member.

## Motivation
The current split view makes the effective shape of a type or enum harder to scan because users must inspect two different sections to understand what is available. Merging inherited members into the primary list improves discoverability, reduces context switching, and better matches how users reason about a type's complete attribute or value set in the editor panel.

## Proposed Changes
- Merge inherited attributes into the main attributes list in the data type editor instead of rendering them only in a separate inherited section.
- Merge inherited enum values into the main values list in the enum editor while visually distinguishing inherited rows from locally owned rows.
- Preserve edit safety by keeping inherited rows non-reorderable and non-removable as inherited entries, while allowing inline edits that automatically materialize a local override and then use normal local-row behavior. When an inherited member is edited inline, a new local member is written to the model with the updated values and the same name, replacing the inherited entry in the effective surface (model-level override, not UI-state-only).
- When a local attribute or enum value has the same name as an inherited member, render only the local row in the merged list and treat it as the effective visible override.
- Order the merged list with all locally declared rows first, followed by inherited rows grouped by inheritance distance from nearest ancestor to farthest ancestor.
- Add origin metadata or row state needed to render inherited members inline in a flat list with an explicit inherited-from ancestor label on each inherited row, detect when an inline edit should fork into a local override, and prevent unsupported mutations on still-inherited rows. The merged-row data shape is: `{ id, name, type, isLocal: boolean, inheritedFrom?: { ancestorName: string, inheritanceDepth: number } }`. Inherited rows display as: `[name] [type] (inherited from [AncestorName])` with a visual indicator of inheritance depth when multiple ancestor levels are present.
- Update tests for panel rendering and row behavior so inherited and local members are validated together in the merged list.

**Files to Modify**:
- packages/visual-editor/src/components/editors/DataTypeForm.tsx - build a merged attribute view and update section rendering
- packages/visual-editor/src/components/editors/EnumForm.tsx - build a merged enum value view and update section rendering
- packages/visual-editor/src/components/editors/AttributeRow.tsx - support inline inherited row presentation and read-only controls
- packages/visual-editor/src/components/editors/EnumValueRow.tsx - support inline inherited value presentation and read-only controls
- packages/visual-editor/src/components/editors/InheritedMembersSection.tsx - remove, narrow, or repurpose once inherited members are rendered inline
- packages/visual-editor/src/components/panels/EditorFormPanel.tsx - continue supplying inherited member data needed by merged row lists
- packages/visual-editor/src/hooks/useInheritedMembers.ts - provide or reshape inherited metadata for inline rendering
- packages/visual-editor/src/components/panels/DetailPanel.tsx - verify whether read-only/detail rendering should stay aligned with the merged presentation; this is a read-only verification step covered in Task 2 or 3, not a separate implementation task unless misalignment is found
- packages/visual-editor/test/** - update or add tests for merged inherited/local list behavior

**Breaking Changes**: [ ] Yes | [x] No
This is a UI behavior enhancement and should not change persisted model structure or public data contracts.

## Implementation Plan

**Phase 1: Implementation**

**Tasks**:
1. [x] Review current data and enum editor flows to identify where local rows and inherited groups are assembled, and define a shared merged-row shape for inline rendering.
2. [x] Update data type editor rendering so inherited attributes appear in the main attributes list with explicit inherited/read-only styling and ancestor context.
3. [x] Update enum editor rendering so inherited enum values appear in the main values list with explicit inherited/read-only styling and ancestor context.
4. [x] Ensure inherited-row inline edits create local overrides cleanly: verify that (1) editing an inherited row creates a new local member in the model, (2) the inherited duplicate no longer appears in the merged list after override creation, and (3) the promoted local row supports all local operations (edit, remove, reorder). Also ensure remove and reorder actions remain scoped to locally declared rows and cannot operate on still-inherited members directly.
5. [x] Add or update tests covering merged list rendering, override creation from inherited-row edits, local row interactions, and empty-state behavior.

**Acceptance Criteria**:
- [x] Data type editor panels show local and inherited attributes in one list, without requiring a separate inherited section for visibility.
- [x] Enum editor panels show local and inherited enum values in one list, with inherited values clearly marked and their source ancestor visible.
- [x] Editing an inherited attribute or enum value inline automatically creates a local override, and the inherited duplicate is no longer rendered separately afterward.
- [x] Remove and reorder actions continue to work only for locally owned members and do not operate directly on still-inherited rows.
- [x] Local members with the same name as inherited members shadow the inherited duplicates in the merged list instead of rendering both rows.
- [x] Merged lists keep locally declared rows at the top and inherited rows after them in nearest-ancestor-first order.
- [x] Each inherited row in the flat merged list displays its source ancestor name and the entry is visually distinguished (e.g. labelled `inherited from [AncestorName]`), enabling users to understand provenance without reintroducing grouped sections.
- [x] Automated tests cover merged rendering and key interaction constraints for both data and enum editors.

## Testing
- [x] Unit tests added or updated for merged data type and enum list rendering
- [x] Integration tests pass for visual-editor package
- [x] Manual testing complete for local and inherited member scenarios in the editor panel
- [x] Edge case: empty local list — merged list renders inherited members only; add button remains functional
- [x] Edge case: name collision — a local member with the same name as an inherited member shadows the inherited duplicate; only the local row is rendered in the merged list, with an optional override indicator
- [x] Edge case: multiple ancestor levels — rows from each ancestor appear in nearest-first order; each row identifies its own ancestor by name
- [x] Edge case: inline edit override creation — editing an inherited row (1) writes a local member to the model, (2) removes the inherited duplicate from the merged list, (3) the promoted row behaves as a local row
- [x] Edge case: inherited-row mutation prevention — remove and reorder controls are absent or disabled on still-inherited rows; attempting to trigger them has no effect

## Verification Checklist
- [x] Changes implemented as described
- [x] Tests written and passing
- [x] No regressions in existing functionality
- [ ] Documentation updated if component behavior or screenshots need refresh
- [ ] Code reviewed if appropriate

## Notes
This enhancement should stay single-phase and focused on panel presentation plus interaction safeguards, including UI-level override creation from inline edits on inherited rows. If the work expands into broader inheritance semantics or model-level override behavior beyond inline editor presentation, it should move to a full `/speckit.specify` workflow.

---
*Enhancement created using `/enhance` workflow - See .specify/extensions/workflows/enhance/*
