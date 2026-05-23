# Curated manifest + per-namespace artifacts — design

Status: **DRAFT for review** · 2026-05-23 · closes the still-open half of #301

## 1. Problem

`POST /api/parse` returns **503 / CF error `1102`** (Pages Function CPU limit) on curated-bundle requests. The lazy-link fix (#234/#308, deployed) removed the heavy Langium *link* of the whole corpus, but the endpoint **still 1102s — even for an empty closure**. Confirmed in prod against the deployed code.

**Root cause (confirmed):** every curated request still touches the *whole* corpus regardless of closure:
1. `fetchCuratedBundle` fetches + gunzips the whole `~4 MB` artifact (`latest.serialized.json.gz`, 141 docs for CDM).
2. `computeCuratedClosure` `JSON.parse`s **all** docs' serialized models to build the namespace map.
3. The response **stringifies all** docs (`hydrationState.documents` passthrough).

That fetch/decompress/parse/stringify of the whole corpus, per request, exceeds the Pages CPU budget on its own. The integration test used a 4-doc synthetic bundle, so it never exercised the real-corpus cost.

## 2. Goal / Non-goals

**Goal:** `/api/parse` must **never touch the whole corpus per request**. It should read a small per-bundle manifest, compute the user's closure from it, fetch only the closure namespaces' artifacts, and return only those — while the namespace explorer still lists every curated namespace.

**Non-goals**
- Changing the **browser** `curated-loader.ts` or the whole-bundle artifact (the 1102 is server-only; the browser has no CPU limit). **Additive scope** (chosen in brainstorming).
- Pre-linking server-side or moving to a higher-CPU Worker.

## 3. Decisions (from brainstorming)

| Axis | Decision |
|---|---|
| Scope | **Additive — `/api/parse` only.** Keep the whole-bundle artifact + browser curated-loader untouched. |
| Closure source | A **precomputed namespace dependency graph in the manifest**, built once at publish time over the *fully-linked* corpus (authoritative — follows real resolved refs, no FQN-without-import gap). `/api/parse` walks it; it does NOT parse docs to find deps. |
| Per-bundle artifacts | **Per-namespace** serialized artifacts; `/api/parse` fetches only the closure namespaces'. |
| Full namespace list (`deferredExports`) | From the manifest's per-namespace `exports` — no whole-corpus fetch. |
| Backward-compat | Publisher writes new fields/artifacts **additively**; `/api/parse` **falls back** to the current whole-bundle path when `manifest.namespaces` is absent (works during republish). |
| `curated-closure.ts` | Kept as the **fallback** path (serialized-import walk) for v1 manifests; the primary path becomes the manifest-graph walk. |

## 4. Architecture & data flow

```
PUBLISH (curated-mirror-worker, fully-linked corpus, no CPU limit):
  build serialized docs (existing)
   ├─ whole-bundle artifact  latest.serialized.json.gz        [UNCHANGED]
   ├─ per-namespace artifacts artifacts/<version>/ns/<ns>.json.gz   [NEW]
   └─ manifest.json (schemaVersion 2)                         [EXTENDED]
        namespaces: { <ns>: { deps:[<ns>...], exports:[{type,name}], artifact:"…" } }

REQUEST (/api/parse, per curated bundle):
  fetch manifest.json (small)
   ├─ if no manifest.namespaces (v1) → FALL BACK to current whole-bundle path
   └─ else:
        seeds   = user files' imported namespaces (collectUserSeedNamespaces, unchanged)
        closure = BFS over manifest.namespaces[ns].deps from seeds
        fetch ONLY closure namespaces' per-ns artifacts
        deserialize + link + dep-graph ONLY those
        deferredExports = ALL namespaces from manifest.namespaces[*].exports
        response: hydrationState.documents = closure docs only;
                  deferredExports = all; dependencyGraph = closure-scoped
```

The whole-corpus fetch/parse/stringify is gone. Per-request cost = one small manifest + the closure's per-ns artifacts (a handful) + link of the closure only.

## 5. Manifest schema (additive)

`apps/curated-mirror-worker/src/manifest.ts` — add to `CuratedManifest`:

```ts
interface CuratedManifest {
  // ... existing: version, sha256, history ...
  schemaVersion?: number;              // 2 when namespaces present (absent/1 = legacy)
  namespaces?: Record<string, {
    deps: string[];                    // DIRECT cross-namespace deps (imports ∪ resolved $ref targets)
    exports: Array<{ type: string; name: string }>;
    artifact: string;                  // R2 key, e.g. "artifacts/2026-05-22/ns/cdm.base.datetime.json.gz"
  }>;
}
```

`deps` are **direct** edges; `/api/parse` walks the transitive closure (BFS, cycle-safe). Computed at publish over the linked corpus (imports + resolved cross-refs → authoritative + complete).

## 6. Per-namespace artifact

- **Key:** `curated/<id>/artifacts/<version>/ns/<namespace>.json.gz` (namespace dotted form is a safe path segment; URL-encode defensively).
- **Format:** `{ documents: [{ path, modelJson, exports }] }` — same shape as the whole-bundle artifact, filtered to docs whose model `name` == that namespace (a namespace may span multiple files → multiple docs).
- Served by `http.ts` under the existing `${MIRROR}/<id>/...` route (long-immutable cache, like the whole-bundle artifact).

## 7. Publisher changes (`publisher.ts`, `serialized-artifact.ts`)

After building the serialized docs (already done for the whole-bundle artifact):
1. Group docs by namespace (`modelJson.name`).
2. For each namespace: gzip its docs → write the per-namespace artifact.
3. Compute the namespace dep-graph: for each doc, collect imports + the **target namespaces of its resolved cross-document `$ref`s**. The published serialized models already carry resolved cross-doc refs as `$ref: "file:///[<id>]/<path>#…"` URIs (verified against the real CDM artifact), so this **reads the existing `$ref`s** (reusing the `$ref`-URI→namespace mapping from #308's `serialized-model-meta`) — it does NOT re-link. → `deps` per namespace.
4. Collect `exports` per namespace from the docs' `exports`.
5. Write the extended `manifest.json` (schemaVersion 2 + `namespaces`).
6. Keep writing the whole-bundle `latest.serialized.json.gz` (unchanged).

The dep-graph + namespace split happen during the serialized-artifact build (which already deserializes/links to produce `modelJson`).

## 8. `/api/parse` changes (`parse.ts`, `curated-fetch.ts`, `curated-closure.ts`)

- New `fetchCuratedManifest(id, version, fetcher)` in `curated-fetch.ts` → returns the parsed manifest.
- New `fetchCuratedNamespace(id, version, namespaceArtifactKey, fetcher)` → returns that namespace's docs.
- `parse.ts` handler:
  - For each `curatedBundle`: fetch manifest. If `manifest.namespaces` present → manifest path; else → existing whole-bundle path (unchanged fallback).
  - Manifest path: `closure = closeNamespaces(seeds, manifest.namespaces)` (BFS over `deps`); fetch closure namespaces' artifacts; push their docs into `documentsForHydration`; `deferredExports` from ALL `manifest.namespaces[*].exports`.
  - `populateDependencyGraph` runs over the closure docs (already gated to closure).
- `curated-closure.ts`: add `closeNamespacesFromManifest(seeds, namespaces)` (pure BFS over the manifest graph). Keep `computeCuratedClosure` (serialized-import walk) for the v1 fallback.

## 9. Backward-compat / rollout

1. Ship publisher + `/api/parse` (with v1 fallback) — `/api/parse` still works on not-yet-republished bundles via the whole-bundle path.
2. Republish cdm / fpml / rune-dsl (generates manifest v2 + per-ns artifacts).
3. Each republished bundle automatically uses the new fast path.
4. (Later, optional) migrate the browser curated-loader; deprecate the whole-bundle artifact.

## 10. Testing

- **Publisher (curated-mirror-worker):** unit — given linked docs across namespaces (A imports B; B `$ref`s C without importing), the manifest's `deps` capture A→B and B→C; per-namespace artifacts contain the right docs; `exports` populated.
- **`/api/parse` manifest path:** integration — stub manifest + per-ns artifact fetches. User file importing `cdm.trade` → closure `{trade, base.datetime, base.math}`; assert only those artifacts are fetched (spy), `dependencyGraph` covers the closure, `deferredExports` lists ALL manifest namespaces, response excludes non-closure docs. **CPU proxy:** assert the whole-bundle artifact is NEVER fetched on the manifest path.
- **Fallback:** v1 manifest (no `namespaces`) → falls back to the whole-bundle path (existing behavior).
- **Post-deploy:** prod re-probe `curatedBundles:[{id:'cdm'}]` (+ user import) → **200** (was 503/1102), and empty-closure → fast 200.

## 11. Build sequence (for the plan)

1. Manifest schema (`manifest.ts`) + `buildManifest` accepts `namespaces`.
2. Publisher: namespace split + per-ns artifacts + dep-graph + exports → manifest v2 (curated-mirror-worker) + tests.
3. `http.ts`: confirm per-ns artifact keys are served (likely already covered by the generic `${id}/...` route).
4. `curated-fetch.ts`: `fetchCuratedManifest` + `fetchCuratedNamespace`.
5. `curated-closure.ts`: `closeNamespacesFromManifest`.
6. `parse.ts`: manifest path + v1 fallback.
7. Integration tests (manifest path + fallback).
8. Deploy curated-mirror-worker; republish bundles; deploy studio; prod re-probe.

## 12. Open questions / deferred

- **Manifest size at scale:** for CDM (~141 namespaces) the `namespaces` map (deps + exports + key) is a modest JSON — fine. If it ever grows large, split into a separate `namespace-index.json`. Deferred; single manifest is simpler.
- **Browser curated-loader migration** — deferred (additive scope).
- **Cache:** per-ns artifacts are immutable per version → long-cache like the whole-bundle artifact; manifest short-cache + ETag (existing).
