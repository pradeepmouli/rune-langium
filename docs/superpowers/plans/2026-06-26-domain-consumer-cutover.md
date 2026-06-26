# Phase 4 Consumer Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the generated domain repository its first real consumers — `byNamespace` for the NamespaceExplorer tree, `byType` for per-kind pill counts, and `byId` for the surviving O(n) read-path scans.

**Architecture:** Editor-only (Approach A). `selectNodeRepository` gains a `byNamespace`/`namespaces()` index built in its memoized factory; the namespace-tree builders source grouping from it; `NamespaceExplorerPanel` (via `ExplorePerspective`) consumes the repository; ~5 read-path sites switch `nodes.find(n => n.id === x)` → `repo.byId(x)`. No langium-zod / generated-core change.

**Tech Stack:** TypeScript (strict ESM), React 19, zustand, Vitest. `packages/visual-editor` resolves `@rune-langium/core` to source; `apps/studio` consumes it as a package.

## Global Constraints

- SPDX header on new files: `// SPDX-License-Identifier: MIT` then `// Copyright (c) 2026 Pradeep Mouli` (packages/ = MIT).
- `SKIP_SIMPLE_GIT_HOOKS=1` on every commit (NOT `--no-verify`).
- Run visual-editor tests from the package dir: `cd packages/visual-editor && pnpm vitest run <path>` (root vitest excludes `packages/visual-editor/**`).
- Behavior-preserving: every `byId` cutover must be exactly equivalent under invariant I1 (`nodes === [...nodesById.values()]`). Read each site before editing.
- DRY/YAGNI/TDD. Do not replace `filterSegmentedTreeByKind` (it already filters cleanly).
- Branch `feat/domain-consumer-cutover` is rebased onto master (carries the PR #335 react/CI fix).

---

### Task 1: `NodeRepository.byNamespace` + `namespaces()`

**Files:**
- Modify: `packages/visual-editor/src/store/node-repository.ts`
- Test: `packages/visual-editor/test/store/node-repository.test.ts`

**Interfaces:**
- Produces: `NodeRepository.byNamespace(ns: string): readonly TypeGraphNode[]`, `NodeRepository.namespaces(): readonly string[]`. Existing `byId`/`byType`/`all` unchanged. `selectNodeRepository(nodesById)` unchanged signature.

- [ ] **Step 1: Write the failing tests**

Append to `packages/visual-editor/test/store/node-repository.test.ts` (it already imports `selectNodeRepository`, `TypeGraphNode`, and defines the `node(id, $type, name)` factory with `meta: { namespace: 'a', ... }`):

```ts
describe('selectNodeRepository — byNamespace / namespaces', () => {
  const nodeNs = (id: string, $type: string, name: string, ns: string): TypeGraphNode =>
    ({
      id,
      type: 'data',
      position: { x: 0, y: 0 },
      data: { $type, name, attributes: [] } as unknown as TypeGraphNode['data'],
      meta: { namespace: ns, errors: [], hasExternalRefs: false },
    }) as TypeGraphNode;

  it('byNamespace returns the nodes in that namespace (meta.namespace axis)', () => {
    const map = new Map([
      ['a.Foo', nodeNs('a.Foo', 'Data', 'Foo', 'a')],
      ['a.Bar', nodeNs('a.Bar', 'Data', 'Bar', 'a')],
      ['b.Baz', nodeNs('b.Baz', 'Data', 'Baz', 'b')],
    ]);
    const repo = selectNodeRepository(map);
    expect(repo.byNamespace('a').map((n) => n.id)).toEqual(['a.Foo', 'a.Bar']);
    expect(repo.byNamespace('b').map((n) => n.id)).toEqual(['b.Baz']);
  });

  it('byNamespace returns an empty array for an unknown namespace', () => {
    const repo = selectNodeRepository(new Map([['a.Foo', nodeNs('a.Foo', 'Data', 'Foo', 'a')]]));
    expect(repo.byNamespace('zzz')).toEqual([]);
  });

  it('namespaces() returns each distinct namespace once', () => {
    const map = new Map([
      ['a.Foo', nodeNs('a.Foo', 'Data', 'Foo', 'a')],
      ['a.Bar', nodeNs('a.Bar', 'Data', 'Bar', 'a')],
      ['b.Baz', nodeNs('b.Baz', 'Data', 'Baz', 'b')],
    ]);
    expect([...selectNodeRepository(map).namespaces()].sort()).toEqual(['a', 'b']);
  });

  it('byNamespace/namespaces share the same memoized instance as byId', () => {
    const map = new Map([['a.Foo', nodeNs('a.Foo', 'Data', 'Foo', 'a')]]);
    expect(selectNodeRepository(map)).toBe(selectNodeRepository(map));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/visual-editor && pnpm vitest run test/store/node-repository.test.ts`
Expected: FAIL — `repo.byNamespace is not a function`.

- [ ] **Step 3: Extend the interface + factory**

In `node-repository.ts`, add the two members to `NodeRepository` (after `byType`):

```ts
export interface NodeRepository {
  byId(id: string): TypeGraphNode | undefined;
  byType<K extends AnyDomain['$type']>(type: K): readonly NodeOf<K>[];
  /** Nodes grouped by `meta.namespace` (the editor's namespace axis). Empty for an unknown ns. */
  byNamespace(ns: string): readonly TypeGraphNode[];
  /** Each distinct namespace once, in first-seen order. */
  namespaces(): readonly string[];
  all(): readonly TypeGraphNode[];
}
```

Replace the body of `selectNodeRepository` (keep the cache vars and the early return):

```ts
export function selectNodeRepository(nodesById: ReadonlyMap<string, TypeGraphNode>): NodeRepository {
  if (nodesById === cacheKey && cacheValue !== null) return cacheValue;
  const base = createRepository(nodesById.values(), {
    key: (n) => n.id,
    type: (n) => n.data.$type
  });
  // Namespace index — a second pass over the same values; createRepository
  // encapsulates its own loop, so byNamespace is composed here rather than
  // generated. Keyed on meta.namespace (the panel's grouping axis).
  const byNs = new Map<string, TypeGraphNode[]>();
  for (const n of nodesById.values()) {
    let bucket = byNs.get(n.meta.namespace);
    if (bucket === undefined) {
      bucket = [];
      byNs.set(n.meta.namespace, bucket);
    }
    bucket.push(n);
  }
  const repo: NodeRepository = {
    byId: (id) => base.byId(id),
    byType: ((type: string) => base.byType(type)) as NodeRepository['byType'],
    byNamespace: (ns) => byNs.get(ns) ?? [],
    namespaces: () => [...byNs.keys()],
    all: () => base.all()
  };
  cacheKey = nodesById;
  cacheValue = repo;
  return repo;
}
```

Update the `STATUS —` doc comment's "no consumer today" line to: `STATUS — byNamespace drives the NamespaceExplorer tree; byType drives the kind-pill counts; byId backs the read-path lookups (see Phase 4 consumer cutover).`

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/visual-editor && pnpm vitest run test/store/node-repository.test.ts`
Expected: PASS (new + existing). Then `pnpm --filter @rune-langium/visual-editor run type-check` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/visual-editor/src/store/node-repository.ts packages/visual-editor/test/store/node-repository.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(visual-editor): add byNamespace/namespaces to NodeRepository"
```

---

### Task 2: Namespace-tree builders source from the repository

**Files:**
- Modify: `packages/visual-editor/src/utils/namespace-tree.ts` (`buildNamespaceTree` ~line 85, `buildSegmentedNamespaceTree` ~line 266)
- Test: `packages/visual-editor/test/utils/namespace-tree.test.ts` (or the existing namespace-tree test file — confirm path)

**Interfaces:**
- Consumes: `NodeRepository` (Task 1) — `namespaces()`, `byNamespace(ns)`.
- Produces: `buildNamespaceTree(repo: NodeRepository): NamespaceTreeNode[]`, `buildSegmentedNamespaceTree(repo: NodeRepository): SegmentNode[]`. `buildSegmentsFromEntries`, `extractTypeEntry`, `countEntriesByKind`, `buildSegmentedNamespaceTreeFromOptions` UNCHANGED.

- [ ] **Step 1: Update the existing builder tests to pass a repository**

In the namespace-tree test file, the builder tests currently call `buildSegmentedNamespaceTree(nodes)` / `buildNamespaceTree(nodes)`. Add a tiny helper near the top and switch those calls:

```ts
import { selectNodeRepository } from '../../src/store/node-repository.js';
// Build a repo from an array of TypeGraphNode for the builder tests.
const repoOf = (nodes: TypeGraphNode[]) => selectNodeRepository(new Map(nodes.map((n) => [n.id, n])));
```

Replace each `buildSegmentedNamespaceTree(<nodesArray>)` → `buildSegmentedNamespaceTree(repoOf(<nodesArray>))` and likewise for `buildNamespaceTree`. The asserted tree output is unchanged (behavior-preserving refactor). Leave `buildSegmentedNamespaceTreeFromOptions(...)` tests untouched.

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/visual-editor && pnpm vitest run test/utils/namespace-tree.test.ts`
Expected: FAIL — type error / builders still expect `TypeGraphNode[]`.

- [ ] **Step 3: Rewrite the two node-based builders**

In `namespace-tree.ts`, add the import:

```ts
import type { NodeRepository } from '../store/node-repository.js';
```

Replace `buildNamespaceTree` (it builds an `nsMap` then per-namespace `NamespaceTreeNode`s):

```ts
export function buildNamespaceTree(repo: NodeRepository): NamespaceTreeNode[] {
  const tree: NamespaceTreeNode[] = [];
  for (const namespace of repo.namespaces()) {
    const types = repo.byNamespace(namespace).map(extractTypeEntry);
    types.sort((a, b) => a.name.localeCompare(b.name));
    tree.push({
      namespace,
      types,
      totalCount: types.length,
      dataCount: types.filter((t) => t.kind === 'data').length,
      choiceCount: types.filter((t) => t.kind === 'choice').length,
      enumCount: types.filter((t) => t.kind === 'enum').length,
      funcCount: types.filter((t) => t.kind === 'func').length
    });
  }
  tree.sort((a, b) => a.namespace.localeCompare(b.namespace));
  return tree;
}
```

Replace `buildSegmentedNamespaceTree`:

```ts
export function buildSegmentedNamespaceTree(repo: NodeRepository): SegmentNode[] {
  const nsMap = new Map<string, NamespaceTypeEntry[]>();
  for (const namespace of repo.namespaces()) {
    nsMap.set(namespace, repo.byNamespace(namespace).map(extractTypeEntry));
  }
  return buildSegmentsFromEntries(nsMap);
}
```

(Note: `buildSegmentsFromEntries` already sorts each namespace's entries and handles the empty case — `nsMap.size === 0` returns `[]` — so the old `nodes.length === 0` guard is no longer needed.)

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/visual-editor && pnpm vitest run test/utils/namespace-tree.test.ts`
Expected: PASS (identical tree output). Then `pnpm --filter @rune-langium/visual-editor run type-check` → will FAIL at the `NamespaceExplorerPanel` call sites (still passing `nodes`) — that's expected and fixed in Task 3. Do NOT fix it here.

- [ ] **Step 5: Commit**

```bash
git add packages/visual-editor/src/utils/namespace-tree.ts packages/visual-editor/test/utils/namespace-tree.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "refactor(visual-editor): namespace-tree builders source grouping from NodeRepository"
```

---

### Task 3: NamespaceExplorerPanel wiring + byType pill counts

**Files:**
- Modify: `packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx`
- Modify: `apps/studio/src/shell/ExplorePerspective.tsx` (the panel's render site + nodesById source)
- Test: `packages/visual-editor/test/components/NamespaceExplorerPanel.test.tsx` (confirm path)

**Interfaces:**
- Consumes: `selectNodeRepository` (Task 1), the repository-based builders (Task 2), `NODE_TYPE_TO_AST_TYPE` from `../../adapters/model-helpers.js`.
- Produces: `NamespaceExplorerPanel` takes a `nodeRepository: NodeRepository` prop (replacing or alongside `nodes` — see Step 1).

- [ ] **Step 1: Read-before-edit — establish the nodesById → repository thread**

Open `apps/studio/src/shell/ExplorePerspective.tsx` and find where `<NamespaceExplorerPanel nodes={...} ... />` is rendered and where the store's `nodesById` Map is available (the store exposes `nodesById`; it's used elsewhere in this file). Open `NamespaceExplorerPanel.tsx` and confirm the `nodes` prop is consumed ONLY by the two `buildSegmentedNamespaceTree(nodes)` calls (lines ~205, ~225) — grep `nodes` within the component to be sure. If `nodes` is used for anything else, keep the `nodes` prop and ADD `nodeRepository`; otherwise replace `nodes` with `nodeRepository`. Report which.

- [ ] **Step 2: Thread the repository from ExplorePerspective (failing compile)**

In `ExplorePerspective.tsx`: derive the repository once from the store's `nodesById` and pass it to the panel:

```ts
import { selectNodeRepository } from '@rune-langium/visual-editor';
// ...near where storeNodes / nodesById are read from the store:
const nodeRepository = selectNodeRepository(nodesById);
// ...in the render:
<NamespaceExplorerPanel nodeRepository={nodeRepository} /* ...existing props except nodes if removed... */ />
```

(If `selectNodeRepository` is not yet re-exported from `@rune-langium/visual-editor`'s public entry, add it to that package's index `export`. Confirm during Step 1.)

- [ ] **Step 3: Update the panel — builders + byType pill counts**

In `NamespaceExplorerPanel.tsx`:

Add imports:
```ts
import type { NodeRepository } from '../../store/node-repository.js';
import { NODE_TYPE_TO_AST_TYPE } from '../../adapters/model-helpers.js';
import type { AnyDomain } from '@rune-langium/core';
```

Change the prop (`nodes: TypeGraphNode[]` → `nodeRepository: NodeRepository`; update `NamespaceExplorerPanelProps` and the destructure). Update the two builder calls:
```ts
const segmentedRootsRaw = useMemo(() => buildSegmentedNamespaceTree(nodeRepository), [nodeRepository]);
// ...and in the treeExpanded initializer:
const roots = buildSegmentedNamespaceTree(nodeRepository);
```

Add a per-kind count map (memoized) for the pills:
```ts
const kindCounts = useMemo(() => {
  const counts = {} as Record<TypeKind, number>;
  for (const kind of EXPLORER_FILTER_KINDS) {
    counts[kind] = nodeRepository.byType(NODE_TYPE_TO_AST_TYPE[kind] as AnyDomain['$type']).length;
  }
  return counts;
}, [nodeRepository]);
```

In the pill button (after `{KIND_LABEL[kind]}`), render the count:
```tsx
{KIND_LABEL[kind]}
<span className="text-muted-foreground/70 tabular-nums">{kindCounts[kind]}</span>
```

- [ ] **Step 4: Update the panel test**

In `NamespaceExplorerPanel.test.tsx`, build the panel's `nodeRepository` prop via `selectNodeRepository(new Map(nodes.map((n) => [n.id, n])))` instead of passing `nodes`. Add one assertion that the `data-testid="kind-filter-data"` pill renders the expected count (e.g. with two Data nodes, the pill shows `2`).

- [ ] **Step 5: Run to verify**

Run (from repo root, both packages):
```bash
cd packages/visual-editor && pnpm vitest run test/components/NamespaceExplorerPanel.test.tsx test/utils/namespace-tree.test.ts && cd ../..
pnpm --filter @rune-langium/visual-editor run type-check
pnpm --filter @rune-langium/studio run type-check
```
Expected: PASS across all three (Task 2's call-site type error is now resolved).

- [ ] **Step 6: Commit**

```bash
git add packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx apps/studio/src/shell/ExplorePerspective.tsx packages/visual-editor/test/components/NamespaceExplorerPanel.test.tsx packages/visual-editor/src/index.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(visual-editor): NamespaceExplorer consumes NodeRepository (byNamespace tree + byType pill counts)"
```

---

### Task 4: `byId` read-path cutover

**Files (read-before-edit each; line numbers are from the survey and may drift):**
- Modify: `apps/studio/src/shell/ExplorePerspective.tsx` (`:647, :766, :771, :1144, :1179, :1755` — `storeNodes.find(n => n.id === <id>)`)
- Modify: `packages/visual-editor/src/components/RuneTypeGraph.tsx:846` (`getNodeData`)
- Modify: `packages/visual-editor/src/components/nodes/NavigationContext.tsx:75` (`resolveTypeNodeId` exact-id branch)
- Modify: `packages/visual-editor/src/hooks/useInheritedMembers.ts:100`
- Modify: `packages/visual-editor/src/validation/edit-validator.ts:68, :131`

**Interfaces:**
- Consumes: `NodeRepository.byId` (Task 1) and `selectNodeRepository` (already threaded in `ExplorePerspective` from Task 3).

- [ ] **Step 1: ExplorePerspective — six id scans → `nodeRepository.byId`**

Reuse the `nodeRepository` from Task 3. At each of the six sites, replace `storeNodes.find((n) => n.id === <id>)` with `nodeRepository.byId(<id>)`. Read each site first — confirm the variable name (`selectedNodeId`, `nodeId`, etc.) and that the result is used the same way (a `TypeGraphNode | undefined`). These are exactly equivalent under I1.

- [ ] **Step 2: RuneTypeGraph.getNodeData → `byId`**

At `RuneTypeGraph.tsx:846`, `storeNodes.find((n) => n.id === nodeId)` → derive the repo from the store's `nodesById` (same source `storeNodes` comes from) and call `selectNodeRepository(nodesById).byId(nodeId)`. Confirm the imperative handle returns the same `node.data`. Do NOT touch the `graphNodes` array reads (`:480/:513/:592/:707`) — those carry React-Flow positions, a different collection.

- [ ] **Step 3: NavigationContext.resolveTypeNodeId — exact-id branch → `byId`**

At `NavigationContext.tsx:75`, the exact-id existence check (currently against a `Set<string>` of ids built at `RuneTypeGraph.tsx:745`) is left AS-IS if it already uses the id Set (that Set is itself an id index — no scan to replace). Only if the resolver does a `nodes.find(n => n.id === ...)` array scan, replace that with `byId`. The bare-name last-segment fallback keeps its existing secondary index. Read the function and report which branch (if any) had an array scan.

- [ ] **Step 4: useInheritedMembers — accept the repository, qualified branch → `byId`**

`useInheritedMembers.ts:100` walks the supertype chain doing `allNodes.find` matching bare name OR `makeNodeId(ns, name)`. Change the hook to also accept the repository (or `nodesById`); for the qualified-name branch (`makeNodeId(ns, name)`) use `repo.byId(makeNodeId(ns, name))`; keep the bare-name branch as the array fallback (the repo has no name index). Update the one caller (`EditorFormPanel.tsx:171` `useInheritedMembers(nodeData, allNodes)`) to pass the repository, threading it the same way `allNodes` arrives. Add/adjust a unit test that exercises the qualified-name resolution.

- [ ] **Step 5: edit-validator — pure functions take the repository, id lookups → `byId`**

`edit-validator.ts:68` (`detectDuplicateName`) and `:131` (`detectDuplicateEnumValue`) do `nodes.find(n => n.id === nodeId)`. Change these functions to accept the repository (or `nodesById`) and use `byId(nodeId)`. The name+namespace dup SCAN at `:80` (`nodes.some(name && namespace)`) stays a scan (the repo has no name index). Update callers + the validator's tests to pass the repository.

- [ ] **Step 6: Run the full visual-editor + studio suites**

Run:
```bash
pnpm --filter @rune-langium/visual-editor test
pnpm --filter @rune-langium/studio test
pnpm --filter @rune-langium/visual-editor run type-check && pnpm --filter @rune-langium/studio run type-check
```
Expected: PASS (behavior-preserving; existing suites cover these read paths).

- [ ] **Step 7: Commit**

```bash
git add -u
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "refactor(visual-editor,studio): route read-path id lookups through NodeRepository.byId"
```

---

### Task 5: Final gates + holistic review

**Files:** none (verification + review)

- [ ] **Step 1: Five package type-checks** — `pnpm run type-check` → PASS (core, visual-editor, studio, lsp-server, cli).
- [ ] **Step 2: Lint** — `pnpm run lint` → PASS (no new errors).
- [ ] **Step 3: Full suite** — `pnpm test` → PASS.
- [ ] **Step 4: Holistic seam review** — request an Opus review over: (a) memoization — `byNamespace`/`namespaces` derive in the same memoized pass and never become a second source of truth; (b) the builder refactor is output-identical (behavior-preserving); (c) every `byId` cutover is exactly equivalent under I1 and no site that scans a *different* collection (React-Flow `graphNodes`, `StructureGraphDoc.nodes`) was wrongly cut over; (d) `byType` pill counts match the tree. Confirm no read-path behavior changed.
- [ ] **Step 5: Changeset (if the repo gates on it) + open PR** — `pnpm run changeset` if visual-editor/studio publish; then `git push -u origin feat/domain-consumer-cutover && gh pr create --base master --fill`.

---

## Self-Review

**Spec coverage:** §3.1 byNamespace/namespaces → Task 1. §3.2 builder cutover → Task 2. §3.3 panel wiring + byType pill counts → Task 3. §3.4 byId cutover (all 5 site groups) → Task 4. §5 testing → per-task tests + Task 5. §6 sequencing → Tasks 1→5. All covered.

**Placeholder scan:** Line numbers in Task 4 are marked "may drift / read-before-edit" with the exact current pattern to match — not placeholders. Test-file paths flagged "confirm path" where the survey didn't pin them; the implementer confirms via `ls`/grep in Step 1 of each task.

**Type consistency:** `NodeRepository` gains `byNamespace(ns: string): readonly TypeGraphNode[]` + `namespaces(): readonly string[]`, used identically in Tasks 2/3/4. `buildSegmentedNamespaceTree`/`buildNamespaceTree` take `NodeRepository` in both Task 2 (definition) and Task 3 (call site). `NODE_TYPE_TO_AST_TYPE` (kind→$type) used for pill counts matches model-helpers. `selectNodeRepository(nodesById)` signature unchanged throughout.
