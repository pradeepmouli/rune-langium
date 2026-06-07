# Phase 3C — 34-Action Recipe Migration (waves A–G) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the remaining **28** raw-`set` store actions into Mutative recipes routed through the single `mutateGraph` chokepoint (the 6 `commitEdit` actions already migrated in 3B), so **all 34** source-affecting actions capture id-rooted, field-precise patches uniformly; route every inline edge-construction template through `node-projection.ts`'s `makeEdgeId`/`parseEdgeId`; then retire the transitional `set`-interceptor once native capture is universal.

**Architecture:** Per-wave conversion behind the green suite (spec §5 Phase 2). Each action's `set((state)=>…)` body becomes a `(draft)=>{ … }` recipe mutating `draft.nodesById`/`draft.edgesById` Maps; `mutateGraph` captures the patches and re-derives the arrays. Edge construction moves from inline template literals to `makeEdgeId`. Node+edge actions (`setEnumParent`, `addChoiceOption`, `removeChoiceOption`, `updateInputParam`, `setInheritance`) mutate both Maps in one recipe. The structural wave (`createType`, `deleteType`, `renameType`, `setInheritance`) is last and most delicate — `renameType` re-keys a Map entry and rebuilds edge ids, replacing the unsafe double-`.replace` surgery.

**Tech Stack:** TypeScript 5.9 (strict, ESM/NodeNext), zustand 5, Mutative, zundo 2, vitest. `@rune-langium/visual-editor` (MIT).

**Depends on:** 3B merged (`mutateGraph`, `updateGraphView`, Map state, the 6 migrated actions, the transitional interceptor). Works with either `::` (pre-3A′) or `.` (post-3A′) node ids — recipes are separator-agnostic; edges go through `makeEdgeId`. **Out of scope:** the generated domain surface + domain repository (3D).

---

## Critical constraints

1. **Behavior-preserving per action.** Each recipe must produce the same resulting `nodes`/`edges` as the old raw `set`. The existing ~1131 VE + ~878 studio tests (esp. `editor-store-actions.test.ts` + the per-editor form tests) are the net — run the **whole** VE package suite after each wave, then the studio suite.
2. **Edges via `node-projection`.** Replace every inline `` `${src}--${kind}--…--${tgt}` `` with `makeEdgeId(kind, { source, target, label? })`. Edge *removal* by predicate becomes a keyed `draft.edgesById.delete(id)` (find the id first, or filter then re-key). The React-Flow `type` field vs `data.kind` distinction is real (`setInheritance` sets `type:'inheritance'`, `data.kind:'extends'`) — preserve both exactly.
3. **`parseEpoch` unchanged; non-graph state via `extra`.** Actions that also set `selectedNodeId`/`validationErrors` (e.g. `deleteType`, `renameType`) pass those through `mutateGraph`'s `extra` param, NOT inside the recipe.
4. **`mutateGraph` no-op guard.** A recipe that produces zero patches and no `extra` leaves state untouched (preserves the existing stale-`parentId` abort semantics of `setInheritance`/`setEnumParent` — instead of `return state`, the recipe simply does nothing on the abort path).
5. **`createType` becomes patch-captured.** Today it is not (a reparse wipes a just-created node). After conversion it captures an id-rooted add patch. Keep the `nodeCounter` positioning side-effect OUT of the recipe (compute the position before, pass the built node in).
6. **Validation:** `pnpm --filter @rune-langium/visual-editor test`, `… run type-check`, `pnpm --filter @rune-langium/studio test`, `pnpm run lint`. Use `rg`. Commits `SKIP_SIMPLE_GIT_HOOKS=1`, end `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Branch `feat/phase3c-action-recipes` off the 3B merge.

## Current-state map (ground-truth audit 2026-06-06, `editor-store.ts`)

- **Already migrated in 3B (6):** `addAttribute:1121`, `removeAttribute:1168`, `updateAttributeType:1191`, `renameAttribute:1281`, `updateCardinality:1322`, `updateAttribute:1400`.
- **To convert (28), with risk:**
  - **Wave A remainder:** `reorderAttribute:1446` (node-only splice).
  - **Wave B Enum:** `addEnumValue:1468`, `removeEnumValue:1490`, `updateEnumValue:1504`, `reorderEnumValue:1520` (node-only); `setEnumParent:1538` (node+`enum-extends` edge — HIGH).
  - **Wave C Choice:** `addChoiceOption:1577` (node+`choice-option` edge — HIGH), `removeChoiceOption:1617` (node+edge filter).
  - **Wave D Function:** `addInputParam:1638`, `removeInputParam:1666`, `reorderInputParam:1759`, `updateOutputType:1777`, `updateExpression:1809` (node-only; `updateExpression` writes `operations[0].expression.$cstText` + `expressionText`); `updateInputParam:1680` (node+`attribute-ref` edge — HIGH, callback `:1689-1756`).
  - **Wave E Conditions:** `addCondition:1844`, `reorderCondition:1916` (node-only); `removeCondition:1875`, `updateCondition:1889` (merged conditions+postConditions index surgery — MEDIUM).
  - **Wave F Metadata:** `updateDefinition:1935`, `updateComments:1941`, `addSynonym:1947`, `removeSynonym:1968`, `addAnnotation:1983`, `removeAnnotation:1999` (all node-only, trivial).
  - **Wave G Structural:** `createType:996` (insert node, `nodeCounter` side-effect, NOT captured today), `deleteType:1057` (remove node + ALL incident edges + `selectedNodeId`), `setInheritance:1336` (node+`extends` edge, stale-parent abort, `disambiguateTypeRef`), `renameType:1065` (CRITICAL — re-keys node id, cascades `updateTypeRefsInNode` across all nodes, rebuilds all edge ids via double `.replace`).
- **Edge formats (inline today):** `attribute-ref`=`${src}--attribute-ref--${attr}--${tgt}`; `choice-option`=`${src}--choice-option--${type}--${tgt}`; `extends`=`${child}--extends--${parent}`; `enum-extends`=`${node}--enum-extends--${parent}`. All map onto `makeEdgeId`.

---

## Task 1: Wave A remainder — `reorderAttribute`

**Files:** Modify `editor-store.ts` (`reorderAttribute:1446`); extend `test/store/editor-store-actions.test.ts`.

> Establishes the array-splice recipe pattern reused by every `reorder*`/`add*`/`remove*` action.

- [ ] **Step 1: Add a patch-shape assertion** to the existing reorder test: after `reorderAttribute`, assert a patch path begins `['nodesById', nodeId, 'data', 'attributes', …]`.
- [ ] **Step 2: Run, confirm the new assertion FAILs** (still raw `set`, no patch).
- [ ] **Step 3: Convert** the body to a recipe:
```ts
reorderAttribute(nodeId, fromIndex, toIndex) {
  mutateGraph(set, get, (draft) => {
    const n = draft.nodesById.get(nodeId);
    const d = n?.data as AnyGraphNode | undefined;
    if (!d || (d.$type !== 'Data' && d.$type !== 'Annotation')) return;
    const attrs = (d as { attributes?: unknown[] }).attributes;
    if (!Array.isArray(attrs)) return;
    const [moved] = attrs.splice(fromIndex, 1);
    if (moved !== undefined) attrs.splice(toIndex, 0, moved);
  });
}
```
(Mutative tracks the in-place `splice` on the draft and emits index-precise patches.)
- [ ] **Step 4: Run** the whole VE suite + studio suite + type-check. Green.
- [ ] **Step 5: Commit** — `refactor(ve): Wave A — reorderAttribute → mutateGraph recipe`.

---

## Task 2: Wave B — Enum (5 actions)

**Files:** Modify `editor-store.ts` (`addEnumValue`, `removeEnumValue`, `updateEnumValue`, `reorderEnumValue`, `setEnumParent`); extend the enum test files (`EnumForm.test.tsx`, `editor-store-actions.test.ts`).

- [ ] **Step 1: Add/extend tests** — a node-only enum patch (e.g. `addEnumValue` → `['nodesById', id, 'data', 'enumValues', …]`) AND a `setEnumParent` test asserting BOTH a node patch (`data.parent`) and an `enum-extends` edge patch (`['edgesById', edgeId, …]`), plus the parent-cleared path removing the edge.
- [ ] **Step 2: Run, confirm FAIL.**
- [ ] **Step 3: Convert the 4 node-only enum actions** (mirror Task 1 over `enumValues`).
- [ ] **Step 4: Convert `setEnumParent`** (node + edge in one recipe; abort = no-op):
```ts
setEnumParent(nodeId, parentId) {
  const state = get();
  const parentNode = parentId ? state.nodesById.get(parentId) : null;
  const parentName = (parentNode?.data as AnyGraphNode | undefined)?.name as string | undefined;
  const parentRef = parentName ? ({ ref: { name: parentName }, $refText: parentName } as never) : undefined;
  mutateGraph(set, get, (draft) => {
    const n = draft.nodesById.get(nodeId);
    const d = n?.data as AnyGraphNode | undefined;
    if (d?.$type !== 'RosettaEnumeration') return;
    (d as { parent?: unknown }).parent = parentRef;
    // remove any existing enum-extends edge from this source
    for (const [id, e] of draft.edgesById) {
      if (e.source === nodeId && e.data?.kind === 'enum-extends') draft.edgesById.delete(id);
    }
    if (parentId) {
      const id = makeEdgeId('enum-extends', { source: nodeId, target: parentId });
      draft.edgesById.set(id, {
        id, source: nodeId, target: parentId, type: 'enum-extends',
        data: { kind: 'enum-extends', label: 'extends' } as EdgeData
      } as TypeGraphEdge);
    }
  });
}
```
Import `makeEdgeId` from `./node-projection.js`. Read the current `setEnumParent` (`:1538`) to confirm the `parentRef` shape and the `type` field value match exactly.
- [ ] **Step 5: Run** whole VE + studio suites + type-check. Green.
- [ ] **Step 6: Commit** — `refactor(ve): Wave B — enum actions → recipes; setEnumParent edge via makeEdgeId`.

---

## Task 3: Wave C — Choice (2 actions, both node+edge)

**Files:** Modify `editor-store.ts` (`addChoiceOption:1577`, `removeChoiceOption:1617`); extend `ChoiceForm.test.tsx` / actions test.

- [ ] **Step 1: Add tests** — `addChoiceOption` asserts a node patch (`data.attributes` push) + a `choice-option` edge patch when a target exists, and node-only when the target is absent; `removeChoiceOption` asserts both the attribute removal and the edge removal keyed by `data.label === typeName`.
- [ ] **Step 2: Run, confirm FAIL.**
- [ ] **Step 3: Convert `addChoiceOption`** (target lookup against the Maps, before the recipe):
```ts
addChoiceOption(nodeId, typeName, newOption) {
  const targetId = [...get().nodesById.values()].find(
    (n) => (n.data as AnyGraphNode).name === typeName
  )?.id;
  mutateGraph(set, get, (draft) => {
    const n = draft.nodesById.get(nodeId);
    const d = n?.data as AnyGraphNode | undefined;
    if (d?.$type !== 'Choice') return;
    ((d as { attributes?: unknown[] }).attributes ??= []).push(newOption);
    if (targetId) {
      const id = makeEdgeId('choice-option', { source: nodeId, target: targetId, label: typeName });
      draft.edgesById.set(id, {
        id, source: nodeId, target: targetId, type: 'choice-option',
        data: { kind: 'choice-option', label: typeName } as EdgeData
      } as TypeGraphEdge);
    }
  });
}
```
- [ ] **Step 4: Convert `removeChoiceOption`** — remove the option (`filter` by `typeCall?.type?.$refText !== typeName` becomes an in-place splice on the draft array) and delete the matching `choice-option` edge(s) by predicate (`source===nodeId && data.kind==='choice-option' && data.label===typeName`).
- [ ] **Step 5: Run** whole VE + studio suites. Green.
- [ ] **Step 6: Commit** — `refactor(ve): Wave C — choice actions → recipes (node+edge)`.

---

## Task 4: Wave D — Function (6 actions)

**Files:** Modify `editor-store.ts` (`addInputParam`, `removeInputParam`, `updateInputParam:1680`, `reorderInputParam`, `updateOutputType`, `updateExpression`); extend `FunctionForm.test.tsx` / actions test.

- [ ] **Step 1: Add tests** — node-only patches for the 5 simple ones (incl. `updateExpression` writing both `operations[0].expression.$cstText` and `expressionText`), and `updateInputParam` asserting a node patch (`data.inputs[*]`) + the `attribute-ref` edge delete/add.
- [ ] **Step 2: Run, confirm FAIL.**
- [ ] **Step 3: Convert the 5 node-only function actions** (mirror the splice/assign pattern over `inputs` / `output.typeCall` / `operations`).
- [ ] **Step 4: Convert `updateInputParam`** (read its full `:1689-1756` body first): in the recipe, update the input entry in place; then reconcile its `attribute-ref` edge — delete the old edge for this input, and conditionally add the new one via `makeEdgeId('attribute-ref', { source: nodeId, target: targetNodeId, label: newName })`. Compute any target lookup against the Maps before the recipe.
- [ ] **Step 5: Run** whole VE + studio suites. Green.
- [ ] **Step 6: Commit** — `refactor(ve): Wave D — function actions → recipes; updateInputParam edge via makeEdgeId`.

---

## Task 5: Wave E — Conditions (4 actions, merged-index surgery)

**Files:** Modify `editor-store.ts` (`addCondition:1844`, `removeCondition:1875`, `updateCondition:1889`, `reorderCondition:1916`); extend the conditions test.

> `removeCondition`/`updateCondition` index into a **merged** `[...conditions, ...postConditions]` then re-split. Preserve that mapping exactly inside the recipe — the index→(array, localIndex) resolution must be byte-identical.

- [ ] **Step 1: Add tests** — assert a representative condition edit patches the correct array (`data.conditions` vs `data.postConditions`) at the correct local index, including a case where the merged index lands in `postConditions`.
- [ ] **Step 2: Run, confirm FAIL.**
- [ ] **Step 3: Convert `addCondition`/`reorderCondition`** (node-only over `conditions`).
- [ ] **Step 4: Convert `removeCondition`/`updateCondition`** — port the merged-index resolution into the recipe (compute `conditions.length` to decide which array the incoming index targets, then splice/assign in place on the draft). Read `:1875-1914` to copy the exact split logic.
- [ ] **Step 5: Run** whole VE + studio suites. Green.
- [ ] **Step 6: Commit** — `refactor(ve): Wave E — condition actions → recipes (merged-index preserved)`.

---

## Task 6: Wave F — Metadata (6 trivial node-only actions)

**Files:** Modify `editor-store.ts` (`updateDefinition`, `updateComments`, `addSynonym:1947`, `removeSynonym`, `addAnnotation`, `removeAnnotation`); extend the metadata test.

> All six are simple field/array writes on a single node — the lowest-risk wave. `addSynonym` is type-dispatched (`RosettaClassSynonym` vs `RosettaSynonym`) — preserve the shape choice.

- [ ] **Step 1: Add one patch-shape assertion** (e.g. `updateComments` → `['nodesById', id, 'data', 'comments']`).
- [ ] **Step 2: Run, confirm FAIL.**
- [ ] **Step 3: Convert all six** — each `mutateGraph(set,get,draft=>{ const d = draft.nodesById.get(id)?.data; if(!d) return; /* assign field or push/splice array */ })`. Keep `addSynonym`'s type dispatch.
- [ ] **Step 4: Run** whole VE + studio suites. Green.
- [ ] **Step 5: Commit** — `refactor(ve): Wave F — metadata actions → recipes`.

---

## Task 7: Wave G — Structural (`createType`, `deleteType`, `setInheritance`, `renameType`)

**Files:** Modify `editor-store.ts` (`createType:996`, `deleteType:1057`, `setInheritance:1336`, `renameType:1065`); extend `editor-store-actions.test.ts` with structural + reorder-safety tests.

> The riskiest wave. `renameType` is the single hardest action: it changes a node's **own id** (a Map re-key), cascades type refs across all nodes, and rebuilds every incident edge id — today via an unsafe double `.replace`. Convert it to `parseEdgeId`/`makeEdgeId` + Map re-keying. Do `createType`/`deleteType`/`setInheritance` first to validate the structural recipe shape, then `renameType` last.

- [ ] **Step 1: Tests first**
  - `createType`: after create + a reparse that does NOT include the new node, with the new node's add-patch in flight, assert the node survives the reparse (proves it is now patch-captured — the bug fix).
  - `deleteType`: assert the node and ALL incident edges (every kind) are gone and `selectedNodeId` cleared if it was the deleted node.
  - `renameType`: (a) node re-keyed under the new id, old key absent; (b) all incident edges re-keyed (ids + source/target/label); (c) `typeCall.$refText` cascaded in referencing nodes; (d) **reorder safety** — perform a rename, then a reparse whose node array is reordered, and assert replay targets the renamed node correctly.
- [ ] **Step 2: Run, confirm FAIL.**
- [ ] **Step 3: Convert `createType`** — build the node + position OUTSIDE the recipe (keep `nodeCounter`), then:
```ts
createType(kind, name, namespace) {
  const nodeId = makeNodeId(namespace, name);
  nodeCounter++;
  const newNode = buildNewTypeNode(kind, name, namespace, nodeCounter); // extract the baseData switch into a helper
  mutateGraph(set, get, (draft) => { draft.nodesById.set(nodeId, newNode); });
  return nodeId;
}
```
Extract the `baseData` kind-switch (`:1004-1054`) into a `buildNewTypeNode` helper for clarity (DRY; it is node-shape construction — consider whether it belongs in `node-projection.ts`, but a local helper is fine if it carries view metadata). The action still returns `nodeId`.
- [ ] **Step 4: Convert `deleteType`** (incident edges by predicate; `selectedNodeId` via `extra`):
```ts
deleteType(nodeId) {
  const clearsSelection = get().selectedNodeId === nodeId;
  mutateGraph(set, get, (draft) => {
    draft.nodesById.delete(nodeId);
    for (const [id, e] of draft.edgesById) {
      if (e.source === nodeId || e.target === nodeId) draft.edgesById.delete(id);
    }
  }, clearsSelection ? { selectedNodeId: null } : undefined);
}
```
- [ ] **Step 5: Convert `setInheritance`** — node `superType` ref (via `disambiguateTypeRef`, computed before the recipe against the Maps) + `extends` edge delete/add via `makeEdgeId`; the stale-`parentId` case becomes a recipe no-op (don't touch the draft) instead of `return state`. Preserve `type:'inheritance'` + `data.kind:'extends'`.
- [ ] **Step 6: Convert `renameType`** (the critical one) — read `:1065-1119` and `updateTypeRefsInNode` first:
```ts
renameType(nodeId, newName) {
  const state = get();
  const target = state.nodesById.get(nodeId);
  if (!target) return;
  const oldName = (target.data as AnyGraphNode).name as string;
  const namespace = (target.data as AnyGraphNode).namespace as string;
  const newNodeId = makeNodeId(namespace, newName);
  const reselect = state.selectedNodeId === nodeId ? newNodeId : state.selectedNodeId;
  mutateGraph(set, get, (draft) => {
    // 1. Re-key the renamed node (delete old, insert new id + name)
    const n = draft.nodesById.get(nodeId);
    if (!n) return;
    draft.nodesById.delete(nodeId);
    draft.nodesById.set(newNodeId, { ...n, id: newNodeId, data: { ...n.data, name: newName } });
    // 2. Cascade typeCall refs in every OTHER node
    for (const [id, other] of draft.nodesById) {
      if (id === newNodeId) continue;
      const updated = updateTypeRefsInNode(other.data as AnyGraphNode, oldName, newName);
      if (updated !== other.data) draft.nodesById.set(id, { ...other, data: updated });
    }
    // 3. Re-key every incident edge via parse/rebuild (NOT string .replace)
    for (const [id, e] of [...draft.edgesById]) {
      const touches = e.source === nodeId || e.target === nodeId || e.data?.label === oldName;
      if (!touches) continue;
      const parsed = parseEdgeId(id);                       // {kind, source, target, label?}
      if (!parsed) continue;
      const source = parsed.source === nodeId ? newNodeId : parsed.source;
      const targetId = parsed.target === nodeId ? newNodeId : parsed.target;
      const label = parsed.label === oldName ? newName : parsed.label;
      const newEdgeId = makeEdgeId(parsed.kind, { source, target: targetId, label });
      draft.edgesById.delete(id);
      draft.edgesById.set(newEdgeId, {
        ...e, id: newEdgeId, source, target: targetId,
        data: e.data ? { ...e.data, label } : e.data
      });
    }
  }, reselect !== state.selectedNodeId ? { selectedNodeId: reselect } : undefined);
}
```
Import `parseEdgeId`/`makeEdgeId`/`makeNodeId` from `./node-projection.js`. **Delete** the old `e.id.replace(nodeId, newNodeId).replace(oldName, newName)` surgery. Note the Map re-key (delete+set) produces remove+add patches — the reorder-safety test (Step 1d) proves replay handles a rename-before-reparse.
- [ ] **Step 7: Run** the whole VE suite + studio suite + type-check. Green. **This wave is where the suite earns its keep** — investigate any structural-graph or reconcile failure carefully (the `renameType` re-key is the §7 highest-risk path).
- [ ] **Step 8: Commit** — `refactor(ve): Wave G — structural actions → recipes; renameType Map re-key replaces .replace surgery`.

---

## Task 8: Retire the transitional interceptor + `rune/no-raw-edge-id` lint + net-LOC verification

**Files:** Modify `editor-store.ts` (remove the 3B `set`-interceptor); `oxlint-plugins/rune.mjs` + `.oxlintrc.json` (the edge-id lint, if not already added in 3A′); full sweep.

- [ ] **Step 1: Remove the transitional `set`-interceptor** (3B Task 2) now that all 34 actions author Maps natively via `mutateGraph`/`updateGraphView`. The store's raw `set` is used only by the chokepoints + non-graph writes. Verify no remaining action writes `nodes`/`edges` arrays directly:
```
rg -n "set\(\(state\)|set\(\{[^}]*\bnodes:" packages/visual-editor/src/store/editor-store.ts
```
Any hit (outside `mutateGraph`/`updateGraphView`/`loadModels` re-derivation) is an un-migrated action — convert it.
- [ ] **Step 2: Add `rune/no-raw-edge-id`** (spec §6 #7) — flag inline `` `--attribute-ref--` ``/`` `--choice-option--` ``/`` `--extends--` ``/`` `--enum-extends--` ``-style templates outside `node-projection.ts`. Mirror the existing `rune/no-raw-node-kind-lookup` rule; one `meta.name` per file (collision gotcha, memory `reference_oxlint_rune_plugin`). Wire it in the visual-editor `.oxlintrc.json`. (If 3A′ already added `rune/no-raw-node-id`, this is its sibling.)
- [ ] **Step 3: Full verification + net-LOC check** — report exact counts:
```
pnpm --filter @rune-langium/visual-editor test
pnpm --filter @rune-langium/visual-editor run type-check
pnpm --filter @rune-langium/studio test
pnpm run lint
```
All green. Then confirm the consolidation removed the inline duplication (spec §8 #3 net-less-code):
```
rg -n "--attribute-ref--|--choice-option--|--extends--|--enum-extends--" packages/visual-editor/src   # only node-projection.ts + tests
rg -n "\.replace\(nodeId|--attribute-ref--\$\{oldName\}" packages/visual-editor/src                     # gone (renameType/renameAttribute surgery retired)
rg -c "mutateGraph\(" packages/visual-editor/src/store/editor-store.ts                                  # ~28+ recipe call sites
```
Report the diff stat (the migration should be net-negative LOC: deleting 28 raw `set` bodies + inline edge templates + the interceptor, minus the recipe bodies).
- [ ] **Step 4: Commit** — `refactor(ve): retire transitional interceptor + no-raw-edge-id lint; all 34 actions captured`.

---

## Self-review checklist (performed during plan authoring)

**Spec coverage (§3.3, §4, §5 Phase 2 waves A–G, §6, §8 #1/#3):** all 28 remaining actions are assigned to a wave/task with their exact audited lines; the 6 already-migrated are noted as 3B-done. Edge construction routed through `makeEdgeId` everywhere (§3.2 V3). `createType` becomes patch-captured (§8 #1 — "an in-flight edit from ANY action survives a stale reparse"). The interceptor retires (§5 "remove it once all 34 are recipes").

**Risk handling:** the five node+edge actions (`setEnumParent`, `addChoiceOption`, `removeChoiceOption`, `updateInputParam`, `setInheritance`) get explicit dual-Map recipes. `renameType` (§7 highest-risk) gets a full Map-re-key recipe replacing the unsafe double `.replace`, with a reorder-safety test as the proof. The merged conditions-index surgery (Wave E) is explicitly preserved. Each wave runs the WHOLE VE + studio suite (memory: sibling tests assert old behavior; a curated subset misses regressions).

**Wave ordering:** trivial node-only waves (A-rem, F) and the node+edge waves (B, C, D) precede the structural wave (G) so the recipe pattern is validated on low-risk actions before the `renameType` re-key. Within G, `createType`/`deleteType`/`setInheritance` precede `renameType`.

**Placeholder scan:** the high-risk recipes (`setEnumParent`, `addChoiceOption`, `createType`, `deleteType`, `renameType`) are given in full; the trivial waves reference the established splice/assign pattern + exact lines rather than repeating near-identical code (the implementer reads the audited line to copy the precise field/shape). Each "read the current body first" instruction targets a specific line range — a guard against shape drift (`parentRef`, `type` field, type-dispatch), not vagueness.

**Type consistency:** every recipe is `(draft: { nodesById: Map; edgesById: Map }) => void` matching `GraphEditRecipe` from 3B; `mutateGraph(set,get,recipe,extra?)` signature is used identically throughout; `extra` carries `selectedNodeId`/`validationErrors` (never the recipe). Edge objects keep the `type` (React-Flow) vs `data.kind` distinction.
