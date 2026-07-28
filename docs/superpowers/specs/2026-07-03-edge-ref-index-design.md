# Edge Ref-Index Promotion — Design

**Executes the recorded spike decision** (2026-06-08, domain-model-as-substrate Phase 1): ref-centralization must NOT be a parallel `RefRegistry`; when pursued, promote `edgesById` — which already materializes every cross-reference as a first-class id-keyed edge — into the ref index. **Driving goal (user-selected): correctness — kill the bare-vs-qualified rename trap.**

## The live bug this fixes

`renameType`'s cascade (`packages/visual-editor/src/store/editor-store.ts` step 2, ~line 1282) rewrites refs by **name-matching across all N nodes** via `updateTypeRefsInNode`/`renameRefText`. `renameRefText` matches the bare form (`oldName`) in ANY node — its own doc comment concedes cross-namespace bare collisions are "a separate, pre-existing resolution concern, untouched here." Concretely: renaming `A.Foo` rewrites a bare `"Foo"` ref in namespace B **even when that ref binds to B's own `Foo`** — silent over-rewrite, wrong source emitted at serialize.

Meanwhile the edges already encode the correct binding: `ast-to-model.ts` materializes every cross-ref as an edge whose `target` was resolved once, at build time, by `nameToNodeId` (with existing cross-ns disambiguation tests). The cascade just doesn't use them. Step 3 (edge re-keying) already does.

## Design

### 1. No new stored edge fields

Two insights eliminate the originally-sketched `fieldPath`/`rawForm` additions:

- **Form is derivable from the value.** A ref's current `$refText` says whether it is bare (`Foo`) or qualified (`ns.Foo`); form-preserving rewrite (bare→bare, qualified→qualified) needs no stored discriminator. The trap was binding ambiguity, not form detection — and the edge's existence IS the binding decision.
- **Location is derivable from edge kind + label + node `$type`.** Attribute-ref edges are labeled with the MEMBER name (`ast-to-model.ts:135`); func outputs use the literal label `'output'` (:274); `extends` maps to `superType` (Data) / `superFunction` (RosettaFunction) / `parent` is covered by `enum-extends`; `choice-option` edges carry the (possibly qualified) TYPE name as label; `type-alias-ref` maps to the alias's `typeCall`. Name-addressed, never index-addressed — reorder/remove recipes create no new invariant.

### 2. Derived edge index (read-side; resolves the spike's staleness finding by construction)

New memoized selector in `packages/visual-editor/src/store/` (sibling to `selectNodeRepository`, same Map-identity memoization):

```ts
selectEdgeIndex(edgesById) → { bySource: Map<nodeId, TypeGraphEdge[]>, byTarget: Map<nodeId, TypeGraphEdge[]> }
```

Derived from the `edgesById` Map identity — rebuilt when the Map reference swaps (every mutation swaps it; Maps-as-SoT), never written to directly. Inline `{$refText}` stays authoritative at serialize; the index only ADDRESSES writes, it never substitutes for them. This is the resolution of the spike finding "a derived index leaves inline $refText stale": the index carries no `$refText`, so it has none to go stale.

### 3. Edge-driven rename cascade

`renameType` step 2 becomes:

1. `byTarget(renamedNodeId)` → incident edges (built from the PRE-mutation `edgesById`, same un-proxied read discipline the recipe already uses).
2. For each edge: locate the slot in the source node's data via a single `locateRefSlot(edge, sourceNode)` helper (the kind+label+`$type` mapping from §1); rewrite that slot's `$refText` form-preservingly (`oldName`→`newName`; `ns.oldName`→`ns.newName`).
3. An edge whose slot cannot be located, or whose located `$refText` matches neither expected form, is an **invariant breach: dev-warn and skip** — never fall back to name-matching, never guess.
4. The renamed node's own data is ALWAYS run through the same slot rewrite for every slot kind (covers self-references, which have no edges — see §5).
5. Step 3 (edge re-keying via `parseEdgeId`/`makeEdgeId`) is unchanged.

`updateTypeRefsInNode`/`renameRefText` are deleted (or reduced to the form-preserving value rewrite used inside the new cascade). No parallel mechanism survives.

### 4. Coverage gap: Annotation edges

The edge-builder kind filter (`ast-to-model.ts` ~:189) covers Data/Choice/Enum/Function/RecordType/TypeAlias but **not Annotation**, while `updateTypeRefsInNode` DOES rewrite Annotation attributes today. Fix: include Annotation nodes in edge materialization (attribute-ref edges via the existing `getAttributeEdges`). Without this, edge-driven rename would regress annotation-attribute refs.

Coverage audit (all other rewrite sites have edges): Data attributes ✓ (:233) / Data superType ✓ (:224) / Choice options ✓ (:242) / Enum parent ✓ (:257) / Func inputs ✓ (:267) / Func output ✓ (:274) / Func superFunction ✓ (:288) / RecordType features ✓ (:297) / TypeAlias typeCall ✓ (:304).

### 5. Pre-existing self-reference bug (confirm, then fix)

Edges skip self (`targetNodeId !== nodeId` guard) AND today's cascade skips the renamed node (`if (id === nodeId) continue`, :1283) — so `type Foo` with a `Foo`-typed attribute almost certainly serializes a stale `$refText` after rename on master. Task order: write the failing test FIRST to confirm, then §3.4 fixes it. Do NOT add self-edges — `edgesById` also feeds React Flow rendering, and visual self-loops are an unwanted side effect.

### 6. Recipe-created edges must keep the invariant

Recipes that create refs (`addAttribute`, `setInheritance`, `updateAttributeType`, choice/enum/alias equivalents) already create/maintain their edges (3B/3C work). The new invariant test (§Testing) makes any drift loud. No new recipe work expected beyond what the invariant test surfaces.

## Testing

- **Cross-ns bare collision** (the live bug): ns A `Foo`, ns B has its own `Foo` + a bare `Foo`-typed attribute binding locally + a qualified `A.Foo` attribute. Rename `A.Foo`→`A.Bar`: B's bare ref untouched; B's qualified ref becomes `A.Bar`. Must FAIL against master's name-matching logic (RED first).
- **Self-reference rename**: `Foo` with `Foo`-typed attribute; rename → own attribute rewritten (confirms + fixes §5).
- **Annotation attribute rename** (covers §4).
- **Qualified cascade + choice-option label re-key**: existing suites stay green.
- **Serialize round-trip after rename**: emitted source contains no stale old-name refs, in either form.
- **Invariant test**: for every edge materialized from a parsed multi-kind fixture, `locateRefSlot` finds a slot whose `$refText` resolves to the edge's target (bare or qualified) — the loud-drift guard for §6.
- **Selector memoization**: same Map identity → same index instance (mirrors node-repository test).

## Error handling

Slot-location failures dev-warn (console, dev-only) and skip the edge; rename completes for all locatable refs. No throw mid-recipe (a throw inside `mutateGraph` would abort the whole mutation).

## Out of scope (YAGNI)

- Routing `findNodeByName` / display classification (`structure-graph-adapter.ts`) through the index — read-path perf was explicitly not the goal.
- Expression-level type refs inside conditions (not rewritten today either; recorded, unchanged).
- Any serializer change; inline `{$refText}` remains the authoritative serialized form.
- Authoritative-handle registry (rejected by spike: substrate replacement for sub-ms gain).
