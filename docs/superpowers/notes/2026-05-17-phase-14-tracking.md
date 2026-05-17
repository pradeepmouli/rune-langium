# Phase 14 — Structure View follow-up tracking

**Created:** 2026-05-17
**Base:** master @ `c1c1716e` (after PR #191 — Phase 13 adversarial fixes merged)
**Source reviews:** Codex 2nd adversarial-review (job `review-mp93ewds-mc2pw7`) + Opus React Flow code review on PR #191

This doc captures 8 findings from the two reviews run on PR #191. They were intentionally deferred from #191 to keep that PR reviewable (#191 already had 10 commits across 3 review rounds). Each finding here has a clear file:line reference, severity, recommended fix, and a sequencing suggestion so the work can be picked up in focused chunks.

## Summary

| # | Severity | Category | Title | Decision needed? |
|---|---|---|---|---|
| C | P1 | RF perf / correctness | Data identity churns on every edit → all DataNode rerender | No — clean refactor |
| D | P1 | Design conflict | Per-instance duplicate types share one expansion key | **YES** — per-instance vs shared semantics |
| A | MED | Contract inconsistency | Choice roots: EditorPage allows, StructureView rejects | **YES** — narrow gating OR wire Choice root rendering |
| B | MED | Contract inconsistency | Choice arms terminal & read-only despite editable target data | **YES** — defer explicitly OR wire arm parity |
| E | P2 | RF UX | `fitView` runs every layout pass → viewport resets on edits | No — clean refactor |
| F | P2 | RF perf / a11y | Decorative Handles in structure mode waste DOM | No — gate by variant |
| G | P2 | RF latent | Top-level `width`/`height` on node; RF12 uses `style.*`/`measured` | No — preventive fix |
| H | P2 | RF perf | `onlyRenderVisibleElements` not set on deep expansions | No — single prop |
| (nit) | — | RF | `useNavigation` called in structure variant but values unused | Bundle with C |
| (nit) | — | RF | Full `expansionMap` passed to each DataNode (could be per-row slice) | Bundle with C |

## Recommended sequencing

**Phase 14a — Decisions** (1 conversation, no code):
- Resolve D (expansion semantics): per-instance or shared
- Resolve A + B (Choice scope): narrow EditorPage gating to Data-only, OR wire Choice root + arm parity
- Pick from the 3 doable-now items: C + E + F + G + H

**Phase 14b — Easy wins** (1 PR, ~half-day):
- E (imperative fitView on focus change only)
- F (gate Handles by variant)
- G (style.width/height)
- H (onlyRenderVisibleElements)
- Plus: regression test that mounts a 20-node expansion and asserts no fitView re-fire on chevron click

**Phase 14c — Data identity refactor** (1 PR, ~half-day):
- C (hoist cellComponents/expansionMap/onToggleExpansion to React context, hook reads in DataNode/GroupContainerNode)
- Nit consolidation (slice expansionMap per-row at the boundary)
- Performance test that asserts a single-cell edit re-renders ≤1 DataNode (not all)

**Phase 14d — Per-instance expansion semantics** (1 PR, design-dependent size):
- D fix: implementation depends on decision in 14a
- If per-instance: extend StructureExpansionKey with an instance-path discriminator, update layout to emit per-instance keys, update store persistence shape
- If shared: keep current behavior, update Phase 13 docstrings + add a test that asserts "click on one Party instance expands all", remove the per-edge instance-id docstring's claim of "drills into its own copy"

**Phase 14e — Choice parity** (1 PR per direction):
- Direction 1 (narrow): EditorPage drops Choice/Enum from `focusedTypeId` derivation; NamespaceExplorer nav button disabled on non-Data rows; CHANGELOG narrows
- Direction 2 (wire): StructureView accepts Choice roots; ChoiceNode receives cellComponents + expansion props; ChoiceNode renders chevron for arms whose target is expandable; arm expansion key contract

## Detail per finding

### C — Data identity churns on every edit (P1)

**Files:** `packages/visual-editor/src/components/StructureView.tsx:110-120`, `apps/studio/src/pages/EditorPage.tsx:1393-1396`

**Problem:** The useMemo in `StructureFlowInner` rebuilds the React Flow node `data` payload on every layout pass (which fires on every edit, since `storeNodes` invalidates on any mutation). React Flow shallow-compares `node.data` for rerender decisions, so every keystroke in a single NameCell rerenders every visible DataNode/GroupContainerNode.

**Fix:** Hoist `cellComponents`/`expansionMap`/`onToggleExpansion` to a `StructureCellContext` provider inside `StructureFlowInner`. DataNode/GroupContainerNode read via `useContext`. Layout's `result.nodes` is returned untouched. Each node's `data` identity stays stable across edits that don't touch its row set.

**Alternative:** WeakMap keyed off the canonical StructureNode identity, returning the same augmented data object across rerenders.

**Impact:** Medium perceived perf on large schemas (CDM `Trade` expanded 3 deep ≈ dozens of nodes re-render on every keystroke). Correctness unaffected.

---

### D — Per-instance duplicate types share one expansion key (P1, design conflict)

**Files:** `packages/visual-editor/src/components/nodes/DataNode.tsx:112-115`, `packages/visual-editor/src/layout/structure-layout.ts:339-341`

**Problem:** Phase 13's per-edge instance ids give each placement of `Party` a unique React Flow node id (`Trade::buyer::Party`, `Trade::seller::Party`). Both render the same `<DataNode>` with the same `namespaceUri` + `name` + row's `attrName`. The chevron's `rowKey` is therefore identical across instances:
```ts
const rowKey = { namespaceUri: ownerNamespaceUri, typeId: ownerTypeName, attrName: row.attrName };
```
Click on `buyer.Party.address` chevron → flips the same map entry that drives `seller.Party.address`. Both subtrees expand together.

**Design question:** Is this the intended contract?
- **Per-instance** — Phase 13 finding 2's stated intent ("each expanded row should visibly drill into its own copy"). Needs: expansion key includes instance path; store persistence key includes instance discriminator.
- **Shared** — current behavior; consistent with store's "expansion is per-type, not per-instance" persistence contract. Needs: docstring fix to drop the "drills into its own copy" claim; explicit test for coupled-expansion behavior; CHANGELOG entry calling out the UX.

**Recommendation:** Pick shared (smaller blast radius, matches store contract) unless the CDM user feedback explicitly wants per-instance.

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

### E — `fitView` re-runs on every layout pass (P2 — NEEDS VERIFICATION)

**File:** `packages/visual-editor/src/components/StructureView.tsx:124-128`

**Opus reviewer claim:** `<ReactFlow fitView ... />` is sticky — re-fits on substantial node-set change. Combined with C, every keystroke can re-fit the viewport, jumping scroll/zoom. Every chevron click also re-fits.

**Codex challenge (PR #193 review):** Per RF12 docs, `fitView` prop fits the INITIAL nodes only; `fitViewOptions` customizes that initial call. Subsequent controlled `nodes` updates do NOT auto-refit. If correct, Phase 14b would spend work on a non-existent bug.

**Verification needed BEFORE code:** mount the studio, open Structure View, expand a row, edit a cell — observe whether the viewport jumps. If it doesn't, drop E entirely; the only thing to track is the fitView-as-prop-vs-imperative-call style choice (negligible).

**If verified bug-fix is:** Drop the `fitView` prop. Add an inner component that calls `fitView()` imperatively via `useReactFlow` inside `useEffect` keyed on `focusedTypeId` only:
```tsx
function FitOnFocus({ focusedTypeId }: { focusedTypeId: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => { void fitView({ padding: 0.2, duration: 200 }); }, [focusedTypeId, fitView]);
  return null;
}
```
Mount inside `StructureFlowInner` (already inside the Provider).

**Impact (if real):** UX — viewport state thrash on every interaction.

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
