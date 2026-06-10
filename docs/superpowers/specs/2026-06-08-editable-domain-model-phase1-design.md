<!-- SPDX-License-Identifier: MIT -->
# Editable Domain Model — Phase 1 Design

**Status:** Phase 1 MERGED (2026-06-09) — langium-zod PR #75 + rune PR #322. The generated `domain.ts` artifact (`@ts-nocheck`, 593 `any`-typed functions) is being torn down; see `docs/superpowers/plans/2026-06-09-revert-domain-emitter.md` for teardown tasks and the corrected follow-on architecture (`Dehydrated<T>`, `RuneStoreHydrator`, typed `domain-ops.ts`). The §3.1 design intent remains correct; the execution output needs replacement.

**Goal:** Produce a generated, editable, round-trippable **domain model** that can become the single representation the rune visual editor edits, the serializer round-trips, and every surface speaks — replacing the three shapes that coexist today.

**Architecture:** Evolve the langium-zod emitter to generate an *editable* domain model (inline `{$refText}` refs, `$type` discriminant, lossless semantic fields, additive normalizations, pure-semantic). Round-trip is proven through Langium's own `JsonSerializer` (`$type`-dispatched, covers all node types). View metadata lives in a rune-side overlay. No editor cutover in this phase.

**Tech stack:** TypeScript 5.9+/ESM, Langium 4.2.x (`JsonSerializer`, generated AST + `AstReflection`), langium-zod (the domain emitter), the rune `@rune-langium/core` serializer + `@rune-langium/visual-editor` consumer. Tests via Vitest.

---

## 1. Context & motivation

The same conceptual entity (a Rosetta type/function) exists today in **three** shapes:

1. **Editor substrate** — `TypeGraphNode.data` (`AnyGraphNode` = `AstNodeModel<T> & GraphMetadata`): AST-shaped with `$type`, editable `{$refText}` refs, **but lossy** (its `ExcludedFields` drop `references`/`labels`/`ruleReferences`/`typeCallArgs`/`enumSynonyms`) and view-metadata is mixed in.
2. **Generated read-projection** — `AnyDomain` via `toDomain` (langium-zod): `$type`-discriminated, **lossless**, but cross-refs are **flattened to plain strings** → read-only-confined (can't round-trip an edit through a flattened ref).
3. **Curated hydration form** — `/api/parse` serialized documents use `typeKind` with **no `$type`** (per `resolveNodeKind`'s doc in `model-helpers.ts`), so curated nodes are second-class and `toDomain` throws on them.

**North star (user-approved):** the domain model should be the **single editable substrate** across all interfaces/services/surfaces — sources *adapt in* at ingestion; editor, inspector, serializer, repository, studio, and codegen all speak domain. The three shapes collapse into one.

## 2. Phase decomposition

This is too large for one spec. Dependency-ordered, each phase ships working software:

- **Phase 1 (this spec) — Editable domain model + round-trip (keystone).** Define the editable, lossless, round-trippable generated model + prove round-trip. No editor cutover.
- **Phase 2 — Source adapters.** A `SourceAdapter` boundary; `parsedAdapter` (Langium AST→domain) and `curatedAdapter` (serialized `typeKind` JSON→domain) both emit Phase-1 objects. Curated stops being second-class.
- **Phase 3 — Editor substrate cutover.** `nodesById` holds domain objects; recipes/write-accessors mutate domain; view-overlay separated; undo/redo on domain.
- **Phase 4 — Consumer cutover.** Inspector, repository, studio, surface-serializer consume domain; retire the AST-shaped duality.

## 3. Phase 1 architecture & boundaries

Three-package split with clean boundaries:

### 3.1 langium-zod — the emitter (generated types + accessors)
Evolve the base #68 generic domain generator so it emits an **editable** model:
- **Cross-refs as editable `{$refText}` objects on both read and write** (un-flatten the current `string` read type). The reference's runtime shape is `{ $refText: string }` (resolution stays derived/external — not embedded).
- **`$type` literal discriminant retained** on every interface (round-trip + narrowing).
- **Lossless semantic fields** — keep `references`/`labels`/`ruleReferences`/`typeCallArgs`/`enumSynonyms` that the editor's `node.data` currently drops. Strip ONLY `$`-internals (`$container`/`$containerProperty`/`$containerIndex`/`$cstNode`/`$document`/`$refNode`/`$nodeDescription`).
- **Additive normalizations** — `extends` (unifying `Data.superType`/`RosettaFunction.superFunction`/`RosettaEnumeration.parent`) and `members` (unifying `attributes`/`enumValues`/`inputs`/`features`). Additive (originals retained), read-derived.
- **Pure-semantic** — NO `position`/`errors`/`namespace`/`isReadOnly` in the domain object.
- **`$type`-dispatched `domain ↔ AST` mapping** — `toDomain(astNode)` (exists) plus its inverse `toAst(domainObj)`. Near-identity because the editable shape mirrors the AST (inline refs, same field names); the inverse drops the additive normalizations and re-nests nothing else.

### 3.2 core — round-trip via Langium (no new serializer)
Round-trip is proven through **Langium's `JsonSerializer`**, which already does `AST ↔ JSON` uniformly, `$type`-dispatched, for **every** node type including Function. The curated artifacts already use exactly this (`kind: 'langium-json-serializer'`). Therefore:
- The **canonical machine serialization** of the domain model = `domain → AST → Langium JSON` (and inverse). No Function gap.
- The existing hand-written `.rosetta` **text** serializer (`packages/core/src/serializer/rosetta-serializer.ts`, Data/Choice/Enum only) stays a **separate downstream renderer**. Its inability to emit Function is a *text-rendering* TODO (its own later spec), decoupled from the domain model's round-trip fidelity.

### 3.3 rune — the view overlay (consumer boundary)
- A **`ViewOverlay`** type for `position`/`errors`/`isReadOnly`, keyed by node id, defining the domain/view split so Phase 3 can cleanly separate `node.data` into `domain object + overlay`.
- `namespace` is **identity-derived** (part of the qualified-name key `qualifiedExportPath(namespace, name)`), not baked into the domain object.
- The flattened string-ref projection (today's `toDomain`) may remain as a **derived read-view** for query/display, computed from the editable model.

## 4. Data flow (proven this phase)

```
.rosetta source ─parse→ AST ─toDomain→ [editable domain] ─edit via generated accessor→ [edited domain]
                                                                          │
                              assert faithful + edit survives ◀── toDomain ◀─ AST ◀─ JsonSerializer(JSON) ◀─ toAst
```

For Data/Choice/Enum, additionally prove the `.rosetta`-**text** round-trip via the existing serializer. Function's text round-trip is out of scope (downstream renderer gap).

## 5. Error handling

- **Curated `$type`-less nodes are out of scope for Phase 1** (they're a Phase 2 *adapter* concern). The editable emitter assumes valid AST `$type`. Phase 1 does NOT wire the model over curated-inclusive node sets — that throw risk (`toDomain` switches on `$type` and throws on the curated `typeKind`-only form) is resolved by the Phase 2 `curatedAdapter`, which assigns `$type` on ingest.
- `toAst`/`toDomain` are total over the known `$type` set (grammar-derived switch); an unknown `$type` throws (a generation/grammar-drift bug, surfaced loudly by the conformance harness).

## 6. Testing (conformance harness)

A new conformance harness asserts, for **Data, Choice, Enum, Function**:
1. **Lossless JSON round-trip** — `domain → toAst → JsonSerializer → deserialize → toDomain` equals the original domain object (every non-`$` AST field survives).
2. **Editable-ref survival** — apply a `setInheritance`/`updateAttributeType`-style edit on the domain object via a generated write-accessor; assert the edited `{$refText}` is present after the round-trip.
3. **`.rosetta`-text round-trip** for Data/Choice/Enum via the existing serializer (Function noted as a downstream gap).
4. **Shape assertions** — `$type` discriminant present and narrowable; `extends`/`members` normalizations present alongside source fields; cross-refs are `{$refText}` objects (not flattened strings); lossless fields (`typeCallArgs` etc.) present.

## 7. Key decisions & rationale

- **Single editable substrate** (not a read projection): user directive — the domain model *is* the thing, so cross-refs stay editable and the model round-trips.
- **Refs: inline `{$refText}` (Option 1), centralization DEFERRED.** A spike proved a derived-index registry doesn't remove the hard `renameType` rewrite (serializer + read sites still read inline `$refText`), and an authoritative-handle registry is a substrate replacement (migration spec, not keystone). Crucially, **`edgesById` already materializes every cross-ref** (`extends`/`attribute-ref`/`choice-option`/`enum-extends`/`type-alias-ref`) — a parallel `RefRegistry` would be a DRY violation. If centralization is later pursued, **promote `edgesById` to be the registry** (add `fieldPath`/`rawForm` discriminators, index `bySource`/`byTarget`). This folds together with the deferred branded-`Ref` "Option 2" migration.
- **Serializer = Langium `JsonSerializer`** (`$type`-dispatched, all types) — do not hand-roll/generate a parallel serializer; the Function "gap" is only in the `.rosetta` text renderer, which is a separate concern.
- **Generated (Approach B)** over hand-derived — the domain model is the SSoT, so it's generated and grammar-driven; the editable emit is a focused change to the existing emitter (refs → objects, `$type` retained, normalizations).

## 8. Non-goals (each its own later spec)

- Ref-centralization / branded-`Ref` → the "promote `edgesById` to ref-registry" migration.
- Curated (and other) **source adapters** → Phase 2.
- Editor **`nodesById` cutover** to domain objects → Phase 3.
- Consumer cutover (inspector/repository/studio) → Phase 4.
- `.rosetta` **Function text-rendering** → a serializer-completion spec.

## 9. Risks & open questions

- **`JsonSerializer` availability in the editor context.** Phase 1 proves round-trip in a Node/test context where Langium services exist. The editor (browser) reaches Langium via the LSP worker; the *editor-substrate* cutover (Phase 3) only needs the pure `domain ↔ AST` mapping, with JSON serialization at the worker boundary — to be confirmed in Phase 3, not Phase 1.
- **langium-zod branch state.** The repo is currently on the base #68 emitter (read-projection 3D-1 work set aside). The editable emit re-introduces `$type` retention + normalizations atop the base — the plan must reconcile this starting point (and the dev-link/shebang handling for consuming the evolved emitter from rune).
- **`toAst` faithfulness.** The inverse mapping must drop additive normalizations without losing source fields; the conformance harness (§6.1) is the guard.
