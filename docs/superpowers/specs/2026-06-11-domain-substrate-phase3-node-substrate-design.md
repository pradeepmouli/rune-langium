# Domain Substrate — Phase 3: Editor Node Substrate = `Dehydrated<T>` + `node.meta`

## Goal

Make the visual-editor's node substrate hold the generated **domain object** (`Dehydrated<T>` from `@rune-langium/core`) as `node.data`, with UI metadata moved to a sibling `node.meta`. This realizes the north-star ("the domain model is the one and only representation across all surfaces") at the editor's core store, replacing today's loosely-typed, lossy AST projection.

## Context

Today (`packages/visual-editor/src/types.ts`):
- `node.data: AnyGraphNode` = `GraphNode<T>` = `AstNodeModel<T>` (a **lossy** AST projection — `ExcludedFields` drops `references`, `labels`, `ruleReferences`, `typeCallArgs`, `enumSynonyms`) **&** `GraphMetadata` (UI fields spread *flat* into the same object: `namespace`, `position`, `errors`, `isReadOnly`, `hasExternalRefs`, `comments`, `deferred`, plus a `[key: string]: unknown` index signature for ReactFlow).
- `nodesById: Map<string, TypeGraphNode>` is the Map-as-SoT (invariant I1: `nodes === [...nodesById.values()]`); built in `loadModels` via `astToModel` → `reconcileParse`; all mutations route through the `mutateGraph` chokepoint.
- `astToModel.buildGraphNode` produces `withGraphMetadata(stripAdditionalAstFields(element), meta)` = `{ ...astData, ...meta }`.
- `Dehydrated<T>` (`packages/core/src/serializer/dehydrated.ts`) is the **lossless** wire model: strips only Langium runtime fields, converts every `Reference` to strict `{ $refText }`, adds readonly `$namespace?`, requires `$type`.
- visual-editor does **not** use `Dehydrated`/`parsedAdapter`/`curatedAdapter` yet (only a type re-export + the generated domain-ops namespaces).

The substrate is ~80% structurally already "AST + `{$refText}` + flat metadata" — Phase 3 is mostly a **re-typing + metadata split**, with three genuine deltas (below).

### Resolved since the original roadmap

- **`typeKind → $type` is done** (Phase 2 curated-serializer fix). Curated and deferred-placeholder nodes now carry `$type`, so `Dehydrated<T>`'s required `$type` is satisfiable at the boundary. The scattered `$type → typeKind → node.type` fallbacks (`ExplorePerspective` `selectedNodeType`/`effectiveType`, `model-helpers.resolveNodeKind`, `OtherForm`) are now **dead code to retire**, not a constraint. This removes what was the #1 risk.

---

## §1 Target substrate shape

```ts
// Domain payload = discriminated union over the editable types (mirrors today's AnyGraphNode union):
type DomainNodeData =
  | Dehydrated<Data> | Dehydrated<Choice> | Dehydrated<RosettaEnumeration>
  | Dehydrated<RosettaFunction> | Dehydrated<RosettaRecordType> | Dehydrated<Annotation>
  | /* …the same arms AnyGraphNode covers today… */ never;

// ReactFlow node: domain payload + UI metadata sibling + native position
export type TypeGraphNode = Node<DomainNodeData> & { meta: GraphMetadata };
//   node.data: Dehydrated<T>   — pure domain object (lossless, strict {$refText}, $type required)
//   node.meta: GraphMetadata   — namespace, errors, isReadOnly, hasExternalRefs, comments, deferred
//   node.position              — ReactFlow-native (unchanged)
```

- `GraphMetadata` **loses** `position` (already a ReactFlow node field) and the `[key:string]: unknown` index signature (no longer needed once it's off the data payload).
- Node **components** (`DataNode`/`ChoiceNode`/`EnumNode`/`GenericNode`) receive `data` via `NodeProps` and read only **domain** fields — unaffected by the meta split. Metadata consumers (forms, validators, structure adapter, store) read `node.meta` at the store/panel level.
- **ReactFlow typing note (impl, not design):** `@xyflow/react` 12 constrains the data payload to `Record<string, unknown>`. `Dehydrated<T>` is a strict mapped type; bridging it to ReactFlow's `Node<…>` needs a typing accommodation (a `DomainNodeData` alias asserting the constraint, or a cast at the ReactFlow boundary). Do **not** reintroduce an index signature on the domain object to satisfy this.

---

## §2 Producing adapter

`astToModel` (and `loadModels`) emit the new shape:

```ts
// per element:
const data = parsedAdapter.dehydrate(element);        // AST → Dehydrated<T> (lossless, $namespace stamped, {$refText})
const meta: GraphMetadata = { namespace, errors: [], isReadOnly, hasExternalRefs: false, comments, deferred };
node = { id, type, position: { x: 0, y: 0 }, data, meta };
```

- **Parsed path:** use `parsedAdapter.dehydrate` (wraps `RuneStoreHydrator`) instead of `stripAdditionalAstFields` — this is the lossless, `$namespace`-stamped, strict-`{$refText}` conversion. (`stripAdditionalAstFields` / `ExcludedFields` / `withGraphMetadata` retire.)
- **Curated path:** `curatedAdapter.parse(json)` (now safe — `$type` present). Move any residual `effectiveType` mapping into the adapter boundary so downstream never needs a fallback.
- **Deferred placeholders:** `buildDeferredPlaceholderNodes` emits `{ data: { $type, name } as Dehydrated<T>, meta: { deferred: true, … } }`.
- **Inverse (`model-to-ast` / serialize):** hydrate directly from `node.data` (pure domain). `stripGraphMetadata` / `GRAPH_METADATA_KEYS` **disappear** — there is no metadata in `data` to strip. This dissolves the strip/fingerprint key-set fragility (the PR #309 corruption class).

---

## §3 The three deltas (and how each closes)

1. **Lossless fields.** `node.data` now carries `references`, `labels`, `ruleReferences`, `typeCallArgs`, `enumSynonyms` (previously dropped). Consequence: fingerprinting (`astRelevantProjection`), the degraded-reparse guard (`isDegradedReparse`), and edit-reconcile (`reconcileParse`) compare full domain objects. **Gate:** round-trip (`loadModels → edit → serialize → reparse`) must be byte-stable; the degraded-reparse and edit-reconcile tests must stay green. If a restored field churns the fingerprint, include it consistently on both sides of the parse↔store seam (the X/X⁻¹ inverse-pair rule).

2. **Ref shape.** Edit actions currently write two-key `{ ref:{name}, $refText }` (`editor-store.ts` ~1553/1723; `model-to-ast` ~88–92). `Dehydrated`'s ref is strict `{ $refText }`. **Normalize every ref write-site to `{ $refText }`** (drop the synthesized `ref:{name}`), or the typing is a lie. Hydration re-resolves the real `Reference` from `$refText` (Langium linker), so `ref:{name}` was never load-bearing for round-trip — verify via the rename-cascade + ref-API tests.

3. **Metadata placement.** ~140 read sites move `d.<metaField>` → `node.meta.<field>` for the metadata fields only (`namespace`, `errors`, `isReadOnly`, `hasExternalRefs`, `comments`, `deferred`); **domain reads stay on `node.data`** (`name`, `$type`, `attributes`, `enumValues`, `inputs`, `output`, `features`, `superType`, `parent`, `superFunction`, `synonyms`, `conditions`, `definition`, `annotations`). Use LSP-driven `findReferences` per metadata field to enumerate sites; an LSP/Copilot rename-symbol is preferred over grep+Edit for these moves.

---

## §4 Consumer surface (from the LSP map)

~140 `.data` read/write sites across ~25 files. Key consumers and their split:
- **editor-store.ts** (~73 sites): domain reads/writes stay on `node.data`; the ~76 `as AnyGraphNode`/`as never` casts collapse to the strict `Dehydrated<T>` typing. Metadata reads (`namespace`) → `node.meta`.
- **edit-validator.ts** (14), **useInheritedMembers.ts**, **node components**, **editor forms** (`DataTypeForm`/`EnumForm`/`ChoiceForm`/`FunctionForm`/`TypeAliasForm`/`EditorFormPanel`): domain reads on `data`; `isReadOnly`/`namespace`/`errors` → `meta`.
- **RuneTypeGraph.tsx**, **namespace-tree.ts**, **structure-graph-adapter.ts**, studio **ExplorePerspective.tsx** (`graphNodesToAdapterDocument`, `selectedNodeType`): `data.name`/domain stays; `namespace`/`typeKind`-fallback → `meta`/retired.

---

## §5 Verification gates (non-negotiable)

- Full visual-editor suite (currently **1271**) green after each shippable step.
- `editor-store-identity-ops` characterization + `editor-store-actions` no-op pins green.
- **Round-trip determinism**: parse → load → (no-op) serialize → reparse is byte-stable; edit → serialize → reparse reflects exactly the edit (no churn from restored lossless fields or ref-shape change).
- Degraded-reparse guard + edit-reconcile (`load-models-one-shot`, `degraded-reparse-guard`, `map-substrate`, `undo-maps`, `update-graph-view`) green.
- core / visual-editor / studio / lsp-server / cli type-check clean.
- Final holistic seam review (Opus) over the parse↔store↔serialize inverse pairs.

---

## §6 Implementation approach

**Decomposition is delegated to the implementing agent (Fable), decided incrementally as the work proceeds**, under these guardrails:
- Keep the substrate compiling + the full VE suite green at every committed step (no long red branches).
- Natural seams (a suggested, non-binding ordering): (a) **prep** — normalize ref write-sites to `{$refText}` + retire dead `$type/typeKind` fallbacks (no type change, independently shippable); (b) **core** — flip `TypeGraphNode` to `Node<Dehydrated<T>> & {meta}`, rewrite `astToModel`/`model-to-ast` via the adapters, migrate the ~140 sites (domain→`data`, metadata→`meta`) atomically; (c) **cleanup** — remove `stripGraphMetadata`/`GRAPH_METADATA_KEYS`/`stripAdditionalAstFields`/`withGraphMetadata`/`AstNodeModel`/`ExcludedFields`, confirm fingerprint tolerance.
- Use LSP `findReferences`/rename-symbol for the metadata-field moves; grep+Edit only where LSP doesn't fit.
- Fable reports decomposition choices; Opus reviews each shippable step (spec-compliance + code-quality) and runs the final holistic review.

---

## Out of scope

- Phase 4 (consumer read-surfaces — inspector/repository/studio reading the domain model directly beyond what the substrate change forces).
- Any change to the generated domain surface / langium-zod (this is a rune-only consumer cutover).
- `curatedAdapter` runtime Zod validation (separate, additive; the cast is sufficient now that `$type` is present).

---

## Decisions log

- **node.data = pure `Dehydrated<T>`; UI metadata → `node.meta` sibling; `position` stays ReactFlow-native.** (User direction.) Splitting metadata out of `data` is the cleaner architecture *and* dissolves the strip/fingerprint key-set fragility.
- **`$type` is guaranteed** (typeKind→$type done) → retire fallbacks rather than design around `$type`-less nodes.
- **Use `parsedAdapter`/`curatedAdapter`** as the producing boundary (first real consumer of the Phase 2 adapters).
- **Strict `{$refText}` refs** — normalize the two-key write-sites.
- **Decomposition owned by Fable at implementation time**, gated by green-suite-per-step + holistic review.
