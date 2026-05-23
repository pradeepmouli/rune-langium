# Curated Manifest + Per-Namespace Artifacts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `/api/parse` from `1102`-ing on curated bundles by making it read a small per-bundle manifest (namespace dep-graph + exports) and fetch only the closure namespaces' artifacts — never the ~4 MB whole-bundle corpus.

**Architecture:** The curated-mirror publisher (which already links the corpus to build the serialized artifact) additionally writes (a) a manifest extended with a per-namespace `{deps, exports, artifact}` map and (b) per-namespace serialized artifacts. `/api/parse` walks the manifest dep-graph from the user's imported namespaces, fetches only those namespaces' artifacts, and sources `deferredExports` from the manifest. Additive: the whole-bundle artifact + browser `curated-loader` are unchanged; `/api/parse` falls back to the whole-bundle path for v1 manifests.

**Tech Stack:** TypeScript ESM, Cloudflare Pages Functions + Workers, Zod v4, `pako` (gzip), Langium (publisher links), Vitest 4.

**Spec:** `docs/superpowers/specs/2026-05-23-curated-manifest-per-namespace-design.md`

**Conventions:** `apps/studio/` + `apps/curated-mirror-worker/` = FSL-1.1-ALv2 SPDX header; `packages/` = MIT. ESM `.js` import extensions. Commit per task with `SKIP_SIMPLE_GIT_HOOKS=1` (no `--no-verify`). Branch: `feat/curated-manifest-per-namespace` (off master).

**File map:**
- `packages/curated-schema/src/index.ts` — manifest Zod schema (+ `namespaces`).
- `apps/curated-mirror-worker/src/serialized-artifact.ts` — per-namespace split + dep-graph + exports (hooks into the existing linked build).
- `apps/curated-mirror-worker/src/manifest.ts` — `buildManifest` accepts `namespaces`.
- `apps/curated-mirror-worker/src/publisher.ts` — write per-ns artifacts + pass namespaces to manifest.
- `apps/studio/functions/lib/curated-fetch.ts` — `fetchCuratedManifest`, `fetchCuratedNamespace`.
- `apps/studio/functions/lib/curated-closure.ts` — `closeNamespacesFromManifest` (keep `computeCuratedClosure` as v1 fallback).
- `apps/studio/functions/api/parse.ts` — manifest path + v1 fallback (curated loop ~179-231).

---

## Task 1: Manifest schema — add `namespaces`

**Files:** Modify `packages/curated-schema/src/index.ts`; Test `packages/curated-schema/test/manifest.test.ts` (find/create).

- [ ] **Step 1: Failing test** — assert a manifest with `schemaVersion: 2` + a `namespaces` map validates, and that `namespaces` is omittable (v1 still valid).

```ts
import { CuratedManifestSchema } from '../src/index.js';
it('accepts schemaVersion 2 with a namespaces map', () => {
  const m = { schemaVersion: 2, modelId: 'cdm', version: '2026-05-22', sha256: 'x', sizeBytes: 1,
    generatedAt: 'now', upstreamCommit: 'c', upstreamRef: 'r', archiveUrl: 'u', history: [],
    namespaces: { 'cdm.base': { deps: ['cdm.base.math'], exports: [{ type: 'Data', name: 'Foo' }], artifact: 'artifacts/v/ns/cdm.base.json.gz' } } };
  expect(CuratedManifestSchema.safeParse(m).success).toBe(true);
});
it('still accepts v1 manifest without namespaces', () => {
  const m = { schemaVersion: 1, modelId: 'cdm', version: 'v', sha256: 'x', sizeBytes: 1, generatedAt: 'n', upstreamCommit: 'c', upstreamRef: 'r', archiveUrl: 'u', history: [] };
  expect(CuratedManifestSchema.safeParse(m).success).toBe(true);
});
```

- [ ] **Step 2: Run → FAIL** (`pnpm --filter @rune-langium/curated-schema test`).
- [ ] **Step 3: Implement.** In `index.ts`: add the namespace-entry schema and extend `CuratedManifestSchema`:

```ts
export const CuratedNamespaceEntrySchema = z.object({
  deps: z.array(z.string()),
  exports: z.array(CuratedSerializedDocumentExportSchema),   // reuse existing {type,name}
  artifact: z.string()                                       // R2 key of the per-namespace artifact
});
export type CuratedNamespaceEntry = z.infer<typeof CuratedNamespaceEntrySchema>;
```
Change `CuratedManifestSchema`'s `schemaVersion: z.literal(1)` → `schemaVersion: z.union([z.literal(1), z.literal(2)])`, and add (optional, after `artifacts`):
```ts
  namespaces: z.record(z.string(), CuratedNamespaceEntrySchema).optional()
```
(Verify `CuratedSerializedDocumentExportSchema` is `{ type: string; name: string }` — it is, ~line 50; if it also has `path`, make a local `{type,name}` schema instead.)

- [ ] **Step 4: Run → PASS** + `pnpm --filter @rune-langium/curated-schema run type-check`.
- [ ] **Step 5: Commit** — `SKIP_SIMPLE_GIT_HOOKS=1 git commit -am "feat(curated-schema): manifest namespaces map (dep-graph + exports + per-ns artifact key)"`

---

## Task 2: Serialized-artifact — per-namespace split + dep-graph + exports

**Files:** Modify `apps/curated-mirror-worker/src/serialized-artifact.ts`; Test `apps/curated-mirror-worker/test/serialized-artifact.test.ts` (find/create).

`buildSerializedWorkspaceArtifact` already: reads rosetta files → `documents` → `builder.build(documents,{validation:false})` (LINKS) → per-doc `{path, modelJson, exports}`. Extend its result with per-namespace grouping + a namespace dep-graph.

- [ ] **Step 1: Read** the full function first to anchor edits + confirm the linked `documents` are in scope after `builder.build`.
- [ ] **Step 2: Failing test** — feed two in-memory rosetta sources: `ns a { import b ... uses b.T }`, `ns b { type T }` (a→b). Assert the build result exposes: (a) `namespaces` = `{ a: {deps:['b'], exports:[...], docCount>=1}, b:{deps:[], ...} }`, (b) a way to get per-namespace doc groups. (Match the harness the existing serialized-artifact test uses; if none, construct documents via the same `createRuneDslServices`/builder path the function uses.)
- [ ] **Step 3: Implement.** After the existing `documents.map(... modelJson/exports ...)` produces the per-doc array, add:
  - Group docs by `model.name` (the namespace; same projection as `serialized-model-meta`'s `nameToNamespace` — string or `{segments}`).
  - **deps per namespace:** for each doc, read its resolved cross-document `$ref`s from the serialized `modelJson` (they're `file:///[<id>]/<path>#…` URIs) and map each to its target namespace via a path→namespace map (built from all docs' `path`+namespace). Reuse the `$ref`-URI→key→namespace logic — port `refUriToCuratedKey` + the namespace lookup from `apps/studio/functions/lib/curated-closure.ts` into a shared helper here (do NOT re-link; read existing `$ref`s). Union with the doc's `imports[].importedNamespace` (strip `.*`). Exclude self.
  - **exports per namespace:** union the docs' `exports` (`{type,name}`; drop `path`).
  - Return on `SerializedArtifactBuildResult`: `namespaces: Record<string,{deps:string[]; exports:{type:string;name:string}[]; docs: Array<{path,modelJson,exports}>}>` (docs grouped so the publisher can write per-ns artifacts).
- [ ] **Step 4: Run → PASS** + worker type-check.
- [ ] **Step 5: Commit** — `feat(curated-mirror): serialized-artifact emits per-namespace groups + dep-graph + exports`.

> Note: the `$ref`→namespace mapping is the crux — write a focused unit test that a doc whose serialized model `$ref`s another namespace's file (no import) still yields that dep (mirrors #308's gap, now fixed at publish).

---

## Task 3: Publisher — write per-namespace artifacts + manifest namespaces

**Files:** Modify `apps/curated-mirror-worker/src/publisher.ts` + `manifest.ts`; Test `apps/curated-mirror-worker/test/publisher.test.ts` (find/create).

- [ ] **Step 1:** Extend `BuildManifestInput` (manifest.ts) with `namespaces?: Record<string, CuratedNamespaceEntry>`; in `buildManifest`, set `schemaVersion: input.namespaces ? 2 : 1` and spread `...(input.namespaces ? { namespaces: input.namespaces } : {})`.
- [ ] **Step 2: Failing test** — publisher (with a stubbed R2 `bucket.put`) writes: per-namespace keys `curated/<id>/artifacts/<version>/ns/<ns>.json.gz` for each namespace, and a manifest whose `namespaces[ns].artifact` matches the written key, with `deps`/`exports` populated.
- [ ] **Step 3: Implement.** In the publish loop, after `buildSerializedWorkspaceArtifact` returns the per-ns groups:
  - For each namespace: `gzip(JSON.stringify({ documents: group.docs }))` → `bucket.put('curated/'+id+'/artifacts/'+version+'/ns/'+ns+'.json.gz', bytes, {httpMetadata: immutable})`.
  - Build the `namespaces` map: `{ [ns]: { deps, exports, artifact: 'artifacts/'+version+'/ns/'+ns+'.json.gz' } }`.
  - Pass `namespaces` into `buildManifest(...)`.
  - Keep writing the whole-bundle `latest.serialized.json.gz` (UNCHANGED).
- [ ] **Step 4: Run → PASS** + worker type-check.
- [ ] **Step 5: Commit** — `feat(curated-mirror): publish per-namespace artifacts + manifest v2 namespaces`.

---

## Task 4: `http.ts` — confirm per-namespace artifact keys are served

**Files:** `apps/curated-mirror-worker/src/http.ts` (read); add a test if routing needs a change.

- [ ] **Step 1:** Read `http.ts`. The per-ns key sits under `curated/<id>/artifacts/...` — confirm the generic `${id}/<rest>` R2 read route already serves arbitrary keys under the model prefix (it serves `archives/`, `latest.tar.gz`, etc.). If yes, **no code change** — note it. If the route allowlists specific suffixes, add `artifacts/.../ns/*.json.gz` (long-immutable cache headers like the whole-bundle artifact).
- [ ] **Step 2:** If changed, add/extend a routing test; else add a one-line comment that per-ns keys are covered by the generic prefix route. Commit only if changed.

---

## Task 5: `curated-fetch.ts` — manifest + per-namespace fetchers

**Files:** Modify `apps/studio/functions/lib/curated-fetch.ts`; Test `apps/studio/functions/test/curated-fetch.test.ts` (find/create).

- [ ] **Step 1: Failing test** — stub the fetcher; assert `fetchCuratedManifest('cdm','latest',fetcher)` GETs `${MIRROR}/cdm/manifest.json` and returns the parsed manifest; `fetchCuratedNamespace('cdm','latest','artifacts/v/ns/cdm.base.json.gz',fetcher)` GETs `${MIRROR}/cdm/artifacts/v/ns/cdm.base.json.gz`, gunzips, and returns `CuratedDocument[]`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** (mirror `fetchCuratedBundle`'s fetcher + gunzip + map; `CURATED_MIRROR_BASE` already defined):

```ts
export async function fetchCuratedManifest(id: string, version: string, fetcher?: CuratedFetcher) {
  const fetchFn = fetcher ?? ((u, i) => globalThis.fetch(u, i));
  const res = await fetchFn(`${CURATED_MIRROR_BASE}/${id}/manifest.json`, { cache: 'no-cache' });
  if (!res.ok) throw new CuratedBundleUnavailableError(id, version, res.status);
  return (await res.json()) as import('@rune-langium/curated-schema').CuratedManifest;
}

export async function fetchCuratedNamespace(id: string, version: string, artifactKey: string, fetcher?: CuratedFetcher): Promise<CuratedDocument[]> {
  const fetchFn = fetcher ?? ((u, i) => globalThis.fetch(u, i));
  const res = await fetchFn(`${CURATED_MIRROR_BASE}/${id}/${artifactKey}`, {});
  if (!res.ok) throw new CuratedBundleUnavailableError(id, version, res.status);
  const gz = new Uint8Array(await res.arrayBuffer());
  // reuse the same inflate→JSON.parse→map as fetchCuratedBundle (extract a shared helper)
  return inflateArtifactToDocuments(gz);
}
```
Extract the inflate→parse→map body from `fetchCuratedBundle` into `inflateArtifactToDocuments(bytes)` and call it from both (DRY).

- [ ] **Step 4: Run → PASS** + studio type-check.
- [ ] **Step 5: Commit** — `feat(api/parse): fetchCuratedManifest + fetchCuratedNamespace`.

---

## Task 6: `curated-closure.ts` — `closeNamespacesFromManifest`

**Files:** Modify `apps/studio/functions/lib/curated-closure.ts`; Test add to `apps/studio/functions/test/curated-closure.test.ts`.

- [ ] **Step 1: Failing test:**
```ts
it('closeNamespacesFromManifest: transitive BFS over manifest deps, cycle-safe', () => {
  const ns = { 'cdm.trade': { deps:['cdm.base.datetime'], exports:[], artifact:'' },
               'cdm.base.datetime': { deps:['cdm.base.math'], exports:[], artifact:'' },
               'cdm.base.math': { deps:[], exports:[], artifact:'' },
               'cdm.other': { deps:[], exports:[], artifact:'' } };
  const c = closeNamespacesFromManifest(['cdm.trade'], ns);
  expect([...c].sort()).toEqual(['cdm.base.datetime','cdm.base.math','cdm.trade']);
  expect(c.has('cdm.other')).toBe(false);
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** (pure BFS; wildcard seeds expand by prefix over the manifest's namespace keys, matching `computeCuratedClosure`):
```ts
export function closeNamespacesFromManifest(
  seeds: Iterable<string>,
  namespaces: Record<string, { deps: string[] }>
): Set<string> {
  const all = new Set(Object.keys(namespaces));
  const expand = (raw: string): string[] =>
    raw.endsWith('.*')
      ? [...all].filter((n) => n === raw.slice(0,-2) || n.startsWith(raw.slice(0,-2) + '.'))
      : (all.has(raw) ? [raw] : []);
  const visited = new Set<string>();
  const queue = [...seeds].flatMap(expand);
  while (queue.length) {
    const n = queue.shift()!;
    if (!all.has(n) || visited.has(n)) continue;
    visited.add(n);
    for (const d of namespaces[n].deps) if (!visited.has(d)) queue.push(d);
  }
  return visited;
}
```
Keep `computeCuratedClosure` unchanged (v1 fallback).
- [ ] **Step 4: Run → PASS** + type-check.
- [ ] **Step 5: Commit** — `feat(api/parse): closeNamespacesFromManifest (BFS over manifest dep-graph)`.

---

## Task 7: `parse.ts` — manifest path + v1 fallback + integration tests

**Files:** Modify `apps/studio/functions/api/parse.ts` (curated loop ~179-231); Test `apps/studio/functions/test/parse-manifest.test.ts` (new).

- [ ] **Step 1: Read** parse.ts 160-260 to anchor the curated loop + `deferredExportsList`/`documentsForHydration`/`populateDependencyGraph(...closure)` shapes.
- [ ] **Step 2:** Replace the curated loop body (per bundle): fetch manifest; **if `manifest.namespaces`** →
  - seeds = `collectUserSeedNamespaces(workspaceContext?.userDocs ?? [])`.
  - `closure = closeNamespacesFromManifest(seeds, manifest.namespaces)`.
  - For each ns in closure: `fetchCuratedNamespace(id, version, manifest.namespaces[ns].artifact, fetcher)` → push docs into `documentsForHydration` (with `bundleId`).
  - `deferredExportsList`: push **one entry per manifest namespace** from `manifest.namespaces[ns].exports` (ALL namespaces, not just closure) — so the explorer lists everything.
  - **else (no `namespaces`)** → existing `fetchCuratedBundle` whole-bundle path (unchanged).
  - Keep `populateDependencyGraph(documentsForHydration, workspaceContext, dependencyGraph, closure)` — already closure-gated; for the manifest path the closure is the manifest closure (pass it through; or compute the same set).
- [ ] **Step 3: Integration test** (real handler; stub `fetchCuratedManifest`/`fetchCuratedNamespace`/`fetchCuratedBundle`): manifest with `cdm.trade→cdm.base.datetime→cdm.base.math` + `cdm.other`; user file `import cdm.trade`. Assert: 200; **`fetchCuratedBundle` (whole-bundle) NEVER called** (the CPU-proxy assertion); only closure namespaces' artifacts fetched; `dependencyGraph` covers the closure; `deferredExports` lists ALL manifest namespaces incl. `cdm.other`. Second test: manifest WITHOUT `namespaces` → falls back to `fetchCuratedBundle` (existing behavior).
- [ ] **Step 4:** `pnpm --filter @rune-langium/studio test -- parse` + both type-checks + lint.
- [ ] **Step 5: Commit** — `fix(api/parse): manifest path (closure + per-namespace fetch); whole-bundle is the v1 fallback`.

---

## Task 8 (OPS — manual, not code): deploy + republish + verify

- [ ] Deploy the curated-mirror-worker: `pnpm --filter @rune-langium/curated-mirror-worker run deploy` (wrangler).
- [ ] **Republish** cdm / fpml / rune-dsl through the publisher's trigger (whatever invokes `publishAll` — a cron/route/`wrangler ... ` endpoint; check `index.ts`) so manifest v2 + per-ns artifacts are generated. Confirm `manifest.json` now has `namespaces` and `artifacts/<v>/ns/*.json.gz` exist (CF API or curl).
- [ ] Merge the studio change to master → CF Pages production build deploys `/api/parse`.
- [ ] **Prod re-probe** (the gate): `POST https://www.daikonic.dev/api/parse` with `{files:[{name,content:'namespace t\nimport cdm.base.datetime.*'}],curatedBundles:[{id:'cdm',version:'latest'}]}` → **200** (was 503/1102); and empty-closure (`content:'namespace t'`) → fast **200**. Then **#301 closes**.

## Final verification
- [ ] Full suites: `pnpm --filter @rune-langium/curated-schema test`, `pnpm --filter @rune-langium/curated-mirror-worker test`, `pnpm --filter @rune-langium/studio test`; all type-checks + `pnpm run lint`.
- [ ] superpowers:finishing-a-development-branch → push + PR (do NOT merge to master locally).

## Notes / risks
- **`$ref`→namespace at publish (Task 2)** is the linchpin — verify against a real CDM doc's serialized `$ref` shape (`file:///[cdm]/<path>#…`) and that grouping by `model.name` matches the doc paths. This is the same mapping #308 verified; reuse it.
- **Manifest path must NOT import/fetch the whole bundle** — the integration test's "fetchCuratedBundle never called" assertion is the regression lock for the CPU fix (CPU can't be unit-asserted).
- **Ops step 8 is required** to actually fix prod — code alone doesn't help until bundles are republished with v2 manifests.
