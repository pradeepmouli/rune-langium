# Structure View — Design Spec

**Feature Branch**: TBD (proposed: `020-studio-structure-view`)
**Status**: Draft — design review
**Created**: 2026-05-12
**Author**: Pradeep Mouli (with brainstorming via Claude Code)

## 1. Goal

Add a second view-mode tab inside the studio `VisualPreviewPanel` called **Structure View** — an XMLSpy-inspired editable canvas that renders a focused Rosetta `type` as a recursively-contained tree: the base type's content visible in a yellow container, the derived type nested inside it, and each complex-typed attribute's target rendered as a nested expansion to the right of the row that references it. Every cell (name, type, cardinality, `extends`) is inline-editable, with edits dispatched through the existing Inspector pipeline. The same drag-source palette pattern is surfaced in three consumer surfaces: Structure rows, the Inspector type field, and the source editor.

The view exists alongside — not in place of — the existing graph view, switchable via a tab inside the same `VisualPreviewPanel`. Names, vocabulary, and visual conventions stay codebase-native (TYPE / DATA / CHOICE / ENUM); no XSD terminology leaks in.

## 2. Architecture

### 2.1 Placement — tab inside VisualPreviewPanel

The new view is a Radix `Tabs` toggle inside `apps/studio/src/shell/panels/VisualPreviewPanel.tsx`:

```
VisualPreviewPanel
├── Tab: Graph     → RuneTypeGraph (existing)
└── Tab: Structure → StructureView (new)
```

The right rail relies on a dockview layout preset: `InspectorPanel` plays the "Details" role and `NamespaceExplorerPanel` plays the "Components" role, both reused as-is for rendering. The dockview state persists the active tab across reloads.

### 2.2 Code map

| File | Status | Purpose |
|---|---|---|
| `apps/studio/src/shell/panels/VisualPreviewPanel.tsx` | modified | Tab toggle (Graph / Structure); persists active tab |
| `packages/visual-editor/src/components/StructureView.tsx` | **new** (~300 LOC) | React Flow surface for the Structure tab |
| `packages/visual-editor/src/layout/structure-layout.ts` | **new** (~200 LOC) | Recursive containment + internal LR layout |
| `packages/visual-editor/src/adapters/structure-graph-adapter.ts` | **new** (~250 LOC) | Langium AST → Structure-view graph; per-row expansion state |
| `packages/visual-editor/src/components/editors/structure/` | **new** | Inline cell editors: `NameCell`, `TypePickerCell`, `CardinalityCell`, `InheritanceCell` |
| `packages/visual-editor/src/hooks/useTypeRefDrop.ts` | **new** (~80 LOC) | Shared drag-over/drop helper for all consumer surfaces |
| `packages/visual-editor/src/components/nodes/DataNode.tsx` | modified | `variant: 'graph' \| 'structure'`; 2-column body in structure variant; per-row source `Handle`s; optional inline-cell components |
| `packages/visual-editor/src/components/nodes/GroupContainerNode.tsx` | modified | New `scope: 'base-type'` variant — yellow body renders base's own rows directly |
| `packages/visual-editor/src/components/nodes/ChoiceNode.tsx` | reused as-is | Consumed as expansion target |
| `packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx` | modified | Single-click marks drag-source (→ arrow appears); items are `draggable`; double-click navigates |
| `apps/studio/src/shell/panels/InspectorPanel.tsx` (TypeSelectorField) | modified | Drop target via `useTypeRefDrop` |
| `apps/studio/src/components/SourceEditor.tsx` | modified | CodeMirror 6 drop extension; inserts qualified type name at drop position |
| `packages/visual-editor/src/styles.css` | modified | Universal visual tightening (see §4) |

**Zero parallel state.** Inline edits, drag-drops, and tab switches all converge on the existing studio store and Inspector edit pipeline. zundo history, LSP diagnostics, and source write-back stay unified.

## 3. Anatomy

### 3.1 Primitives (codebase-native vocabulary)

- **TYPE node** (`DataNode`) — a Rosetta `type` declaration. Header shows `[type] <name>` with optional `extends <base>` badge. Body in `structure` variant is a 2-column grid: **rows on the left, expansions on the right**, both inside the same border.
- **CHOICE node** (`ChoiceNode`) — a Rosetta `oneOf` choice. Header shows `[choice] <name>`; rows are choice options.
- **ENUM** — never rendered as a canvas node. When an attribute's type is an enum, the type cell is a reference chip with an `↗` glyph; click → focuses that enum in the Inspector. Rendering of the enum itself remains the Inspector's responsibility.
- **Base-type container** (`GroupContainerNode` with `scope: 'base-type'`) — yellow dashed container that represents the base type of an inheritance relation. The base's own attribute rows render directly inside the yellow body; the derived type is a nested `DataNode` below those rows, containing only the derived's new additions.

### 3.2 Recursive containment rule

Containment is the single mechanism for both inheritance and type-reference:

- **Inheritance** (`type Trade extends TradeBase`) — Trade is a `DataNode` nested inside a `GroupContainerNode(scope: 'base-type')` whose label is `TradeBase` and whose body shows TradeBase's own attribute rows above the nested Trade box. Multi-level inheritance nests yellow inside yellow recursively.
- **Type-reference** (`economics: Economics`) — when expanded, Economics is a `DataNode` parented (via React Flow `parentNode` + `extent: 'parent'`) to Trade and positioned in Trade's right-hand children column, vertically aligned with the `economics` row that referenced it. Economics' own complex-typed rows expand the same way recursively.

The right-hand children column auto-grows to fit nested expansions. React Flow's containment semantics enforce that children stay inside their parent's bounds; layout uses dagre LR within the children column to align each expansion with its source row.

### 3.3 Row-level affordances

Each row in a Data node body:

```
┌─────────────┬──────────────────┬──────────┬─────┐
│ name        │ type             │ card     │ ⬡ / ↗│
└─────────────┴──────────────────┴──────────┴─────┘
```

> **Node width (e2e-batch PR):** the rows column is **content-estimated per node** rather than fixed. Each node's `data.rowsColWidth` is computed by `estimateRowsColWidth(rows)` in `structure-layout.ts`, summing name + typeName + cardinality character widths + chrome overhead, clamped to `[COL_WIDTH=320, COL_WIDTH_MAX=600]`. Renderers apply it as inline `style.width` on `.rune-node-rows`, overriding the `--rune-col-width` CSS fallback. Original spec assumed a globally-fixed `COL_WIDTH=260` — that floor was too small for CDM-scale type names like `AdjustableOrAdjustedOrRelativeDate`. The width is estimated (not measured) — cost is one extra layout pass; tradeoff is that variable-pitch fonts may render slightly wider than the estimate (text-overflow: ellipsis is the safety net beyond 600px).

- **Name cell** — click to inline-edit; validates against Langium scope for duplicates.
- **Type cell** — small **chip** with a subtle background tint keyed to target kind (Data = muted blue; Choice = muted orange; Enum = muted amber; basic types = muted gray). Click to navigate-refocus the canvas on that type. Drop target for drag-from-NamespaceExplorer.
- **Cardinality cell** — small **monospace pill** (`0..1`, `1..1`, `0..*`, `2..2`). Click to open a popover editor.
- **Right-edge action**:
  - Hexagon-plus (⬡+) on rows whose target is a complex Type or Choice — toggles inline expansion.
  - Inspect arrow (↗) on enum-typed rows — focuses the enum in the Inspector.
  - Question mark (?) on unresolved references — surfaces the LSP diagnostic.

### 3.4 Row-level visual conventions

- **Optional** (`0..1` / `0..*`) — 2px dashed left border in `--border`.
- **Editing** (cell open for inline edit) — 2px solid left border in `--primary`. Distinct from dashed-optional.
- **Drag-over** (a draggable type is hovering over this row) — 2px solid `--primary` outline on the full row.
- **Diagnostic present** (LSP warning/error intersects the row's AST range) — severity-tinted left edge marker + tooltip.

## 4. Visual tightening (universal)

The existing node styling (`packages/visual-editor/src/styles.css`) is loaded with gradient + radial-overlay + drop-shadow chrome that fits hero-graph aesthetics but adds noise to a dense editing surface. Tightening is applied **universally** (Graph + Structure) for a single coherent visual language.

**Changes:**

- Strip the `.rune-node::after` radial-gradient overlay.
- Replace the `.rune-node` gradient background with a flat (or near-flat) surface using studio's `--background` / `--card` tokens.
- Drop `border-radius` from 8px → 4px.
- Reduce padding: header 8/12px → 4/8px; body 8/12px → 4/8px.
- Reduce base font 13–14px → 12px.
- Drop `box-shadow` to minimal (`0 1px 2px rgba(0,0,0,0.04)`) or none.
- **Keep** the 3px left accent (`.rune-node::before`) — it is information-bearing (kind indicator), not decoration.
- Replace `.rune-node-member-type` (italic, right-aligned text) with a **type chip** (`<button data-navigable>` rendered as a pill with kind-tinted background).
- Replace `.rune-node-member-cardinality` (plain text) with a **cardinality pill** (monospace, muted background, click-target for the cardinality popover).
- All colors map to Tailwind 4 + Radix tokens at implementation time; no hardcoded hex values in component-level CSS.

These cell-level improvements (type chip, cardinality pill, hexagon-plus expander) inherit to the graph view as well — there is no `data-variant` gating on cell styling.

## 5. Edit semantics — route through `editor-store`

Every inline edit on the Structure View canvas dispatches an action on `packages/visual-editor/src/store/editor-store.ts` — the same store a future Inspector form will dispatch through (the Inspector form panel is currently a stub; it will land separately and inherit this same pipeline):

| Surface | Action |
|---|---|
| NameCell blur | `editor-store.renameAttribute` |
| TypePickerCell select / drop | `editor-store.updateAttributeType` |
| CardinalityCell commit | `editor-store.updateCardinality` |
| InheritanceCell commit | `editor-store.setInheritance` |

`renameAttribute` and `updateAttributeType` are new granular actions added in Phase 0; the other two already exist on `editor-store` today.

All actions:

1. Mutate the Langium AST in the LSP worker.
2. Emit new document state.
3. Trigger validation (LSP diagnostics).
4. Append to the zundo history (Cmd-Z works uniformly).
5. Schedule source write-back.

The Structure View never owns mutation state; it is a participant in the existing edit pipeline.

### 5.1 Edit depth

Full structural editing is in scope:

- **Inline value edits** — rename, retype, re-cardinality, re-extend.
- **Add / remove / reorder attribute rows** — via UI controls on the row and in the type header (e.g., context menu, `+` / `−` buttons in the header gutter). Not via drag-reparent gestures in v1 (see §10).

All structural ops use the same dispatch model — they route through `editor-store` actions. Any action that does not yet exist (e.g., `addAttribute`, `removeAttribute`, `moveAttribute`) is added once to `editor-store`; both surfaces (the future Inspector form and Structure View) inherit the new capability.

### 5.2 Expansion state

The only state the Structure View owns is per-attribute expansion. Stored in a new zustand slice:

```ts
useStudioStore.structureView.expansionMap: Map<string, boolean>
// key: `${namespaceUri}::${typeId}::${attrName}`
```

Persisted to IndexedDB via studio's existing workspace-metadata layer (`apps/studio/src/workspace/persistence.ts` — the same `idb`-backed store that holds workspace records, tabs, and dockview layout). Expansion state lives as a new optional `structureView` field on `WorkspaceRecord`, so it travels with workspace switches automatically. No new IndexedDB connection or extra dependency. A toolbar "Collapse all" action resets the map for the current namespace.

**Default: fully collapsed.** Only the focused type's rows are visible on first render. Every expandable row shows a hexagon-plus; nothing expands automatically.

## 6. Drag-drop palette — NamespaceExplorer as drag source

`NamespaceExplorerPanel` becomes an active palette for type references. Three behaviors, all distinct:

| Action | Result |
|---|---|
| Single-click | Marks the type as the active drag-source. The row gets a left-edge color stripe + tinted background gradient (was `→` glyph in the original design; updated in the e2e-batch PR — the glyph visually competed with the right-aligned navigate ChevronRight, both being right-pointing arrows). Screen readers hear the state via the row's own `aria-label` (`"<name> — active drag source"`) and `aria-pressed="true"`. Studio's focused type does NOT change. |
| Drag-and-drop onto a drop target | Drop target consumes the type reference (see drop targets below). |
| Double-click | Refocus Structure View on that type as the new root. |

**Drag payload:**

```ts
type TypeRefPayload = {
  rune: 'type-ref',
  namespaceUri: string,
  typeId: string,
  kind: 'Data' | 'Choice' | 'Enum' | 'BasicType',
}
```

Encoded as JSON via `dataTransfer.setData('application/x-rune-type-ref', JSON.stringify(payload))`.

### 6.1 Drop targets

Three surfaces accept the drop, sharing the new `useTypeRefDrop` hook:

```ts
useTypeRefDrop({
  accept: Array<'Data' | 'Choice' | 'Enum' | 'BasicType'>,
  onDrop: (payload: TypeRefPayload) => void,
}) => { dragOverHandlers, isOver }
```

| Surface | `onDrop` action |
|---|---|
| Structure View row (`DataNode` 2-column body) | `editor-store.updateAttributeType(row.nodeId, row.attrName, payload)` |
| Inspector TypeSelectorField | **Deferred to a follow-up** — the Inspector form is a stub today; `useTypeRefDrop` is built and ready for this surface when the Inspector form lands. |
| Source editor (CodeMirror 6) | Insert qualified name (`<namespace>.<typeId>`) at `EditorView.posAtCoords(event)` via a transaction |

**Source-editor caveat (v1):** No auto-import. If the dropped type is in another namespace and not yet imported, the LSP surfaces an unresolved-reference diagnostic; the existing LSP quick-fix resolves it. Auto-import logic is deferred to v2.

The CodeMirror drop handler is registered as a `EditorView.domEventHandlers({ drop, dragover })` extension — no internal CM6 hacks.

## 7. Data flow

Five flows; all reuse existing studio plumbing.

**1 · Selection sync.** Single `useStudioStore.selection` slice. Three writers: Structure row click, source-editor cursor, NamespaceExplorer double-click. Subscribers: Inspector, Structure View, source editor.

**2 · Edit dispatch.** Inline cell edit → Inspector store action → AST mutation in the LSP worker → new document state → React Flow re-renders.

**3 · Validation surfacing.** Each row binds to its AST node's `range`. A `useDiagnosticsForRange(range)` selector returns intersecting diagnostics; row renders a severity-tinted left-edge marker + tooltip.

**4 · Undo / redo.** zundo observes the document store; Structure View edits become history entries automatically. No per-view history.

**5 · Expansion state.** Owned by Structure View; persisted to IndexedDB; per-namespace; default fully collapsed.

> **Effective-type resolution rule (e2e-batch PR, Codex P1 follow-up):** the original design assumed every graph node carries `data.$type` (e.g. `'Data'`, `'Choice'`, `'RosettaEnumeration'`). Curated hydration paths (`/api/parse` round-trips, deferred-export loaders) sometimes attach `data.typeKind` (`'data'`/`'choice'`/`'enum'`) or only the React Flow `node.type` instead, without setting `$type`. Both `selectedNodeType` (`apps/studio/src/pages/EditorPage.tsx`, the gate that decides what reaches Structure View) AND `graphNodesToAdapterDocument` (the same file, the projection that builds the `AdapterDocument` Structure View consumes) MUST resolve the effective type via the same fallback chain: `data.$type → data.typeKind → node.type`. A one-sided fallback produces a "selection forwarded but no matching node in adapter" dead-end where Structure shows the stale-selection state for legitimately-loaded curated types.

## 8. Edge cases

The **collapse-by-default** default resolves most cases naturally — nothing recursive or deep is rendered until the user explicitly walks into it.

| Case | Resolution |
|---|---|
| Recursive types (`Tree → parent: Tree`) | Inner Tree expansion is also collapsed by default. Each user click adds exactly one more level; view scales linearly with clicks. No cycle detection needed. |
| Deep nesting | User-controlled; no expansion-budget warning. |
| Wide schemas | Only what the user expanded is rendered. Bounded by user action. |
| Cross-namespace reference | Foreign type's expansion header carries a small `ns: <namespace>` badge; click to switch focused namespace. Otherwise expands inline. |
| Unresolved reference (broken import / typo) | Adapter detects via `Reference.error`; type chip rendered in `--destructive` tint; hexagon-plus replaced with `?`; tooltip surfaces the LSP error. |
| Concurrent edits (source-editor change during open Structure cell edit) | Source-editor wins. Pending Structure cell edit is discarded with a transient toast (`"Source changed — edit discarded"`); focus is dropped; cell re-reads from fresh AST. Same rule Inspector follows today. |
| Empty state (Structure tab opened with no focused type) | Centered prompt: `Select a type from the Namespace Explorer to view its structure.` |
| Unsupported kind selected (Function, TypeAlias, Record, Annotation, BasicType, etc.) | Targeted prompt naming the selected type + its kind label, directing the user to pick a Data / Choice / Enum type. Empty state branches on `unsupportedSelectedType` prop computed in EditorPage via `selectedNodeType` + a friendly-label map (with `formatUnknownKind` fallback for unmapped AST `$type` strings). Added in the e2e-batch PR after the original generic prompt was reported as non-actionable. |

## 9. Testing

**Unit (Vitest):**

- `structure-graph-adapter.test.ts` — fixture-driven; covers standalone type, single/multi-level extension, type-ref to Data / Choice / Enum, cross-namespace ref, unresolved ref, recursion.
- `structure-layout.test.ts` — given graph + expansion state → expected node positions and parent chains; covers fully collapsed, 1-level expand, 2-level expand, sibling alignment, recursion.
- Inline cell editors — name validation, cardinality format, type picker autocomplete.
- `useTypeRefDrop.test.ts` — kind-filter accept/reject; `dragover` state; `onDrop` invocation.

**Component (Vitest + React Testing Library):**

- `DataNode` `structure` variant: 2-column body, type chip, cardinality pill, hexagon-plus on complex refs, click-cell-to-edit, blur dispatches.
- `GroupContainerNode` `base-type` variant: base rows render directly; nested derived box positions correctly.
- Drop visual feedback states.

**Integration (Playwright, in `apps/studio`):**

- Open Structure tab; default fully collapsed; empty-state prompt with no focused type.
- Focus via NamespaceExplorer double-click → root populates.
- Hexagon-plus expands; nested node aligns with source row.
- Inline rename → source editor reflects within 1 frame.
- Drag from NamespaceExplorer → drop on Structure row / Inspector field / source editor — each updates state through unified dispatch.
- Cmd-Z reverts; tab toggle preserves selection.
- Wait for visible UI readiness, not `networkidle` (per project convention).

**Visual / accessibility:**

- Playwright `toHaveScreenshot()` snapshots for collapsed and expanded Trade layouts.
- axe checks on the Structure tab.
- Keyboard nav: Tab, Enter, Esc, arrow keys.

**Corpus rule:** Tests requiring real CDM fixtures under `.resources/` guard with skip-if-absent; adapter unit tests parse small inline Langium snippets so the unit layer is corpus-independent.

## 10. Out of scope (v1)

- **Auto-import on source-editor drop.** Defer to v2; LSP quick-fix handles unresolved references in v1.
- **Structural drag-rearrange on the canvas** (e.g., dragging attribute rows between types). v1 supports add/remove/reorder via Inspector form + canvas inline edits, but not drag-reparent.
- **Multi-namespace overview.** The Graph view is the surface for cross-namespace overviews; Structure View remains single-namespace-focused at any given moment.
- **Custom layout per type** (saved positions). The recursive layout is deterministic per (graphInput, expansionState); positions are not user-adjustable.

## 11. Open questions

- Final i18n keys for the tab label (`Structure`) and toolbar actions.
- Whether the toolbar `Collapse all` action should also reset focused type to namespace root, or stay scoped to the current type's expansion state.
- Whether `↗ Inspect enum` should also close the Structure View's row selection, or keep selection independent of Inspector focus.

These can be resolved during implementation review without affecting architecture.
