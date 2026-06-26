# Phase 4 Consumer Cutover — Design

**Date:** 2026-06-26
**Status:** Approved
**Depends on:** Phase 4 generated domain repository (merged, PR #334); the react/react-dom CI fix + oxfmt reformat (merged, PR #335) for a green baseline — this branch is rebased onto that master.

## 1. Goal

Give the forward-looking generated domain repository its first real consumers. The Phase 4 repository (`createRepository`/`DomainRepository`/`selectNodeRepository`) shipped with `byId`/`byType`/`all` but no consumers — the editor's mutation-side lookups were cut over to `nodesById.get` directly, and `byType` has none at all.

This effort wires three real consumers, scaled to where each projection genuinely fits:

- **`byNamespace`** → the `NamespaceExplorerPanel` browse surface (its true need; the panel groups by namespace).
- **`byType`** → the panel's global kind-filter (a smaller but genuine `$type` consumer, via the 1:1 `TypeKind ↔ $type` mapping).
- **`byId`** → the ~5 read-path sites still doing O(n) `nodes.find(n => n.id === x)` scans.

**Out of scope:** any langium-zod / generated-core change. `byNamespace` is added editor-side only (Approach A). The `TypeOption`-based pickers and the `…FromOptions` namespace-tree builder are not touched — they operate on a builtin-inclusive projection, not domain nodes. No taxonomy migration of `TypeKind`/`TypeOption` onto `$type`.

## 2. The taxonomy reality (why the scope is shaped this way)

Two taxonomies are in play and they do NOT align with `byType`:

- `DomainRepository.byType<K>` keys on **`$type`** (`'Data'`, `'RosettaEnumeration'`, …).
- Browse/filter surfaces group by **namespace** and filter by **`TypeKind`** (`'data' | 'choice' | 'enum' | …`, via `resolveNodeKind`); pickers filter a pre-flattened, builtin-inclusive `TypeOption[]`.

`$type → TypeKind` is a deterministic 1:1 mapping, so `byType` can drive kind-filtering of *domain nodes*, but the browse surface also needs **namespace grouping**, which `byType` does not provide. Hence: `byNamespace` is the panel's real need; `byType` fits only the global kind-filter.

## 3. Components

### 3.1 `NodeRepository.byNamespace` + `namespaces()`
**File:** `packages/visual-editor/src/store/node-repository.ts`

The generated `createRepository` exposes only `byId`/`byType`/`all`. `selectNodeRepository` builds an additional namespace index — a `Map<string, TypeGraphNode[]>` keyed on `node.meta.namespace` (the panel's existing grouping axis) — in a second pass over `nodesById.values()`, and returns the composed surface:

```ts
export interface NodeRepository {
  byId(id: string): TypeGraphNode | undefined;
  byType<K extends AnyDomain['$type']>(type: K): readonly NodeOf<K>[];
  byNamespace(ns: string): readonly TypeGraphNode[];
  namespaces(): readonly string[];
  all(): readonly TypeGraphNode[];
}
```

- `byNamespace(ns)` returns the nodes in that namespace (empty array for an unknown namespace, mirroring `byType`).
- `namespaces()` returns the distinct namespaces. Order is insertion order; callers that need sorting sort themselves (the namespace-tree already sorts).
- Memoization is unchanged — still keyed on the `nodesById` Map identity; the namespace index is built inside the same memoized factory.

### 3.2 Namespace-tree builders source from the repository
**File:** `packages/visual-editor/src/utils/namespace-tree.ts`

`buildNamespaceTree` and `buildSegmentedNamespaceTree` change signature from `(nodes: TypeGraphNode[])` to `(repo: NodeRepository)`, replacing their inline `nsMap` grouping loops with `repo.namespaces()` + `repo.byNamespace(ns)`. The shared `buildSegmentsFromEntries` core, the `extractTypeEntry` helper, `countEntriesByKind`, and `buildSegmentedNamespaceTreeFromOptions` (TypeOption input) are unchanged.

### 3.3 `NamespaceExplorerPanel` wiring + `byType` kind-filter
**File:** `packages/visual-editor/src/components/panels/NamespaceExplorerPanel.tsx`

- The panel derives `selectNodeRepository(nodesById)` (memoized) and passes it to the builders instead of `nodes`.
- The global kind-filter (`filterSegmentedTreeByKind` / kind pills) routes through `byType` via a `TypeKind → $type` map: a selected kind resolves to its `$type`, and `byType($type)` yields the node-id set to retain. This is `byType`'s genuine consumer.
- The plan's first task verifies the panel can reach `nodesById` from the store (it already reads `nodes` from a store selector; `nodesById` is the same source).

### 3.4 `byId` read-path cutover
The ~5 surviving O(n) `nodes.find(n => n.id === x)` read sites:

| Site | File | Cutover |
|------|------|---------|
| ExplorePerspective (×6) | `apps/studio/src/shell/ExplorePerspective.tsx` | `repo.byId(id)` (has store access) |
| getNodeData | `packages/visual-editor/src/components/RuneTypeGraph.tsx:846` | `repo.byId(id)` |
| resolveTypeNodeId | `packages/visual-editor/src/components/nodes/NavigationContext.tsx` | `repo.byId` for the exact-id branch (bare-name fallback keeps its existing secondary index) |
| useInheritedMembers | `packages/visual-editor/src/hooks/useInheritedMembers.ts:100` | takes the repository / `nodesById`; qualified-name branch → `byId` |
| edit-validator | `packages/visual-editor/src/validation/edit-validator.ts:68,131` | pure functions take the repository / `nodesById`; id lookups → `byId` |

Rules: sites with `nodesById` in scope use `repo.byId`; pure-function consumers take the repository (or `nodesById`) as a parameter. Each is read-before-edit and behavior-preserving (id lookup is exactly equivalent under invariant I1 `nodes === [...nodesById.values()]`). Sites that scan a *different* node collection (React-Flow `graphNodes` with positions, `StructureGraphDoc.nodes`) are explicitly NOT cut over — the repository does not apply to them.

## 4. Statefulness & invariants

- The repository remains a **pure derived snapshot** of `nodesById` — never a second source of truth. `byNamespace`/`namespaces` are derived in the same memoized pass; a new `nodesById` reference (post-mutation) yields a fresh repository.
- `byNamespace` cannot throw (it's a grouping, not a unique-key index) — unlike `byId`'s `DuplicateKeyError`, which is already unreachable from a reconciled `nodesById`.

## 5. Testing

- **`node-repository.test.ts`**: add `byNamespace` (grouping, unknown-ns empty, order) and `namespaces()` cases; confirm memoization still holds.
- **`namespace-tree` tests**: update existing builder tests to pass a repository (or a small fake) instead of a `nodes` array; assert identical tree output (behavior-preserving refactor).
- **`byType` kind-filter**: a NamespaceExplorer test asserting the kind-filter retains only the selected kind's nodes via `byType` (covers the `TypeKind → $type` mapping).
- **`byId` cutover**: existing suites cover behavior; add coverage where a pure-function signature changes (`useInheritedMembers`, `edit-validator`).
- Full `visual-editor` + `studio` suites stay green; round-trip unaffected (these are read-path changes).

## 6. Sequencing (for the plan)

1. `NodeRepository.byNamespace` + `namespaces()` (+ tests) — TDD.
2. Namespace-tree builders source from the repository (+ updated builder tests).
3. `NamespaceExplorerPanel` wiring + `byType` kind-filter (+ test).
4. `byId` read-path cutover (per-site, read-before-edit).
5. Gates (5 type-checks, lint, full suite) + holistic seam review.

(PR #335's CI fix is already on master and this branch is rebased onto it, so CI runs green.)

## 7. Decisions locked

- `byNamespace` keyed on `meta.namespace` (the panel's axis; matches `$namespace` on data).
- Builders take the repository, not panel-pre-grouped entries.
- `byId` cutover prefers `repo.byId` where the repository is in scope.
- Editor-only — no langium-zod/generated-core change (Approach A).
- `TypeOption` pickers and `…FromOptions` builder untouched.
