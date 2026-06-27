# `/api/codegen` Curated Closure (no whole-bundle deserialize) — Design

**Date:** 2026-06-27
**Status:** Proposed (awaiting review)
**Author:** Pradeep Mouli (with Claude)
**Follow-up to:** PR #342 (curated dep graph from manifest) — separate PR, off `master`.

## Problem

`/api/codegen` (the studio Download flow, `apps/studio/functions/api/codegen.ts`)
re-fetches the **whole** curated bundle and **deserializes every doc** to run the
generator:

- `loadAllDocuments` calls `fetchCuratedBundle(id, version)` (whole bundle — all
  ~143 CDM docs, NOT closure-scoped) and `hydrateModelDocument` (JSON
  deserialize) on each. That materializes the entire corpus AST in the
  128 MB-capped Worker → OOM. (Curated docs are not re-linked — only user docs —
  so it is deserialize-only, but over the whole corpus.)
- This matches the observed symptom: `/api/codegen` has been **503-ing in prod**;
  the studio's primary codegen path is the **client-side Code tab / preview
  worker**, which deserializes curated models in-browser from
  `serializedModelJson` and is unaffected.

Meanwhile the studio **already holds** the closure-scoped serialized curated
models client-side (from `/api/parse`'s `hydrationState`) and **already sends**
`namespaces` (the dependency-closed subset, from the #342 dep-graph cascade) to
`/api/codegen` — but only to filter the emit, not to scope the load.

## Goal

Eliminate the whole-bundle fetch + deserialize. The codegen Worker must only ever
deserialize the **closure** the user is generating for. Two complementary paths
("hybrid A+C"):

- **Path A (primary):** the studio passes the closure's serialized curated docs
  (which it already has from `/api/parse`) in the codegen request. The server
  deserializes only those; it never fetches.
- **Path C (fallback):** when the request carries no pre-loaded docs (curated was
  never loaded client-side, or a direct/API caller), the server loads the
  **closure** itself via parse's closure-loading helpers
  (`fetchCuratedManifest` → `closeNamespacesFromManifest(seeds)` →
  `fetchCuratedNamespace`), then deserializes only the closure.

Either way, `fetchCuratedBundle` (whole-bundle) is removed from the codegen path.

## Non-Goals

- Refactoring `/api/parse` to share a closure-loader (DRY follow-up, deferred to
  avoid conflicting with the open #342 parse.ts changes).
- Changing the client-side Code-tab/preview path (already closure-scoped + in
  browser; out of scope).
- Changing `/api/generate` (the separate legacy Java ExportDialog worker).
- Removing `fetchCuratedBundle` from the codebase (it may still be used
  elsewhere; only the codegen call site changes).

## Request shape (`/api/codegen`)

```ts
{
  files: Array<{ path: string; content: string }>,   // user files (unchanged)
  target: string, options?: ..., namespaces?: string[], // unchanged (namespaces = emit filter)
  // Curated source — EITHER (A) pre-loaded docs OR (C) bundle refs:
  curatedDocs?: Array<{ uri: string; serializedModel: string }>,  // NEW — path A
  curatedBundles?: Array<{ id: string; version: string }>         // KEPT — path C fallback
}
```

Resolution order (server): if `curatedDocs` is present and non-empty → **path A**
(deserialize them, no fetch). Else if `curatedBundles` is present → **path C**
(load the closure via the manifest helpers, then deserialize). Else → user files
only.

`curatedDocs` and `curatedBundles` are mutually exclusive in practice; if both are
sent, `curatedDocs` wins (it's the already-resolved, cheaper path).

## Server design (`loadAllDocuments`)

1. Parse user files (unchanged).
2. Curated:
   - **A:** for each `curatedDocs` entry, `hydrateModelDocument(uri,
     serializedModel, { register: 'idempotent' })` → LangiumDocument.
   - **C:** compute seeds from the parsed user docs' imports
     (`collectUserSeedNamespaces`) ∪ the request's `namespaces`; for each bundle,
     `fetchCuratedManifest` → require a v2 `namespaces` map (missing → 502,
     consistent with #342) → `closeNamespacesFromManifest(seeds, nsGraph)` →
     `fetchCuratedNamespace` per closure namespace (bounded concurrency) →
     `hydrateModelDocument` per returned doc.
   - Remove the `fetchCuratedBundle` branch.
3. Build only user docs (unchanged — curated refs are pre-resolved on the mirror).
4. Generate, filtered by `namespaces` (unchanged).

Both paths deserialize **only the closure**, so peak memory scales with what the
user references, never the whole corpus.

## Client design (`downloadTargetViaRouter`, workspace.ts)

When the studio has the curated closure loaded (the common case — the workspace
was hydrated via `/api/parse`), send the closure's `{ uri, serializedModel }`
docs as `curatedDocs` instead of `curatedBundles`. Source: the same
`hydrationState.documents` the workspace already stores (curated entries, i.e.
those with a `bundleId`). When no curated docs are loaded, fall back to sending
`curatedBundles` (path C). `namespaces` continues to be sent as the emit filter.

## Correctness / safety

- **Equivalence:** path A deserializes exactly the docs the client loaded for the
  workspace (the closure of the user's imports) — the same set path C computes
  from the manifest. The generator sees the same closure either way.
- **Memory:** neither path deserializes more than the closure; the whole-bundle
  path is gone. Peak is bounded by the user's actual reference closure.
- **502 behavior:** path C requires a v2 manifest (missing/empty → 502), matching
  #342 — no whole-bundle fallback re-introduced.
- **No double work:** path A reuses the client's already-fetched serialized models
  (no network), realizing "the curated models come from `/api/parse`."

## Testing

- **Path A:** request with `curatedDocs` (a small fixture closure) + a user file
  referencing a curated type → 200, generated output references the curated type;
  assert `fetchCuratedManifest`/`fetchCuratedNamespace`/`fetchCuratedBundle` are
  **never called** (no server fetch).
- **Path C:** request with `curatedBundles` only + a manifest fixture → asserts
  `fetchCuratedNamespace` called for closure namespaces only, `fetchCuratedBundle`
  **never** called; missing manifest → 502.
- **Closure scoping:** a deep-namespace fixture → only closure docs deserialized
  (assert via the fetched-artifact set / hydrated doc count), unrelated namespace
  absent.
- **Memory smoke (no commit):** drive path A with the real CDM
  `cdm.base.staticdata.party` closure → peak bounded, status 200 (the whole-bundle
  path previously 503'd).
- Existing codegen suites (`functions/test/codegen.test.ts`) stay green; update any
  that asserted the whole-bundle `fetchCuratedBundle` path.

## Risks

- **Request body size (path A):** the closure's serialized models travel in the
  request (a few MB; well under CF's 100 MB body limit). Bounded by the closure.
- **Temporary duplication:** the closure-load orchestration is added for codegen
  while `/api/parse` keeps its own copy (deferred DRY follow-up to avoid #342
  conflict). Flagged; converge once #342 merges.
