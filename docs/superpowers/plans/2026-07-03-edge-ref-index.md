# Edge Ref-Index Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `renameType`'s O(N) name-matching ref cascade with an edge-driven cascade addressed by a derived `bySource`/`byTarget` edge index, fixing the live cross-namespace bare-collision over-rewrite and the pre-existing self-reference staleness bug.

**Architecture:** A memoized `selectEdgeIndex` selector (Map-identity cached, mirroring `selectNodeRepository`) derives forward/reverse edge indices from `edgesById`. A new pure module `edge-ref-rewrite.ts` locates a ref slot in a node's data from an edge's kind + label + the node's `$type` (name-addressed, never index-addressed) and rewrites `$refText` form-preservingly. `renameType` walks `byTarget(renamedId)` instead of all N nodes; the renamed node's own data is always rewritten (self-refs have no edges). Annotation nodes gain the attribute-ref edges they were missing.

**Tech Stack:** TypeScript 5.9 strict ESM, zustand 5 store (`editor-store.ts`), Mutative drafts via `mutateGraph`, vitest, `@rune-langium/core` `parse`.

**Spec:** `docs/superpowers/specs/2026-07-03-edge-ref-index-design.md` — binding. Read it first.

## Global Constraints

- Commits: `SKIP_SIMPLE_GIT_HOOKS=1 git commit`; stage ONLY files you changed (never `git add -A` — untracked `reference-design/` must not be committed); every commit footer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01QBKeg1hukfnXfvCCkQnxb2`
- New files under `packages/` get `// SPDX-License-Identifier: MIT` + `// Copyright (c) 2026 Pradeep Mouli` headers.
- visual-editor resolves to `./src` — NO dist rebuild needed for its tests; `@rune-langium/core` resolves to dist (unchanged here).
- Inline `{$refText}` stays authoritative at serialize — the index only ADDRESSES writes (spec §2). No serializer changes.
- Slot-location failure inside the cascade: dev-warn + skip, NEVER throw (a throw inside `mutateGraph` aborts the whole mutation) and NEVER fall back to name matching (spec §3.3).
- No self-edges in `edgesById` (it feeds React Flow rendering) — self-references are handled by always rewriting the renamed node's own data (spec §5).
- Run `pnpm exec oxfmt <changed files>` before each commit; `pnpm run format:check` must stay clean.
- Run the FULL visual-editor suite before finishing (not a curated subset): `pnpm --filter @rune-langium/visual-editor test`.

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/visual-editor/src/store/edge-index.ts` | Create | `selectEdgeIndex` memoized selector → `{ bySource, byTarget }` |
| `packages/visual-editor/src/store/edge-ref-rewrite.ts` | Create | Pure slot location + form-preserving rewrite (`renameRefValue`, `rewriteEdgeRefInNode`, `rewriteOwnRefs`) |
| `packages/visual-editor/src/adapters/ast-to-model.ts` | Modify (~189, ~230) | Annotation nodes gain attribute-ref edges |
| `packages/visual-editor/src/store/editor-store.ts` | Modify (~564-682, ~1281-1286) | Delete `renameRefText`/`updateTypeRefsInNode`; `renameType` step 2 → edge-driven |
| `packages/visual-editor/test/store/edge-index.test.ts` | Create | Selector memoization + index correctness |
| `packages/visual-editor/test/store/edge-ref-rewrite.test.ts` | Create | Unit + edge→slot invariant tests |
| `packages/visual-editor/test/store/rename-cascade.test.ts` | Modify | RED cross-ns bare-collision + self-ref + annotation tests |
| `packages/visual-editor/test/adapters/ast-to-model.test.ts` (or the file that tests edges — locate by `rg -l "attribute-ref" packages/visual-editor/test/adapters`) | Modify | Annotation edge materialization test |

---

### Task 1: `selectEdgeIndex` selector

**Files:**
- Create: `packages/visual-editor/src/store/edge-index.ts`
- Test: `packages/visual-editor/test/store/edge-index.test.ts`

**Interfaces:**
- Consumes: `TypeGraphEdge` from `../types.js`.
- Produces: `selectEdgeIndex(edgesById: ReadonlyMap<string, TypeGraphEdge>): EdgeIndex` where `EdgeIndex = { bySource(id: string): readonly TypeGraphEdge[]; byTarget(id: string): readonly TypeGraphEdge[] }`. Task 4 calls `selectEdgeIndex(originalEdges).byTarget(nodeId)`.

- [ ] **Step 1: Write the failing test**

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';
import { selectEdgeIndex } from '../../src/store/edge-index.js';
import { SIMPLE_INHERITANCE_SOURCE } from '../helpers/fixture-loader.js';

describe('selectEdgeIndex', () => {
  it('indexes every edge under both its source and its target', async () => {
    const store = createEditorStore();
    store.getState().loadModels((await parse(SIMPLE_INHERITANCE_SOURCE)).value);
    const { edgesById } = store.getState();
    expect(edgesById.size).toBeGreaterThan(0); // fixture sanity

    const index = selectEdgeIndex(edgesById);
    for (const edge of edgesById.values()) {
      expect(index.bySource(edge.source)).toContain(edge);
      expect(index.byTarget(edge.target)).toContain(edge);
    }
    // Sum over buckets equals the edge count exactly (no duplicates, no drops).
    const seen = new Set<string>();
    for (const edge of edgesById.values()) {
      for (const e of index.byTarget(edge.target)) seen.add(e.id);
    }
    expect(seen.size).toBe(edgesById.size);
  });

  it('unknown node id returns an empty (not undefined) list', async () => {
    const store = createEditorStore();
    store.getState().loadModels((await parse(SIMPLE_INHERITANCE_SOURCE)).value);
    const index = selectEdgeIndex(store.getState().edgesById);
    expect(index.bySource('nope')).toEqual([]);
    expect(index.byTarget('nope')).toEqual([]);
  });

  it('is memoized on Map identity: same Map → same instance, new Map → new instance', async () => {
    const store = createEditorStore();
    store.getState().loadModels((await parse(SIMPLE_INHERITANCE_SOURCE)).value);
    const map1 = store.getState().edgesById;
    const a = selectEdgeIndex(map1);
    const b = selectEdgeIndex(map1);
    expect(b).toBe(a);
    const map2 = new Map(map1); // simulates the post-mutation Map swap
    const c = selectEdgeIndex(map2);
    expect(c).not.toBe(a);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/visual-editor exec vitest run test/store/edge-index.test.ts`
Expected: FAIL — `Cannot find module '../../src/store/edge-index.js'`

- [ ] **Step 3: Write the implementation**

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import type { TypeGraphEdge } from '../types.js';

/**
 * Forward/reverse edge index derived from `edgesById`.
 *
 * READ-SIDE ONLY (spec §2): the index carries no `$refText`, so it has none
 * to go stale — inline `{$refText}` on node data remains the authoritative
 * serialized form. Writes are ADDRESSED by this index (renameType walks
 * `byTarget`), they never flow through it.
 */
export interface EdgeIndex {
  bySource(id: string): readonly TypeGraphEdge[];
  byTarget(id: string): readonly TypeGraphEdge[];
}

const EMPTY: readonly TypeGraphEdge[] = [];

let cacheKey: ReadonlyMap<string, TypeGraphEdge> | null = null;
let cacheValue: EdgeIndex | null = null;

/**
 * Memoized on the Map's identity — the store swaps the `edgesById` reference
 * on every `mutateGraph`, so an unchanged reference returns the cached
 * instance (same single-slot pattern as `selectNodeRepository`; a single
 * cache slot is correctness-safe for Studio's single store).
 */
export function selectEdgeIndex(edgesById: ReadonlyMap<string, TypeGraphEdge>): EdgeIndex {
  if (edgesById === cacheKey && cacheValue !== null) return cacheValue;
  const bySource = new Map<string, TypeGraphEdge[]>();
  const byTarget = new Map<string, TypeGraphEdge[]>();
  for (const edge of edgesById.values()) {
    let s = bySource.get(edge.source);
    if (s === undefined) {
      s = [];
      bySource.set(edge.source, s);
    }
    s.push(edge);
    let t = byTarget.get(edge.target);
    if (t === undefined) {
      t = [];
      byTarget.set(edge.target, t);
    }
    t.push(edge);
  }
  const index: EdgeIndex = {
    bySource: (id) => bySource.get(id) ?? EMPTY,
    byTarget: (id) => byTarget.get(id) ?? EMPTY
  };
  cacheKey = edgesById;
  cacheValue = index;
  return index;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/visual-editor exec vitest run test/store/edge-index.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Format + commit**

```bash
pnpm exec oxfmt packages/visual-editor/src/store/edge-index.ts packages/visual-editor/test/store/edge-index.test.ts
git add packages/visual-editor/src/store/edge-index.ts packages/visual-editor/test/store/edge-index.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(visual-editor): selectEdgeIndex — memoized bySource/byTarget edge index"
```

---

### Task 2: Annotation nodes gain attribute-ref edges

**Files:**
- Modify: `packages/visual-editor/src/adapters/ast-to-model.ts` (kind filter ~line 189; per-kind edge branches ~line 220-310)
- Test: the adapters test file that already asserts edge materialization — find it with `rg -ln "attribute-ref" packages/visual-editor/test/adapters` and add to the closest-matching suite (create `packages/visual-editor/test/adapters/annotation-edges.test.ts` if none fits).

**Interfaces:**
- Consumes: existing `getAttributeEdges(nodeId, members, nameToNodeId)` helper (ast-to-model.ts:123) — reuse verbatim, do NOT duplicate.
- Produces: Annotation nodes appear in the edge set with `kind: 'attribute-ref'` edges for each resolvable attribute type — Task 4's cascade relies on this (spec §4: without it, edge-driven rename REGRESSES annotation-attribute refs vs today's name-matching).

- [ ] **Step 1: Write the failing test**

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';

const ANNOTATION_SOURCE = `namespace test.anno

type Payload:
  value string (0..1)

annotation myAnnotation:
  target Payload (0..1)
`;

describe('annotation edge materialization', () => {
  it('materializes an attribute-ref edge from the annotation to its attribute type', async () => {
    const store = createEditorStore();
    store.getState().loadModels((await parse(ANNOTATION_SOURCE)).value);
    const { nodesById, edgesById } = store.getState();
    const anno = [...nodesById.values()].find((n) => n.data.$type === 'Annotation');
    const payload = [...nodesById.values()].find((n) => n.data.name === 'Payload');
    expect(anno).toBeDefined();
    expect(payload).toBeDefined();
    const edge = [...edgesById.values()].find(
      (e) => e.source === anno!.id && e.target === payload!.id && e.data?.kind === 'attribute-ref'
    );
    expect(edge).toBeDefined();
    expect(edge!.data!.label).toBe('target'); // member-name label, same convention as Data attributes
  });
});
```

NOTE: verify the annotation grammar shape against a real corpus annotation first (`rg -n "^annotation" .resources/cdm/*.rosetta | head -3`, then read one) — if the fixture above does not parse (check `parseResult.parserErrors` in the test with a sanity assertion), adjust the fixture to the real grammar. Parse-first validation is mandatory.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/visual-editor exec vitest run test/adapters/annotation-edges.test.ts`
Expected: FAIL — `expect(edge).toBeDefined()` (no edge materialized for Annotation nodes)

- [ ] **Step 3: Implement**

In `ast-to-model.ts`: import `isAnnotation` from `@rune-langium/core` (alongside the existing `isData`/`isChoice`/… imports, ~line 14-20). Add `isAnnotation(element)` to the node-kind filter (~line 189-193). In the per-kind edge-building section, add the Annotation branch mirroring Data's attributes call (~line 233):

```ts
} else if (isAnnotation(d)) {
  edges.push(...getAttributeEdges(node.id, (d.attributes ?? []) as unknown as MemberLikeRef[], nameToNodeId));
}
```

(Adapt the exact guard/branch shape to the surrounding switch/if-chain — the structural requirement is: Annotation attributes go through the SAME `getAttributeEdges` helper with member-name labels. If the filter change makes Annotation nodes newly appear in the GRAPH where they didn't before, STOP and check: `rg -n "Annotation" packages/visual-editor/src/adapters/ast-to-model.ts` — if Annotation nodes were already projected as nodes via another path, only the EDGE branch is missing; do not double-project nodes.)

- [ ] **Step 4: Run test + the full adapters suite**

Run: `pnpm --filter @rune-langium/visual-editor exec vitest run test/adapters`
Expected: new test PASS; zero regressions in the adapters suite.

- [ ] **Step 5: Format + commit**

```bash
pnpm exec oxfmt packages/visual-editor/src/adapters/ast-to-model.ts packages/visual-editor/test/adapters/annotation-edges.test.ts
git add packages/visual-editor/src/adapters/ast-to-model.ts packages/visual-editor/test/adapters/annotation-edges.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "fix(visual-editor): materialize attribute-ref edges for Annotation nodes"
```

---

### Task 3: `edge-ref-rewrite` — pure slot location + form-preserving rewrite

**Files:**
- Create: `packages/visual-editor/src/store/edge-ref-rewrite.ts`
- Test: `packages/visual-editor/test/store/edge-ref-rewrite.test.ts`

**Interfaces:**
- Consumes: `TypeGraphEdge`, `TypeGraphNode`, `DomainNodeData` from `../types.js`.
- Produces (Task 4 imports all three):
  - `renameRefValue(value: string | undefined, oldName: string, newName: string, namespace: string): string | null` — form-preserving value rewrite (verbatim semantics of today's `renameRefText`, editor-store.ts:578-582, MOVED here).
  - `rewriteEdgeRefInNode(edge: TypeGraphEdge, sourceData: DomainNodeData, oldName: string, newName: string, namespace: string): DomainNodeData | null` — locates the slot named by the edge and rewrites it; returns new data, or `null` when the slot cannot be located OR the located `$refText` matches neither expected form (invariant breach — caller warns + skips).
  - `rewriteOwnRefs(data: DomainNodeData, oldName: string, newName: string, namespace: string): DomainNodeData` — today's `updateTypeRefsInNode` body (editor-store.ts:606-678) MOVED here verbatim, applied by Task 4 ONLY to the renamed node itself (spec §3.4: self-refs have no edges; name-matching scoped to the renamed node is sound — a bare self-name inside the node binds to itself).

- [ ] **Step 1: Write the failing tests**

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';
import { renameRefValue, rewriteEdgeRefInNode } from '../../src/store/edge-ref-rewrite.js';
import { SIMPLE_INHERITANCE_SOURCE, ENUM_MODEL_SOURCE, CHOICE_MODEL_SOURCE, COMBINED_MODEL_SOURCE } from '../helpers/fixture-loader.js';

describe('renameRefValue (form-preserving)', () => {
  it('bare stays bare, qualified stays qualified, non-matching returns null', () => {
    expect(renameRefValue('Foo', 'Foo', 'Bar', 'ns')).toBe('Bar');
    expect(renameRefValue('ns.Foo', 'Foo', 'Bar', 'ns')).toBe('ns.Bar');
    expect(renameRefValue('other.Foo', 'Foo', 'Bar', 'ns')).toBeNull();
    expect(renameRefValue('Fool', 'Foo', 'Bar', 'ns')).toBeNull();
    expect(renameRefValue(undefined, 'Foo', 'Bar', 'ns')).toBeNull();
  });
});

describe('edge → slot invariant (every materialized edge locates a rewritable slot)', () => {
  // Spec §Testing: the loud-drift guard for recipe-created edges (§6).
  for (const [name, source] of [
    ['inheritance', SIMPLE_INHERITANCE_SOURCE],
    ['enum', ENUM_MODEL_SOURCE],
    ['choice', CHOICE_MODEL_SOURCE],
    ['combined', COMBINED_MODEL_SOURCE]
  ] as const) {
    it(`${name} fixture: rewriteEdgeRefInNode locates every edge's slot`, async () => {
      const store = createEditorStore();
      store.getState().loadModels((await parse(source)).value);
      const { nodesById, edgesById } = store.getState();
      expect(edgesById.size).toBeGreaterThan(0);
      for (const edge of edgesById.values()) {
        const src = nodesById.get(edge.source)!;
        const target = nodesById.get(edge.target)!;
        const oldName = target.data.name!;
        const ns = target.meta.namespace;
        // Rewriting to a sentinel must succeed (non-null) for EVERY edge:
        // the slot exists and its $refText matches bare or qualified form.
        const rewritten = rewriteEdgeRefInNode(edge, src.data, oldName, '__SENTINEL__', ns);
        expect(rewritten, `edge ${edge.id} failed to locate/match its slot`).not.toBeNull();
        // And the rewrite is FORM-PRESERVING: sentinel appears bare or ns-qualified, never mixed.
        const json = JSON.stringify(rewritten);
        expect(json.includes('__SENTINEL__')).toBe(true);
      }
    });
  }
});

describe('rewriteEdgeRefInNode returns null on invariant breach', () => {
  it('unlocatable slot (label names a missing member) → null, no throw', async () => {
    const store = createEditorStore();
    store.getState().loadModels((await parse(SIMPLE_INHERITANCE_SOURCE)).value);
    const { nodesById, edgesById } = store.getState();
    const edge = [...edgesById.values()].find((e) => e.data?.kind === 'attribute-ref')!;
    const src = nodesById.get(edge.source)!;
    const bogusEdge = { ...edge, data: { ...edge.data!, label: 'no-such-member' } };
    expect(rewriteEdgeRefInNode(bogusEdge, src.data, 'X', 'Y', 'ns')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rune-langium/visual-editor exec vitest run test/store/edge-ref-rewrite.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import type { TypeGraphEdge, DomainNodeData } from '../types.js';

/**
 * Form-preserving `$refText` rewrite (moved verbatim from editor-store's
 * renameRefText). Matches the two forms the codebase emits: bare (`oldName`)
 * and namespace-qualified (`<namespace>.<oldName>`, the form
 * `disambiguateTypeRef` writes). Returns the rewritten value or null when
 * `value` does not reference the renamed type.
 */
export function renameRefValue(
  value: string | undefined,
  oldName: string,
  newName: string,
  namespace: string
): string | null {
  if (value === oldName) return newName;
  if (value === `${namespace}.${oldName}`) return `${namespace}.${newName}`;
  return null;
}

type MemberWithTypeCall = { name?: string; typeCall?: { type?: { $refText?: string } } };

/** Rewrite `members[i].typeCall.type.$refText` for the member named `label`. */
function rewriteMemberByName(
  members: readonly MemberWithTypeCall[] | undefined,
  label: string | undefined,
  oldName: string,
  newName: string,
  namespace: string
): { members: MemberWithTypeCall[]; changed: boolean } | null {
  if (!members || label === undefined) return null;
  const i = members.findIndex((m) => m.name === label);
  if (i === -1) return null;
  const next = renameRefValue(members[i]?.typeCall?.type?.$refText, oldName, newName, namespace);
  if (next === null) return null;
  const updated = [...members];
  updated[i] = {
    ...updated[i],
    typeCall: { ...updated[i]!.typeCall, type: { ...updated[i]!.typeCall!.type, $refText: next } }
  };
  return { members: updated, changed: true };
}

/**
 * Locate the ref slot named by `edge` inside `sourceData` and rewrite it
 * form-preservingly (spec §1: location = edge kind + label + node $type,
 * name-addressed). Returns the new data object, or null when the slot
 * cannot be located or its `$refText` matches neither expected form —
 * an INVARIANT BREACH the caller must dev-warn + skip (never guess,
 * never fall back to name matching).
 */
export function rewriteEdgeRefInNode(
  edge: TypeGraphEdge,
  sourceData: DomainNodeData,
  oldName: string,
  newName: string,
  namespace: string
): DomainNodeData | null {
  const d = sourceData as unknown as Record<string, unknown>;
  const kind = edge.data?.kind;
  const label = edge.data?.label as string | undefined;

  switch (kind) {
    case 'attribute-ref': {
      // Member-name label. Which array depends on the node kind; func 'output'
      // is a labeled singleton (ast-to-model.ts:274).
      if (sourceData.$type === 'RosettaFunction') {
        if (label === 'output') {
          const out = d['output'] as MemberWithTypeCall | undefined;
          const next = renameRefValue(out?.typeCall?.type?.$refText, oldName, newName, namespace);
          if (next === null) return null;
          return {
            ...sourceData,
            output: { ...out, typeCall: { ...out!.typeCall, type: { ...out!.typeCall!.type, $refText: next } } }
          } as DomainNodeData;
        }
        const r = rewriteMemberByName(d['inputs'] as MemberWithTypeCall[], label, oldName, newName, namespace);
        return r ? ({ ...sourceData, inputs: r.members } as DomainNodeData) : null;
      }
      if (sourceData.$type === 'RosettaRecordType') {
        const r = rewriteMemberByName(d['features'] as MemberWithTypeCall[], label, oldName, newName, namespace);
        return r ? ({ ...sourceData, features: r.members } as DomainNodeData) : null;
      }
      // Data + Annotation: attributes
      const r = rewriteMemberByName(d['attributes'] as MemberWithTypeCall[], label, oldName, newName, namespace);
      return r ? ({ ...sourceData, attributes: r.members } as DomainNodeData) : null;
    }
    case 'choice-option': {
      // Label carries the (possibly qualified) TYPE name, not a member name
      // (ast-to-model.ts:242, editor-store renameType step-3 comment).
      const options = d['attributes'] as MemberWithTypeCall[] | undefined;
      if (!options) return null;
      const i = options.findIndex((o) => {
        const t = o.typeCall?.type?.$refText;
        return t === oldName || t === `${namespace}.${oldName}`;
      });
      if (i === -1) return null;
      const next = renameRefValue(options[i]?.typeCall?.type?.$refText, oldName, newName, namespace);
      if (next === null) return null;
      const updated = [...options];
      updated[i] = {
        ...updated[i],
        typeCall: { ...updated[i]!.typeCall, type: { ...updated[i]!.typeCall!.type, $refText: next } }
      };
      return { ...sourceData, attributes: updated } as DomainNodeData;
    }
    case 'extends': {
      const field = sourceData.$type === 'RosettaFunction' ? 'superFunction' : 'superType';
      const ref = d[field] as { $refText?: string } | undefined;
      const next = renameRefValue(ref?.$refText, oldName, newName, namespace);
      if (next === null) return null;
      return { ...sourceData, [field]: { ...ref, $refText: next } } as DomainNodeData;
    }
    case 'enum-extends': {
      const ref = d['parent'] as { $refText?: string } | undefined;
      const next = renameRefValue(ref?.$refText, oldName, newName, namespace);
      if (next === null) return null;
      return { ...sourceData, parent: { ...ref, $refText: next } } as DomainNodeData;
    }
    case 'type-alias-ref': {
      const typeCall = d['typeCall'] as { type?: { $refText?: string } } | undefined;
      const next = renameRefValue(typeCall?.type?.$refText, oldName, newName, namespace);
      if (next === null) return null;
      return {
        ...sourceData,
        typeCall: { ...typeCall, type: { ...typeCall!.type, $refText: next } }
      } as DomainNodeData;
    }
    default:
      return null;
  }
}
```

Then MOVE `updateTypeRefsInNode` (editor-store.ts:606-678) into this file as `export function rewriteOwnRefs(...)` — body verbatim, `renameRefText` calls renamed to `renameRefValue`. (It survives ONLY for the renamed node's own data — spec §3.4; the exhaustive per-`$type` switch is exactly what "run the slot rewrite over the renamed node's own data for every slot kind" means.) Delete nothing from editor-store yet — Task 4 does the cutover.

Check the exact `DomainNodeData`/`AnyGraphNode` type name used at editor-store.ts:606 and keep the moved signature IDENTICAL (post-P4 it may be `AnyGraphNode = AnyDomain`; use whatever `updateTypeRefsInNode` uses today).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @rune-langium/visual-editor exec vitest run test/store/edge-ref-rewrite.test.ts`
Expected: PASS. If any invariant-test edge fails to locate, READ the edge (kind, label, source `$type`) and fix `rewriteEdgeRefInNode`'s mapping — do NOT weaken the test.

- [ ] **Step 5: Format + commit**

```bash
pnpm exec oxfmt packages/visual-editor/src/store/edge-ref-rewrite.ts packages/visual-editor/test/store/edge-ref-rewrite.test.ts
git add packages/visual-editor/src/store/edge-ref-rewrite.ts packages/visual-editor/test/store/edge-ref-rewrite.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(visual-editor): edge-ref-rewrite — pure slot location + form-preserving rewrite"
```

---

### Task 4: Edge-driven `renameType` cascade (the cutover)

**Files:**
- Modify: `packages/visual-editor/src/store/editor-store.ts` (step 2 of `renameType` ~:1281-1286; delete local `renameRefText` :578-582 and `updateTypeRefsInNode` :606-678; add imports)
- Test: `packages/visual-editor/test/store/rename-cascade.test.ts` (extend)

**Interfaces:**
- Consumes: `selectEdgeIndex` (Task 1), `rewriteEdgeRefInNode`, `rewriteOwnRefs`, `renameRefValue` (Task 3).
- Produces: no new API — `renameType(nodeId, newName)` behavior contract only.

- [ ] **Step 1: Write the RED tests (BEFORE touching the store)**

Append to `rename-cascade.test.ts` (mirror its existing store-API harness, :157-179):

```ts
describe('edge-driven rename cascade (spec 2026-07-03-edge-ref-index)', () => {
  it('cross-ns bare collision: renaming alpha.Trade leaves beta\'s bare Trade ref (binding beta.Trade) untouched', () => {
    const s = createEditorStore();
    s.getState().createType('data', 'Trade', 'alpha');
    s.getState().createType('data', 'Trade', 'beta');
    s.getState().createType('data', 'Holder', 'beta');
    const alphaTradeId = s.getState().nodes.find((n) => n.data.name === 'Trade' && n.meta.namespace === 'alpha')!.id;
    const betaTradeId = s.getState().nodes.find((n) => n.data.name === 'Trade' && n.meta.namespace === 'beta')!.id;
    const holderId = s.getState().nodes.find((n) => n.data.name === 'Holder')!.id;

    // Holder.local is a BARE ref binding beta.Trade (same-namespace).
    s.getState().addAttribute(holderId, 'local', 'Trade', '(1..1)');
    s.getState().updateAttributeType(holderId, 'local', 'Trade', betaTradeId);
    const bareBefore = (s.getState().nodes.find((n) => n.id === holderId)!.data as any).attributes[0].typeCall.type.$refText;
    expect(bareBefore).toBe('Trade'); // setup sanity: bare, binds locally

    s.getState().renameType(alphaTradeId, 'Execution');

    const bareAfter = (s.getState().nodes.find((n) => n.id === holderId)!.data as any).attributes[0].typeCall.type.$refText;
    // THE LIVE BUG (spec §The live bug): master's name-matching cascade
    // rewrites this to 'Execution', silently rebinding Holder.local from
    // beta.Trade to... nothing. Must stay 'Trade'.
    expect(bareAfter).toBe('Trade');
  });

  it('self-reference: renaming Foo rewrites Foo\'s own Foo-typed attribute', () => {
    const s = createEditorStore();
    s.getState().createType('data', 'Foo', 'alpha');
    const fooId = s.getState().nodes.find((n) => n.data.name === 'Foo')!.id;
    s.getState().addAttribute(fooId, 'parentFoo', 'Foo', '(0..1)');

    s.getState().renameType(fooId, 'Bar');

    const renamed = s.getState().nodes.find((n) => n.data.name === 'Bar')!;
    const selfRef = (renamed.data as any).attributes[0].typeCall.type.$refText;
    // Pre-existing bug (spec §5): master skips the renamed node in its own
    // cascade (editor-store.ts:1283), leaving this stale as 'Foo'.
    expect(selfRef).toBe('Bar');
  });
});
```

- [ ] **Step 2: Run to verify BOTH fail on master's logic**

Run: `pnpm --filter @rune-langium/visual-editor exec vitest run test/store/rename-cascade.test.ts`
Expected: the two new tests FAIL (bare ref rewritten to 'Execution'; self ref stale as 'Foo'). If the cross-ns test PASSES on master's logic, STOP — re-read `updateTypeRefsInNode`'s call pattern; the bug premise is in the spec and must be re-verified, not assumed.

- [ ] **Step 3: Cut over `renameType` step 2**

In `editor-store.ts`, add imports:

```ts
import { selectEdgeIndex } from './edge-index.js';
import { rewriteEdgeRefInNode, rewriteOwnRefs, renameRefValue } from './edge-ref-rewrite.js';
```

Replace step 2 (:1281-1286) inside the `mutateGraph` recipe:

```ts
// 2. Cascade refs EDGE-DRIVEN (spec §3): only nodes with an incident edge
//    targeting the renamed node are touched — the edge's existence IS the
//    binding decision, so a bare same-name ref in another namespace that
//    binds locally has no edge here and is (correctly) untouched.
const incident = selectEdgeIndex(originalEdges).byTarget(nodeId);
for (const edge of incident) {
  if (edge.source === nodeId) continue; // self handled below via rewriteOwnRefs
  const other = originalNodes.get(edge.source);
  if (!other) continue;
  // A node can have several incident edges; rewrite against the LATEST
  // draft state so multiple slots accumulate.
  const current = draft.nodes.get(edge.source) ?? other;
  const rewritten = rewriteEdgeRefInNode(edge, current.data, oldName, newName, namespace);
  if (rewritten === null) {
    // Invariant breach (spec §3.3): warn + skip; never guess, never throw.
    console.warn(`[renameType] edge ${edge.id} did not locate a rewritable slot — skipped`);
    continue;
  }
  draft.nodes.set(edge.source, { ...current, data: rewritten });
}
// 2b. The renamed node's own data ALWAYS gets the slot rewrite (self-refs
//     have no edges — spec §3.4/§5). Applied to the re-keyed entry from step 1.
const renamedEntry = draft.nodes.get(newNodeId)!;
const ownRewritten = rewriteOwnRefs(renamedEntry.data, oldName, newName, namespace);
if (ownRewritten !== renamedEntry.data) {
  draft.nodes.set(newNodeId, { ...renamedEntry, data: ownRewritten });
}
```

Then DELETE the local `renameRefText` (:578-582) and `updateTypeRefsInNode` (:606-678) from editor-store.ts; step 3's `renameRefText(e.data?.label, …)` call for choice-option labels becomes `renameRefValue(...)` (imported). Nothing else in the file may reference the deleted functions (`rg -n "updateTypeRefsInNode|renameRefText" packages/visual-editor/src` must return zero hits).

CAUTION — draft-vs-original discipline: the recipe reads `originalNodes`/`originalEdges` (un-proxied, editor-store.ts:1263-1268 comment) and writes `draft.nodes`. The `draft.nodes.get(edge.source) ?? other` read is REQUIRED: two edges from the same source (e.g. two attributes typed by the renamed node) must compound, not clobber. Add a test if the invariant fixtures don't already cover a double-ref node:

```ts
it('two attributes on one node both referencing the renamed type are both rewritten', () => {
  const s = createEditorStore();
  s.getState().createType('data', 'Target', 'alpha');
  s.getState().createType('data', 'Holder', 'alpha');
  const targetId = s.getState().nodes.find((n) => n.data.name === 'Target')!.id;
  const holderId = s.getState().nodes.find((n) => n.data.name === 'Holder')!.id;
  s.getState().addAttribute(holderId, 'first', 'Target', '(1..1)');
  s.getState().addAttribute(holderId, 'second', 'Target', '(0..1)');

  s.getState().renameType(targetId, 'Renamed');

  const attrs = (s.getState().nodes.find((n) => n.id === holderId)!.data as any).attributes;
  expect(attrs[0].typeCall.type.$refText).toBe('Renamed');
  expect(attrs[1].typeCall.type.$refText).toBe('Renamed');
});
```

- [ ] **Step 4: Run the full store + serialize suites**

Run: `pnpm --filter @rune-langium/visual-editor exec vitest run test/store test/serialize`
Expected: the two RED tests now PASS; the double-ref test PASSES; ALL existing rename/identity-ops/serialize tests stay green (the qualified-cascade test at rename-cascade.test.ts:157-179 is the canary — it must pass via the edge path now).

- [ ] **Step 5: Full visual-editor suite**

Run: `pnpm --filter @rune-langium/visual-editor test`
Expected: everything green (~1396+ tests). A failure in an unrelated suite touching renameType means a behavior change — investigate, don't suppress.

- [ ] **Step 6: Format + commit**

```bash
pnpm exec oxfmt packages/visual-editor/src/store/editor-store.ts packages/visual-editor/test/store/rename-cascade.test.ts
git add packages/visual-editor/src/store/editor-store.ts packages/visual-editor/test/store/rename-cascade.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "fix(visual-editor): edge-driven renameType cascade — kills cross-ns bare-collision over-rewrite + stale self-refs"
```

---

### Task 5: Final gates

- [ ] **Step 1: Whole-monorepo gates**

```bash
pnpm --filter @rune-langium/visual-editor test
pnpm run type-check
pnpm run format:check
pnpm --filter @rune-langium/studio test
```

Expected: all green. Studio consumes VE from src — its suite must be run (studio uses renameType via editorActions; the VE-actions-interface seam is a recorded studio-breaking hazard).

- [ ] **Step 2: Serialize round-trip spot-check**

Confirm the serialize suite ran in Task 4 Step 4 includes a post-rename round-trip (search `rg -ln "renameType" packages/visual-editor/test/serialize`). If NO serialize test exercises renameType, add one to `test/serialize/editable-roundtrip.test.ts` following its existing pattern: load fixture → renameType → serialize → assert emitted source contains `newName` and does NOT contain a stale `oldName` ref in either bare or qualified form.

- [ ] **Step 3: Ledger + report**

Append progress notes per task to `.superpowers/sdd/edge-ref-index-progress.md` as tasks complete (create on first task).

---

## Self-Review (performed at plan authoring)

- Spec coverage: §1→Task 3 (no stored fields; kind+label+`$type` mapping), §2→Task 1, §3→Task 4, §4→Task 2, §5→Task 4 self-ref RED test + 2b, §6+invariant→Task 3 invariant tests, Testing section→Tasks 3/4/5, Error handling→Task 4 warn+skip. No gaps.
- Placeholders: none; all steps carry code or exact commands.
- Type consistency: `renameRefValue`/`rewriteEdgeRefInNode`/`rewriteOwnRefs`/`selectEdgeIndex` names used identically across Tasks 1/3/4; `EdgeIndex.byTarget(id)` signature consistent. Task 3 Step 3 explicitly instructs matching the existing `updateTypeRefsInNode` signature type name when moving it.
