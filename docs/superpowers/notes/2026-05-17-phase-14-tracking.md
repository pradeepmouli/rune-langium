# Phase 14 — Structure View follow-up tracking

**Created:** 2026-05-17
**Base:** master @ `c1c1716e` (after PR #191 — Phase 13 adversarial fixes merged)
**Source reviews:** Codex 2nd adversarial-review (job `review-mp93ewds-mc2pw7`) + Opus React Flow code review on PR #191

This doc captures 8 findings from the two reviews run on PR #191. They were intentionally deferred from #191 to keep that PR reviewable (#191 already had 10 commits across 3 review rounds). Each finding here has a clear file:line reference, severity, recommended fix, and a sequencing suggestion so the work can be picked up in focused chunks.

## Summary

| # | Severity | Category | Title | Decision |
|---|---|---|---|---|
| C | P1 | RF perf / correctness | Data identity churns on every edit → all DataNode rerender | Phase 14c (3-part refactor) |
| D | P1 | Design conflict | Per-instance duplicate types share one expansion key | **PER-INSTANCE** (XmlSpy match) — Phase 14d |
| A | MED | Contract inconsistency | Choice roots: EditorPage allows, StructureView rejects | **WIRE** Choice root rendering — Phase 14e |
| B | MED | Contract inconsistency | Choice arms terminal & read-only despite editable target data | **WIRE** arm parity — Phase 14e |
| ~~E~~ | ~~P2~~ | ~~RF UX~~ | ~~`fitView` runs every layout pass → viewport resets on edits~~ | **DROPPED** — see § E |
| F | P2 | RF perf / a11y | Decorative Handles in structure mode waste DOM | Phase 14b — gate by variant |
| G | P2 | RF latent | Top-level `width`/`height` on node; RF12 uses `style.*`/`measured` | Phase 14b — preventive fix |
| H | P2 | RF perf | `onlyRenderVisibleElements` not set on deep expansions | Phase 14b — single prop |
| (nit) | — | RF | `useNavigation` called in structure variant but values unused | Bundle with C |
| (nit) | — | RF | Full `expansionMap` passed to each DataNode (could be per-row slice) | Bundle with C |

## Recommended sequencing

**Phase 14a — Decisions** (DONE, see Summary table):
- D → per-instance (XmlSpy / Altova UModel / Liquid Studio / Oxygen XML match)
- A → wire Choice root rendering (Direction 2)
- B → wire Choice arm parity (Direction 2)
- E → DROPPED per source-grep verification of RF12 internals

**Phase 14b — Easy wins** (1 PR, ~half-day):
- F (gate Handles by variant)
- G (style.width/height)
- H (onlyRenderVisibleElements)
- E is **DROPPED** — see § E for the source-grep verification. RF12 `fitView` prop is a one-shot initial fit; subsequent layout passes do NOT re-fit. The Opus reviewer applied an RF11 mental model.

**Phase 14c — Data identity refactor** (1 PR, ~half-day):
- C (hoist cellComponents/expansionMap/onToggleExpansion to React context, hook reads in DataNode/GroupContainerNode)
- Nit consolidation (slice expansionMap per-row at the boundary)
- Performance test that asserts a single-cell edit re-renders ≤1 DataNode (not all)

**Phase 14d — Per-instance expansion semantics** (this PR — branch `020-structure-view-phase-14d-per-instance-expansion`):
- D fix: per-instance (XmlSpy / Altova UModel / Liquid Studio / Oxygen XML convention)
- Extend `StructureExpansionKey` with optional `instancePath: ReadonlyArray<string>` (path of React Flow instance ids of ancestors leading to this row's owner; empty = root-level)
- Update `expansionKey()` serializer: empty/undefined `instancePath` serializes to the SAME string as before (back-compat); populated path appends `::<path.join('>')>` suffix
- Layout exposes `data.instancePath` on every emitted React Flow node (path = the React Flow node ids of ancestors; root = `[]`)
- DataNode / GroupContainerNode chevrons read `data.instancePath` when building the row's expansion key
- Adapter `shouldExpand` accepts `instancePath` and threads it through `walkAndExpand` / `walkBaseExpansions`
- Migration story: old persisted keys (no `instancePath` suffix) parse as root-level expansions — zero data loss

**Phase 14e — Choice parity** (separate PR, Direction 2 chosen):
- StructureView accepts Choice roots; `buildStructureGraph` extended to materialize Choice (and likely Enum) focused roots via `buildChoiceNode` / equivalent
- ChoiceNode receives cellComponents + expansion props; renders chevron for arms whose target is expandable
- Arm expansion key contract (likely `{namespaceUri, typeId: choiceTypeName, attrName: 'arms[index]'}` or similar)
- Adapter tests for Choice-as-root materialization; ChoiceNode parity tests with DataNode chevron tests

## Detail per finding

### C — Data identity churns on every edit (P1)

**Files:** `packages/visual-editor/src/components/StructureView.tsx:110-120`, `apps/studio/src/components/StructureView.tsx` (memo deps), `packages/visual-editor/src/adapters/structure-graph-adapter.ts` (node-object creation), `packages/visual-editor/src/layout/structure-layout.ts:414-423` (data payload spread), `apps/studio/src/pages/EditorPage.tsx:1393-1396` (adapterDoc memo)

**Problem:** The useMemo in `StructureFlowInner` rebuilds the React Flow node `data` payload on every layout pass (which fires on every edit, since `storeNodes` invalidates on any mutation). React Flow shallow-compares `node.data` for rerender decisions, so every keystroke in a single NameCell rerenders every visible DataNode/GroupContainerNode.

**Codex correction (PR #193 review):** The context-only fix is necessary but **not sufficient**. Three sources of identity churn ALL need to be addressed:
1. The `StructureView` injection (`data: { ...n.data, cellComponents, ... }`) — fixed by context refactor
2. `layoutStructureGraph()` wraps every layout-returned node with fresh `data: { ...n, variant: 'structure' }` — still churns identity even if injection is removed
3. `buildStructureGraph()` creates fresh `StructureDataNode`/row objects on each `adapterDoc` pass — feeds (2) with new inputs even when underlying content is unchanged

Without addressing all three, the "≤1 DataNode rerender on single-cell edit" test will fail because React Flow still sees new `node.data` identities for every visible node.

**Full fix (3 parts):**
1. **Context refactor (C.1)**: hoist `cellComponents`/`expansionMap`/`onToggleExpansion` to a `StructureCellContext` provider inside `StructureFlowInner`. DataNode/GroupContainerNode read via `useContext`. (Originally proposed.)
2. **Stable layout output (C.2)**: cache the layout's per-node data payload by canonical StructureNode identity (e.g., `WeakMap<StructureNode, ReactFlowNodeData>`). When layout walks an unchanged adapter node, return the cached data object. New cache entry only when the canonical node identity changes.
3. **Stable adapter output (C.3)**: cache buildStructureGraph's output similarly — if the underlying editor-store nodes for a focused type haven't changed (deep-equal on the source fields), return the previous `StructureGraphInput` with reference-stable nodes.

OR — a simpler total approach — selectively re-use the previous `result` object's nodes when their canonical content hasn't changed (identity-preserving map over `prev.nodes`):
```ts
const stableNodes = result.nodes.map((n) => {
  const prev = prevResultRef.current?.nodes.find((p) => p.id === n.id);
  return prev && shallowEqual(prev.data, n.data) ? prev : n;
});
```
This is cheaper to implement than C.2 + C.3 but does a per-edit O(n²) scan; acceptable for typical schemas.

**Impact:** Medium perceived perf on large schemas (CDM `Trade` expanded 3 deep ≈ dozens of nodes re-render on every keystroke). Correctness unaffected.

**Acceptance test refinement:** "Edit a single cell; assert that React DevTools Profiler shows ≤1 DataNode rerender" — must pass after ALL three fix parts, not just C.1.

---

### D — Per-instance duplicate types share one expansion key (P1, design conflict) — **RESOLVED: per-instance**

**Files:** `packages/visual-editor/src/components/nodes/DataNode.tsx:112-115`, `packages/visual-editor/src/layout/structure-layout.ts:339-341`

**Problem:** Phase 13's per-edge instance ids give each placement of `Party` a unique React Flow node id (`Trade::buyer::Party`, `Trade::seller::Party`). Both render the same `<DataNode>` with the same `namespaceUri` + `name` + row's `attrName`. The chevron's `rowKey` is therefore identical across instances:
```ts
const rowKey = { namespaceUri: ownerNamespaceUri, typeId: ownerTypeName, attrName: row.attrName };
```
Click on `buyer.Party.address` chevron → flips the same map entry that drives `seller.Party.address`. Both subtrees expand together.

**Decision (user-confirmed 2026-05-17): per-instance**, matching XmlSpy / Altova UModel / Liquid Studio / Oxygen XML conventions. Each visible occurrence of a type tracks its own expansion state. Implementation in Phase 14d:
- `StructureExpansionKey` gains optional `instancePath: ReadonlyArray<string>` (React Flow instance ids of ancestors leading to this row's owner)
- `expansionKey()` serializer is back-compatible: empty/undefined `instancePath` serializes to the same string as before (`${namespaceUri}::${typeId}::${attrName}`); populated path appends `::${path.join('>')}` (using `>` because `:` is the existing separator)
- Layout exposes `data.instancePath` on every emitted React Flow node; renderers read it when building their row keys
- Adapter `shouldExpand` accepts `instancePath` and threads it through recursion
- Migration: zero data loss — old persisted keys parse as root-level (empty `instancePath`), which under the new model behaves as the root instance's per-instance state

---

### A — Choice roots rejected after pass-through (MED, contract inconsistency)

**Files:** `apps/studio/src/pages/EditorPage.tsx` (focusedTypeId gating), `packages/visual-editor/src/components/StructureView.tsx:174-178` (unsupported-root branch)

**Problem:** EditorPage's `focusedTypeId` derivation allows `'Data' | 'Choice' | 'RosettaEnumeration'` through (per Phase 7.5 commit `94addf4d`). StructureView's unsupported-root branch rejects everything that isn't Data. Layout/adapter have code paths for a Choice root.

**Two paths:**
1. **Narrow EditorPage gating** to Data-only. Add UI cue on the explorer nav button (disabled / different affordance) for non-Data types. Simplest; honest about scope.
2. **Wire Choice root rendering**: needs MORE than a renderer change. Per Codex on PR #193: `buildStructureGraph` currently only materializes Data roots; `buildChoiceNode` is a private helper used only for expanded Choice targets within a Data structure. A Phase 14e PR that only touches StructureView would render nothing. Required work:
   - Extend `buildStructureGraph` to accept Choice (and probably Enum) focused roots and materialize them via `buildChoiceNode` / equivalent
   - Update `StructureGraphInput` shape if root-as-Choice differs structurally from root-as-Data
   - Drop StructureView's `rootNode.$type !== 'Data'` rejection branch
   - Add adapter tests for Choice-as-root materialization

**Recommendation:** Direction 1 unless we want Choice roots as a first-class UX (which the spec didn't require). Direction 2 is real adapter + layout work, not a one-file change.

---

### B — Choice arms terminal & read-only despite editable target data (MED, contract inconsistency)

**Files:** `packages/visual-editor/src/components/nodes/ChoiceNode.tsx:48-60`

**Problem:** ChoiceNode's structure-variant maps each arm to a plain type chip + handle. No `cellComponents`, no `onToggleExpansion`, no `expansionMap`. A Choice arm targeting a Data type can't be expanded or retyped via TypePickerCell. The adapter records `targetNodeId` and `typeKind` for arms — data is there, plumbing isn't.

**Two paths:**
1. **Defer explicitly**: keep arms inert in this implementation; add a UI cue or tooltip ("type swap not yet supported on Choice arms"); spec note.
2. **Wire arm parity**: add arm expansion key contract (probably `{namespaceUri, typeId: choiceTypeName, attrName: 'arms[index]'}` or similar), pipe expansion/cell plumbing into ChoiceNode, render TypePickerCell for arm type refs, update layout/adapter to recurse from expandable arms.

**Recommendation:** Direction 1 unless arm interactivity is a known user ask.

---

### E — `fitView` re-runs on every layout pass (P2) — **DROPPED 2026-05-17**

**File:** `packages/visual-editor/src/components/StructureView.tsx:124-128`

**Opus reviewer claim (REFUTED):** `<ReactFlow fitView ... />` re-fits on substantial node-set change → every keystroke jumps the viewport.

**Verification (source-grep against @xyflow/react 12.10.2 bundle):**
- `fitView` prop sets `fitViewQueued` state on first `setNodes` (bundle line 3198)
- `setNodes` consumes `fitViewQueued` and clears it (line 3260–3290) — one-shot
- `updateNodeInternals` also clears `fitViewQueued` (line 3314–3323) — one-shot
- The state is never re-armed unless the prop's reference identity changes. The Structure View passes literal `true`, which has stable identity.

**Conclusion:** `fitView` prop is a one-shot initial-fit. RF12 explicitly removed RF11's "re-fit on substantial change" behavior. Opus reviewer applied an RF11 mental model and was wrong. **No bug exists.**

**Inverted finding (lower priority, not in 14b):** The viewport does NOT re-center when `focusedTypeId` changes — this is a missing feature, not a regression. When a user navigates from `Trade` to `Party` via the explorer, the viewport stays where it was instead of refitting on the new root. If we want that behavior, the imperative-fitView refactor sketched in the original E recommendation IS the right shape — but as a feature add, not a fix:
```tsx
function FitOnFocus({ focusedTypeId }: { focusedTypeId: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => { void fitView({ padding: 0.2, duration: 200 }); }, [focusedTypeId, fitView]);
  return null;
}
```
Tracking note: file as a separate UX improvement ticket if user feedback requests it. Out of scope for Phase 14b.

---

### F — Decorative Handles render in structure mode with no edges (P2)

**Files:** `packages/visual-editor/src/components/nodes/DataNode.tsx:103, 172-178, 185`, `packages/visual-editor/src/components/nodes/ChoiceNode.tsx:52, 61-67, 71`

**Problem:** Each structure-variant row mounts a `<Handle type="source" .../>`. The node also emits target/source Handles at top/bottom. Layout emits ZERO edges. `nodesConnectable={false}` doesn't suppress them — they're empty DOM nodes with React Flow's internal handle registry tracking them.

**Fix:** Gate Handles on `!isStructureData(data)`. In structure variant: drop the outer Handles AND the per-row source Handles.

**Impact:** Perf (DOM count + RF handle subscriptions) on dense schemas (50 rows × 5 expansions ≈ 250 extra DOM nodes per render); minor a11y improvement.

---

### G — Top-level `width`/`height` on node; RF12 expects `style.width/height` (P2, latent)

**File:** `packages/visual-editor/src/layout/structure-layout.ts:414-423`

**Problem:** React Flow 12 stores measured dimensions on `node.measured`. The top-level `width`/`height` properties are initial-sizing inputs that don't drive layout the way `style.width/height` do. Per the [v12 migration docs](https://reactflow.dev/learn/troubleshooting/migrate-to-v12): "the `width` and `height` properties of a node will no longer be updated. Instead, the measured dimensions are stored in `node.measured`."

The code accidentally works today because `parentId` + `extent: 'parent'` mostly cares about the parent's measured rect and positions are pre-computed. But if RF starts auto-measuring (which it does on mount), measured rect can diverge from `sz.width/sz.height` — CSS-rendered DataNode is what gets measured, and any drift from layout's `COL_WIDTH=260` shows up as `extent: 'parent'` clamping children incorrectly.

**Fix:** Move to `style: { width: sz.width, height: sz.height }`. Also add a test that mounts a known node and asserts `node.measured.width === sz.width` (within 1px tolerance) to catch CSS drift.

**Impact:** Latent — works today, breaks the moment CSS drifts from layout constants.

---

### H — `onlyRenderVisibleElements` not set (P2)

**File:** `packages/visual-editor/src/components/StructureView.tsx:124-133`

**Problem:** Deep expansions emit hundreds of containment-nested nodes; React Flow renders all even when most are off-viewport.

**Fix:** Add `onlyRenderVisibleElements` to `<ReactFlow>`. Test with a `.resources/` CDM fixture to confirm no visual regressions during pan.

**Impact:** Medium perceived perf on deep expansions; trivial fix.

---

## DONE RIGHT (preserve)

From the Opus review, things to keep as the code evolves:
1. `nodeTypes` at module scope — `packages/visual-editor/src/components/nodes/index.ts:17`
2. `ReactFlowProvider` placement — wraps inner subtree only
3. Read-only flags explicit — `nodesDraggable/Connectable/elementsSelectable={false}`
4. `cellComponents` memoized at call site
5. Path-aware size cache with cycle-protection docstrings
6. All node components `memo`'d
7. Exhaustive switch with `_exhaustive: never`
8. No `Background`/`Controls`/`MiniMap` — Structure View is a viewer

## Source review jobs

- Codex 2nd adversarial: `review-mp93ewds-mc2pw7` (verdict: needs-attention / no-ship; 2 MED findings)
- Opus React Flow review: `agentId a3b6e823700346181` (2 P1 + 3 P2 + 2 nits; 8 done-right call-outs)
