# Curated Dependency Graph Without Server-Side Link — Design

**Date:** 2026-06-26
**Status:** Proposed (awaiting review)
**Author:** Pradeep Mouli (with Claude)

## Problem

Loading any curated bundle (CDM, FpML) in production returns **HTTP 503** with an
empty inspector. Root cause (established by systematic debugging + measurement):

`/api/parse` → `populateDependencyGraph` deserializes **and links** the entire
curated namespace closure in-memory to compute the cross-namespace dependency
graph. For the CDM closure this peaks well above Cloudflare's **hard 128 MB
per-isolate memory cap** (measured ~238 MB for a realistic closure; ~548 MB
linking the full 143-doc corpus). The CF runtime kills the isolate → 503.

The 128 MB cap is **not configurable** on any plan. Two cheaper-looking fixes
were measured and **ruled out**:

- **Trim `$textRegion` metadata** — saves only ~7% of peak RSS (38 MB). The
  memory is dominated by the linked AST object graph, not source-position
  metadata. (Still a worthwhile *latency* win — ~32% faster, ~half the download —
  but irrelevant to the OOM.)
- **Stream artifacts to the browser** — works, but reverses the deliberate "019:
  no browser corpus parsing" directive and is a full re-architecture.

## Key Insight

The server links the curated AST for exactly **one** purpose: `collectNamespaceDependencies`
reads *resolved* cross-references (`element.superType?.ref`, `attr.typeCall?.type?.ref`),
and a Langium `.ref` is `undefined` until the document is linked.

But **this dependency information already exists, precomputed, in the v2 manifest
the fast-path already fetches.** Per `@rune-langium/curated-schema`:

```ts
// CuratedNamespaceEntrySchema
deps: z.array(z.string()),   // DIRECT cross-namespace edges
// CuratedManifestSchema.namespaces — schema comment:
//   "deps are DIRECT cross-namespace edges; consumers walk the transitive closure."
```

The publish pipeline walked the **fully-linked corpus (imports ∪ resolved `$ref`
targets)** on an uncapped build machine and recorded `namespaces[ns].deps`. The
fast-path **already uses** this graph to compute the fetch closure
(`closeNamespacesFromManifest`, parse.ts:248) — then `populateDependencyGraph`
**redundantly re-derives the same edges** by linking the live AST inside the
128 MB-capped Worker.

**We do not need to load the model into memory at all.** Assemble the response
`dependencyGraph` from the manifest's precomputed `deps`, and skip the curated
deserialize+link entirely.

## Goals

- Eliminate the curated deserialize+link from `/api/parse` (manifest fast-path).
- Produce a `dependencyGraph` **observationally identical** (or a safe superset)
  to today's, for all consumers.
- Preserve the "019" server-side design (browser still receives serialized
  strings + a dependency graph; no browser parsing).
- No langium revert, no metadata change.

## Non-Goals

- Browser-side hydration / streaming-from-storage (separate, larger effort).
- `$textRegion` trimming (separate latency optimization; can follow independently).

## Decision: remove the v1 (whole-bundle) fallback entirely

The v1 path fetched the whole serialized bundle and derived deps by **linking it**
— the exact step that OOMs. It served two roles, both now obsolete or harmful:

1. **Legacy bundles without a v2 manifest.** CDM/FpML/rune-dsl all publish v2
   manifests; nothing in production relies on v1.
2. **Resilience net for a transiently missing/malformed manifest** (parse.ts:233-244,
   Codex P1). But the net's action is *"fetch + link the whole bundle"* — i.e. it
   would trigger the 238 MB+ OOM for CDM precisely when invoked. The "safety net"
   is itself the failure mode.

So v1 is removed: the **manifest becomes required**. A missing/malformed manifest
now returns a clean **502** (`curated_bundle_unavailable`) instead of falling
through to a link that silently 503-kills the isolate. This converts a confusing
silent OOM into an explicit, fast, debuggable error — strictly better.

**Code deleted:** `anyV1Fallback`, the `manifest = null` fallthrough, the
whole-bundle branch (parse.ts:289-310), `fetchCuratedBundle`, and the
serialized-import walk `computeCuratedClosure` (+ its now-unused helpers in
`curated-closure.ts`, retaining only what the manifest path uses). With v1 gone,
the dependency graph is **always** manifest-derived and **never** links a curated
doc — there is no remaining code path that deserializes the corpus.

## Consumers of `dependencyGraph` (verified)

1. **`DownloadConfigModal.computeNamespaceSelection`** — uses
   `dependencyGraph[ns] ?? [ns]` as the per-namespace **transitive closure** for
   the auto-select cascade. Fail-soft: a missing key emits only itself.
2. **`CodePreviewPanel.tsx:153` & `ExportPerspective.tsx:54`** —
   `Object.keys(dependencyGraph).sort()` is the **namespace list** shown for
   codegen/export. ⇒ the graph's **keys** must enumerate every user + curated
   closure namespace.
3. **`workspace.ts:552`** — `setDependencyGraph(data.dependencyGraph ?? {})`,
   a pure store write.

**The link has no other effect on the response.** It only fills
`dependencyGraph`; it does not mutate `hydrationState.documents` (pass-through
serialized strings), `models:[]`, or `deferredExports` (sourced from artifact
`exports`). Removing the curated link changes nothing else.

## Design

Replace the curated portion of `populateDependencyGraph` with a manifest-derived
direct-dependency map, then reuse the **existing** transitive-closure function.

### Edge sources (all no-link)

| Edge | Source | Cost |
|---|---|---|
| curated → curated | `manifest.namespaces[ns].deps` (already fetched) | O(graph), no parse |
| user → user | `collectNamespaceDependencies(userDocs)` — user docs are already built among themselves in `hydrateUserWorkspace` | cheap (user files are small) |
| user → curated | user-doc **imports** (`model.imports[].importedNamespace`), expanded through the same wildcard rules `closeNamespacesFromManifest`/`computeCuratedClosure` use | syntactic, no link |

Rationale for `user → curated` via imports: this is precisely the seed set that
already drove the fetch closure (`collectUserSeedNamespaces` + `requestedHydration`).
Imports over-approximate at worst (import-but-unused → cascade pulls a harmless
extra), never under-approximate for user-authored files, which must import a
namespace to reference its types in normal scope. Consistent with how the closure
was computed in the same request.

### Assembling the response graph

1. In the bundle loop, alongside `manifestClosureNamespaces`, accumulate a
   `manifestDeps: Map<string, Set<string>>` from `manifest.namespaces[ns].deps`
   for every `ns` in the closure (expanding wildcard deps the same way the
   closure walk does, so the map is over real namespaces).
2. In the dep-graph block (replacing the curated link):
   - Build `directDeps: Map<string, Set<string>>`:
     - seed every **curated closure namespace** and every **user namespace** as a
       key (so `Object.keys` enumerates the full list — requirement #2);
     - merge in `manifestDeps` (curated → curated);
     - merge in `collectNamespaceDependencies(userDocs)` (user → user);
     - merge in user-import edges (user → curated).
   - For each key `ns`: `dependencyGraph[ns] = [...closeNamespaceDependencies(ns, directDeps)].sort()`
     — **unchanged** transitive-closure function, identical output shape.
3. **Never deserialize or link curated docs.** `documentsForHydration` still
   carries the pass-through serialized strings into `hydrationState`.

### Manifest required (v1 removed)

There is no fallback. If `fetchCuratedManifest` fails or the manifest has no
`namespaces`, the bundle request returns **502** (`curated_bundle_unavailable`).
Every successful curated request goes through the manifest path, so the dep graph
is always assembled from `namespaces[].deps` and the corpus is never deserialized.

## Correctness / Equivalence

- **Closure shape:** `closeNamespaceDependencies` is reused verbatim, so output is
  `Record<namespace, sorted string[]>` exactly as today.
- **Keys:** seeded from user namespaces ∪ curated closure namespaces — same set
  the current link produces (its `allDocs` = user docs + linked curated closure
  docs).
- **Edge set:** manifest `deps` = "imports ∪ resolved `$ref` targets", a
  **superset** of `collectNamespaceDependencies`'s §5.2 subset (which explicitly
  skips function-body refs — see its "NOT walked yet" note). The cascade therefore
  becomes *at least as* correct; any difference is safe over-inclusion in codegen.
- **Fail-soft preserved:** any error assembling the graph leaves `dependencyGraph`
  empty; the modal degrades to no-cascade (`?? [ns]`), exactly as today.

## Testing

- **Unit (functions/test):** given a synthetic manifest with known `namespaces[].deps`
  and a user doc importing a curated namespace, assert the assembled
  `dependencyGraph` equals the expected transitive closure and that its keys cover
  user + closure namespaces. No langium services instantiated.
- **Equivalence test:** for a small fixture bundle that has both a manifest and a
  full corpus, assert the manifest-derived graph equals the link-derived graph
  (lock in observational equivalence before deleting the link path).
- **Memory regression:** re-run the closure-hydration mem-probe harness against
  `/api/parse` for the CDM `cdm.base.staticdata.party` closure; assert peak RSS is
  now bounded well under 128 MB (no deserialize+link).
- **Existing suites:** `parse.test.ts`, `parse-manifest.test.ts`,
  `parse-lazy-link.test.ts` must stay green. **`curated-closure.test.ts`** loses
  the `computeCuratedClosure` cases (that function is deleted); retain/move any
  coverage still relevant to the manifest path. Add a case asserting a
  missing-manifest bundle now returns **502** (was: silent v1 fallback).
- **Dead-code check:** confirm `fetchCuratedBundle`, `computeCuratedClosure`,
  `extractCrossDocRefNamespaces`, and `anyV1Fallback` have no remaining
  references after removal (lint/type-check + grep).
- **Production smoke:** the `prod-smoke` Playwright spec ("Inspector populates
  members on first navigation to a never-hydrated curated namespace") must pass.

## Risks

- **User refs to curated via global scope without import** (the curated "46/141"
  pattern, applied to a user file): import-only `user → curated` would miss it. Low
  likelihood for user-authored studio files; if it ever bites, upgrade `user →
  curated` to the no-link `$ref` extraction over user serialized models.
- **Stale manifest deps vs corpus:** the manifest is the publish-time source of
  truth; if a corpus is republished without regenerating `namespaces`, deps could
  drift. Mitigated by the existing publish pipeline that builds both together.
- **A consumer secretly depending on the link side-effect:** ruled out by the
  consumer audit above.

## Rollout

Single PR, scoped to `apps/studio/functions`. The change is server-side only and
fail-soft, so a bad graph degrades the cascade rather than breaking hydration.
