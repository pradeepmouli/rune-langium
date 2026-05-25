<!-- SPDX-License-Identifier: FSL-1.1-ALv2 -->
<!-- Copyright (c) 2026 Pradeep Mouli -->

# Curated On-Demand Namespace Hydration — Design

**Status:** Approved (design); pending implementation plan.
**Scope:** `apps/studio` (FSL-1.1-ALv2) — Pages Function `/api/parse`, parser worker, workspace service, namespace explorer.

## Goal

Restore full resolution and browsing of curated model types that fall **outside the user's import closure**, without browser-side corpus fetching and without reintroducing the whole-bundle CPU exhaustion (prod `/api/parse` 1102) that the manifest fast-path fixed. Bundle this with a small fix that restores the "loaded" status for curated bundles no user file imports.

## Background

The manifest fast-path (PR #239, #301) made `/api/parse` hydrate **only** the user's import closure: it walks `closeNamespacesFromManifest(seeds, nsGraph)` from the namespaces the user's files import, fetches per-namespace artifacts for that closure, and returns them in `hydrationState.documents`. Namespaces outside the closure are returned **list-only** in `deferredExports` (name + exports, no serialized AST). This bounded the per-request work and resolved the 1102.

Two regressions resulted:

1. **"Load failed" for un-imported bundles.** The browser populates `LoadedModel.files` from `curatedRefOnlyFiles`, built from `hydrationState.documents` (closure only). A curated bundle that no user file imports has an empty closure → zero hydrated docs → `LoadedModel.files` stays `[]` → `ModelLoader`'s 30s hydration timeout fires → "load failed". Before the fast-path, the whole bundle was always hydrated, so this always had files.

2. **Non-closure types don't resolve / can't be browsed.** The parser worker's `DeferredModelProvider.getModel(uri)` (`parser-worker.ts:133`) deserializes from an **in-memory** `deferredModelJson` map and returns `undefined` on a miss — there is **no network fetch**. Langium's linker (`rune-dsl-linker.ts:44`) is **synchronous**, so it cannot fetch mid-link. The map is fed only by `/api/parse`'s `hydrationState`. Under the fast-path, non-closure namespaces' JSON never reaches the map, so references to them (or attempts to inspect them in the namespace explorer) cannot materialize an AST.

## Constraints

- **No browser-side corpus fetch (019 directive).** Corpus artifacts are fetched server-to-server by `/api/parse` only. The worker comments at `parser-worker.ts:301` and `:112` restate this ("workers can't fetch curated bundles directly"). On-demand hydration must therefore be **server-mediated**.
- **Synchronous linker.** `RuneDslLinker.loadAstNode` / `DeferredModelProvider.getModel` cannot `await`. On-demand resolution must pre-populate the worker's map *before* a (re-)link, not during one.
- **No whole-bundle work per request.** Hydration must remain per-namespace; requesting extra namespaces only ever adds a bounded, deps-closed set.

## Architecture

On-demand hydration is expressed as **closure-seed expansion**. The closure walk is monotonic and idempotent: `closeNamespacesFromManifest([...importSeeds, ...requested], nsGraph)` only ever adds namespaces (plus their transitive deps). So "hydrate namespace N on demand" reduces to "re-run the existing parse with N added to the seeds." This reuses the entire existing server stack (manifest fast-path, `fetchCuratedNamespace`, SSRF guard, concurrency, server-side `namespaceCache`) and keeps the response shape identical — it just carries more hydrated docs.

Two triggers feed requested namespaces into that mechanism:

- **A. Re-link loop (referenced types).** After a routed parse + worker hydrate, enumerate unresolved cross-reference targets, map them to known-curated namespaces not yet hydrated, and re-request. Iterate to a fixpoint with a hard cap.
- **B. Explorer-driven (browsing).** When the user expands/selects a non-closure namespace, request hydration for exactly that namespace so its types gain ASTs (structure view, inspector).

### Components & changes

1. **Server — `apps/studio/functions/api/parse.ts`**
   - Add optional `hydrateNamespaces?: string[]` (fully-qualified names) to `ParseRequestBody`.
   - Per loaded `curatedBundle`, union the requested names that exist in *that bundle's* manifest into `seeds` (the value computed at `parse.ts:177` by `collectUserSeedNamespaces`) before `closeNamespacesFromManifest(seeds, nsGraph)` at `parse.ts:222`.
   - Names not present in any loaded bundle's manifest are ignored (no error; the request is best-effort). Response shape unchanged.

2. **Parser worker — `apps/studio/src/workers/parser-worker.ts`**
   - Add a way for the workspace service to learn which curated namespaces are unresolved after a link. Either a new `collectUnresolvedCuratedRefs` request, or extend the existing link/hydrate response with the unresolved target URIs. The worker walks built documents' `references` for entries with `.error` (unresolved) and reports their target document URIs.
   - Track which namespaces are already hydrated (the `deferredModelJson` map already records hydrated URIs; expose/use that to avoid re-reporting).

3. **Workspace service — `apps/studio/src/services/workspace.ts`**
   - **Loaded-status fix (bundled):** after the existing `hydrationState.documents` loop that builds `curatedRefOnlyFiles` (`workspace.ts:546-579`), also register the list-only `deferredExports` namespaces (filePath `${bundleId}/${ns}`, guarded by `CURATED_MODEL_IDS`) as `refOnly` `CachedFile` entries, deduped against closure docs already added. This gives every loaded bundle a non-zero file count → "loaded", independent of the closure.
   - **Re-link loop (trigger A):** orchestrate parse → hydrate → enumerate unresolved curated namespaces → re-POST `/api/parse` with `hydrateNamespaces` → re-hydrate → re-link, to a fixpoint capped at a small iteration limit (e.g. 5) to guarantee termination. Stop when the unresolved-curated set is empty or stops shrinking.

4. **Namespace explorer (trigger B)**
   - On expand/select of a non-closure namespace, call `ensureNamespaceHydrated(bundleId, namespace)` → a `/api/parse` round-trip with `hydrateNamespaces:[namespace]` (plus current user files + curated bundles) → worker hydrate → the namespace's types now resolve for the structure/inspector views.

5. **Client hydration tracking**
   - Maintain a set of already-hydrated namespaces keyed by `bundleId@version` so neither trigger re-requests the same namespace. The server's `namespaceCache` and the worker's `deferredModelJson` dedupe the remainder defensively.

## Data flow

```
parseWorkspaceFiles(files)
  └─ POST /api/parse { files, curatedBundles, hydrateNamespaces: [] }
       server: seeds = userImports ∪ hydrateNamespaces(∈ bundle manifest)
               closure = closeNamespacesFromManifest(seeds, nsGraph)
               fetch per-ns artifacts for closure (cached)
       → hydrationState (closure docs) + deferredExports (all namespaces)
  └─ worker.hydrate(hydrationState)         # deferredModelJson ← closure JSON
  └─ build/link user docs
  └─ unresolved = worker.collectUnresolvedCuratedRefs()
       map → curated namespaces not yet hydrated
       if non-empty and iterations < CAP:
         re-POST with hydrateNamespaces = unresolved ; repeat   # fixpoint

explorer expand(ns)
  └─ ensureNamespaceHydrated(bundleId, ns)
       └─ POST /api/parse { ..., hydrateNamespaces:[ns] }
       └─ worker.hydrate(new closure docs)
       └─ structure/inspector for ns now resolves
```

## Error handling

- **Iteration cap** on the re-link loop guarantees termination even if a namespace is genuinely unresolvable (e.g. a name not in any manifest); remaining unresolved refs surface as normal Langium link errors.
- **Unknown / off-manifest names** in `hydrateNamespaces` are silently ignored server-side (best-effort), never an error.
- **Fetch failure** for a requested namespace degrades to the existing behavior (that namespace stays list-only); the SSRF guard and `CuratedBundleUnavailableError` handling are unchanged.
- **Router failure** falls back to the existing main-thread parse path; on-demand hydration is a no-op in that fallback.

## Testing

- **Server (`functions/test/parse.test.ts`):** `hydrateNamespaces` unions into seeds; requested namespace + its deps appear in `hydrationState`; off-manifest names ignored; absent/empty `hydrateNamespaces` preserves current behavior.
- **Worker:** `collectUnresolvedCuratedRefs` reports unresolved curated target URIs and omits already-hydrated/resolved ones.
- **Workspace (`workspace.test.ts` or sibling):** loaded-status — a bundle with empty closure yields non-zero `curatedRefOnlyFiles` from `deferredExports`, deduped against closure docs; re-link loop reaches a fixpoint and terminates at the cap; already-hydrated namespaces aren't re-requested.
- **Explorer:** `ensureNamespaceHydrated` issues exactly one round-trip per (bundle, namespace) and is idempotent.

## Non-goals

- Cross-session persistence of hydrated namespaces (per-session is sufficient).
- Background pre-warming / speculative hydration.
- Changing the artifact format or the manifest schema.
- Any browser-side direct corpus fetch.

## Licensing

All touched files are under `apps/studio` → FSL-1.1-ALv2. New files carry the FSL SPDX header.
