# Node Representation Unification — Maps-as-SoT + a single node-projection module

- **Date:** 2026-06-05
- **Status:** Design — **metamodel + generator-target agreed (§0, 2026-06-06)**, grounded in a langium-zod architecture review (§0.5). The grammar/AST is the metamodel; the node surface is *generated* by a new `domain` target on `langium-zod`; the editor refactor (§1–§8) consumes it. Ready for `writing-plans`. Not yet implemented.
- **Scope:** Two workstreams. **(A) Editor unification (§1–§8):** `packages/visual-editor` (MIT) — Maps-as-SoT + a single `node-projection.ts`. **(B) Cross-layer DRY (§9):** `@rune-langium/core` (MIT) gains shared wire-AST / namespace / qualified-name helpers consumed by the FSL `apps/studio` + `functions/` parse pipeline. The **node-id `::`→`.` unification (§9.8) spans both** — it does touch `apps/studio` source (a delimiter swap), correcting the "no studio changes" assumption that workstream (A) alone would imply.
- **Primary mandate:** DRY across the many representations / serializations / projections of a "node." Per repo `CLAUDE.md`, "DRY is the #1 core correctness rule."

---

## 0. Metamodel (agreed foundation)

> **Agreed 2026-06-06.** This section is the foundation the rest of the document projects from. §1–§8 (the editor Maps-as-SoT refactor) and §9 (cross-layer DRY) are **downstream** of it — they *consume* the metamodel and its generated surface rather than re-deriving node shape. Where §3.2's hand-written `node-projection.ts` helpers overlap the generated surface, the generated artifact wins and `node-projection.ts` shrinks to a re-export + the few things codegen can't own (see §0.4).

### 0.1 The metamodel **is** the Langium grammar / AST

The canonical model of a Rune entity is the **Langium grammar** (`packages/core/src/grammar/rune-dsl.langium`) and its generated `ast.ts` — itself Rune's reimplementation of the **Rosetta metamodel**. There is **no hand-written parallel domain model**: a second model would duplicate what the grammar already single-sources and *generates*, and the AST↔domain mapping would re-introduce the very drift this document fights (it would be V1–V15 relocated into a sync layer). The grammar is the SSoT for *structure*; the only thing we add is a **single, generated owner** of how to *navigate and edit* that structure. (This also subsumes the "align to Rosetta metamodel" option — the grammar already is that alignment.)

### 0.2 The surface is GENERATED — extend `langium-zod` with a `domain` target

The node "surface" (the typed, quirk-free view consumers use) is **generated** from the grammar by adding a `domain` target to **`langium-zod`** (`/Users/pmouli/GitHub.nosync/active/ts/langium-zod`, the user's generic Langium→Zod generator). The generator stays **generic** by splitting concerns:

- **Mechanical layer — auto-detected from the grammar, zero Rune knowledge:** strip `$`-internals (existing `--strip-internals`); **single cross-reference → flattened `$refText` string** (generalizes the `typeCall.type.$refText → typeRef` quirk — any single-valued cross-ref property gets a string surface, because the grammar marks cross-refs).
- **Semantic layer — a Rune projection config (`domain-surfaces.json`, like `form-surfaces.json`):** everything the grammar can't express — `conditions ⊕ postConditions → conditions`, `Choice.attributes → options`, renames/aliases. **All Rune-specificity lives here, not in the generator.**

**Asymmetric surface (resolves the merge write-back problem).** Simple flattenings (cross-ref→string, rename) are bidirectional. **Aggregations** (n arrays → 1 list) are read-trivial but write-ambiguous (an edit to a merged `conditions` list can't be auto-routed back to `conditions` vs `postConditions`). So the generated surface is asymmetric:

- a **read projection** (`toDomain(ast)`) that merges/flattens freely — for display, inspector, fingerprinting;
- **field-precise write accessors** that mutate the **source** arrays in place (`addCondition` vs `addPostCondition` stay distinct) — no unmerge, no bidirectional transform, no live proxy.

The write accessors **are** the `mutateGraph` recipe surface (§3.3): they mutate the Mutative draft of the AST node, and Mutative captures the id-rooted patch. So the generator's write-side output and the editor's edit/patch model are the same thing — they compose natively.

### 0.3 The five facets (resolved)

| Facet | Resolution |
|---|---|
| **Source of truth** | Langium grammar / generated `ast.ts` (= Rune's Rosetta metamodel). No parallel model. |
| **Surface** | Generated per-kind types + read projection + field-precise write accessors (langium-zod `domain` target + Rune `domain-surfaces.json`). |
| **Entities (kinds)** | Closed set: Data, Choice, Enumeration, Function, Annotation, RecordType, TypeAlias, basicType. |
| **Members** | Per-kind containers, owned by the generated accessors (closes V4). |
| **Identity** | Top-level: dot qualified name `${namespace}.${name}` (§9.8). Members: parent + local name (no global id). |
| **Relationships (edges)** | **Derived**, not stored — projected from member type-refs + `superType` by the forward adapter; edge-id grammar owned centrally (§2-V3). |
| **Model vs. view** | "Model" = the AST fields `serializeModel` round-trips; "view" = `GraphMetadata`. The split is the round-trip set, not an opinion (closes V2). |
| **Edit composition** | Generated write accessors are the `mutateGraph` recipe surface — mutate the Mutative draft in place; patches captured id-rooted. No proxy, no unmerge. |

### 0.4 How the rest of the spec consumes the generated surface

- **`node-projection.ts` (§3.2)** becomes a thin **re-export** of the generated accessors plus the handful of things codegen does not own: the **edge-id grammar** (V3, `makeEdgeId`/`parseEdgeId`), the **array↔Map derivation** (V5/V6), and the **`GRAPH_METADATA_KEYS`/strip** (V2) (the model/view split is editor policy layered on top of the AST model). `makeNodeId` is the generated `qualifiedExportPath` (§9.8). The member-container map (V4) and the type-ref/cardinality accessors come from the generated artifact.
- **`mutateGraph` recipes (§3.3, all 34 actions)** call generated setters — "migrate action → recipe" becomes "action calls `setMemberTypeRef(draft, …)`."
- **The read projection** feeds the inspector/structure surfaces and `computeContentFingerprint` (P4) — one generated `toDomain` instead of ad-hoc field reads.
- **Regeneration** joins the existing `generate:schemas` (R7) pipeline; the domain artifact is a generated file, never hand-edited (like `zod-schemas.ts`).

### 0.5 Generator-target design (extend `langium-zod`)

Grounded in a read of `langium-zod` (`/Users/pmouli/GitHub.nosync/active/ts/langium-zod`). Integration is clean — **no blocking obstacles**, ~500–800 LOC added, no breaking change to the Zod emitter.

**Reuse the IR pipeline.** langium-zod already builds a target-agnostic IR from the grammar: `collectAst(grammar)` → `extractTypeDescriptors` → `detectRecursiveTypes` → `applyProjectionToDescriptors` (`api.ts:138–173`). The IR is `TypeDescriptor[]` (object/union/enum) with per-property `{name, type-expr, optional, minItems}` and a **cross-ref signal** (`property.isCrossRef` / `zodType.kind === 'crossReference'` + `targetType`, `type-mapper.ts:179`). The `domain` emitter consumes the **same** descriptors — only the final emit differs.

**Add a target abstraction.** The CLI is single-purpose today (`generate` → Zod only; no `--target`). Introduce **`--target zod|domain`** (repeatable), dispatching the shared IR to `generateZodCode` (existing) or a new `generateDomainCode(descriptors, recursiveTypes, options)` in `src/emitters/domain.ts`, reusing `topoSortObjectDescriptors`, recursion handling, humanization, import/header helpers. (Minimal fallback: an additive `--domain`/`--domain-out` flag on the existing command.)

**Mechanical rules (generic, in the emitter):** a cross-ref property → domain `…Ref: string` (read = `prop.$refText`; write accessor sets it in place); `--strip-internals` already drops `$`-fields via the projection.

**Semantic overlays need a projection-schema extension.** Today's `ProjectionConfig` (`projection.ts:4`) supports only `defaults.strip` + per-type `fields` whitelist — it **cannot** express merges or renames. Extend it and add an `applySemanticOverlays(descriptors, config)` pass after `applyProjectionToDescriptors`:
```jsonc
// rune domain-surfaces.json
{ "types": {
  "RosettaFunction": { "merges": [{ "from": ["conditions","postConditions"], "to": "conditions" }] },
  "Choice":          { "renames": { "attributes": "options" } }
}}
```
**Renames are bidirectional** (one source field → unambiguous write-back). **Merges are read-only on the merged name:** the generator emits a merged READ field (`conditions = conditions ⧺ postConditions`) but **write accessors target the SOURCE fields** (`addCondition`→`conditions[]`, `addPostCondition`→`postConditions[]`) — there is no merged setter. This is the asymmetric surface (§0.2) realized in codegen; **merges never need an unmerge.**

**Generated artifact (committed, like `zod-schemas.ts`).** Emit `packages/visual-editor/src/generated/domain.ts`: per-kind domain interfaces (read shape) + `toDomain(ast)` read projection + field-precise write accessors (`setMemberTypeRef`, `addCondition`, …). Regenerated via an extended `generate:schemas` (or sibling `generate:domain`) script; never hand-edited.

**Conformance (optional, reuse infra).** langium-zod's `--conformance` file-I/O (`conformance.ts`) can emit an AST↔domain round-trip guard (read `toDomain`, write-back preserves required fields + cross-ref flattening) — different logic, same plumbing.

**Packaging / dev loop.** Single package (Option 1) — the extractor/type-mapper are shared, no second package warranted. rune-langium consumes a workspace-linked / `@dev` langium-zod build while the `domain` target is in flight; pins a release once shipped.

> The metamodel (§0.1–§0.4) is agreed and stable; this subsection is the implementation contract for the generator that produces its surface.

---

## 1. Summary / goal

The editor already survives a stale reparse without corrupting source: `useModelSourceSync`'s `parseEpoch` serialize-gate, `loadModels`' `isDegradedReparse` guard, and the one-shot id-rooted patch replay in `edit-reconcile.ts` together fix the file-corruption class of bugs. **This work is not a live-bug fix.** It buys three things:

1. **Uniform in-flight coverage.** Today only the **6** actions routed through `commitEdit` (`packages/visual-editor/src/store/editor-store.ts:701`) capture id-rooted patches; the other **~28** source-affecting actions call `set((state) => …)` directly and produce *no* pending patches, so an edit made by one of those just before its own reparse lands can be momentarily reverted. Routing all **34** source-affecting actions through one chokepoint makes the in-flight guarantee uniform.
2. **DRY across node representations.** Node-shape knowledge (id construction, edge-id construction, "which fields are AST vs GraphMetadata", attribute-container shape, array↔Map derivation) is currently duplicated and **divergent** across at least five files. We consolidate it into one `node-projection.ts` module so no node-shape fact lives in two places.
3. **Cleaner authoring.** Edit actions become Mutative *draft recipes* (`draft.nodesById.get(id).data.attributes.push(…)`) instead of hand-rolled immutable spreads (`{ ...n, data: { ...n.data, … } }`) plus hand-built patch boilerplate. Patches are captured automatically and are inherently field-precise and id-rooted.

The chosen shape is **"B (Mutative-draft authoring) delivered via C (id-keyed Map source-of-truth)"**. This is **dual-representation on purpose**: the Maps are the edit/patch substrate; the existing `nodes[]`/`edges[]` arrays remain in state as **derived render caches** so React Flow, `useModelSourceSync`, and ~all consumers/tests keep reading `state.nodes` unchanged.

**Non-goals (explicitly rejected):** arrays-fully-derived-via-selectors (too much consumer churn for no benefit); changing the serializer; changing the `parseEpoch` / degraded-parse / one-shot invariants; inventing a stable per-attribute global id.

> **§9 extends this** across the parse/serialization stack (core ↔ parse ↔ lsp ↔ studio). While workstream (A) "is not a live-bug fix," §9 surfaced **one genuine latent bug — V8**, a BigInt `Number`-vs-`String` divergence between two wire-serialization paths — worth fixing independently of this refactor. The §9.6 "wire-AST helper trio" (V7/V8/V9) and the `qualifiedExportPath` consolidation (§9.8/V11) are the low-risk, high-value first steps.

---

## 2. Current state: the node representation map (the heart of this doc)

A single conceptual "node" is materialized in **seven** representations and crosses **six** projection boundaries. Below is each representation, then each conversion, with `file:line` evidence and the DRY violations.

### 2.1 Representations of a node

| # | Representation | Where | Shape / notes |
|---|---|---|---|
| R1 | **Langium AST node** | `packages/core/src/generated/ast.ts` | `Data` (`:799`), `Choice` (`:542`), `RosettaEnumeration` (`:2913`), `RosettaFunction` (`:3380`), `Annotation` (`:180`), `RosettaRecordType` (`:4132`), `Attribute` (`:485`), `RosettaEnumValue` (`:2965`). Carries Langium internals (`$container`, `$cstNode`, `$document`, `$containerIndex`) and resolved refs. Identity is **positional** (`$containerIndex`) or name-based cross-refs — *no stable node id*. |
| R2 | **`AstNodeModel<T>`** (stripped AST) | `packages/visual-editor/src/types.ts:102` | Mapped type that strips `ExcludedFields` (`:58`) and recursively maps children. The "client/editor" AST shape with internals removed. |
| R3 | **`GraphNode<T>` / `AnyGraphNode`** | `packages/visual-editor/src/types.ts:131`, `:149` | `AstNodeModel<T> & GraphMetadata`. `GraphMetadata` (`:112`) adds `namespace, position, errors, isReadOnly?, hasExternalRefs, comments?, deferred?` plus a `[key:string]: unknown` index signature for React Flow. |
| R4 | **`TypeGraphNode` / `TypeGraphEdge`** (React Flow) | `packages/visual-editor/src/types.ts:585-586` | `Node<AnyGraphNode>` / `Edge<EdgeData>`. The render unit: `{ id, type, position, data }`. |
| R5 | **Store arrays `nodes[]` / `edges[]`** | `editor-store.ts:113-114` | The current source-of-truth + render cache in one. Tracked by zundo `partialize` (`editor-store.ts:2410`, `history.ts:21`). |
| R6 | **`GraphDraft` Maps** (`nodes:Map`, `edges:Map`) | `edit-reconcile.ts:29` | *Transient today* — built per `commitEdit` from arrays, used only for patch capture/replay, discarded. **This design promotes them to persistent store state** (`nodesById`/`edgesById`). |
| R7 | **Generated Zod schemas** | `packages/visual-editor/src/generated/zod-schemas.ts` (+ `.conformance.ts`) | Produced by the `generate:schemas` script (`packages/visual-editor/package.json:29`, `langium-zod` `:62`). Validate `AstNodeModel` shapes directly. Authoritative external declaration of node field shape — a 7th representation we must *consume*, not re-encode. |
| R7a | **Deferred placeholder node** | `buildDeferredPlaceholderNodes` (`editor-store.ts:404`) | A hand-built minimal `AnyGraphNode` (`:419-428`) for list-only curated types not yet hydrated. Re-encodes the GraphMetadata field set inline. |

### 2.2 Conversions / projections between representations

| # | Projection | Direction | Where | Notes |
|---|---|---|---|---|
| P1 | **Forward adapter** | R1 → R4 | `astToModel` (`adapters/ast-to-model.ts:153`); per-node `buildGraphNode` (`:79`), strip via `stripAdditionalAstFields` (`adapters/strip-additional-ast-fields.ts:72`) | Spreads stripped AST + GraphMetadata (`:87-95`); builds nodes (pass 1) then edges (pass 2). |
| P2 | **Reverse adapter / serialize input** | R4 → R2/R1 | `modelsToAst` (`adapters/model-to-ast.ts:87`); `stripMetadata` (`:48`) | Groups by namespace, strips GraphMetadata back to AST-shaped objects, re-injects inheritance from edges. |
| P3 | **Serialize** | R2 → text | `serializeModel` from `@rune-langium/core` (`packages/core/src/serializer/rosetta-serializer.ts`) | Consumes `ModelOutput` (`model-to-ast.ts:25`). |
| P4 | **Content fingerprint** | R4 → string | `computeContentFingerprint` (`hooks/useModelSourceSync.ts:43`) | Projects to an "AST-relevant subset" to skip view-only churn; gates the serialize pipeline. |
| P5 | **Array ↔ Map** | R5 ↔ R6 | `projectGraph` (`edit-reconcile.ts:37`), `flattenGraph` (`:44`), `commitGraphEdit` (`:53`), `reconcileParse` (`:121`) | The id-keyed patch substrate + reparse replay. |
| P6 | **Store render-cache sync** | R6 → R5 | *(does not exist yet)* — today `commitEdit` (`editor-store.ts:701`) round-trips arrays→Map→arrays per edit via `commitGraphEdit` | This design makes Maps persistent and re-derives arrays on every Map change. |
| P7 | **Node-kind resolution** | any → kind string | `resolveNodeKind` (`adapters/model-helpers.ts:266`), `AST_TYPE_TO_NODE_TYPE` (`:200`), `NODE_TYPE_TO_AST_TYPE` (`:211`) | Already centralized in `model-helpers.ts` and enforced by `rune/no-raw-node-kind-lookup`. **Keep as-is** — model for what we want everywhere. |

### 2.3 DRY violations (the consolidation targets)

**V1 — `makeNodeId` defined twice.**
`adapters/ast-to-model.ts:60` and `editor-store.ts:495` define byte-identical `makeNodeId(namespace, name) => \`${namespace}::${name}\``. `buildDeferredPlaceholderNodes` (`editor-store.ts:412`) and `nameFromNodeId` (`model-to-ast.ts:61`, the *inverse*) re-encode the same `::` convention inline. **→ one exported `makeNodeId` + `splitNodeId`/`nameFromNodeId` pair.**

> **Separator decision (see §9.8 / V11):** when consolidating, change the separator from `::` to **`.`** so `makeNodeId` produces the **core qualified name** `${namespace}.${name}` (Langium's scope/export key, `services/rune-dsl-scope-computation.ts:45`), retiring `::`. Type names are dotless (`ValidID`/`ID`, grammar `:7,:901`) so the dot form is injective and last-dot-splittable; the single builder should be the shared `qualifiedExportPath(namespace, name)` from `@rune-langium/core` (format-matched, not re-synthesized per file). `splitNodeId`/`nameFromNodeId` become **last-dot** splits. This makes the editor node id identical to the scope/hydration/cross-ref key and lets `disambiguateTypeRef` (`editor-store.ts:90`) drop its `::`↔dot bridge.

**V2 — "GraphMetadata vs AST" field set is duplicated and DIVERGENT.** Three independent declarations of the same conceptual fact ("which keys are editor metadata, not AST"):
- `model-to-ast.ts:42` strips `{namespace, position, errors, isReadOnly, hasExternalRefs, comments}` (6 keys).
- `useModelSourceSync.ts:54` (P4 fingerprint) skips only `{position, errors, hasExternalRefs}` (3 keys).
- `buildGraphNode` (`ast-to-model.ts:88-95`) and `buildDeferredPlaceholderNodes` (`editor-store.ts:419-428`) *add* the metadata keys inline.

These disagree: the fingerprint counts `namespace`, `isReadOnly`, `comments`, `deferred` as content, so e.g. a `comments`-only edit perturbs the fingerprint and triggers a (harmless but real) serialize attempt, while `model-to-ast` correctly treats `comments` as non-AST. The `deferred` key isn't handled by either. The `GraphMetadata` interface (`types.ts:112`) is a *fourth*, type-level declaration. **→ ONE canonical `GRAPH_METADATA_KEYS` set + `stripGraphMetadata()` + `astRelevantProjection()`, derived from / kept in lockstep with `GraphMetadata`, consumed by P2, P4, P1, and R7a.**

**V3 — Edge-id construction scattered and parse/build-asymmetric.** Edge ids are built from inline template literals in ≥16 sites across two files (`ast-to-model.ts` and `editor-store.ts`):
- `` `${nodeId}--attribute-ref--${name}--${target}` `` (`ast-to-model.ts:127`, `editor-store.ts:1149`)
- `` `${node.id}--extends--${parentNodeId}` `` (`ast-to-model.ts:216`, `:283`)
- `` `${node.id}--choice-option--${typeName}--${targetNodeId}` `` (`:235`)
- `` `${node.id}--enum-extends--${parentNodeId}` `` (`:251`)
- `` `${node.id}--type-alias-ref--${targetNodeId}` `` (`:301`)
- output-ref variant `` `${node.id}--attribute-ref--output--${targetNodeId}` `` (`:269`)

`renameType` (`editor-store.ts:1107`) then *reconstructs* edge ids by string `.replace(nodeId, newNodeId).replace(oldName, newName)` — a brittle parse of a format defined elsewhere. **→ centralized, parse+build-symmetric `makeEdgeId(kind, {source, target, label?})` + `parseEdgeId(id)` helpers so edge identity is defined once and `renameType` rebuilds via the builder, not `.replace`.**

**V4 — Attribute-container shape guard re-encoded per action.** The `$type === 'Data' || $type === 'Annotation'` (and the `'Choice'`, `'RosettaFunction'.inputs`, `'RosettaRecordType'.features`) member-array discrimination is repeated in nearly every edit action and in both adapters: `addAttribute` (`editor-store.ts:1166`), `removeAttribute` (`:1184`), the `hasExternalRefs` pass (`ast-to-model.ts:316-334`), the edge pass (`ast-to-model.ts:209-309`), etc. Each site re-decides "where do members live on this node kind, and what's the array name." **→ a small `getMemberArray(node) / setMemberArray / forEachMember(node, fn)` accessor that owns the kind→array-field mapping once.**

**V5 — Array↔Map derivation will exist in two copies.** `projectGraph`/`flattenGraph` (`edit-reconcile.ts:37,44`) are the array↔Map boundary. Making Maps persistent introduces a *second* need to derive arrays from Maps (the render-cache sync, P6). If written inline in the store it duplicates `flattenGraph`. **→ the single array-derivation lives in `node-projection.ts` and is consumed by BOTH the store sync and the reconcile module.**

**V6 — `buildNodeMap` is a third Map projection.** `editor-store.ts:389` `buildNodeMap(nodes) => new Map(...)` duplicates `projectGraph`'s node half. **→ fold into the one projection module.**

---

## 3. Target architecture

### 3.1 Maps-as-SoT, arrays-as-derived-cache (dual representation)

`EditorState` gains two fields and **keeps** the two arrays:

```ts
interface EditorState {
  // NEW canonical edit substrate (source of truth for edits + patches):
  nodesById: Map<string, TypeGraphNode>;
  edgesById: Map<string, TypeGraphEdge>;
  // RETAINED, now DERIVED render caches (= [...map.values()]):
  nodes: TypeGraphNode[];
  edges: TypeGraphEdge[];
  // unchanged:
  parseEpoch: number;
  pendingEditPatches: Patches;
  …
}
```

Invariant **I1 (sync):** `state.nodes` is *always* `[...state.nodesById.values()]` and `state.edges` is `[...state.edgesById.values()]`, re-derived **once per Map change** (not per render), so React Flow gets a stable array reference that changes iff the graph changed.

Invariant **I2 (no view state in patches):** patch paths are rooted at `nodesById`/`edgesById` and are *field-precise* (e.g. `['nodesById','com.x.Foo','data','attributes',0,'name']` — the Map key is the dot qualified node id per §9.8/V11). They **never** contain `position` (see §3.4).

### 3.2 The `node-projection.ts` module (single owner of node-shape knowledge)

New file `packages/visual-editor/src/store/node-projection.ts` (MIT SPDX header). It is the *only* place any node-shape fact is encoded. It owns:

1. **Id builders (V1):**
   - `makeNodeId(namespace, name): string`
   - `splitNodeId(id): { namespace: string; name: string }` / `nameFromNodeId(id)`
2. **Edge-id builders (V3):**
   - `makeEdgeId(kind: EdgeKind, parts: { source: string; target: string; label?: string }): string`
   - `parseEdgeId(id): { kind; source; target; label? } | null`
   These encode the `--{kind}--` format once; the output-ref edge is `attribute-ref` with `label:'output'`.
3. **Metadata field set + AST projection (V2):**
   - `GRAPH_METADATA_KEYS: ReadonlySet<string>` — the canonical set, kept in lockstep with `GraphMetadata` (a type-level `satisfies`/keyof guard test enforces parity; see §6).
   - `stripGraphMetadata(data): Record<string, unknown>` — replaces `model-to-ast.ts:stripMetadata`.
   - `astRelevantProjection(data): Record<string, unknown>` — replaces the inline projection in `computeContentFingerprint`. (The fingerprint additionally excludes the *positional/derived* metadata; the **one** decision about "what is content" lives here, so P2 and P4 can never diverge again.)
   - `withGraphMetadata(astData, meta): AnyGraphNode` — the inverse, replacing the inline spreads in `buildGraphNode` and `buildDeferredPlaceholderNodes`.
4. **Member accessors (V4):**
   - `getMemberArray(node): { field: string; members: unknown[] } | null` — owns the kind→field map (`Data`/`Annotation`→`attributes`, `Choice`→`attributes`, `RosettaFunction`→`inputs`, `RosettaRecordType`→`features`).
   - `forEachMember(node, fn)` / `ensureMemberArray(node)`.
5. **Array↔Map derivation (V5/V6):**
   - `toNodesById(nodes)` / `toEdgesById(edges)` (replaces `projectGraph` halves and `buildNodeMap`).
   - `nodesFromMap(map)` / `edgesFromMap(map)` (replaces `flattenGraph`).

`edit-reconcile.ts` imports `toNodesById`/`nodesFromMap` instead of its private `projectGraph`/`flattenGraph` (delete those). `ast-to-model.ts`, `model-to-ast.ts`, `useModelSourceSync.ts`, and the store all import from this one module. **Node-kind resolution stays in `model-helpers.ts`** (P7) — already DRY and lint-enforced; `node-projection.ts` may re-export it for a single import surface but must not re-implement it.

### 3.3 The `mutateGraph` chokepoint (generalize `commitEdit`)

Rename/generalize `commitEdit` (`editor-store.ts:701`) into `mutateGraph(set, get, recipe, extra?)`:

```ts
function mutateGraph(set, get, recipe: GraphEditRecipe, extra?) {
  const { nodesById, edgesById, pendingEditPatches } = get();
  const [next, patches] = create({ nodesById, edgesById }, recipe, { enablePatches: true });
  if (patches.length === 0 && !extra) return;          // no-op recipe → leave state untouched
  set({
    nodesById: next.nodesById,
    edgesById: next.edgesById,
    nodes: nodesFromMap(next.nodesById),                // re-derive caches ONCE
    edges: edgesFromMap(next.edgesById),
    pendingEditPatches: patches.length ? [...pendingEditPatches, ...patches] : pendingEditPatches,
    ...extra
  });
}
```

`GraphEditRecipe` becomes `(draft: { nodesById: Map<…>; edgesById: Map<…> }) => void`. All **34** source-affecting actions become recipes routed through this one helper. Because Mutative patches address Maps by **key**, every captured patch is id-rooted and survives a reparse re-ordering — uniformly, for all 34 actions, with zero per-action patch boilerplate. `parseEpoch` is **not** bumped (these are USER-origin edits), preserving the `useModelSourceSync` serialize-gate contract.

### 3.4 Position / layout — the NON-capturing path

Drag, Dagre layout (`computeLayout`), and fit-view update node `position` only. These are **view state, not source edits**. They route through a *separate* `updateGraphView(set, get, recipe)` (or a positions-only fast path) that:
- writes `nodesById`/`edgesById` + re-derived arrays, **but**
- does **NOT** capture patches into `pendingEditPatches`, and
- does **NOT** advance `parseEpoch`.

`applyReactFlowNodeChanges` (`editor-store.ts:343`) and `relayout`/`loadModels` layout use this path. This guarantees I2 (patches never carry `position`) and preserves the existing behavior where `computeContentFingerprint` already ignores `position` so drags don't churn serialization.

### 3.5 Reconcile on Maps; one-shot retained unchanged in spirit

- `loadModels` (`editor-store.ts:789`): builds `nodesById`/`edgesById` from the fresh parse (P1 then `toNodesById`), runs `reconcileParse` keyed on the Maps, replays `pendingEditPatches` (now rooted at `nodesById`), then **clears** them (ONE-SHOT) and bumps `parseEpoch` — exactly as today (`:862-892`). The `isDegradedReparse` guard (`:841`) and the merge of `buildDeferredPlaceholderNodes` (`:803`) are unchanged in behavior. The one-shot rationale (object-valued patches like `typeCall`/`card` never compare byte-equal to a reparse, so carrying them would replay stale data forever — `:856-861`, `edit-reconcile.ts:94-108`) is **retained verbatim**.
- `reconcileParse` (`edit-reconcile.ts:121`): now receives/returns Maps directly (or keeps its array signature but uses the shared derivation internally). The `patchAlreadySatisfied` / `apply` / catch-fallback semantics are unchanged.
- The **6 existing `commitEdit` migrations collapse** into the uniform `mutateGraph` path (no behavioral change for them; they already capture patches).

---

## 4. Data flow

**Edit (all 34 actions):**
```
action(args)
  → mutateGraph(set, get, draft => { /* Mutative mutation on nodesById/edgesById */ })
      → create(...) yields { next Maps, id-rooted field-precise patches }
      → set: nodesById', edgesById', nodes=nodesFromMap, edges=edgesFromMap,
             pendingEditPatches += patches    (parseEpoch UNCHANGED)
  → React subscribers see new `nodes`/`edges` array refs
  → useModelSourceSync: parseEpoch unchanged ⇒ USER-origin
      → fingerprint (astRelevantProjection) changed ⇒ modelsToAst (stripGraphMetadata) → serializeModel → onModelChanged
```

**Reparse (save round-trips, hydration, or external):**
```
loadModels(models)
  → astToModel (P1) → toNodesById  (+ deferred placeholders merge)
  → isDegradedReparse guard (reject worker-down strip)
  → reconcileParse(parseMaps, pendingEditPatches): drop satisfied, replay unsatisfied
  → set: nodesById/edgesById from reconciled, nodes/edges re-derived,
         parseEpoch+1, pendingEditPatches = []   (ONE-SHOT clear)
  → useModelSourceSync: parseEpoch advanced ⇒ PARSE-origin ⇒ adopt baseline, DO NOT serialize
```

**Drag / layout / fit-view:**
```
applyReactFlowNodeChanges / relayout
  → updateGraphView(set, get, recipe)   // positions only
      → set: nodesById/edgesById + re-derived arrays
             (NO patch capture, NO parseEpoch bump)
  → useModelSourceSync: fingerprint excludes position ⇒ no serialize
```

---

## 5. Migration / phasing (de-risked, behind a green suite)

**Phase 0 — `node-projection.ts` (pure, no behavior change).** Create the module with V1–V6 helpers. Re-point existing callers to it *without* changing semantics: `edit-reconcile.ts` uses `toNodesById`/`nodesFromMap`; `model-to-ast.ts` uses `stripGraphMetadata` + `nameFromNodeId`; `useModelSourceSync.ts` uses `astRelevantProjection`; `ast-to-model.ts`/`editor-store.ts` import the one `makeNodeId` and the edge-id builders; member accessors replace the inline `$type` guards. **This alone closes V1–V6 and lands the bulk of the DRY win even before Maps exist.** Full suite stays green.

**Phase 1 — Map substrate + sync, actions untouched.** Add `nodesById`/`edgesById` to state and `initialState`. Make every existing `set` that currently writes `nodes`/`edges` also write the Maps + re-derive arrays, OR (recommended transitional aid, see below) install a `set`-interceptor that re-derives Maps from arrays after any write. Generalize `commitEdit`→`mutateGraph` operating on the Maps; migrate the existing 6 `commitEdit` callers. Update `loadModels`/`reconcileParse` to Maps. Update zundo `partialize` (see §7 decision). Suite green with 28 actions still array-authored.

**Phase 2 — convert the 34 actions to recipes, in waves.** Each wave converts a related cluster, runs the **full** `@rune-langium/visual-editor` suite, then the studio suite (per memory: sibling tests assert old behavior; run the whole package, not a subset). Suggested waves:

- **Wave A — Attributes (Data/Annotation):** `addAttribute`, `removeAttribute`, `renameAttribute`, `updateAttributeType`, `updateAttribute`, `reorderAttribute`, `updateCardinality`. *(`addAttribute`/`removeAttribute` already on `commitEdit` — they validate the recipe shape.)*
- **Wave B — Enum:** `addEnumValue`, `removeEnumValue`, `updateEnumValue`, `reorderEnumValue`, `setEnumParent`.
- **Wave C — Choice:** `addChoiceOption`, `removeChoiceOption`.
- **Wave D — Function:** `addInputParam`, `removeInputParam`, `updateInputParam`, `reorderInputParam`, `updateOutputType`, `updateExpression`.
- **Wave E — Conditions:** `addCondition`, `removeCondition`, `updateCondition`, `reorderCondition`.
- **Wave F — Metadata/annotations:** `updateDefinition`, `updateComments`, `addSynonym`, `removeSynonym`, `addAnnotation`, `removeAnnotation`.
- **Wave G — Structural (touch ids/edges):** `createType`, `deleteType`, `renameType`, `setInheritance`. `renameType` (`editor-store.ts:1073`) is the riskiest: it rewrites node ids, cascades type refs, and rebuilds edge ids — convert it to use `makeEdgeId`/`parseEdgeId` and Map re-keying (delete the `.replace` id surgery at `:1107`).

**OPTIONAL transitional safety net (implementation aid, not the end state):** during Phases 1–2, a thin `set`-interceptor can diff any `nodes`/`edges` an *un-migrated* action writes against the previous Maps and synthesize id-rooted patches, so the 28 not-yet-converted actions still get in-flight coverage mid-migration. Remove it once all 34 are recipes (the end state captures patches natively via `mutateGraph`).

---

## 6. Testing strategy

What must prove correctness (all run with the existing **89** visual-editor test files / **~1119** tests and **118** studio test files / **~875** tests staying green):

1. **Id-rooted, field-precise patch shape.** Assert a representative edit (e.g. `updateCardinality`) yields a single patch whose path begins `['nodesById', '<ns.Name>', 'data', …]` (dot qualified id, §9.8/V11) and ends at the exact field — not an index into `nodes[]`. (Extends `edit-reconcile.test.ts`.)
2. **Reorder safety.** After a `mutateGraph` edit, feed a reparse whose node array is in a *different order*; assert the patch replays onto the correct node (the core reason for Maps). Use the existing reconcile harness.
3. **One-shot clearing.** After `loadModels` replays patches, assert `pendingEditPatches === []` and that a *second* reparse does not resurrect the edit (object-valued `typeCall`/`card` case).
4. **Array/Map sync invariant (I1).** A store-level invariant test: after any action, `state.nodes` deep-equals `[...state.nodesById.values()]` (same for edges), and the array **reference** is stable across a no-op `set`.
5. **Position non-capture (I2).** After a drag/relayout, assert `pendingEditPatches` is unchanged, `parseEpoch` unchanged, and no patch path contains `'position'`.
6. **Undo/redo correctness.** With Maps tracked by `partialize` (§7), assert undo after an edit restores the prior Maps *and* re-derives the arrays, and that `pendingEditPatches` is **not** part of the temporal snapshot (undo must not rewind in-flight intent).
7. **No-duplication guard (the DRY success criterion as a test).**
   - A type/unit test asserting `GRAPH_METADATA_KEYS` equals `keyof GraphMetadata` minus the index signature (catches drift V2).
   - An ESLint/oxlint rule (sibling to the existing `rune/no-raw-node-kind-lookup`, see `model-helpers.ts:264`) — e.g. `rune/no-raw-edge-id` / `rune/no-raw-node-id` — flagging inline `` `--attribute-ref--` ``-style templates and `` `${ns}::${name}` `` outside `node-projection.ts`. This makes "node-shape knowledge in exactly one place" a CI-enforced invariant.
8. **Serialization parity.** Golden test: a model loaded → edited via a recipe → `modelsToAst`/`serializeModel` produces the same source as the pre-refactor path (no regression in P2/P3).

---

## 7. Risks & open questions

- **zundo `partialize` (DECISION REQUIRED, leaning: track Maps).** Today `partialize` tracks `{nodes, edges}` (`history.ts:21`, `editor-store.ts:2410`). With Maps as SoT, undo should restore the **Maps** and the store must re-derive the arrays on undo/redo. Recommended: change `TrackedState` to `Pick<EditorState,'nodesById'|'edgesById'>` and add a zundo `equality`/`onSave` that re-derives `nodes`/`edges` into the snapshot, OR keep tracking arrays and rebuild Maps on undo. Either way `pendingEditPatches` **must stay excluded** (it is in-flight intent, not state — `editor-store.ts:189-192`). *Caveat:* zundo's default equality and structural-sharing assume plain objects/arrays; Maps need an explicit equality fn (Maps are compared by reference). Spike this early in Phase 1.
- **Array/Map drift (I1).** The single biggest correctness risk of dual-representation. Mitigation: arrays are *only ever* written by re-derivation inside `mutateGraph`/`updateGraphView`/`loadModels` (never hand-assembled); enforced by the invariant test (#4) and ideally a lint forbidding raw `set({ nodes: … })` outside those chokepoints.
- **Performance of array re-derivation.** `[...map.values()]` is O(n) per edit; n is bounded by the visible graph (large models collapse, `LARGE_MODEL_THRESHOLD`). Re-deriving once per Map change (not per render) keeps React Flow's prop reference stable. Acceptable; measure on the largest curated namespace if concerned.
- **Within-node index fragility for attributes.** Attributes/inputs/enum-values have **no global id** (see the nodeId-finding note below); patches address them by parent id + array index (e.g. `…,'attributes',0,'name'`). This is safe in the in-flight window because a *stale* reparse preserves sibling order, and the one-shot clear bounds the window to a single replay. A *structural* reparse that reorders siblings would mis-target — but that path falls into `reconcileParse`'s `try/catch` → parse-verbatim fallback (`edit-reconcile.ts:132-137`), which is safe (edit already persisted in source). Document, don't over-engineer.
- **`renameType` re-keying.** Changing a node's id means deleting+re-inserting the Map entry and re-keying every edge id. Mutative patches for a key-change are remove+add; verify replay handles a rename made just before its reparse. Highest-risk single action — Wave G.

### nodeId finding (state explicitly in the implementation)

Langium provides **no stable node id**. Its only identities are **positional** (`$containerIndex`, or `AstNodeLocator` paths like `/types@2/attributes@1`) — *unstable across edits* — or **name-based cross-references**. The stable key for top-level types is the synthesized **qualified name** that `makeNodeId` produces (R1 has no id; R4 gets the synthesized one). **Keep the synthesized-qualified-name approach, but use the dot form `${namespace}.${name}` (= Langium's own scope/export key), not `::`** — see §9.8 / V11: the `::` separator is unnecessary because dotless type names make the dot form injective and last-dot-splittable, and the dot form unifies the editor id with the scope/hydration/cross-ref key. Attributes/inputs/enum-values have no global id; identify them by **parent id + local name (or array index within the parent)**, which is sufficient for the in-flight window.

---

## 8. Success criteria

1. **Uniform coverage:** all **34** source-affecting actions capture id-rooted, field-precise patches via the single `mutateGraph` chokepoint (today only 6). An in-flight edit from *any* action survives a stale reparse.
2. **Single source of node-shape knowledge:** node id, edge id, GraphMetadata-vs-AST field set, attribute-container shape, and array↔Map derivation are each defined in **exactly one place** (`node-projection.ts`), consumed by P1/P2/P4/P5/P6 and R7a. Enforced by the parity test + the new lint rule (V1–V6 all closed). Node-kind resolution stays solely in `model-helpers.ts` (P7).
3. **Net LESS code:** deleting the duplicate `makeNodeId`, the inline edge-id templates and `.replace` id surgery, `projectGraph`/`flattenGraph`/`buildNodeMap`, the divergent metadata-strip sets, and the per-action `$type` guards + per-action patch boilerplate removes more than `node-projection.ts` adds.
4. **Invariants intact:** `parseEpoch` serialize-gate, `isDegradedReparse`, and the one-shot patch clear are unchanged in behavior. Patches never carry `position`. `pendingEditPatches` stays out of undo history.
5. **Existing tests green:** the full `@rune-langium/visual-editor` (~1119) and studio (~875) suites pass unchanged, plus the new id-rooted-patch / sync-invariant / no-duplication tests.

---

## Implementation notes

- New source files under `packages/` are **MIT** — add `// SPDX-License-Identifier: MIT` + `// Copyright (c) 2026 Pradeep Mouli` (matching `editor-store.ts:1-2`). New `apps/studio` / `functions/` files are **FSL-1.1-ALv2**.
- **Per-workstream source surface:** (A) §1–§8 is `packages/visual-editor`-only. (B) §9 adds helpers to `@rune-langium/core` (MIT) and re-points consumers in `functions/` + `apps/studio` (FSL). The §9.8 node-id `::`→`.` change **does edit `apps/studio` source** (`ExplorePerspective.tsx` delimiter swaps) — the only place workstream (A)'s "visual-editor-only" boundary is crossed, and only because the node-id *value* is shared.
- The studio is **source-available**, not "open source."
- Useful validation: `pnpm --filter @rune-langium/visual-editor test`, `pnpm --filter @rune-langium/visual-editor run type-check`, then `pnpm test` for the studio suite before any push (whole-package, per project convention).
- R7 (generated Zod schemas) is regenerated via `pnpm --filter @rune-langium/visual-editor run generate:schemas`; this refactor must not require regenerating it (we *consume* the schema shape, never re-declare it).

---

## 9. Cross-layer serialization & state DRY (core ↔ parse ↔ lsp ↔ studio)

> **Scope of this section.** §2–§8 analyzed the **visual-editor**'s seven node representations (R1–R7) and six render/edit projections (P1–P7). This section analyzes the layers §2 did *not*: how a `RosettaModel`/AST is **serialized**, **shipped**, **deserialized**, and **state-managed** across `packages/core`, the `/api/parse` Pages Function (FSL), the parse Web Worker (FSL), the LSP transport, and studio persistence (OPFS + in-memory stores). It continues the R-numbering (R8+), adds a new **P9-series** for the *wire/storage* projections (to avoid colliding with §2's render P1–P7), and continues the V-numbering (V7+). The visual-editor sits **downstream** of everything here: §2's R1 (live Langium AST) is what the worker's `deserialize` produces, and §2's P1 (`astToModel`) consumes it.

### 9.1 Representations across layers (continuing R-numbering)

A single `RosettaModel`/element is materialized in these additional forms once it leaves the in-memory AST:

| # | Representation | Where (file:line) | Shape / notes |
|---|---|---|---|
| R8 | **Langium-serialized AST JSON** (`serializedModel` / `serializedModelJson` / `modelJson`) | produced `functions/api/parse.ts:444`; consumed `parser-worker.ts:137,412`, `workspace.ts:578`, `codegen-worker.ts:237`, `functions/api/codegen.ts:218`, `functions/api/parse.ts:657` | Output of `RuneDsl.serializer.JsonSerializer.serialize(model, { refText, textRegions, replacer:bigint→Number })`. The **canonical wire+storage form** of an AST. Round-trips back to R1 via `JsonSerializer.deserialize`. Carries `$type`, `$refText`, text regions; **drops** `$cstNode` (see R8a). Three field names for one concept: `serializedModel` (parse response/hydration), `serializedModelJson` (`WorkspaceFile`/`CachedFile`, `workspace.ts:39`, `model-types.ts:58`), `modelJson` (curated artifact, `curated-fetch.ts:215`). |
| R8a | **`$cstText` side-channel** | written `parser-worker.ts:208` (`preserveCstText`) **and** `functions/api/parse.ts:500` (`preserveCstText`) | `$cstNode` is non-serializable (circular, structured-clone-hostile). Both the in-worker and server parse paths walk Function/Data/Choice condition+expression nodes and copy `$cstNode.text → $cstText` *before* serialize, so the visual-editor's expression cells survive the JSON round-trip. **Two byte-identical implementations** with mutual "keep in sync" comments (`parser-worker.ts:204-205`, `parse.ts:489-497`). |
| R9 | **`HydrateRequest.documents[]` entry** | `parser-worker.ts:56-75` | `{ uri, content, serializedModel, exports[], bundleId? }`. The worker-hydration unit: a document plus its symbol-index exports and bundle tag. |
| R10 | **`ParseWorkspaceResponse` / router JSON** | worker shape `parser-worker.ts:99-115`; router shape `parse.ts:346-361`; client re-typed `workspace.ts:524-531` | `{ models, parsedModels, errors, deferredExports, hydrationState.documents, dependencyGraph, curatedRefOnlyFiles? }`. **Same logical response produced by two code paths** (in-worker `handleParseWorkspace` vs server router) with *deliberately divergent* population: the router sets `models:[]`/omits `parsedModels` (can't ship circular ASTs), the worker fills them. |
| R11 | **`deferredExports` / export descriptor** | `parse.ts:164-168`, `parser-worker.ts:93-97`, `workspace.ts:114-118` | `{ filePath, namespace, exports/entries: {type,name}[] }` — the namespace-explorer + `nodeIdToFilePath` source. Per-**file** (not per-namespace) by hard-won design (`parse.ts:155-163`). The `{type,name,path}` export triple (`path = namespace.Name`) is the symbol-index unit (R12). |
| R12 | **`AstNodeDescription` / index export** | built `parser-worker.ts:316-321,477-483`; path produced `parse.ts:458`, `curated-fetch.ts:215` | `{ type, name, path, documentUri }` registered into `IndexManager.registerExports`. `path` is the qualified name `${namespace}.${name}` — Langium's scope key. |
| R13 | **`WorkspaceFile` / `CachedFile` (studio state)** | `workspace.ts:31-69`, `model-types.ts:50-75` | In-memory studio state unit. Two near-identical interfaces: `WorkspaceFile {name,path,content,dirty,readOnly?,serializedModelJson?,exports?,bundleId?,bundleVersion?,refOnly?}` vs `CachedFile {path,content,namespace,serializedModelJson?,exports?,refOnly?}`. Carries R8 (`serializedModelJson`) for curated/ref-only entries; user files carry raw `content` only. |
| R14 | **OPFS / IndexedDB persisted form** | OPFS `workspace/persistence.ts`, `workspace/workspace-files.ts`; IDB `persistence.ts:12` | **Raw source text only** for user files (+ small IDB metadata records, "heavy file content lives [elsewhere]" `persistence.ts:11`). The AST is **never persisted as JSON** — it is recomputed by re-parsing on load. R8 lives only transiently in memory / on the wire. |
| R15 | **`SerializedModelMeta`** | `functions/lib/serialized-model-meta.ts:15` | `{ namespace, imports[] }` — a *cheap* projection read out of R8 by `JSON.parse` + field pick (NO Langium deserialize), used to compute the curated closure without paying link cost. |

### 9.2 Wire/storage projections (new P9-series)

| # | Projection | Direction | Where (file:line) | Notes |
|---|---|---|---|---|
| P9 | **AST → serialized JSON** | R1 → R8 | `parse.ts:444`, `build-serialized-artifacts.mjs:153`, (codegen artifact build) | `JsonSerializer.serialize` with the `{refText:true, textRegions:true, replacer:bigint→Number}` option triple **duplicated** in ≥2 places (V8). |
| P9b | **CST text preservation** | R1 → R1+$cstText | `parser-worker.ts:208`, `parse.ts:500` | Pre-serialize walk; the two copies are V7. |
| P10 | **Serialized JSON → AST** | R8 → R1 | `parser-worker.ts:137,412`, `workspace.ts:578`, `codegen-worker.ts:237`, `parse.ts:657`, `codegen.ts:218` | `JsonSerializer.deserialize<RosettaModel>(json)`. The **register-into-services** variant (`deserialize → factory.fromModel → langiumDocs.addDocument`) recurs in ≥4 places (V9). |
| P11 | **AST → source text** | R1 → `.rosetta` | core `serializeModel` (`rosetta-serializer.ts:294`) | **Distinct** serializer from P9 — produces editable `.rosetta` source, not wire JSON. Consumed by export/codegen + visual-editor §2-P3. Not duplicated; correctly single-sourced in core. |
| P12 | **BigInt-safe stringify** | any → JSON string | `parse.ts:347,448,576`, `build-serialized-artifacts.mjs:155,164,216` | `bigint → Number\|String` replacer repeated ~5× across the function + the artifact script (V8 sibling). |
| P13 | **Namespace extraction** | source/AST/JSON → `string` | source-regex `model-loader.ts:264` + `parser-worker.ts:325` (`/^\s*namespace\s+([\w.]+)/m`); AST `name` `parse.ts:451`; serialized `name.segments` `serialized-model-meta.ts:20`, `rosetta-serializer.ts:51`, `cross-namespace-refs.ts:57,116` | **Four+ independent ways to answer "what namespace is this model in"** depending on which representation you hold (V10). |
| P14 | **Qualified export path** | element → `string` | `parse.ts:458` (`${namespace}.${name}`); curated artifact build (same shape, `curated-fetch.ts:215`) | The Langium scope key (R12.path). Built server-side; consumed by `IndexManager` (V11). |
| P15 | **Worker hydration / replacement** | R9 → worker state | `parser-worker.ts:452` (`handleHydrate`), `:266` (`handleParseWorkspace`) | Both reset `deferredModelJson` + `IndexManager` + `LangiumDocuments`, then register R9/R8 entries. The reset+register block is **duplicated** between the two handlers (V12). |
| P16 | **Router JSON → worker + studio state** | R10 → R9 + R13 | `workspace.ts:571-684` | Client glue: deserialize user docs to R1, group curated docs into `curatedRefOnlyFiles` (R13), then re-ship the *same* `hydrationState.documents` to the worker via `workerRequest('hydrate')` (`:659`). |

### 9.3 DRY violations (continuing V-numbering)

| # | Violation | Evidence (file:line) | Verdict | Recommendation |
|---|---|---|---|---|
| **V7** | **`preserveCstText` duplicated** — the "which AST nodes carry expression CST text" knowledge (Function shortcuts/conditions/operations/postConditions + Data/Choice conditions, plus the `expression.$cstNode.text` sub-walk) is hand-written **twice, identically**, with reciprocal "keep in sync" comments. | `parser-worker.ts:208-236` and `functions/api/parse.ts:500-525` | **REAL.** Same node-shape knowledge in two files that *will* drift when a new condition-bearing kind is added. | **Move `preserveCstText` into `@rune-langium/core`** (e.g. `core/src/serializer/preserve-cst-text.ts`) and import it from both the worker (browser) and the function (server). Core is the only shared dependency both already import; it is MIT so both FSL consumers may use it. This is the single cleanest consolidation. |
| **V8** | **JsonSerializer serialize-options + BigInt replacer duplicated** — the `{ refText:true, textRegions:true, replacer:bigint→Number }` triple and the standalone `bigint→Number\|String` replacers are repeated across the function, the artifact build script, and curated paths. The *contract* "this is how a Rune AST is serialized for the wire" lives in ≥3 places and can silently diverge (e.g. one path keeping bigint as String, another as Number — already true: `parse.ts:448` uses `Number`, `parse.ts:577` uses `toString()`). | `parse.ts:444-449,576-577`; `build-serialized-artifacts.mjs:153-156,164,216`; `curated-fetch` consumes the result | **REAL** (the Number-vs-String divergence is a live latent bug for very large literals). | **Export a `serializeRuneModel(model): string` + `RUNE_SERIALIZE_OPTIONS` from `@rune-langium/core`** that owns the option triple and one canonical bigint policy. The artifact script (`.mjs`) and the function both call it. Pin the bigint policy in ONE place so wire and artifact bytes agree. |
| **V9** | **"deserialize then register into Langium services" recurs** — `JsonSerializer.deserialize → factory.fromModel → langiumDocuments.addDocument` (+ idempotent `getDocument` guard) is re-implemented in the parser worker (link + deferred-provider), the codegen worker, the parse function's dep-graph pass, and the codegen function. | `parser-worker.ts:412-416`, `codegen-worker.ts:237-249`, `parse.ts:657-659`, `codegen.ts:218`; provider variant `parser-worker.ts:133-144` | **REAL** for the browser-side trio (worker + worker); **DISTINCT-by-boundary** for the two FSL *functions* only in that they can't import the browser worker — but they *can* import a core helper. | **Add `hydrateModelDocument(services, uri, json): LangiumDocument` to `@rune-langium/core`** (deserialize + `fromModel` + idempotent add). All five sites call it. The deferred-provider accumulator stays worker-local (it's a closure concern, not shape knowledge). |
| **V10** | **Namespace extraction has 4+ implementations** — source-text regex (`/^\s*namespace\s+([\w.]+)/m`) in BOTH `model-loader.ts` and `parser-worker.ts`; AST `model.name` strip-quotes in `parse.ts`; serialized `name.segments.join('.')` in `serialized-model-meta.ts`, `rosetta-serializer.ts`, and `cross-namespace-refs.ts` (twice). The "a namespace's string form" rule is encoded per-representation. | `model-loader.ts:264`, `parser-worker.ts:325`, `parse.ts:451`, `serialized-model-meta.ts:20`, `rosetta-serializer.ts:51`, `cross-namespace-refs.ts:57,116` | **MIXED.** The two *source-text regexes* are REAL duplication (identical, both browser- side-importable from core). The *AST `name`* reader and the *serialized `name.segments`* reader are DISTINCT-by-input (different representations) but should at least share the `nameToNamespace(name)` normalizer, which is itself duplicated (`serialized-model-meta.ts:20` vs the three `.segments.join('.')` inlines). | **Two helpers in `@rune-langium/core`:** `namespaceFromSource(text)` (the regex) and `namespaceFromModelName(name)` (the string\|{segments} normalizer). Replace all 7 sites. The function's `serialized-model-meta.ts` keeps its cheap-JSON.parse path but calls `namespaceFromModelName`. |
| **V11** | **Two stable-key conventions for the same entity — UNIFIABLE onto the dot qualified name** — the symbol-index / scope key is `${namespace}.${name}` (dot), built server-side in three inline spots; the visual-editor's node id is `${namespace}::${name}` (double-colon, §2-V1 `makeNodeId`). These are **the same conceptual identity expressed two ways.** Prior analysis treated the `::` form as load-bearing ("distinct-by-necessity"); **re-investigation (2026-06-05) shows it is not.** See the dedicated analysis in §9.8. | scope desc `services/rune-dsl-scope-computation.ts:45`; export path `functions/api/parse.ts:458`, `curated-fetch.ts:215`; vs §2 node id `ast-to-model.ts:60`, `editor-store.ts:467`, inverse `model-to-ast.ts:61` | **UNIFIABLE.** The `::` was chosen only for reversible splitting; with **dotless** type names that reason evaporates (last-dot split is equally reversible). The two conventions are parallels with **no semantic difference** — the dot form is canonical (it is Langium's scope key). | **Retire `::`; unify the editor node id onto the core dot qualified name `${namespace}.${name}`.** (a) Centralize the dot form as `qualifiedExportPath(namespace, name)` in `@rune-langium/core`, consumed by `parse.ts`, the artifact build, **and** `node-projection.ts`'s `makeNodeId`. (b) Switch `makeNodeId`→`${ns}.${name}` and `splitNodeId`/`nameFromNodeId` to **last-dot** split. (c) Delete the `::`↔dot bridge in `disambiguateTypeRef` (`editor-store.ts:90`) — node ids and qualified ref-text become the same form. **See §9.8 for the injectivity proof, the source-vs-format-match finding, and the full migration surface.** |
| **V12** | **Worker reset+register duplicated** — `handleHydrate` and `handleParseWorkspace` both (i) iterate `langiumDocs.all` deleting every doc, (ii) clear/`indexManager.clearExports` + `deferredModelJson.clear()`, (iii) register R9/R8 entries + exports. | `parser-worker.ts:286-294` (parseWorkspace) and `:459-485` (hydrate) | **REAL.** Same workspace-reset + export-register sequence; a change to reset semantics (e.g. a new index to clear) must be made twice. | Extract a worker-local `resetWorkspaceState()` and `registerDeferredDocument(uri, json, exports)` and call from both handlers. Worker-local (not core) — it touches the worker's module-level `deferredModelJson`/`indexManager` singletons. |
| **V13** | **Diagnostics: four shapes, ad-hoc conversions** — parse errors are `string[]` (worker `parser-worker.ts:91,105`), aggregated to `Record<filePath,string[]>` → studio `Map<string,string[]>` (`workspace.ts:81,172`), LSP emits `LspDiagnostic {range,severity:1-4,code,source,message}` (`diagnostics.ts:11`), the visual-editor uses `ValidationError {nodeId,severity:'error'|'warning'|'info',message,ruleId?,line?,column?}` (`types.ts:182`). Severity is encoded **two ways** (numeric 1-4 vs string union) and `GraphMetadata.errors: ValidationError[]` is hard-coded `[]` at `ast-to-model.ts:92` — parse errors **never reach** the graph nodes. | `parser-worker.ts:91`, `workspace.ts:81`, `diagnostics.ts:11`, `types.ts:182`, `diagnostics-bridge.ts:54-55`, `ast-to-model.ts:92` | **MIXED.** The string[]→Map aggregation is incidental plumbing (DISTINCT — file-scoped vs node-scoped). The **severity double-encoding** (1-4 ↔ error/warning/info) is REAL and lives in the bridge's `if (diag.severity === 1)` switch (`diagnostics-bridge.ts:54`). | **Add a single `severityToString(1-4)`/`severityToNumber` pair** (core or a shared `diagnostics` util) so the bridge and any future LSP→ValidationError adapter share one mapping. Do **not** force-unify the four container shapes — file-keyed vs node-keyed vs LSP-range are legitimately different *aggregations* of the same atom. Separately, fix-or-document that `GraphMetadata.errors` is never populated from parse errors (a gap, not a dup). |
| **V14** | **`ParseWorkspaceResponse` produced by two divergent code paths** — the worker's `handleParseWorkspace` and the server router both construct the same response interface, but populate it differently (worker fills `models`/`parsedModels`; router sets `models:[]`, omits `parsedModels`, adds `curatedRefOnlyFiles`). The client (`workspace.ts:524`) **re-declares** a structurally-overlapping inline type for the router JSON instead of importing the interface. | worker `parser-worker.ts:99-115,373-380`; router `parse.ts:346-361`; client re-type `workspace.ts:524-531` | **MIXED.** The two *producers* are DISTINCT-by-necessity (the server genuinely cannot ship circular ASTs in `parsedModels`, §2-R1 — so `models:[]` is a hard constraint, not laziness). The client's **inline re-declaration** of the response shape (V14-narrow) is REAL — it should `import type` the canonical interface. | Keep the two producers. **Lift `ParseWorkspaceResponse` (and the `HydrationDocument` element type) into a shared, browser-safe types module** importable by the function, the worker, and `workspace.ts` so the wire contract is declared **once** and the client stops re-typing it inline. The `curatedRefOnlyFiles` field already lives on the worker interface (`parser-worker.ts:114`), so the function just needs to import the type, not re-spell it. |
| **V15** | **`WorkspaceFile` vs `CachedFile` near-duplicate** — two interfaces describe "a file with optional serialized model + exports + refOnly," overlapping on `path/content/serializedModelJson/exports/refOnly`, differing only in `name/dirty/readOnly/bundle*` (WorkspaceFile) vs required `namespace` (CachedFile). `mergeModelFiles` converts between them. | `workspace.ts:31-69`, `model-types.ts:50-75` | **DISTINCT-by-necessity** (one is editor/dirty state, the other is loader/cache state) **but** the *serialized-model + exports + refOnly* sub-shape is genuinely shared. | Low priority. Extract the shared sub-shape (`SerializedFilePayload = {serializedModelJson?, exports?, refOnly?}`) and have both interfaces `extends`/intersect it, so the R8 wire field's three aliases (`serializedModel`/`serializedModelJson`/`modelJson`) at least collapse to **one** TS field name on the studio side. Rename is cosmetic; defer behind V7–V12. |

### 9.4 Is there ONE shared AST↔JSON (de)serializer? — direct answer

**No — there are N call sites of Langium's `JsonSerializer`, but they all go through core's single `RuneDsl.serializer.JsonSerializer` instance.** The *serializer* is single-sourced (it's a Langium service constructed once per `createRuneDslServices`). What is **duplicated** is the **glue around it**: the serialize-**options** (V8), the pre-serialize `$cstText` walk (V7), the post-deserialize **register-into-services** sequence (V9), and the BigInt replacer (V8/P12). So the answer the investigation sought: *the (de)serializer itself is DRY (lives in core); the ~5 serialize sites and ~6 deserialize sites each re-encode the surrounding contract, and that contract is what should move into core.* Storage (R14) never holds R8 at all — OPFS persists raw source and the AST-JSON is recomputed, so there is **no** persistence-vs-wire serializer fork to worry about.

### 9.5 AST-internal `$`-field stripping across layers

The §2 visual-editor `stripAdditionalAstFields` (`strip-additional-ast-fields.ts:12`, strips `$container/$cstNode/$document/$refNode/$nodeDescription/...` + `references/labels/ref/error/...`) is the **client-side** strip. Server-side, the function does **not** run an equivalent field-name strip — it relies on `JsonSerializer.serialize` to omit non-serializable internals (`$cstNode` etc. are dropped by the serializer's own rules, which is *why* `$cstText` must be copied out first, V7/R8a). So the "which `$`-fields are Langium-internal" knowledge is encoded in **two conceptually different mechanisms**: (a) Langium's serializer (server/wire) and (b) the visual-editor's explicit deny-list (client, post-deserialize). **Verdict: DISTINCT-by-necessity** — the serializer strips for *wire safety*, the deny-list strips for *editor cleanliness* (it also removes resolved `ref`/`references` that the serializer keeps as `$refText`). They are not the same set and should not be merged. **No action** beyond noting the boundary; the only real strip-knowledge dup is internal to visual-editor (§2-V2), already covered.

### 9.6 Top 3 consolidations worth doing (priority order)

1. **`@rune-langium/core` gains a "wire AST" helper trio** — `serializeRuneModel`/`RUNE_SERIALIZE_OPTIONS` (V8), `preserveCstText` (V7), and `hydrateModelDocument` (V9). This closes the three highest-churn, highest-drift-risk dups in one MIT module both FSL consumers already depend on. Net: deletes the two `preserveCstText` copies, the duplicated option triple, and ~4 deserialize-and-register blocks.
2. **A shared, browser-safe wire-contract types module** declaring `ParseWorkspaceResponse` + the `HydrationDocument` element + `DeferredExportEntry` once (V14), imported by `functions/api/parse.ts`, `parser-worker.ts`, and `workspace.ts` (which today re-types it inline at `:524`). Closes the producer/consumer type-skew risk.
3. **Namespace + qualified-key helpers in core** — `namespaceFromSource` / `namespaceFromModelName` (V10) and `qualifiedExportPath` (V11/P14). Collapses 7 namespace-extraction sites and centralizes the scope `.`-path, while explicitly documenting that it is **not** the visual-editor's `::` node id (§2-V1).

### 9.7 Boundaries that BLOCK consolidation (must respect)

- **Server (Pages Function) cannot import browser code.** `functions/api/parse.ts` + `functions/lib/*` run in the Cloudflare Workers runtime: **no React, no DOM, no Web Worker, no `apps/studio/src` imports.** Any consolidation they share with the worker/studio must land in a **package** (`@rune-langium/core` or a new browser-safe types package), never in `apps/studio/src`. This is why V7/V8/V9/V10/V11 all target **core** specifically.
- **Server cannot ship live ASTs.** R1 has circular `$container` refs; the router's `models:[]` / absent `parsedModels` (R10/V14) is a *hard correctness constraint*, not duplication — the wire form **must** be R8 (serialized JSON), reconstructed client-side. Do not "unify" the two `ParseWorkspaceResponse` producers into one that ships ASTs.
- **Licensing split.** `packages/` = **MIT**; `apps/studio/` (incl. `functions/`) = **FSL-1.1-ALv2**. Shared code therefore **must live in a `packages/*` (MIT) module** so both the MIT visual-editor and the FSL studio+function can consume it; it may **not** live in `apps/studio`. Worker-local extractions (V12) and studio-state-shape merges (V15) stay FSL-side because they touch FSL-only singletons/state.
- **The studio is source-available, not "open source."**
- **Persistence holds no AST JSON.** OPFS/IndexedDB (R14) persist raw source + small metadata; R8 is recomputed on load. There is no storage-format migration surface here — consolidation is purely about the *wire + in-memory* paths.

### 9.8 Unify the editor node id onto the core qualified name (retire `::`) — V11 deep-dive

> **Supersedes** the earlier "deliberately not unified / distinct-by-necessity" note for V11. A focused re-investigation (2026-06-05) verified the three preconditions below and found the `::` convention is **unnecessary**, not load-bearing. The recommendation is to make the editor node id **identical** to Langium's dot qualified name.

**The decision.** Replace the visual-editor node id `${namespace}::${name}` with the core qualified name `${namespace}.${name}`, retiring `::` everywhere. This collapses the two stable-identity conventions (§2-V1's `::` node id and the §9 scope/export `.` path) into **one identity** spanning editor ↔ scope ↔ hydration ↔ cross-ref, and removes the `::`↔dot bridge that `disambiguateTypeRef` (`editor-store.ts:90`) implicitly straddles.

**Precondition 1 — type names are dotless; namespaces are dotted ⇒ `${ns}.${name}` is injective and reversible by last-dot split.** From the grammar (`packages/core/src/grammar/rune-dsl.langium`):
- A type/member NAME is `name=ValidID` via `fragment RosettaNamed` (`:201-203`), used by `Data` (`:114`), `Choice` (`:122`), `Enumeration` (`:141`), `RosettaFunction` (`:148`), `Annotation` (`:78`), `Attribute` (`:134`), etc. `ValidID returns string: ID | 'condition' | 'source' | 'value' | 'version' | 'pattern' | 'scope'` (`:901-903`), and `terminal ID: /\^?[a-zA-Z_][a-zA-Z_0-9]*/` (`:7`). **No `ID` or `ValidID` alternative can contain a `.`** — a type name is always a single dotless identifier.
- A NAMESPACE is `name=(QualifiedName | STRING)` (`RosettaModel`, `:48`), where `QualifiedName returns string: ValidID ('.' ValidID)*` (`:889-891`) — a dot-joined ID sequence with no leading/trailing/double dot.
- **Therefore** `(namespace, name) → \`${namespace}.${name}\`` is **injective**, and because `name` contains no `.`, the **last** `.` always separates namespace from name: `id.slice(0, id.lastIndexOf('.'))` / `id.slice(id.lastIndexOf('.') + 1)` recovers `(namespace, name)` exactly. (The `STRING`-named-namespace edge case — quoted namespaces with embedded dots/spaces — is the lone caveat; it is not produced by any current fixture and is already mishandled identically by today's `::` scheme, so it is not a regression. Document, don't block.) The `::` separator was chosen *only* for reversible splitting (`nodeId.split('::')`, `model-to-ast.ts:62`); last-dot split is exactly as reversible, so `::` buys nothing.

**Precondition 2 — the dot qualified name is the CANONICAL core key, and the editor can FORMAT-MATCH it (it cannot yet SOURCE it).** Langium/core already computes the dot qualified name as an `AstNodeDescription`: `RuneDslScopeComputation.addExportedSymbol` builds `const qualifiedName = \`${ns}.${simpleName}\`` and pushes `descriptions.createDescription(node, qualifiedName, document)` (`services/rune-dsl-scope-computation.ts:39-46`). The identical formula is re-emitted server-side as the export `path` in `functions/api/parse.ts:458` (`\`${namespace}.${e.name}\``) and in the curated artifact build (`curated-fetch.ts:215`) — and the studio mirrors the editor's `::` form in `ExplorePerspective.tsx` (`:1032`, `:1039`, `:1059`).
   - **Can the editor SOURCE it?** **No, not at the `astToModel` boundary today.** `astToModel` (`adapters/ast-to-model.ts:153`) consumes **deserialized `RosettaModel` ASTs** (R8→R1), reading `namespace` from `model.name` (`:56-57`) and `name` from `element.name` (`:173`). The `AstNodeDescription`s that carry the qualified name live in the **worker's `IndexManager` (server/worker-side)** and are *not* attached to the AST objects shipped to the editor; `astToModel` never sees a description. There is also **no exported core helper** for the dot form yet (no `qualifiedExportPath`/`getQualifiedName` in core's public surface). So the editor must **format-match** the convention — it constructs `${namespace}.${name}` from the same dotless `name` + dotted namespace the core uses, which is byte-identical *by construction* given Precondition 1.
   - **The cleanest form of "format-match":** introduce `qualifiedExportPath(namespace, name)` in `@rune-langium/core` (per §9.6 #3 / V11(a)) and have BOTH the server export-path sites AND the editor's `makeNodeId` call it. The editor then shares the **builder** (DRY) even though it still passes `(namespace, name)` rather than receiving a prebuilt description. This is "sourced from core" at the *function* level — the strongest available coupling short of threading descriptions through the wire (which would mean shipping the symbol index alongside R8; out of scope here).

**Precondition 3 — edge-id `--` parsing stays unambiguous under dots.** Edge ids embed node ids between `--{kind}--` delimiters (§2-V3; e.g. `\`${nodeId}--attribute-ref--${name}--${target}\``, `ast-to-model.ts:127`). Neither namespaces nor names can contain `--` (the grammar's `ID`/`QualifiedName` permit only `[a-zA-Z_0-9]` and single `.`), so `parseEdgeId` splitting on `--` remains unambiguous when node ids contain dots. **No edge-id change is required by the `::`→dot switch.**

**Consolidation achieved.** One identity across editor ↔ scope ↔ hydration ↔ cross-ref. `disambiguateTypeRef` (`editor-store.ts:77-94`) today returns the **dot** ref-text `${targetNamespace}.${targetTypeName}` (`:90`) for sibling-name collisions while operating on `::` node ids — i.e. it already straddles both forms. After unification the node id **is** the qualified ref-text, so the `::`↔dot translation disappears and the qualified-name form is built in exactly one place (`qualifiedExportPath`, re-exported through `node-projection.ts`).

**Migration surface (studio isn't live — pre-existing decision is no back-compat shim is needed; throwaway, not migrated).**
- **visual-editor `src` (small):** the **two** `makeNodeId` definitions (`adapters/ast-to-model.ts:60`, `store/editor-store.ts:467`) → one `${ns}.${name}` builder via `qualifiedExportPath`; the inverse `nameFromNodeId` (`model-to-ast.ts:61-64`, currently `split('::').pop()`) → last-dot split; the three `editor-store.ts` `makeNodeId` call sites (`:842`, `:917`, `:1064`-area) unchanged in shape; **delete** the `::`↔dot reconciliation latent in `disambiguateTypeRef` (`:90`). This work is *already folded into* §2-V1 / `node-projection.ts` (just change the literal from `::` to `.`).
- **studio `src` (FSL — out of the stated §-scope but must move in lockstep):** `ExplorePerspective.tsx` re-synthesizes `${ns}::${name}` at `:1032`, `:1039`, `:1059` and parses with `split('::')` at `:921`, `:1144`, `:1710`. These build/consume the **same** editor node-id convention, so they flip to `.` / last-dot split with the editor. `nodeIdToFilePath` (`:1018`) is keyed by these ids. (The header / §1 / Implementation-notes scope now reflects this: the node-id *value* change reaches studio — the one place workstream (A)'s "visual-editor-only" boundary is crossed.)
- **Test fixtures (~34 files):** roughly **34** visual-editor test files reference `ns::Name` literal ids (e.g. `test/store/editor-store.test.ts`, `test/store/editor-store-actions.test.ts`, `test/adapters/structure-graph-adapter.test.ts`, the `test/editors/*Form.test.tsx` family, `test/components/nodes/*Node.test.tsx`). All hard-code the `::` separator and must be rewritten to `.`. This is mechanical (a delimiter swap in fixtures), but it is the bulk of the diff.
- **Persistence: NONE.** No OPFS/IndexedDB or layout store persists `::`-keyed node ids — R14 holds raw source only; positions/ids are recomputed on load (§9.7). No data migration, no shim.

**Net.** Total source surface is small (≤6 edit points in visual-editor `src` + ~6 in studio `src`, all delimiter swaps); the cost is ~34 test-fixture rewrites. Because studio is not live, the switch is a hard cutover with **no back-compat layer**. The editor obtains the qualified name by **format-matching** the canonical core formula (ideally via a shared `qualifiedExportPath` builder), not by reading a Langium description object — sourcing the description itself would require threading the symbol index to the editor and is deliberately out of scope.
