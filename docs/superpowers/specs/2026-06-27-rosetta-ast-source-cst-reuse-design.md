# Lossless AST → `.rosetta` Source via CST-Reuse — Design

**Date:** 2026-06-27
**Status:** Proposed (awaiting review)
**Author:** Pradeep Mouli (with Claude)

## Problem

Editing a type through the visual editor's **inspector** silently corrupts that
type's source. The live write-back path is:

```
parse source (full AST: conditions, attribute metadata, synonyms, doc refs)
  → ast-to-model → node.data = LOSSLESS Dehydrated<T> domain payload (keeps everything)
  → inspector edits ONE field → mutateGraph (updates node.data, no parseEpoch bump)
  → useModelSourceSync fires (mounted unconditionally; any store change)
  → serializeModel(node.data)        ← LOSSY: conditions→`True`, drops every
                                        attribute annotation except [definition]
  → mergeSerializedIntoSource        ← splices the lossy block over the original
  → file written
```

`serializeModel` (`packages/core/src/serializer/rosetta-serializer.ts`) emits only
`Data` / `Choice` / `RosettaEnumeration`, and for those it under-emits: condition
bodies become `True` placeholders (`rosetta-serializer.ts:186`), and
`serializeAttribute` emits only name/type/cardinality/`[definition]` — dropping
`[metadata …]`, `[synonym …]`, doc references, labels, and rule references.

`mergeSerializedIntoSource` (`apps/studio/src/utils/source-merge.ts`, PR #221)
protects whole **dropped element kinds** (functions, typeAliases, rules…) by
preserving them verbatim. It does **not** protect lossy content *inside* a
supported kind: a `Data` with a condition is present in the serialized output (as
`True`), so the merge matches it by name+kind and splices the lossy version over
the real source. The merge's safety net has a hole exactly the size of
"supported kind, under-emitted content."

**Severity:** this is a live correctness bug, not latent. The trigger is the
constant inspector auto-sync (every edit), and the data is right there in the
lossless `node.data` — `serializeModel` is simply incomplete relative to the
payload it is handed. Curated `deferred` nodes are filtered out
(`model-to-ast.ts:70`), so exposure is user-authored / hydrated-editable content;
CDM-derived content is condition- and metadata-heavy.

## Background: Langium has no native AST → source serializer

Verified three ways (installed package, maintainers, docs):

- **`langium@4.3.0`** exposes only `JsonSerializer` (AST ↔ JSON) + `Hydrator` in
  its `serializer` service group (`services.d.ts:76`). The `./generate` subpath is
  codegen *helpers* (`expandToString`, `CompositeGeneratorNode`), not an unparser.
- **Maintainers** ([discussion #683](https://github.com/eclipse-langium/langium/discussions/683)):
  "a serializer does not exist yet for Langium"; only musings about a future
  `langium-stringify` package (still nonexistent 3+ years later). Recommended
  workaround: hand-write an AST→text generator. They also confirm the formatter
  only works on nodes that already have a CST — it cannot synthesize text for a
  CST-less AST.
- **Docs** show every "AST → text" example as a hand-written generator;
  `JsonSerializer.serialize` is JSON only.

Conclusion: building our own AST → `.rosetta` generator is correct and
unavoidable. The maintainers' two hardest problems — reincorporating
comments/hidden nodes and default whitespace across grammars — are precisely what
CST-reuse sidesteps: untouched bytes are never regenerated.

## Key insight: this is the recast / red-green model

The source text is the artifact; patch only the delta. For each node: if its
subtree is unchanged, emit its **original bytes** (sliced from the source at the
node's CST offsets); if dirty or new, **regenerate** it structurally and recurse
into its children (each child takes its own reuse fast-path).

Two facts make this lean:

1. **`node.data` is strongly typed, not duck-typed.** It is
   `DomainNodeData` = a discriminated union of `Dehydrated<T>`
   (`visual-editor/src/types.ts:81`, `core/serializer/dehydrated.ts:34`).
   `Dehydrated<T>` is a typed transform of the real Langium AST type `T`:
   `Reference<T>` → `{ $refText: string }`, runtime fields stripped, all semantic
   fields preserved and mutable. A real linked AST node is structurally
   assignable to `Dehydrated<T>` for reads (every `Reference` carries `$refText`;
   dropped fields are extra). So one `$refText`-first emit core typed against
   `Dehydrated<T>` serves both the editor and codegen — no duck-typing, no
   Zod-style fallback.

2. **CST offsets are intrinsic and tiny.** `CstNode extends DocumentSegment`
   (`syntax-tree.d.ts:215`) carries `offset`/`end`/`range`. Carrying offsets is
   two integers per node — unlike `$cstText`, which nests and duplicates the
   source O(depth). `RUNE_SERIALIZE_OPTIONS` already sets `textRegions: true`
   (`rune-serialize.ts:18`), so the JSON wire form already carries `$textRegion`
   offset metadata; we surface/retain it rather than invent it.

## Goals

- Make inspector edits **lossless**: conditions, attribute annotations,
  metadata, synonyms, doc references, comments, and formatting survive an edit to
  any other field of the same element.
- Provide a **whole-AST emit-core** that returns structural `.rosetta` text where
  a construct is implemented and **`null`** where it is not, so the caller falls
  back to the node's CST-range slice. The implemented set is seeded with the
  inspector-editable surface (`Data`/`Choice`/`RosettaEnumeration` scalars +
  add/remove children) and grows incrementally; **correctness is universal from
  day one** because any unimplemented `$type` rides CST-reuse. Reusable outside the
  editor (batch export, CLI, server).
- Share **one emit core** between the editor's incremental path and a batch
  codegen `.rosetta` target (DRY).
- Eliminate the lossy `serializeModel` → `mergeSerializedIntoSource` round-trip
  for the edit path.

## Non-Goals

- **Day-one structural coverage of every construct.** The emit-core dispatches
  over the whole AST but returns `null` for `$type`s it does not yet structurally
  emit; those fall back to CST-reuse. Coverage grows incrementally — there is no
  point where an unimplemented construct causes data loss (it slices its original
  bytes). A grammar-driven generic generator remains a possible future direction,
  reachable behind the same `emitNode` interface.
- Preserving user formatting *within* a node that is structurally edited — an
  edited node is regenerated with canonical formatting; its untouched siblings
  and descendants keep their original bytes.
- Browser-side corpus parsing changes (the "019" boundary stays).

## Decision

Adopt option **B** (CST-reuse via carried offsets) for the editor write-back, and
implement the generation half as a **shared pure emit core** that is also wrapped
as a codegen `.rosetta` target.

Each dehydrated node carries `$cstRange = { offset, end }` — a **permanent
baseline locator** stamped at dehydrate time and refreshed on every reparse,
indexing the source that produced the current parse. It is **never cleared**; it
serves both as the slice source for a clean node and as the splice location for a
dirty one. **Dirtiness is a separate, free signal:** `pendingEditPatches` (the
Mutative patches `mutateGraph` already captures since the last parse). A node is
dirty iff some patch path is at-or-under it. So `subtreeClean(node)` ≡ `node` has
a `$cstRange` AND no patch path falls at-or-under it → slice; otherwise
regenerate. No reparse, no per-node text, and `mutateGraph` needs no change.

## Architecture

### Components

```
packages/codegen/src/emit/rosetta/
  rosetta-emit-core.ts     PURE, Dehydrated<T>-typed, $refText-first.
                           No NamespaceWalkResult, no fs, no ExcelJS.
  rosetta-emitter.ts       class RosettaEmitter implements NamespaceEmitter;
                           composes the core per-namespace; registered in generator.ts.

packages/codegen package export:
  "@rune-langium/codegen/rosetta"   NEW browser-safe subpath exporting
                                    rosetta-emit-core ONLY (bypasses
                                    generator.ts → excel-emitter → exceljs).

packages/core/src/serializer/
  dehydrated.ts            Dehydrated<T> gains $cstRange?: { offset; end }.
  (dehydrate adapter)      Stamps $cstRange from $cstNode at dehydrate time.

packages/visual-editor/src/
  store/editor-store.ts    (no change to mutateGraph — it already captures
                           pendingEditPatches; the serializer reads them as the
                           dirty signal.)
  serialize/
    cst-reuse-serializer.ts  Option B. Recursive: $cstRange present → slice
                             baseline source; else emit-core(node) + recurse.
                             Replaces serializeModel + mergeSerializedIntoSource
                             for the edit path.
```

### The emit core (pure generation)

```ts
// packages/codegen/src/emit/rosetta/rosetta-emit-core.ts
type DehydratedNode = Dehydrated<AstNode>;
export type EmitChild = (child: DehydratedNode) => string;

// Whole-AST dispatcher. Returns structural .rosetta text for an implemented
// $type, or `null` for any $type not yet implemented. Composite children are
// emitted via `emitChild` (the driver supplies the reuse-or-regenerate policy).
export function emitNode(node: DehydratedNode, emitChild: EmitChild): string | null;
```

- **Whole-AST, `null`-for-unimplemented.** `emitNode` switches on `node.$type`.
  Implemented cases (seeded with `Data`/`Choice`/`RosettaEnumeration` and their
  editable scalars) return text; every other `$type` returns `null`. `null` means
  "I cannot generate this — use the CST." This is the universal correctness valve.
- **Inversion of control for children.** An implemented case emits the node's own
  scalars and calls `emitChild(child)` for each composite child (attributes,
  conditions, annotations, …). The driver supplies `emitChild`:
  - editor: `emitChild = c => emitNode(c, emitChild) ?? slice(c.$cstRange)` —
    so an untouched child of an edited node rides its CST slice even if its
    `$type` is unimplemented.
  - codegen batch: `emitChild = c => emitNode(c, emitChild) ?? gap(c)` — no CST to
    slice, so an unimplemented child is a known gap (logged, never silent).
- **Typed against `Dehydrated<T>`; `$refText`-first** throughout — works for the
  editor's unlinked payload AND a structurally-compatible codegen AST node.
  Cross-references emit `ref.$refText`; never `.ref` (may be undefined/stale).
- No duck-typing; the legacy `(el as { $type })` guards do not carry forward.
- Implemented scalars (Plan A seed): `Data` (name/`extends`/`<definition>`),
  `Attribute` (`override`/name/type/`card`/`<definition>`), `Choice` (name/
  `<definition>`), `ChoiceOption` (type), `RosettaEnumeration` (name/`extends`/
  `<definition>`), `RosettaEnumValue` (name/`displayName`/`<definition>`). All
  other fields/children (annotations, synonyms, doc refs, labels, rule refs,
  conditions, expressions) ride CST-reuse until structural cases are added.

### The codegen `.rosetta` target (batch generation)

- `RosettaEmitter implements NamespaceEmitter` (`namespace-emitter.ts:35`),
  composing the emit core per construct; registered via two one-line table
  entries in `generator.ts` (`NAMESPACE_EMITTERS` + optional `PROFILES`).
- Reuses the existing whole-namespace driver `emitNamespaceWithContract`.
- **Pre-req:** the codegen walker does not collect `Choice`
  (`namespace-walker.ts:58-74`); add `Choice` collection so the batch target
  covers the full domain surface. (The editor path gets `Choice` from `node.data`
  regardless.)

### The editor serializer (option B / incremental)

Evolves `apps/studio/src/utils/source-merge.ts` from element-granular splice to
recursive, offset-driven CST-reuse:

```
serialize(node, originalSource, dirtyPaths):
  if subtreeClean(node, dirtyPaths):     // has $cstRange AND no patch at-or-under
    return originalSource.slice(node.$cstRange.offset, node.$cstRange.end)   // reuse
  else:
    return emitNode(node, child => serialize(child, originalSource, dirtyPaths))
           ?? originalSource.slice(node.$cstRange.offset, node.$cstRange.end)  // regen, else slice
           ?? throw                                                           // new + unimplemented
```

- **Dirty signal:** `pendingEditPatches` (id-rooted Mutative patches, already
  captured by `mutateGraph`). Every write — including cascaded `$refText` rewrites
  from a rename — produces a patch at the rewritten path, so referencing
  attributes are correctly marked dirty and regenerated.
- **Byte source:** `originalSource.slice(offset, end)` using carried offsets. No
  reparse.
- **New nodes** (no `$cstRange`): full emit-core; inserted after the last clean
  sibling's range, or at the namespace tail when there is no sibling to anchor to.
- **Deleted nodes:** conservatively **preserved** in Plan A — a node removed from
  the graph has no current `$cstRange`, so its original source range falls into a
  copied "gap" and survives (matching `source-merge`'s current behavior: deletion
  is done through the source editor, never silent loss). Lossless inspector-driven
  deletion needs a retained baseline element-id→range index and is a follow-up.

### Data flow

```
parse → AST(+CST) → dehydrate (stamp $cstRange) → node.data
inspector edit → mutateGraph → patch node.data, append pendingEditPatches ($cstRange untouched)
useModelSourceSync (parseEpoch unchanged) →
    cst-reuse-serializer(nodes, originalSource, dirtyPaths from pendingEditPatches)
  → per element: subtreeClean ? slice($cstRange) : emitNode (recurse)
  → assembled file text → onFilesChange → write
reparse (parseEpoch++) → re-stamp $cstRange from fresh CST, pendingEditPatches cleared
```

## Correctness constraints

- **Offsets are baseline-relative.** They index the source that produced the
  current parse. (1) Compute all reuse-slices and regenerations against that one
  baseline and assemble in a single ordered pass — never slice a baseline offset
  against already-mutated text. (2) Re-stamp `$cstRange` on every reparse
  (`parseEpoch` bump). (3) **Do not trust `$cstRange` from a degraded / worker-
  unavailable parse** — fall back to full emit-core (ties into the existing
  degraded-parse guard / parseEpoch gate in `useModelSourceSync`).
- **Subtree-aware dirtiness.** A dirty descendant must force the parent to
  regenerate (its whole-block slice is stale). So `subtreeClean(node)` tests
  whether ANY patch path falls at-or-under `node`'s path, not just on `node`
  itself. `$cstRange` stays put as the locator either way.
- **Cross-reference cascades.** Rename → the cascade rewrites `$refText` in
  referencing attributes via `mutateGraph`; those rewrites emit patches at those
  attributes' paths → they are dirty → regenerated with the new name. A naive
  "only the clicked node is dirty" rule would reuse stale references; the
  patch-path test avoids that.
- **Browser safety.** The editor imports `@rune-langium/codegen/rosetta` (emit
  core only). The package barrel must not be on that path, because
  `index.ts → generator.ts → excel-emitter → exceljs` would bundle ExcelJS.

## Error handling

- Emit-core never throws on a well-typed `Dehydrated<T>`; a missing optional
  field emits nothing for that field (not a placeholder).
- If assembling against the baseline fails (e.g. an offset is out of range
  because the parse was degraded), the serializer falls back to full emit-core for
  the affected element and logs once via the output store, mirroring the existing
  `handleModelChanged` `// Error serializing …` guard — never silently truncating.
- If `pendingEditPatches` is empty for a content change (should not happen given
  the `mutateGraph` chokepoint), treat all nodes as dirty (full regenerate) rather
  than reuse stale offsets.

## Testing

- **Emit-core unit tests** (`packages/codegen/test/`): per implemented `$type`, a
  `Dehydrated<T>` fixture asserting exact `.rosetta` text for the implemented
  scalars (cardinality forms, `override`, `extends`, `<definition>`, choice
  options, enum values incl. `displayName`). Plus a test that `emitNode` returns
  `null` for an unimplemented `$type` (e.g. `RosettaFunction`).
- **Round-trip regression (the bug):** parse a `type` with a condition AND an
  attribute `[metadata …]`/`[synonym …]`; load to graph; edit an *unrelated*
  attribute via a store action; run the cst-reuse serializer; assert the condition
  and metadata survive byte-for-byte. This test must fail against today's
  `serializeModel` + merge and pass after.
- **Reuse vs. regenerate:** assert an edit to node A leaves node B's bytes
  identical (offset slice) and only A's block changes.
- **Cascade:** rename type B; assert referencing attributes regenerate with the
  new name while their siblings' bytes are untouched.
- **New / deleted nodes:** add a type (full emit, inserted) and delete a type
  (range dropped); assert valid output.
- **Degraded parse:** simulate a degraded reparse; assert the serializer does not
  slice stale offsets (falls back to emit-core), reusing the existing
  source-corruption fixtures.
- **codegen `.rosetta` target:** batch-emit a small namespace (incl. a `Choice`)
  and re-parse the output to assert grammar validity.
- **Browser-safety:** a bundle/import test asserting `@rune-langium/codegen/rosetta`
  does not pull in `exceljs`.

## Rollout / phasing

1. **Emit-core + tests** (`packages/codegen/src/emit/rosetta/`), browser-safe
   subpath, ExcelJS-avoidance verified. Whole-AST dispatcher; structural cases for
   the inspector-editable scalars, `null` for the rest.
2. **Offset preservation:** `Dehydrated<T>.$cstRange`, stamp at dehydrate,
   re-stamp on reparse.
3. **Dirty-path wiring:** thread `pendingEditPatches` (as a dirty-path set) from
   the store through `useModelSourceSync` into the serializer. No `mutateGraph`
   change.
4. **cst-reuse serializer** replacing `serializeModel`/`mergeSerializedIntoSource`
   on the edit path; round-trip + cascade + degraded tests green.
5. **codegen `.rosetta` batch target** + `Choice` walker support + registration.
6. **Cleanup:** retire dead `serializeElement`/`serializeModels`; retire
   `serializeModel`/`source-merge` once the editor path is migrated; evaluate
   retiring `preserveCstText` (offsets + on-demand slice replace the condition-text
   snapshot — pending the cross-worker case where the source is unavailable at the
   consumer).

Each phase is independently testable; phases 1–4 deliver the bug fix, 5 delivers
the reusable batch target, 6 is cleanup.

## Risks

- **`preserveCstText` cross-worker case.** Expression cells consume condition text
  after a parse-worker → main-thread / server → browser hop where the source is
  not available to slice. Offsets alone do not help there. Mitigation: keep
  `preserveCstText` for that bounded hop; only retire it if those consumers gain
  source access. (Phase 6 verifies before removal.)
- **Offset drift / staleness.** Mitigated by baseline-relative discipline,
  re-stamp on reparse, and the degraded-parse guard (above).
- **Structural assignability of linked AST → `Dehydrated<T>`.** If TS rejects the
  assignment at the codegen call site, run nodes through the existing
  `dehydrate()` adapter before emit (cheap, already exists).
- **`$textRegion` weight.** Carrying offsets is ~2 ints/node; verify it does not
  regress the curated artifact size (it is already on the wire via `textRegions:
  true`). Trim opportunity stays available and is orthogonal.

## Consumers affected

- `useModelSourceSync.ts` / `handleModelChanged` (ExplorePerspective) — switch to
  the cst-reuse serializer.
- `RuneTypeGraph.exportRosetta` — switch to the emit-core (or the codegen target).
- `serializeModel` callers retire; `serializeElement` / `serializeModels` are
  already dead (zero importers; the conformance test redefines its own locals)
  and are removed as part of phase 6 cleanup.
