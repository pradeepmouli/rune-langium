# Enhancement: Namespace-Based Graph Explorer with Correlated Graph Collapsing

**Enhancement ID**: enhance-001
**Branch**: `enhance/001-namespace-based-graph`
**Created**: 2025-02-12
**Priority**: [x] High | [ ] Medium | [ ] Low
**Component**: packages/visual-editor (primary), apps/studio (integration)
**Status**: [ ] Planned | [ ] In Progress | [x] Complete

## Input
User description: "The entire CDM model loaded into the browser has poor UX because all nodes display on the graph at the same time. Need an outline/explorer (type graph-based tree — not file-based). The tree starts collapsed at the namespace level, and collapsing/expanding in the tree correlates with hiding/showing nodes in the graph view. Expanding any namespace (or subsequent child nodes therein) would expand in the view as well."

## Overview
Add a tree-based namespace explorer panel to the visual editor that provides hierarchical navigation of the type graph grouped by namespace. The tree's expand/collapse state directly controls which nodes are visible on the ReactFlow canvas — collapsed namespaces hide their types from the graph; expanded namespaces show them. This eliminates the overwhelming "all nodes at once" problem when loading large models like CDM (~4,000+ types across ~50 namespaces).

## Motivation
When loading the full CDM (Common Domain Model) into the studio, every type node renders simultaneously on the canvas, making the graph unusable:

- **Visual overload**: Thousands of nodes with dense cross-namespace edges create an incomprehensible layout
- **Performance**: Dagre layout + React Flow rendering with 4,000+ nodes is slow and unresponsive
- **Navigation**: No way to progressively explore the model by namespace or type hierarchy
- **Existing gap**: Namespace data already flows through the entire pipeline (`TypeNodeData.namespace`, `GraphFilters.namespaces`) but no UI leverages it for progressive disclosure

The tree explorer solves this by defaulting to a collapsed view (namespace labels only, no graph nodes rendered) and letting users progressively expand areas of interest — both in the tree and on the canvas.

## Proposed Changes

### 1. NamespaceExplorerPanel Component
New tree component in `packages/visual-editor/src/components/panels/` that renders a collapsible tree:
```
▶ com.rosetta.model              (312 types)
▶ com.rosetta.model.lib          (45 types)
▼ com.rosetta.model.event        (87 types)
    ├── 📦 EventInstruction       [data]
    ├── 📦 TradeState             [data]
    ├── 🔀 ActionEnum             [enum]
    └── ...
▶ cdm.product.asset              (156 types)
```

- Tree root = sorted list of unique namespaces extracted from loaded models
- Second level = type nodes within each namespace, sorted alphabetically, with kind icons
- Each node has a checkbox/toggle for fine-grained visibility control
- Namespace counts shown as badges
- Search/filter within the tree

### 2. Visibility State in EditorStore
Extend the Zustand store with namespace-level and node-level visibility:
```ts
interface VisibilityState {
  expandedNamespaces: Set<string>;       // namespaces currently expanded (visible on graph)
  hiddenNodeIds: Set<string>;            // individual nodes hidden within expanded namespaces
}
```

### 3. Correlated Graph Filtering
- `RuneTypeGraph` filters nodes/edges based on visibility state before passing to ReactFlow
- Collapsing a namespace in the tree removes its nodes from the canvas and triggers relayout
- Expanding a namespace adds its nodes and triggers incremental layout
- Edges that cross visibility boundaries are hidden (both endpoints must be visible)

### 4. Initial Load Behavior
- On first load with large models (>100 types), all namespaces start **collapsed**
- On first load with small models (≤100 types), all namespaces start **expanded** (current behavior)
- User can "Expand All" / "Collapse All" from the panel toolbar

### 5. Integration into Studio Layout
- Explorer panel docked on the left side of the editor page
- Resizable via drag handle
- Collapsible to a thin icon strip to maximize graph canvas area

**Files to Modify**:
- `packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx` — **NEW** tree component
- `packages/visual-editor/src/store/editor-store.ts` — add visibility state + actions
- `packages/visual-editor/src/components/RuneTypeGraph.tsx` — filter nodes/edges by visibility
- `packages/visual-editor/src/adapters/ast-to-graph.ts` — extract namespace tree structure
- `packages/visual-editor/src/components/panels/index.ts` — export new panel
- `packages/visual-editor/src/types.ts` — add `VisibilityState`, `NamespaceTreeNode` types
- `apps/studio/src/pages/EditorPage.tsx` — integrate explorer panel into layout

**Breaking Changes**: [ ] Yes | [x] No
Additive feature — existing graph behavior preserved for small models.

## Implementation Plan

**Phase 1: Implementation**

**Tasks**:
1. [x] **Define types and visibility state** — Add `NamespaceTreeNode`, `VisibilityState` types to `types.ts`. Extend `EditorState` in `editor-store.ts` with `expandedNamespaces: Set<string>`, `hiddenNodeIds: Set<string>`, and actions: `toggleNamespace(ns)`, `toggleNodeVisibility(id)`, `expandAll()`, `collapseAll()`, `setInitialVisibility(models)`.

2. [x] **Build namespace tree data extractor** — Add `buildNamespaceTree(nodes: TypeGraphNode[]): NamespaceTreeNode[]` utility that groups nodes by namespace, computes counts per namespace and per kind, and sorts alphabetically. This feeds the explorer panel.

3. [x] **Create NamespaceExplorerPanel component** — Build the tree UI with: collapsible namespace rows showing name + type count badge; child type rows with kind icons (data/choice/enum); expand/collapse chevrons; individual node visibility toggles; a local search input that filters the tree; "Expand All" / "Collapse All" toolbar buttons.

4. [x] **Wire visibility filtering into RuneTypeGraph** — In `RuneTypeGraph.tsx`, derive visible nodes/edges from the full set using `expandedNamespaces` and `hiddenNodeIds`. Only pass visible nodes to `<ReactFlow>`. Trigger `computeLayout()` on visibility changes so the graph reflows without gaps. Debounce rapid toggles.

5. [x] **Integrate explorer panel into EditorPage layout** — Add the panel to the left side of `EditorPage.tsx` with a resizable split pane. Add a toggle button in the toolbar to show/hide the explorer. Set initial visibility based on model size threshold (>100 types → collapsed).

6. [x] **Add unit and integration tests** — Test `buildNamespaceTree` with various model structures. Test store visibility actions (toggle, expand all, collapse all). Test that node/edge filtering respects visibility state. Test initial visibility threshold logic. Integration test: load CDM fixtures, verify collapsed by default, expand one namespace, verify graph updates.

7. [x] **Polish UX and edge cases** — Handle edge cases: namespace with single type, deeply nested namespace segments (e.g. `com.rosetta.model.lib.process`), cross-namespace edge indicators (show faded badge when a visible node has hidden references), keyboard navigation in the tree, and appropriate loading states during relayout.

**Acceptance Criteria**:
- [ ] Loading CDM (4,000+ types) shows an empty graph canvas with a populated namespace tree, all collapsed
- [ ] Expanding a namespace in the tree renders only that namespace's types on the canvas
- [ ] Collapsing a namespace removes its types and the graph relayouts cleanly
- [ ] Cross-namespace edges only display when both endpoints are visible
- [ ] Small models (≤100 types) load with all namespaces expanded (preserving current behavior)
- [ ] Tree supports search/filter to quickly find namespaces or types by name
- [ ] Explorer panel is resizable and collapsible without breaking graph layout

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual testing complete
- [ ] Edge cases verified

## Verification Checklist
- [ ] Changes implemented as described
- [ ] Tests written and passing
- [ ] No regressions in existing functionality
- [ ] Documentation updated (if needed)
- [ ] Code reviewed (if appropriate)

## Notes
- **Namespace data already exists** throughout the pipeline: `TypeNodeData.namespace` is populated, node IDs use `namespace::TypeName` format, and `GraphFilters.namespaces` supports filtering — this enhancement builds UI on top of that foundation.
- **Performance**: By default-collapsing large models, we avoid the expensive dagre layout of 4,000+ nodes on initial load. Layout only runs on the visible subset.
- **If this grows beyond 7 tasks** (e.g., adding namespace-colored group boundaries on the canvas, minimap integration, persistence of expand state), consider migrating to a full `/speckit.specify` specification.
- **Future extensions**: Namespace group nodes on canvas (ReactFlow subflows), color-coding by namespace, persist expand/collapse state to localStorage, "focus mode" that shows a namespace + its direct dependencies.

---
*Enhancement created using `/enhance` workflow - See .specify/extensions/workflows/enhance/*
