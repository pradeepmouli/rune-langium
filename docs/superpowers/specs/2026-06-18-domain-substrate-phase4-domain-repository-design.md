# Domain Substrate — Phase 4: Generated Typed Domain Repository

## Goal

Give every surface a **single typed lookup abstraction** over domain elements — `byId` (qualified name), `byType` (type-safe), `all` — generated from the grammar by langium-zod and shipped in `@rune-langium/core`. This replaces the ad-hoc linear scans scattered through the editor store (`nodes.find(n => n.data.name === typeName)`, `nodes.find(n => n.id === nodeId)`) with one repository surface, and finally lands the editable-type union (`AnyDomain`) in core instead of being hand-maintained as the editor's `AnyGraphNode`.

This is the 4th and final phase of the editable-domain-model effort (north star: "the domain model is the one and only representation across all surfaces"). Phases 1–3 are merged; the consumer read-surfaces already read `node.data`/`node.meta` directly, so Phase 4 is **not a migration** — there is no `toDomain`/`AnyDomain`/repository abstraction in the tree to cut over *from*. Phase 4 *builds the missing typed index*.

## Context (verified against the tree, 2026-06-18)

- **No `toDomain`, no `AnyDomain`, no repository exist.** Exhaustive search finds zero definitions/call-sites; they survive only as named intent in comments/tests. The "read-projection layer" is `packages/core/src/generated/domain.ts` — namespace-merged **mutation/accessor ops** over `Dehydrated<ast.*>`, with **no** type-keyed or id-keyed lookup.
- **`Dehydrated<T>` carries no `id`.** Its domain identity is the **qualified name** = `qualifiedExportPath($namespace, name)`.
- **`node.id` is already the qualified name.** `ast-to-model.ts:187` builds `nodeId = makeNodeId(namespace, name)`, and `makeNodeId(ns, n) = qualifiedExportPath(ns, n)` (`node-projection.ts:24`). So in the editor, **`node.id` === the domain qualified-name key**.
- **A transient `nameToNodeId` map already exists** (`ast-to-model.ts:207–211`) indexing both the qualified id and the bare `data.name`, used once for edge-building then discarded — the store's runtime mutations cannot reach it, so they re-scan `get().nodes` linearly. The bare-name half also silently clobbers cross-namespace homonyms (last-write-wins).
- **Editor lookups split three ways** (all in `editor-store.ts`):
  - **node-id scans** (`:1386`, `:1411`, `:1477`): `nodes.find(n => n.id === nodeId)` — want the `TypeGraphNode` (position/meta/type).
  - **name scans** (`:1324`, `:1594`, `:1767`, `:1880`): `nodes.find(n => n.data.name === typeName)` — resolve a ref's target node.
  - **type filters**: ad-hoc `.filter` over `nodes` by `$type`.
- **`nodesById: Map<string, TypeGraphNode>`** is the editor's Map-as-SoT (invariant I1: `nodes === [...nodesById.values()]`); its reference is swapped on every `mutateGraph`. It is already a by-id index — but keyed to `TypeGraphNode`, not type-bucketed, and not consulted by the scan sites above.
- **langium-zod** is present locally at `0.8.2`/`0.8.3` with the emitter at `packages/langium-zod/src/emitters/namespace-ops.ts` (a string-template emitter that already walks the full editable object-type set via `objectTypeNames` and qualifies every type as `ast.Foo`). This is the emitter Phase 4 extends, exactly as Phase 2 did.

---

## §1 Architecture — two streams (mirrors Phase 2)

**Stream A (cross-repo, langium-zod, blocking):** extend `namespace-ops.ts` to emit the repository. Lands as a langium-zod PR + version publish before Stream B Task that regenerates.

**Stream B (rune-side):** regenerate `domain.ts`, land `AnyDomain` + repository in core with tests, then cut the editor over to a single repository surface.

```
langium-zod emitter ──generates──▶ core/generated/domain.ts ──export *──▶ @rune-langium/core
                                                                              │
                  editor: createRepository(nodesById.values(), {key,type}) ◀──┘
                  (memoized derived snapshot; raw nodesById stays the SoT)
```

---

## §2 Generated artifacts (emitted into `domain.ts`)

The emitter adds three things alongside the existing per-type namespaces.

### §2.1 Generic repository primitive (runtime + interface)

```ts
export interface Repository<T> {
  byId(id: string): T | undefined;                  // exact qualified-name key
  byType<K extends string>(type: K): readonly T[];  // bucketed on the type-selector
  all(): readonly T[];
}

/**
 * Builds an id-index + type-bucket index in one pass.
 * THROWS `DuplicateKeyError(key)` if two items map to the same id — a duplicate
 * qualified name is a genuine duplicate-definition model error, surfaced loudly
 * at index-build time rather than silently clobbered.
 */
export function createRepository<T>(
  items: Iterable<T>,
  opts: { key: (t: T) => string; type: (t: T) => string },
): Repository<T>;
```

The runtime is grammar-invariant (two `Map`s); it is emitted into `domain.ts` for one-home consistency with the existing generated ops (per Approach A), not hand-authored.

### §2.2 Editable-type union + type map (generated, grammar-synced)

```ts
export type AnyDomain =
  | Dehydrated<ast.Data> | Dehydrated<ast.Choice> | Dehydrated<ast.RosettaEnumeration>
  | Dehydrated<ast.RosettaFunction> | Dehydrated<ast.RosettaRecordType>
  | Dehydrated<ast.RosettaTypeAlias> | Dehydrated<ast.RosettaBasicType>
  | Dehydrated<ast.Annotation>;     // = the editor's current AnyGraphNode arms

export interface DomainTypeMap {
  Data: Dehydrated<ast.Data>;
  Choice: Dehydrated<ast.Choice>;
  /* …one entry per editable object type… */
}
```

Members come from a **config-driven `repository.elementTypes` list** in `domain-surface.config.json` (the top-level element types: Data, Choice, RosettaEnumeration, RosettaFunction, RosettaRecordType, RosettaTypeAlias, RosettaBasicType, Annotation), mirroring the existing `identity` map. This is deliberate: the emitter's `objectTypeNames` set includes *member* types (Attribute, TypeCall, …) that must **not** appear in `AnyDomain` — only node-level elements belong in the domain repository. The list is config, not hand-maintained TypeScript, so it stays a single source of truth driving generation.

### §2.3 Domain-typed specialization (typed `byType`)

```ts
export interface DomainRepository {
  byId(qn: string): AnyDomain | undefined;
  byType<K extends keyof DomainTypeMap>(type: K): readonly DomainTypeMap[K][];  // type-safe
  all(): readonly AnyDomain[];
}

export function createDomainRepository(
  elements: Iterable<AnyDomain>,
  key: (e: AnyDomain) => string = (e) => (e.$namespace ? `${e.$namespace}.${e.name}` : e.name),
): DomainRepository;   // delegates to createRepository with type: (e) => e.$type
```

The default key is the qualified name with a bare-`name` fallback when `$namespace` is absent. Consumers with their own identity policy (the editor) pass an explicit `key`.

---

## §3 Consumer cutover — one lookup surface in the editor

The editor builds **one** node repository per derived snapshot and routes **every** node/element lookup through it. Action code stops touching `get().nodes`/`nodesById` directly for reads.

```ts
// Node-typed instance: indexes TypeGraphNode by node.id (= qualified name) and by $type.
const repo = createRepository(nodesById.values(), {
  key:  (n) => n.id,           // = makeNodeId(namespace, name) = qualified name
  type: (n) => n.data.$type,
});
```

| Site | Today | After |
|---|---|---|
| node-id scans (`:1386`, `:1411`, `:1477`) | `nodes.find(n => n.id === nodeId)` | `repo.byId(nodeId)` → `TypeGraphNode` |
| name scans (`:1324`, `:1594`, `:1767`, `:1880`) | linear bare-name `.find` | `repo.byId(makeNodeId(ns, typeName))` |
| type filters | ad-hoc `.filter(n => n.data.$type === …)` | `repo.byType('Data')` |
| editor `AnyGraphNode` union (`types.ts:77–95`) | hand-maintained discriminated union | `import type { AnyDomain }` from core |

Notes:
- **`byId` === `byQualifiedName`** in the editor (node.id *is* the qualified name), so the editor's surface is just `byId` + `byType`. There is no bare-name lookup (per the §collision decision); name scans qualify the bare `typeName` with the source node's namespace first.
- **Node-typed `byType`.** `repo.byType('Data')` over nodes returns `TypeGraphNode[]` whose `.data` is `Dehydrated<Data>`. The narrowing map `NodeOf<K> = Node<DomainTypeMap[K]> & { meta: GraphNodeMeta }` is supplied editor-side (it composes the generated `DomainTypeMap` with the editor's `TypeGraphNode` shape); the generic `byType<K extends string>` accepts it without a generated node-map in core.
- **`nodesById` remains the SoT.** The repository is a derived snapshot; raw `nodesById` is not read by action code but is still the authoritative Map that mutations write. No new invariant to sync.

### Cross-namespace bare refs (explicit scope boundary)
Name-scan cutover qualifies a bare `typeName` with the **source node's namespace**. A bare ref that resolves cross-namespace via imports is a pre-existing ambiguity the linear scan also mishandles (it matched any/first homonym); Phase 4 does **not** fix it (out of scope) and does **not** regress it. When a ref's `$refText` is already qualified, `byId` uses it directly.

---

## §4 Statefulness & data flow — pure snapshot

- The repository is **always derived, never a source of truth.** It is rebuilt from `nodesById` whenever the Map's identity changes (Maps-as-SoT swaps the reference on every `mutateGraph`), via a **memoized selector** keyed on the Map reference. This matches the `edgesById`/Maps-as-SoT discipline — no second SoT, no sync invariant.
- **Build ordering (requirement).** The repo is constructed from `nodesById` **after** `mutateGraph` reconciliation, which already dedupes by node id (`nodeIdSet` in `ast-to-model.ts`). This guarantees no two nodes with the same qualified name reach `createRepository`, so the fail-fast throw (§5) cannot fire on a transient mid-edit state.
- Non-editor consumers (core/studio/codegen) that hold a bare `Dehydrated[]` build a `DomainRepository` directly via `createDomainRepository(elements)`.

---

## §5 Error handling & edge cases

- **Duplicate qualified key → throw.** `createRepository` throws `DuplicateKeyError(key)` at build time. Rationale: a duplicate qualified name is a genuine duplicate-definition model error; throwing surfaces it loudly at the exact boundary. The §4 build-ordering requirement ensures the editor never feeds it transient duplicates.
- **Bare-name collisions → impossible to mis-resolve.** The key is qualified; no bare lookup exists. (Decision: qualified-only; bare callers thread a namespace.)
- **Missing `$namespace`.** The default `createDomainRepository` key falls back to bare `name`; the editor always passes an explicit `key` (`n => n.id`), so this never bites in-editor.
- **Curated / deferred nodes.** Carry `$type` + `name` + `$namespace` post-Phase-2, so they index normally (no `toDomain`-style throw on `$type`-less nodes).
- **Empty collection.** `createRepository([], …)` yields a repo whose `byId`/`byType` return `undefined`/`[]` and `all()` returns `[]`.

---

## §6 Testing & verification gates (non-negotiable)

**langium-zod (Stream A):**
- Emitter unit tests against a fixture grammar: assert the emitted `AnyDomain` union members, `DomainTypeMap` entries, the generic `createRepository`/`Repository<T>` source, and `createDomainRepository`.
- Type-level assertion that `byType('Data')` is `readonly Dehydrated<Data>[]` (e.g. `tsd`/expect-type).
- Determinism: regenerating the fixture output is byte-stable.

**core (Stream B):**
- `createRepository` runtime tests: `byId` hit/miss, `byType` buckets, `all()` order, custom `key`/`type`, empty, **duplicate-key throws**.
- `createDomainRepository` tests: default qualified key, `$namespace`-absent fallback, typed `byType` return (`tsd`).
- `generate:domain` deterministic under the `check-generated` CI gate.

**visual-editor (Stream B):**
- Scan-site cutover keeps `editor-store-actions`, ref-cascade/rename, round-trip (`load → edit → serialize → reparse` byte-stable), degraded-reparse, and `map-substrate`/`undo-maps`/`update-graph-view` suites green.
- `AnyGraphNode → AnyDomain` swap type-checks clean across **all 5 packages** (core, visual-editor, studio, lsp-server, cli).
- A test pinning the memoized-selector identity behavior (repo rebuilt only when `nodesById` reference changes).

**Final:** holistic seam review (Opus) over the build-ordering ↔ throw-on-duplicate ↔ memoization interaction.

---

## §7 Sequencing

1. **Stream A** — langium-zod: emitter + tests → PR → publish (`0.8.4`/`0.9.0`) → rune override + `minimumReleaseAgeExclude` bump.
2. **Stream B.1** — regenerate `domain.ts`; land `AnyDomain` + `DomainTypeMap` + `Repository`/`createRepository` + `DomainRepository`/`createDomainRepository` in core with tests; re-export via `core/index.ts` (already `export * from './generated/domain.js'`).
3. **Stream B.2** — editor cutover: add the memoized node-repository selector; migrate node-id scans → `repo.byId`, name scans → `repo.byId(makeNodeId(ns, typeName))`, type filters → `repo.byType`; swap `AnyGraphNode → AnyDomain` (keep the editor's `NodeOf<K>` narrowing map). Enforce the §4 build-ordering requirement.

Each step keeps every package compiling and the full visual-editor suite green (no long red branches).

---

## Out of scope

- Cross-namespace bare-ref resolution beyond same-namespace qualify (pre-existing ambiguity; not regressed).
- Runtime Zod validation inside the repository (the cast/index is sufficient; additive later).
- Any change to `node.meta`, the edge model, or `edgesById` (refs remain inline `{$refText}`; promoting `edgesById` to a ref registry stays deferred — see the edgesById spike).
- Studio panels (already domain-direct) and `/api/parse` producers — no consumer change needed.
- A node-typed `byType` map *generated in core* — the editor supplies `NodeOf<K>` locally over the generated `DomainTypeMap`.

---

## Decisions log

- **Build the missing typed index, not a migration.** Verified: consumers already read domain-direct; `toDomain`/`AnyDomain`/repository do not exist. (Survey, 2026-06-18.)
- **Generated in `domain.ts` via langium-zod** (Approach A), matching the generated-domain-surface north star and the prior 3D "generated repository w/ byType" decision. Cross-repo, two-stream like Phase 2.
- **Generic `Repository<T>` primitive + generated domain specialization.** Lets "one repository surface" hold for both the *domain* repo (over `Dehydrated`) and the editor's *node* repo (over `TypeGraphNode`) — same shape, different `key`/`type` selectors; typed `byType` via the generated `DomainTypeMap` / editor `NodeOf<K>`.
- **Identity = qualified name = `node.id`** (`makeNodeId` = `qualifiedExportPath`); `byId` is the only key. Injectable `key` selector; editor passes `n => n.id`.
- **Qualified-only; no bare-name lookup** — bare callers thread a namespace (qualify-then-`byId`).
- **Throw on duplicate qualified key** — fail-fast at build; §4 ordering guarantees no transient duplicates reach it.
- **Pure-snapshot, derived, never a SoT** — memoized selector over `nodesById`; consistent with Maps-as-SoT / `edgesById` discipline.
- **`AnyDomain` lands in core** — the editor's hand-maintained `AnyGraphNode` union becomes an import (DRY win).
