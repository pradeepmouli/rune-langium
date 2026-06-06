# Phase 3B — Maps-as-SoT Substrate + `mutateGraph` Chokepoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `nodesById: Map<string,TypeGraphNode>` / `edgesById: Map<string,TypeGraphEdge>` as the canonical edit substrate of the visual-editor store, keep `nodes[]`/`edges[]` as **derived** render caches (invariant I1: `nodes === [...nodesById.values()]`), generalize `commitEdit` into one `mutateGraph(set,get,recipe,extra?)` chokepoint, add a separate non-capturing `updateGraphView` path for positions (invariant I2: patches never carry `position`), and route `loadModels`/reconcile/zundo through the Maps — **without converting the 28 raw-`set` actions yet** (that is 3C).

**Architecture:** Maps become source-of-truth; arrays are re-derived once per Map change (not per render) so React Flow gets a stable array reference. The 6 existing `commitEdit` actions migrate to `mutateGraph` (no behavior change — they already capture patches). The other 28 actions keep authoring arrays during 3B; a **transitional `set`-interceptor** re-derives the Maps after any array-touching write so I1 holds mid-migration. `updateGraphView` handles drag/layout without capturing patches or bumping `parseEpoch`. The generic id→entity index primitive is lifted to `@rune-langium/core` (`indexById`/`fromIndex`) and `node-projection.ts` re-exports it; the non-editor ad-hoc id-map sites adopt it too.

**Tech Stack:** TypeScript 5.9 (strict, ESM/NodeNext), zustand 5, zundo 2, Mutative (`create`/`apply`/`Patches`), React 19, vitest. `@rune-langium/core` (MIT) resolves from source via project references; `@rune-langium/visual-editor` (MIT).

**Depends on:** 3A merged (node-projection owns V1–V6 incl. `toNodesById`/`nodesFromMap`/`buildNodeMap` delegation). 3A′ may land before or after 3B (orthogonal — 3B doesn't care about the separator value). **Out of scope:** the 34-action recipe migration (3C); the generated domain surface + domain repository (3D).

---

## Critical constraints

1. **Invariant I1 (sync):** `state.nodes` is *always* `nodesFromMap(state.nodesById)` and `state.edges` is `edgesFromMap(state.edgesById)`, re-derived **once per Map change**. Arrays are NEVER hand-assembled into `set` except via re-derivation.
2. **Invariant I2 (no view state in patches):** patch paths are rooted at `nodesById`/`edgesById`, field-precise, and never contain `position`. Position/layout go through `updateGraphView` (no patch capture, no `parseEpoch` bump).
3. **`parseEpoch` contract preserved.** `mutateGraph` does NOT bump `parseEpoch` (USER-origin). `loadModels` bumps it +1 and clears `pendingEditPatches` (ONE-SHOT) — unchanged behavior. The `useModelSourceSync` PARSE-origin gate (`:121-146`) is untouched.
4. **`pendingEditPatches` stays OUT of undo history** (it is in-flight intent, not state). zundo `partialize` tracks the Maps, not the patches.
5. **28 actions stay array-authored in 3B.** Do NOT convert them to recipes here. The transitional `set`-interceptor keeps their writes I1-consistent. 3C removes the need for it.
6. **Validation:** `pnpm --filter @rune-langium/core test`, `pnpm --filter @rune-langium/visual-editor test`, `… run type-check`, `pnpm --filter @rune-langium/studio test`, `pnpm run lint`. Use `rg`. Commits `SKIP_SIMPLE_GIT_HOOKS=1`, end `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Branch `feat/phase3b-map-substrate` off the 3A merge.

## Current-state map (ground-truth audit 2026-06-06)

- **No Maps in state.** `EditorState` has `nodes: TypeGraphNode[]`, `edges: TypeGraphEdge[]`, `parseEpoch`, `pendingEditPatches: Patches`. Store factory `createEditorStore`; zundo `temporal` imported `editor-store.ts:29`; inline `partialize` `:2401-2407` (NOT the unused `history.ts` `temporalOptions`).
- **`commitEdit`** `editor-store.ts:693` → `commitGraphEdit` (`edit-reconcile.ts:53-60`): runs a `GraphEditRecipe` on `Map` projections via Mutative `enablePatches:true`, returns `{nodes,edges,patches}`, then `set({nodes,edges,pendingEditPatches:[...old,...patches],...extra})`. Zero-patch recipe = full no-op. **6 callers:** `addAttribute:1153`, `removeAttribute:1172`, `updateAttributeType:1259`, `renameAttribute:1303`, `updateCardinality:1324`, `updateAttribute:1426`.
- **`reconcileParse`** returns `{nodes,edges,remainingPatches}` (ARRAYS); `loadModels` makes ONE `set()` after the `isDegradedReparse` guard `return`, hardcodes `pendingEditPatches:[]` (discards `remainingPatches`), bumps `parseEpoch`.
- **Position/view path:** `applyReactFlowNodeChanges:343`, `relayout`, `setLayoutEngine` — raw `set` writing `nodes`, no patch, no epoch.
- **`buildNodeMap`** def `:389`, 7 call sites (`937,2305,2317,2328,2331,2350,2387`) — transient lookup Maps, discarded.
- **Types:** `TypeGraphNode`/`TypeGraphEdge` `types.ts:594-595` (`Node<AnyGraphNode>`/`Edge<EdgeData>` from `@xyflow/react`). `Patches` from `mutative` (`editor-store.ts:59`; `edit-reconcile.ts:25` imports `create, apply, Patches, Patch`).
- **zundo Maps caveat:** zundo compares snapshot fields by reference; Maps need an explicit `equality` or every new-Map `set` registers as a history entry.

---

## Task 1: Lift the generic id→entity index primitive to `@rune-langium/core`

**Files:**
- Create: `packages/core/src/collections/index-by-id.ts`
- Create: `packages/core/test/collections/index-by-id.test.ts`
- Modify: `packages/core/src/index.ts` (export)
- Modify: `packages/visual-editor/src/store/node-projection.ts` (re-point `toNodesById`/`nodesFromMap`/`toEdgesById`/`edgesFromMap` to delegate; re-export the primitive)

> Decision (2026-06-06): the index primitive is core, shared with the non-editor ad-hoc id-map sites (Task 7). `node-projection.ts`'s typed wrappers stay (they pin `TypeGraphNode`/`TypeGraphEdge`) but delegate to the core generic.

- [ ] **Step 1: Write the failing core test**

```ts
// packages/core/test/collections/index-by-id.test.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { indexById, fromIndex } from '../../src/collections/index-by-id.js';

describe('indexById / fromIndex', () => {
  it('indexes by .id preserving insertion order', () => {
    const items = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }];
    const map = indexById(items);
    expect(map.get('a')).toBe(items[0]);
    expect([...map.keys()]).toEqual(['a', 'b']);
  });
  it('fromIndex returns values in insertion order', () => {
    const map = new Map([['a', { id: 'a' }], ['b', { id: 'b' }]]);
    expect(fromIndex(map)).toEqual([{ id: 'a' }, { id: 'b' }]);
  });
  it('round-trips', () => {
    const items = [{ id: 'x' }, { id: 'y' }, { id: 'z' }];
    expect(fromIndex(indexById(items))).toEqual(items);
  });
  it('a custom key selector overrides .id', () => {
    const items = [{ key: 'k1' }, { key: 'k2' }];
    expect([...indexById(items, (i) => i.key).keys()]).toEqual(['k1', 'k2']);
  });
});
```

- [ ] **Step 2: Run, confirm FAIL** — `pnpm --filter @rune-langium/core test -- index-by-id`

- [ ] **Step 3: Implement the primitive**

```ts
// packages/core/src/collections/index-by-id.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/** Build an id→item Map, insertion order preserved. Defaults the key to `item.id`. */
export function indexById<T extends { id: string }>(items: readonly T[]): Map<string, T>;
export function indexById<T>(items: readonly T[], key: (item: T) => string): Map<string, T>;
export function indexById<T>(items: readonly T[], key?: (item: T) => string): Map<string, T> {
  const sel = key ?? ((item: T) => (item as unknown as { id: string }).id);
  return new Map(items.map((item) => [sel(item), item]));
}

/** Derive the value array from an id→item Map (insertion order). */
export function fromIndex<T>(map: ReadonlyMap<string, T>): T[] {
  return [...map.values()];
}
```

- [ ] **Step 4: Run, confirm PASS** — `pnpm --filter @rune-langium/core test -- index-by-id`

- [ ] **Step 5: Export from core** — add to `packages/core/src/index.ts`: `export { indexById, fromIndex } from './collections/index-by-id.js';` (match the existing export style; confirm whether a short alias is conventional).

- [ ] **Step 6: Delegate in `node-projection.ts`** — change the four V5/V6 wrappers to delegate (keep the typed signatures so callers stay typed):
```ts
import { indexById, fromIndex } from '@rune-langium/core';
export function toNodesById(nodes: readonly TypeGraphNode[]): Map<string, TypeGraphNode> { return indexById(nodes); }
export function nodesFromMap(map: ReadonlyMap<string, TypeGraphNode>): TypeGraphNode[] { return fromIndex(map); }
export function toEdgesById(edges: readonly TypeGraphEdge[]): Map<string, TypeGraphEdge> { return indexById(edges); }
export function edgesFromMap(map: ReadonlyMap<string, TypeGraphEdge>): TypeGraphEdge[] { return fromIndex(map); }
// optional single import surface:
export { indexById, fromIndex } from '@rune-langium/core';
```

- [ ] **Step 7: Verify** — `pnpm --filter @rune-langium/core test`, `pnpm --filter @rune-langium/visual-editor test`, both `run type-check`. Green.

- [ ] **Step 8: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add packages/core/src/collections/index-by-id.ts packages/core/test/collections/index-by-id.test.ts packages/core/src/index.ts packages/visual-editor/src/store/node-projection.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(core): indexById/fromIndex primitive; node-projection delegates V5/V6

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Add `nodesById`/`edgesById` to state + the transitional `set`-interceptor

**Files:**
- Modify: `packages/visual-editor/src/types.ts` (or wherever `EditorState` lives) — add the two Map fields
- Modify: `packages/visual-editor/src/store/editor-store.ts` (`initialState`, store factory `set` wrap)
- Test: `packages/visual-editor/test/store/map-substrate.test.ts` (new)

> The interceptor is the spec's transitional aid: after any `set` whose partial touches `nodes`/`edges`, re-derive the Maps. This keeps I1 while the 28 actions still author arrays. `mutateGraph` (Task 3) authors Maps directly and re-derives arrays; the interceptor seeing those arrays re-derives equivalent Maps (idempotent — same entries, same order). Remove the interceptor's necessity in 3C.

- [ ] **Step 1: Write the failing I1 test**

```ts
// packages/visual-editor/test/store/map-substrate.test.ts (SPDX MIT header)
import { describe, it, expect } from 'vitest';
import { createEditorStore } from '../../src/store/editor-store.js';

describe('Map substrate (I1 sync)', () => {
  it('nodesById/edgesById mirror the arrays after a raw array write', () => {
    const store = createEditorStore();
    // drive an existing array-authoring action OR load a small model, then:
    const s = store.getState();
    expect([...s.nodesById.values()]).toEqual(s.nodes);
    expect([...s.edgesById.values()]).toEqual(s.edges);
  });
});
```
(Use whatever the store's existing test harness uses to seed a couple of nodes — mirror `editor-store.test.ts` setup.)

- [ ] **Step 2: Run, confirm FAIL** (`nodesById` undefined).

- [ ] **Step 3: Add the fields to `EditorState`**
```ts
nodesById: Map<string, TypeGraphNode>;
edgesById: Map<string, TypeGraphEdge>;
```
Initialize in `initialState` from the initial arrays: `nodesById: toNodesById(initialNodes)`, `edgesById: toEdgesById(initialEdges)` (use the empty arrays the store starts with → empty Maps).

- [ ] **Step 4: Install the interceptor in the store factory**

Wrap zustand's `set` so array writes re-derive Maps. In `createEditorStore`, where the store is created with `(set, get) => ({...})`, introduce a wrapper:
```ts
import { toNodesById, toEdgesById } from './node-projection.js';
// inside the creator:
const rawSet = set;
const set: typeof rawSet = (partial, replace) => {
  rawSet(partial as never, replace as never);
  const next = get();
  // Re-derive Maps iff an array was (re)written and the Map is now stale.
  // Cheap identity check: only rebuild when the array reference changed.
  if (next.nodes !== lastNodesRef || next.edges !== lastEdgesRef) {
    lastNodesRef = next.nodes; lastEdgesRef = next.edges;
    rawSet({ nodesById: toNodesById(next.nodes), edgesById: toEdgesById(next.edges) } as never);
  }
};
```
Track `lastNodesRef`/`lastEdgesRef` in the factory closure (init to the initial arrays). **Caveat to handle:** `mutateGraph` (Task 3) will set Maps AND arrays in one `rawSet` — route `mutateGraph` through `rawSet` directly (NOT the wrapper) to avoid a redundant rebuild, OR accept the idempotent double-derive. Document the choice. Confirm the wrapper does not recurse infinitely (the inner `rawSet` writes only Maps, not arrays, so the ref-check is false on the recursive pass — but the wrapper isn't called recursively since we call `rawSet`, not `set`).

- [ ] **Step 5: Run, confirm PASS** — `pnpm --filter @rune-langium/visual-editor test -- map-substrate`

- [ ] **Step 6: Verify whole suite** — `pnpm --filter @rune-langium/visual-editor test` + `run type-check`. Green (no action converted yet; arrays still authoritative, Maps shadow them).

- [ ] **Step 7: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add packages/visual-editor/src/types.ts packages/visual-editor/src/store/editor-store.ts packages/visual-editor/test/store/map-substrate.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(ve): add nodesById/edgesById state + transitional set-interceptor (I1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `mutateGraph` chokepoint; migrate the 6 `commitEdit` actions

**Files:**
- Modify: `packages/visual-editor/src/store/editor-store.ts` (add `mutateGraph`; re-point the 6 callers; keep or alias `commitEdit`)
- Modify: `packages/visual-editor/src/store/edit-reconcile.ts` (if `commitGraphEdit` is reused)
- Test: `packages/visual-editor/test/store/mutate-graph.test.ts` (new — id-rooted patch shape)

> `mutateGraph` operates on the **state Maps** (not a transient projection): `create({ nodesById, edgesById }, recipe, { enablePatches:true })` → next Maps + id-rooted patches → set Maps + re-derived arrays + appended patches. Because patches address Maps by key, every captured patch is id-rooted (spec §3.3). `parseEpoch` unchanged.

- [ ] **Step 1: Write the failing id-rooted-patch test**

```ts
// asserts a representative edit yields a patch path beginning at nodesById/<id>/data/...
it('mutateGraph captures an id-rooted, field-precise patch', () => {
  const store = createEditorStore();
  // seed one Data node with one attribute, then:
  store.getState().updateCardinality(nodeId, 'attr', { inf: 0, sup: 1 }); // a migrated action
  const patches = store.getState().pendingEditPatches;
  expect(patches.length).toBeGreaterThan(0);
  expect(patches[0].path[0]).toBe('nodesById');
  expect(patches[0].path[1]).toBe(nodeId);            // keyed by id, not array index
  expect(patches[0].path).toContain('data');
});
```

- [ ] **Step 2: Run, confirm FAIL** (patches still rooted at the old projection / array).

- [ ] **Step 3: Add `mutateGraph`**

```ts
import { create } from 'mutative';
import { nodesFromMap, edgesFromMap } from './node-projection.js';

type GraphMaps = { nodesById: Map<string, TypeGraphNode>; edgesById: Map<string, TypeGraphEdge> };
export type GraphEditRecipe = (draft: GraphMaps) => void;

function mutateGraph(
  set: /* the raw set */,
  get: () => EditorState,
  recipe: GraphEditRecipe,
  extra?: Partial<EditorState>
): void {
  const { nodesById, edgesById, pendingEditPatches } = get();
  const [next, patches] = create({ nodesById, edgesById }, recipe, { enablePatches: true });
  if (patches.length === 0 && !extra) return;          // no-op recipe → leave state untouched
  set({
    nodesById: next.nodesById,
    edgesById: next.edgesById,
    nodes: nodesFromMap(next.nodesById),               // re-derive caches ONCE
    edges: edgesFromMap(next.edgesById),
    pendingEditPatches: patches.length ? [...pendingEditPatches, ...patches] : pendingEditPatches,
    ...extra
  });
}
```
Route `mutateGraph` through `rawSet` (per Task 2 caveat) so the interceptor doesn't double-derive. Confirm Mutative `create` handles `Map` drafts with `enablePatches` (it does — Maps are first-class in Mutative; patches use the key as the path segment).

- [ ] **Step 4: Migrate the 6 `commitEdit` callers** — change each (`addAttribute:1153`, `removeAttribute:1172`, `updateAttributeType:1259`, `renameAttribute:1303`, `updateCardinality:1324`, `updateAttribute:1426`) from `commitEdit(set,get,recipe)` to `mutateGraph(set,get,recipe)`. Their recipes already use `draft.nodes.get(id)`/`draft.edges` Map ops — confirm the draft field names match (`draft.nodesById`/`draft.edgesById` now; if the old recipes used `draft.nodes`/`draft.edges` as the Map names, either rename the recipe locals or name the `GraphMaps` fields to match the old `commitGraphEdit` projection to minimize churn). **Pick the lower-churn option and apply it uniformly.**

- [ ] **Step 5: Retire/alias `commitEdit`** — if nothing else calls it, delete it (and `commitGraphEdit` if now unused) per spec §8 #3 (net-less-code). If retained transitionally, make it a thin alias to `mutateGraph`. Report which.

- [ ] **Step 6: Run** — `pnpm --filter @rune-langium/visual-editor test -- mutate-graph` then the whole VE suite + `run type-check`. Green. The reorder-safety reconcile tests still pass (patches now id-rooted — strictly better).

- [ ] **Step 7: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add packages/visual-editor/src/store/editor-store.ts packages/visual-editor/src/store/edit-reconcile.ts packages/visual-editor/test/store/mutate-graph.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(ve): mutateGraph chokepoint on Maps; migrate 6 commitEdit actions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `loadModels` / `reconcileParse` on Maps (one-shot preserved)

**Files:**
- Modify: `packages/visual-editor/src/store/editor-store.ts` (`loadModels`)
- Modify: `packages/visual-editor/src/store/edit-reconcile.ts` (`reconcileParse` — Maps internally)
- Test: extend `packages/visual-editor/test/store/edit-reconcile.test.ts` + a one-shot test

> Behavior is unchanged: build `nodesById`/`edgesById` from the reconciled result, replay `pendingEditPatches` rooted at the Maps, clear them (ONE-SHOT), bump `parseEpoch`. The `isDegradedReparse` guard and deferred-placeholder merge are untouched.

- [ ] **Step 1: Write/extend the failing tests**
  - **Reorder safety:** after a `mutateGraph` edit, feed a reparse whose node array is in a *different order*; assert the patch replays onto the correct node (keyed by id).
  - **One-shot:** after `loadModels` replays, `pendingEditPatches === []`, and a SECOND reparse does not resurrect the edit.

- [ ] **Step 2: Run, confirm FAIL/RED where the new Map-rooted replay isn't wired.**

- [ ] **Step 3: Update `reconcileParse`** to operate on Maps internally (build Maps from the incoming parse arrays via `toNodesById`/`toEdgesById`, apply/skip patches by key, return Maps OR keep the array return but derive internally). Preserve `patchAlreadySatisfied` / `apply` / catch-fallback semantics verbatim. Keep returning `remainingPatches`.

- [ ] **Step 4: Update `loadModels`'s single `set()`** — set `nodesById`/`edgesById` from the reconciled Maps, `nodes`/`edges` re-derived, `parseEpoch: parseEpoch+1`, `pendingEditPatches: []` (one-shot). Route through `rawSet`. The degraded-guard early `return` stays. Merge `buildDeferredPlaceholderNodes` into the Maps before reconcile (unchanged in behavior).

- [ ] **Step 5: Run** — the reconcile + degraded-reparse-guard + source-sync suites. Green. **Watch the one-shot test** (object-valued `typeCall`/`card` patches must not resurrect).

- [ ] **Step 6: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add packages/visual-editor/src/store/editor-store.ts packages/visual-editor/src/store/edit-reconcile.ts packages/visual-editor/test/store/edit-reconcile.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(ve): reconcile + loadModels on Map substrate; one-shot clear preserved

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `updateGraphView` non-capturing path for position/layout (I2)

**Files:**
- Modify: `packages/visual-editor/src/store/editor-store.ts` (`applyReactFlowNodeChanges:343`, `relayout`, `setLayoutEngine`)
- Test: `packages/visual-editor/test/store/update-graph-view.test.ts` (new — I2)

> Drag/Dagre/fit-view update `position` only — view state, not source edits. They must write Maps + re-derived arrays but NOT capture patches or bump `parseEpoch`.

- [ ] **Step 1: Write the failing I2 test**
```ts
it('a position update captures no patch and does not bump parseEpoch', () => {
  const store = createEditorStore(); // seed a node
  const before = store.getState();
  store.getState().applyReactFlowNodeChanges([/* a position change for nodeId */]);
  const after = store.getState();
  expect(after.pendingEditPatches).toBe(before.pendingEditPatches); // unchanged ref
  expect(after.parseEpoch).toBe(before.parseEpoch);
  expect(after.pendingEditPatches.every((p) => !p.path.includes('position'))).toBe(true);
});
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Add `updateGraphView`**
```ts
function updateGraphView(set, get, recipe: GraphEditRecipe): void {
  const { nodesById, edgesById } = get();
  const next = create({ nodesById, edgesById }, recipe); // NO enablePatches
  set({
    nodesById: next.nodesById, edgesById: next.edgesById,
    nodes: nodesFromMap(next.nodesById), edges: edgesFromMap(next.edgesById)
    // NO pendingEditPatches, NO parseEpoch
  });
}
```
Route `applyReactFlowNodeChanges`/`relayout`/`setLayoutEngine` through it (apply RF changes / Dagre positions onto the Map drafts). Route through `rawSet`.

- [ ] **Step 4: Run** — the I2 test + drag/layout tests + the source-sync fingerprint test (position excluded → no serialize churn). Green.

- [ ] **Step 5: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add packages/visual-editor/src/store/editor-store.ts packages/visual-editor/test/store/update-graph-view.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(ve): updateGraphView non-capturing position/layout path (I2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: zundo tracks the Maps; `buildNodeMap`→`toNodesById`; invariant tests

**Files:**
- Modify: `packages/visual-editor/src/store/history.ts` (`TrackedState`, `temporalOptions`)
- Modify: `packages/visual-editor/src/store/editor-store.ts` (inline `partialize:2401-2407` + temporal `equality`; `buildNodeMap`)
- Test: `packages/visual-editor/test/store/undo-maps.test.ts` (new) + the I1 invariant test

> zundo compares snapshot fields by reference; tracking Maps needs an explicit `equality` (else every new-Map `set` is a history entry). `pendingEditPatches` stays excluded.

- [ ] **Step 1: Write the failing undo test**
```ts
it('undo restores the prior Maps and re-derives arrays; patches excluded from history', () => {
  // edit via a migrated action → undo → assert Maps + arrays restored, pendingEditPatches NOT rewound
});
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Update `TrackedState` + `partialize`**
```ts
// history.ts
export type TrackedState = Pick<EditorState, 'nodesById' | 'edgesById'>;
export const temporalOptions = {
  partialize: (s: EditorState): TrackedState => ({ nodesById: s.nodesById, edgesById: s.edgesById }),
  limit: 50,
  equality: (a: TrackedState, b: TrackedState) =>
    a.nodesById === b.nodesById && a.edgesById === b.edgesById  // ref equality — Maps replaced atomically by mutateGraph
};
```
Update the inline `partialize` at `editor-store.ts:2401-2407` to match (or import `temporalOptions` from `history.ts` and stop duplicating — DRY; the audit notes `history.ts`'s export is currently UNUSED). On undo/redo, re-derive arrays from the restored Maps — add a temporal `onSave`/subscription or a wrapper that, after a temporal state change, sets `nodes`/`edges` = re-derived. Confirm zundo's API for post-restore derivation in this version (zundo 2); if it lacks a hook, subscribe to the temporal store and re-derive.

- [ ] **Step 4: Re-point `buildNodeMap`** — its body to `return toNodesById(nodes);` (already delegated in 3A Task 5 — confirm; if 3A left it, do it now). Leaves the 7 call sites untouched.

- [ ] **Step 5: Add the I1 store-invariant test** — after any action, `state.nodes` deep-equals `[...state.nodesById.values()]` (+ edges), and the array reference is stable across a no-op `set`.

- [ ] **Step 6: Run** — undo/redo suite + invariant test + whole VE suite + studio suite. Green.

- [ ] **Step 7: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add packages/visual-editor/src/store/history.ts packages/visual-editor/src/store/editor-store.ts packages/visual-editor/test/store/undo-maps.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(ve): zundo tracks Maps w/ explicit equality; I1 invariant test

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Adopt core `indexById` at the non-editor ad-hoc id-map sites + full verification

**Files (adopt the primitive where it's a clean win):**
- `apps/studio/src/shell/ExplorePerspective.tsx` — `nodeIdToFilePath` and any inline `new Map(x.map(...))` id index
- the cross-namespace-refs / namespace-graph builders (`rg` for `new Map(` keyed by id/name in `packages/core`, `functions/`, `apps/studio`)
- curated-mirror id maps (if any)

> Only re-point sites that build a literal id→entity Map AND would read more clearly via `indexById`. Do NOT force unrelated Maps through it. Report each adoption; if a site's key isn't `.id`, use the `key` selector overload.

- [ ] **Step 1: Enumerate candidates** — `rg -n "new Map\(.*\.map\(" apps/studio/src functions packages/core packages/visual-editor/src | rg -i "id|name|node"`. Classify each as adopt / leave.

- [ ] **Step 2: Re-point the clean ones** to `indexById(items)` / `indexById(items, i => i.key)`. Keep behavior identical.

- [ ] **Step 3: Full verification sweep** — report exact counts:
```
pnpm --filter @rune-langium/core test
pnpm --filter @rune-langium/visual-editor test
pnpm --filter @rune-langium/visual-editor run type-check
pnpm --filter @rune-langium/studio test
pnpm --filter @rune-langium/studio run type-check
pnpm run lint
```
All green. Then confirm the substrate landed and arrays are never hand-assembled outside the chokepoints:
```
rg -n "set\(\{[^}]*nodes:" packages/visual-editor/src/store/editor-store.ts   # only via mutateGraph/updateGraphView/loadModels re-derivation
rg -n "buildNodeMap|new Map\(nodes|new Map\(edges" packages/visual-editor/src  # delegated to indexById
```
Report residual raw `set({ nodes: … })` outside the chokepoints (the 28 un-migrated actions are EXPECTED here — they convert in 3C; list them so 3C has the worklist).

- [ ] **Step 4: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add apps/studio/src packages/core packages/visual-editor/src
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "refactor: adopt core indexById at non-editor id-map sites; close 3B

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review checklist (performed during plan authoring)

**Spec coverage (§3.1–§3.5, §5 Phase 1, §6, §7):** Map state fields + I1 (Task 2) ✓; `mutateGraph` + 6-action migration (Task 3) ✓; reconcile/loadModels on Maps + one-shot (Task 4) ✓; `updateGraphView` + I2 (Task 5) ✓; zundo Maps + equality + `pendingEditPatches` excluded (Task 6) ✓; core `indexById` lift + adoption (Tasks 1,7 — the approved 2026-06-06 decision) ✓; testing strategy #1 (id-rooted patch), #2 (reorder), #3 (one-shot), #4 (I1), #5 (I2), #6 (undo) each have a task-owned test ✓.

**Risk handling:** the zundo Map-equality caveat (§7) is an explicit `equality` fn (Task 6). The interceptor-vs-mutateGraph double-derive (the trickiest interaction) is resolved by routing chokepoints through `rawSet` and a ref-check guard (Task 2 Step 4). The 28 array-authoring actions are kept correct by the interceptor and explicitly deferred to 3C (constraint 5) — this plan does NOT touch them, keeping the diff reviewable.

**Net-less-code:** `commitEdit`/`commitGraphEdit` retire into `mutateGraph` (Task 3 Step 5); `buildNodeMap` delegates; `history.ts`'s currently-unused `temporalOptions` becomes the single source (Task 6). The interceptor is transitional (removed when 3C lands native capture).

**Placeholder scan:** new code (indexById, mutateGraph, updateGraphView, zundo equality) is given in full; existing-code re-points cite exact audited lines. The two spots needing edit-time confirmation are flagged precisely: Mutative Map+patches behavior (Task 3 Step 3) and zundo 2's post-restore derivation hook (Task 6 Step 3) — verify against the installed versions, not assumed.

**Type consistency:** `GraphEditRecipe` = `(draft: { nodesById: Map; edgesById: Map }) => void` is used identically in Tasks 3 and 5. The `draft` field naming (`nodesById`/`edgesById` vs the old `commitGraphEdit` `nodes`/`edges` Map names) is called out as a uniform choice in Task 3 Step 4 to avoid a `clearLayers()`/`clearFullLayers()`-style drift.
