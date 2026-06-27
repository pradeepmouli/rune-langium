# `/api/codegen` Curated Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `/api/codegen` from fetching + deserializing the whole curated bundle (the latent 128 MB Worker OOM behind the prod `/api/codegen` 503s); deserialize only the import closure.

**Architecture:** Hybrid of two closure-scoped paths. **Path A:** the studio passes the closure's already-loaded serialized curated docs (`curatedDocs`) in the request; the server deserializes only those, no fetch. **Path C (fallback):** when no docs are provided, the server loads the closure via the manifest helpers (`fetchCuratedManifest` → `closeNamespacesFromManifest(seeds)` → `fetchCuratedNamespace`), deserializing only the closure. `fetchCuratedBundle` (whole-bundle) is removed from the codegen path.

**Tech Stack:** TypeScript (ESM, strict), Cloudflare Pages Functions, Vitest, Langium 4.3, React 19 (studio client).

**Design spec:** `docs/superpowers/specs/2026-06-27-codegen-curated-closure-design.md`

## Global Constraints

- SPDX header on every source file: `apps/studio/` → `FSL-1.1-ALv2`.
- `SKIP_SIMPLE_GIT_HOOKS=1` on every `git commit` (NOT `--no-verify`).
- Run function tests: `pnpm --filter @rune-langium/studio test -- <path>`. Type-check: `pnpm --filter @rune-langium/studio run type-check`. Lint: `pnpm run lint`.
- DRY: reuse the existing `fetchCuratedManifest`, `fetchCuratedNamespace`, `closeNamespacesFromManifest` helpers — do not reimplement closure logic.
- Branch is off `master` (independent of the open PR #342). Do NOT modify `apps/studio/functions/api/parse.ts` or `curated-closure.ts` (avoids overlap with #342). Curated docs are pre-resolved on the mirror — never re-link them (build only user docs).
- Manifest required for path C: a missing/empty `namespaces` map → 502, consistent with #342. No whole-bundle fallback.

---

## File Structure

- `apps/studio/functions/api/codegen.ts` — **modify.** Replace the whole-bundle curated load in `loadAllDocuments` with closure-scoped path C; accept `curatedDocs` (path A); thread `namespaces` for seeds; drop `fetchCuratedBundle`.
- `apps/studio/functions/test/codegen.test.ts` — **modify.** Update curated tests from whole-bundle to path A + path C; add closure-scoping + 502 assertions.
- `apps/studio/src/services/workspace.ts` — **modify.** `downloadTargetViaRouter` gains a `curatedDocs` param; sends `curatedDocs` (path A) when present, else `curatedBundles` (path C).
- `apps/studio/src/components/CodePreviewPanel.tsx` + `apps/studio/src/shell/perspectives/screens/ExportPerspective.tsx` — **modify.** Build `curatedDocs` from the workspace's loaded curated files and pass it through.
- `apps/studio/test/services/workspace*.test.ts` — **modify/add.** Assert `curatedDocs` is sent when serialized models are loaded.

---

## Task 1: Server — closure-scoped curated load (path C); remove whole-bundle

**Files:**
- Modify: `apps/studio/functions/api/codegen.ts`
- Test: `apps/studio/functions/test/codegen.test.ts`

**Interfaces:**
- Consumes (existing, this branch): `fetchCuratedManifest(id, version, fetcher)`, `fetchCuratedNamespace(id, version, artifactKey, fetcher)` from `../lib/curated-fetch.js`; `closeNamespacesFromManifest(seeds: Iterable<string>, namespaces: Record<string,{deps: readonly string[]}>): Set<string>` from `../lib/curated-closure.js`; `hydrateModelDocument` from `@rune-langium/core`.
- Produces: `loadAllDocuments(files, curatedBundles, curatedFetcher, requestedNamespaces: readonly string[])` — closure-scoped; never calls `fetchCuratedBundle`.

- [ ] **Step 1: Write the failing test**

In `apps/studio/functions/test/codegen.test.ts`, add a manifest fixture + test (mirror `parse-manifest.test.ts`'s shape). Add near the other curated tests:

```ts
const CG_VERSION = '2026-05-22';
const CG_MANIFEST = {
  schemaVersion: 2, modelId: 'cdm', version: CG_VERSION,
  sha256: 'a'.repeat(64), sizeBytes: 1, generatedAt: 'now', upstreamCommit: 'c', upstreamRef: 'r',
  archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz', history: [],
  namespaces: {
    'cdm.base.math': { deps: [], exports: [{ type: 'Data', name: 'Quantity' }], artifact: `artifacts/${CG_VERSION}/ns/cdm.base.math.json.gz` },
    'cdm.other': { deps: [], exports: [{ type: 'Data', name: 'Unrelated' }], artifact: `artifacts/${CG_VERSION}/ns/cdm.other.json.gz` }
  }
};
function cgSM(name: string, importNs: string[] = []): string {
  return JSON.stringify({ $type: 'RosettaModel', name, imports: importNs.map((ns) => ({ importedNamespace: ns })), elements: [] });
}
const CG_NS_DOCS: Record<string, Array<{ uri: string; content: string; serializedModel: string; exports: Array<{ type: string; name: string; path: string }> }>> = {
  'cdm.base.math': [{ uri: 'cdm/base/math.rosetta', content: '', serializedModel: cgSM('cdm.base.math'), exports: [{ type: 'Data', name: 'Quantity', path: 'cdm.base.math.Quantity' }] }],
  'cdm.other': [{ uri: 'cdm/other/other.rosetta', content: '', serializedModel: cgSM('cdm.other'), exports: [{ type: 'Data', name: 'Unrelated', path: 'cdm.other.Unrelated' }] }]
};

it('path C: closure-scoped curated load — whole-bundle never fetched, unrelated ns skipped', async () => {
  const mod = await import('../lib/curated-fetch.js');
  vi.spyOn(mod, 'fetchCuratedManifest').mockResolvedValue(CG_MANIFEST as never);
  vi.spyOn(mod, 'fetchCuratedNamespace').mockImplementation(async (_id, _v, artifactKey) => {
    const ns = Object.keys(CG_NS_DOCS).find((n) => artifactKey.includes(`/ns/${n}.json.gz`));
    return ns ? CG_NS_DOCS[ns] : [];
  });
  const bundleSpy = vi.spyOn(mod, 'fetchCuratedBundle');

  const res = await onRequestPost({
    request: new Request('http://x/api/codegen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: [{ path: 'app.rune', content: 'namespace app\nimport cdm.base.math\n' }],
        target: 'typescript',
        curatedBundles: [{ id: 'cdm', version: 'latest' }]
      })
    }),
    env: {}
  } as never);

  expect(bundleSpy).not.toHaveBeenCalled();
  const arts = (mod.fetchCuratedNamespace as ReturnType<typeof vi.spyOn>).mock.calls.map((c: unknown[]) => c[2] as string);
  expect(arts.some((a) => a.includes('/ns/cdm.base.math.json.gz'))).toBe(true);
  expect(arts.some((a) => a.includes('/ns/cdm.other.json.gz'))).toBe(false); // unrelated → not loaded
  expect(res.status).not.toBe(503);
});

it('path C: missing manifest namespaces → 502 (no whole-bundle fallback)', async () => {
  const mod = await import('../lib/curated-fetch.js');
  vi.spyOn(mod, 'fetchCuratedManifest').mockResolvedValue({ ...CG_MANIFEST, namespaces: {} } as never);
  const bundleSpy = vi.spyOn(mod, 'fetchCuratedBundle');
  const res = await onRequestPost({
    request: new Request('http://x/api/codegen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [{ path: 'app.rune', content: 'namespace app\nimport cdm.base.math\n' }], target: 'typescript', curatedBundles: [{ id: 'cdm', version: 'latest' }] })
    }), env: {}
  } as never);
  expect(res.status).toBe(502);
  expect(bundleSpy).not.toHaveBeenCalled();
});
```

(Use the same `onRequestPost` import + `afterEach(() => vi.restoreAllMocks())` already present in the file. If the file has no `vi` import, add `vi` to the vitest import.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @rune-langium/studio test -- functions/test/codegen.test.ts`
Expected: FAIL — current code calls `fetchCuratedBundle` (so `bundleSpy` IS called), and there is no 502-on-missing-manifest path.

- [ ] **Step 3: Update imports in `codegen.ts`**

Replace the curated-fetch import (currently `import { fetchCuratedBundle, CuratedBundleUnavailableError } from '../lib/curated-fetch.js';`) with:
```ts
import { fetchCuratedManifest, fetchCuratedNamespace, CuratedBundleUnavailableError } from '../lib/curated-fetch.js';
import { closeNamespacesFromManifest } from '../lib/curated-closure.js';
```

- [ ] **Step 4: Add `requestedNamespaces` param + seed collection + closure load**

Change the `loadAllDocuments` signature to:
```ts
async function loadAllDocuments(
  files: ReadonlyArray<{ path: string; content: string }>,
  curatedBundles: ReadonlyArray<{ id: string; version: string }>,
  curatedFetcher: ((url: string, init?: RequestInit) => Promise<Response>) | undefined,
  requestedNamespaces: readonly string[]
): Promise<{ docs: import('langium').LangiumDocument[]; curatedError?: Response }> {
```

After the user files are parsed and pushed into `docs` (just before the `for (const bundle of curatedBundles)` loop), collect closure seeds from the parsed user docs' imports unioned with the request's namespaces:
```ts
  // Closure seeds: namespaces the user files import, plus the request's
  // dependency-closed namespace subset (the modal cascade output). Imports are
  // syntactic — readable from the parsed AST without a link.
  const seeds = new Set<string>(requestedNamespaces);
  for (const doc of docs) {
    const model = doc.parseResult?.value as { imports?: Array<{ importedNamespace?: unknown }> } | undefined;
    for (const imp of model?.imports ?? []) {
      if (typeof imp.importedNamespace === 'string' && imp.importedNamespace.length > 0) {
        seeds.add(imp.importedNamespace);
      }
    }
  }
```

Replace the curated loop body (the `try { const curatedDocs = await fetchCuratedBundle(...) ... }` block) with the closure-scoped manifest path:
```ts
  for (const bundle of curatedBundles) {
    try {
      const manifest = await fetchCuratedManifest(bundle.id, bundle.version, curatedFetcher);
      if (!manifest?.namespaces || Object.keys(manifest.namespaces).length === 0) {
        return {
          docs: [],
          curatedError: new Response(
            JSON.stringify({ ok: false, error: 'curated_manifest_missing', bundleId: bundle.id, version: bundle.version }),
            { status: 502, headers: { 'Content-Type': 'application/json' } }
          )
        };
      }
      const nsGraph = manifest.namespaces;
      const closure = closeNamespacesFromManifest(seeds, nsGraph);
      const closureNs = [...closure].filter((ns) => nsGraph[ns]);
      const FETCH_CONCURRENCY = 8;
      for (let i = 0; i < closureNs.length; i += FETCH_CONCURRENCY) {
        const window = closureNs.slice(i, i + FETCH_CONCURRENCY);
        const fetched = await Promise.all(
          window.map((ns) => fetchCuratedNamespace(bundle.id, bundle.version, nsGraph[ns]!.artifact, curatedFetcher))
        );
        for (const nsDocs of fetched) {
          for (const cd of nsDocs) {
            const { document } = hydrateModelDocument(
              { RuneDsl, shared: RuneDsl.shared },
              URI.parse(`curated:///${cd.uri}`),
              cd.serializedModel,
              { register: 'idempotent' }
            );
            docs.push(document);
          }
        }
      }
    } catch (err) {
      if (err instanceof CuratedBundleUnavailableError) {
        return {
          docs: [],
          curatedError: new Response(
            JSON.stringify({ ok: false, error: 'curated_bundle_unavailable', bundleId: err.bundleId, version: err.version, upstreamStatus: err.status }),
            { status: 502, headers: { 'Content-Type': 'application/json' } }
          )
        };
      }
      throw err;
    }
  }
```

- [ ] **Step 5: Thread `namespaces` from the call site**

At the `onRequestPost` call site (`const { docs: documents, curatedError } = await loadAllDocuments(body.files, curatedBundles, curatedFetcher);`), pass the request namespaces:
```ts
  const { docs: documents, curatedError } = await loadAllDocuments(
    body.files,
    curatedBundles,
    curatedFetcher,
    body.namespaces ?? []
  );
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @rune-langium/studio test -- functions/test/codegen.test.ts`
Expected: PASS — `fetchCuratedBundle` never called; only closure namespaces fetched; missing manifest → 502.

- [ ] **Step 7: Type-check + structural check**

Run: `pnpm --filter @rune-langium/studio run type-check`
Expected: no errors.
Run: `rg -n "fetchCuratedBundle" apps/studio/functions/api/codegen.ts`
Expected: NO matches (the whole-bundle import + call are gone).

- [ ] **Step 8: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add apps/studio/functions/api/codegen.ts apps/studio/functions/test/codegen.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "fix(api/codegen): closure-scope curated load via manifest, drop whole-bundle (fixes codegen OOM)"
```

---

## Task 2: Server — accept pre-loaded `curatedDocs` (path A)

**Files:**
- Modify: `apps/studio/functions/api/codegen.ts`
- Test: `apps/studio/functions/test/codegen.test.ts`

**Interfaces:**
- Consumes: `loadAllDocuments(files, curatedBundles, curatedFetcher, requestedNamespaces)` from Task 1.
- Produces: request accepts `curatedDocs?: Array<{ uri: string; serializedModel: string }>`; when present + non-empty, the server deserializes them and performs NO manifest/namespace fetch.

- [ ] **Step 1: Write the failing test**

Add to `codegen.test.ts`:
```ts
it('path A: deserializes provided curatedDocs without any fetch', async () => {
  const mod = await import('../lib/curated-fetch.js');
  const manifestSpy = vi.spyOn(mod, 'fetchCuratedManifest');
  const nsSpy = vi.spyOn(mod, 'fetchCuratedNamespace');
  const bundleSpy = vi.spyOn(mod, 'fetchCuratedBundle');

  const res = await onRequestPost({
    request: new Request('http://x/api/codegen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: [{ path: 'app.rune', content: 'namespace app\nimport cdm.base.math\n' }],
        target: 'typescript',
        curatedDocs: [{ uri: 'cdm/base/math.rosetta', serializedModel: cgSM('cdm.base.math') }]
      })
    }), env: {}
  } as never);

  expect(res.status).not.toBe(503);
  expect(manifestSpy).not.toHaveBeenCalled();
  expect(nsSpy).not.toHaveBeenCalled();
  expect(bundleSpy).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @rune-langium/studio test -- functions/test/codegen.test.ts`
Expected: FAIL — `curatedDocs` is unknown; the field is ignored and (with no `curatedBundles`) curated isn't loaded, or a type error surfaces.

- [ ] **Step 3: Extend the request type + validator**

In `CodegenRequestBody` add:
```ts
  /**
   * Pre-loaded serialized curated docs (path A). When present, the server
   * deserializes these directly and performs NO manifest/namespace fetch —
   * the studio passes the closure it already loaded via /api/parse. Mutually
   * exclusive with curatedBundles; if both are sent, curatedDocs wins.
   */
  curatedDocs?: Array<{ uri: string; serializedModel: string }>;
```

In `isValidRequest`, after the `curatedBundles` check, validate `curatedDocs` when present:
```ts
  if (b2.curatedDocs !== undefined) {
    if (
      !Array.isArray(b2.curatedDocs) ||
      !b2.curatedDocs.every(
        (d) => d && typeof d === 'object' &&
          typeof (d as { uri?: unknown }).uri === 'string' &&
          typeof (d as { serializedModel?: unknown }).serializedModel === 'string'
      )
    ) {
      return false;
    }
  }
```
(Widen the local `b`/`b2` cast to include `curatedDocs?: unknown` alongside the existing fields.)

- [ ] **Step 4: Add the path-A branch to `loadAllDocuments`**

Add `curatedDocs` as a parameter and short-circuit before the bundle loop:
```ts
async function loadAllDocuments(
  files: ReadonlyArray<{ path: string; content: string }>,
  curatedBundles: ReadonlyArray<{ id: string; version: string }>,
  curatedFetcher: ((url: string, init?: RequestInit) => Promise<Response>) | undefined,
  requestedNamespaces: readonly string[],
  curatedDocs: ReadonlyArray<{ uri: string; serializedModel: string }>
): Promise<{ docs: import('langium').LangiumDocument[]; curatedError?: Response }> {
```

Right before the `for (const bundle of curatedBundles)` loop, branch on path A (deserialize provided docs, skip fetch entirely):
```ts
  if (curatedDocs.length > 0) {
    for (const cd of curatedDocs) {
      const { document } = hydrateModelDocument(
        { RuneDsl, shared: RuneDsl.shared },
        URI.parse(`curated:///${cd.uri}`),
        cd.serializedModel,
        { register: 'idempotent' }
      );
      docs.push(document);
    }
  } else {
    for (const bundle of curatedBundles) {
      // ... Task 1's closure-scoped manifest load (unchanged) ...
    }
  }
```
(The seed-collection block from Task 1 may be left in place; it is only consumed inside the `else` branch.)

- [ ] **Step 5: Thread `curatedDocs` from the call site**

```ts
  const { docs: documents, curatedError } = await loadAllDocuments(
    body.files,
    curatedBundles,
    curatedFetcher,
    body.namespaces ?? [],
    body.curatedDocs ?? []
  );
```

- [ ] **Step 6: Run tests + type-check**

Run: `pnpm --filter @rune-langium/studio test -- functions/test/codegen.test.ts`
Expected: PASS (path A test + Task 1's path C tests all green).
Run: `pnpm --filter @rune-langium/studio run type-check`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add apps/studio/functions/api/codegen.ts apps/studio/functions/test/codegen.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(api/codegen): accept pre-loaded curatedDocs (path A, no server fetch)"
```

---

## Task 3: Client — send `curatedDocs` from the loaded workspace

**Files:**
- Modify: `apps/studio/src/services/workspace.ts` (`downloadTargetViaRouter`)
- Modify: `apps/studio/src/components/CodePreviewPanel.tsx`, `apps/studio/src/shell/perspectives/screens/ExportPerspective.tsx`
- Test: `apps/studio/test/services/workspace-download.test.ts` (or the nearest existing `downloadTargetViaRouter` test file)

**Interfaces:**
- Consumes: server path A from Task 2 (`curatedDocs: Array<{ uri, serializedModel }>`).
- Consumes (existing): `CachedFile.serializedModelJson?: string` (the loaded curated doc's serialized AST) and `CachedFile.path`.
- Produces: `downloadTargetViaRouter(files, target, options, curatedBundles, namespaces, curatedDocs)` — sends `curatedDocs` when non-empty, else `curatedBundles`.

- [ ] **Step 1: Write the failing test**

In the workspace download test file, add (adapt the existing `fetch` mock pattern in that file):
```ts
it('sends curatedDocs (path A) when curated serialized models are loaded', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(new Blob(['x']), { status: 200, headers: { 'Content-Disposition': 'attachment; filename="out.zip"' } })
  );
  await downloadTargetViaRouter(
    [{ path: 'app.rune', content: 'namespace app' }],
    'typescript',
    {},
    [{ id: 'cdm', version: 'latest' }],
    ['cdm.base.math'],
    [{ uri: 'cdm/base/math.rosetta', serializedModel: '{"$type":"RosettaModel","name":"cdm.base.math"}' }]
  );
  const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
  expect(body.curatedDocs).toHaveLength(1);
  expect(body.curatedDocs[0].uri).toBe('cdm/base/math.rosetta');
  // path A: curatedBundles omitted when curatedDocs present
  expect(body.curatedBundles).toBeUndefined();
});
```
(`triggerBlobDownload` may need its DOM side-effects stubbed the same way the existing tests in this file do; reuse their setup.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @rune-langium/studio test -- test/services/workspace-download.test.ts`
Expected: FAIL — `downloadTargetViaRouter` has no `curatedDocs` parameter; `body.curatedDocs` is undefined.

- [ ] **Step 3: Add `curatedDocs` to `downloadTargetViaRouter`**

Extend the signature and body construction (currently builds `{ files, target, options }` then conditionally adds `curatedBundles`/`namespaces`):
```ts
export async function downloadTargetViaRouter(
  files: Array<{ path: string; content: string }>,
  target: string,
  options: Record<string, unknown> = {},
  curatedBundles: ReadonlyArray<{ id: string; version: string }> = [],
  namespaces: ReadonlyArray<string> = [],
  curatedDocs: ReadonlyArray<{ uri: string; serializedModel: string }> = []
): Promise<void> {
  const body: Record<string, unknown> = { files, target, options };
  if (curatedDocs.length > 0) {
    body.curatedDocs = curatedDocs; // path A — server deserializes these, no fetch
  } else if (curatedBundles.length > 0) {
    body.curatedBundles = curatedBundles; // path C fallback
  }
  if (namespaces.length > 0) {
    body.namespaces = namespaces;
  }
  // ... unchanged fetch('/api/codegen', ...) + error handling + blob download ...
}
```

- [ ] **Step 4: Build `curatedDocs` at the call sites**

In `CodePreviewPanel.tsx` (where `curatedBundles = collectCuratedBundlesFromWorkspace(fileList)` is built) add, just after it:
```ts
      const curatedDocs = fileList
        .filter((f) => typeof f.serializedModelJson === 'string' && f.serializedModelJson.length > 0)
        .map((f) => ({ uri: f.path, serializedModel: f.serializedModelJson as string }));
```
and pass it as the new last argument:
```ts
      await downloadTargetViaRouter(requestFiles, newTarget, options, curatedBundles, config.namespaces, curatedDocs);
```
Apply the identical change in `ExportPerspective.tsx` at its `downloadTargetViaRouter(...)` call (it uses the same `fileList` + `collectCuratedBundlesFromWorkspace` pattern).

- [ ] **Step 5: Run tests + type-check**

Run: `pnpm --filter @rune-langium/studio test -- test/services/workspace-download.test.ts`
Expected: PASS.
Run: `pnpm --filter @rune-langium/studio run type-check`
Expected: no errors.

- [ ] **Step 6: Run the studio suite (sibling components assert old call arity)**

Run: `pnpm --filter @rune-langium/studio test`
Expected: PASS — confirms no other caller of `downloadTargetViaRouter` broke on the new optional param (it is optional, so existing calls remain valid).

- [ ] **Step 7: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add apps/studio/src/services/workspace.ts apps/studio/src/components/CodePreviewPanel.tsx apps/studio/src/shell/perspectives/screens/ExportPerspective.tsx apps/studio/test/services/workspace-download.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(studio): send loaded curatedDocs to /api/codegen (path A — no server re-fetch)"
```

---

## Task 4: Memory verification (no commit)

**Files:** none (verification only).

- [ ] **Step 1: Path-A memory smoke**

Write a throwaway `apps/studio/functions/test/_memprobe.test.ts` (DELETE after) that POSTs to `onRequestPost` with `curatedDocs` built from the real CDM `cdm.base.staticdata.party` closure artifacts under `dist/curated-artifacts/cdm/ns/` (gunzip each, map `documents[].modelJson` → `{ uri: 'cdm/'+path, serializedModel: modelJson }`), `target: 'typescript'`, sampling `process.memoryUsage().rss`. Assert peak RSS bounded well under 200 MB and `res.status !== 503`. Surface the number via `expect.fail("MEMPROBE peakRSS=...MB")`.

Run: `pnpm --filter @rune-langium/studio test -- functions/test/_memprobe.test.ts`
Expected: bounded peak, no 503. Then `rm apps/studio/functions/test/_memprobe.test.ts` (do not commit).

- [ ] **Step 2: Structural check**

Run: `rg -n "fetchCuratedBundle" apps/studio/functions/api/codegen.ts`
Expected: NO matches — the whole-bundle path is fully gone from codegen.

- [ ] **Step 3: Record outcome in the PR description** (peak RSS + that the whole-bundle path is removed). No commit.

---

## Self-Review

**1. Spec coverage:**
- Path A (client-provided docs) → Task 2 (server accept) + Task 3 (client send).
- Path C (closure-load fallback) → Task 1.
- Remove `fetchCuratedBundle` from codegen → Task 1 (Step 7 grep) + Task 4 (Step 2).
- Manifest-required → 502 → Task 1 (test + impl).
- Resolution order (curatedDocs wins) → Task 2 (Step 4 branch).
- Closure-only deserialize / memory bound → Task 1 + Task 4 smoke.
- Non-goals (no parse.ts/curated-closure.ts edits, no re-link of curated) → honored: only codegen.ts, codegen.test.ts, and client files are modified; build stays user-docs-only.

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code. Task 3 Step 1 notes "reuse the existing fetch-mock/DOM-stub setup" — that is a real instruction (the test file's harness is the source of truth for those stubs), not a logic placeholder.

**3. Type consistency:** `loadAllDocuments(files, curatedBundles, curatedFetcher, requestedNamespaces, curatedDocs)` is consistent across Task 1 (4 params) → Task 2 (adds 5th `curatedDocs`) → call site. `curatedDocs: Array<{ uri: string; serializedModel: string }>` is identical in the request type (Task 2), `loadAllDocuments` (Task 2), and `downloadTargetViaRouter` (Task 3). `closeNamespacesFromManifest(seeds, nsGraph)` and `fetchCuratedNamespace(id, version, artifact, fetcher)` match the existing signatures. `CachedFile.serializedModelJson` is the confirmed client field.
