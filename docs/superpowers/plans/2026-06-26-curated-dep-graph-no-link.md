# Curated Dependency Graph Without Server-Side Link — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the curated-corpus deserialize+link from `/api/parse` (the 128 MB Cloudflare-Worker OOM that returns 503 when loading CDM/FpML) by assembling the response `dependencyGraph` from the manifest's precomputed `deps`, and remove the v1 whole-bundle fallback entirely.

**Architecture:** The publish pipeline already records direct cross-namespace edges per namespace in the v2 manifest (`namespaces[ns].deps`). `/api/parse` currently re-derives the same edges by deserializing + linking the live AST inside the memory-capped Worker. We replace that with a pure function that builds the graph from manifest `deps` (curated→curated) and user-model import declarations (user→\*), reusing the existing `closeNamespaceDependencies` transitive-closure walk. The corpus is never materialized in memory. The v1 (no-manifest, whole-bundle) path — whose only dep-graph mechanism was that same link — is deleted; a missing manifest becomes a clean 502.

**Tech Stack:** TypeScript (ESM, strict), Cloudflare Pages Functions, Vitest, Langium 4.3 (only for user docs now), `@rune-langium/core`, `@rune-langium/curated-schema`.

**Design spec:** `docs/superpowers/specs/2026-06-26-curated-dep-graph-no-link-design.md`

## Global Constraints

- SPDX header on every source file: `packages/` → `MIT`; `apps/studio/` → `FSL-1.1-ALv2`. New files under `apps/studio/functions/` use FSL-1.1-ALv2.
- `SKIP_SIMPLE_GIT_HOOKS=1` on every `git commit` (NOT `--no-verify`).
- pnpm workspace; run function tests with `pnpm --filter @rune-langium/studio test -- <path>` (vitest resolves workspace imports; bare `node`/`tsx` does not).
- DRY: reuse `closeNamespaceDependencies` (the transitive-closure walk) and a single shared `expandWildcard`; do not reimplement either.
- The response `dependencyGraph` shape is unchanged: `Record<namespace, string[]>` where each value is the namespace's transitive closure (including itself), sorted.
- `dependencyGraph` consumers (verified): `DownloadConfigModal.computeNamespaceSelection` reads `dependencyGraph[ns] ?? [ns]`; `CodePreviewPanel.tsx:153` and `ExportPerspective.tsx:54` read `Object.keys(dependencyGraph)` as the namespace list. Keys MUST enumerate every user + curated-closure namespace.
- Intentional behavior change (documented): user→curated edges become **import-based** (was resolved-ref-based). This is a safe superset — over-pull at worst, never under-pull — and is required because curated docs are no longer linked.

---

## File Structure

- `apps/studio/functions/lib/curated-closure.ts` — **modify.** Add `expandWildcard` (extracted, shared) and `buildDependencyGraph` (new pure function). Later: delete `computeCuratedClosure`, `extractCrossDocRefNamespaces`, `refUriToCuratedKey` (v1-only, dead after Task 2).
- `apps/studio/functions/api/parse.ts` — **modify.** Remove v1 fallback + manifest-null fallthrough; accumulate manifest `deps`; replace `populateDependencyGraph(...)` call and delete the function; fix imports.
- `apps/studio/functions/test/curated-closure.test.ts` — **modify.** Add unit tests for `expandWildcard` + `buildDependencyGraph`; remove `computeCuratedClosure` tests.
- `apps/studio/functions/test/parse-manifest.test.ts` — **modify.** Strengthen Test 1's `dependencyGraph` value assertions; convert Test 2/3/3b (v1 fallback) to 502 expectations / deletion.
- `apps/studio/functions/test/parse-lazy-link.test.ts` — **delete.** Regression lock for the deleted v1 deserialize+link path; surviving behavior (closure-scoping + passthrough) is covered by `parse-manifest.test.ts`.

---

## Task 1: Pure dependency-graph builder (`expandWildcard` + `buildDependencyGraph`)

**Files:**
- Modify: `apps/studio/functions/lib/curated-closure.ts`
- Test: `apps/studio/functions/test/curated-closure.test.ts`

**Interfaces:**
- Consumes: `closeNamespaceDependencies(source: string, deps: ReadonlyMap<string, ReadonlySet<string>>): Set<string>` from `@rune-langium/core` (existing; returns the transitive closure including `source`).
- Produces:
  - `expandWildcard(raw: string, allNs: ReadonlySet<string>): string[]` — `a.b.*` → every ns equal to `a.b` or starting with `a.b.`; a bare name → `[name]` iff present in `allNs`, else `[]`.
  - `buildDependencyGraph(userModels: ReadonlyArray<{ namespace: string; imports: readonly string[] }>, curatedDeps: ReadonlyMap<string, ReadonlySet<string>>, allNamespaces: ReadonlySet<string>): Record<string, string[]>` — every namespace in `allNamespaces` is a key; value is its sorted transitive closure (incl. itself).

- [ ] **Step 1: Write the failing unit tests**

Add to the end of `apps/studio/functions/test/curated-closure.test.ts` (import the new symbols at the top of the file alongside the existing imports):

```ts
import { expandWildcard, buildDependencyGraph } from '../lib/curated-closure.js';

describe('expandWildcard', () => {
  const allNs = new Set(['cdm.base.math', 'cdm.base.datetime', 'cdm.trade', 'app']);

  it('expands a wildcard to matching namespaces (exact prefix + dotted children)', () => {
    expect(expandWildcard('cdm.base.*', allNs).sort()).toEqual(['cdm.base.datetime', 'cdm.base.math']);
  });

  it('returns a bare name iff present', () => {
    expect(expandWildcard('cdm.trade', allNs)).toEqual(['cdm.trade']);
    expect(expandWildcard('cdm.unknown', allNs)).toEqual([]);
  });

  it('matches the wildcard prefix itself when present', () => {
    const ns = new Set(['cdm.base', 'cdm.base.math']);
    expect(expandWildcard('cdm.base.*', ns).sort()).toEqual(['cdm.base', 'cdm.base.math']);
  });
});

describe('buildDependencyGraph', () => {
  // Topology: cdm.trade → cdm.base.datetime → cdm.base.math ; cdm.other isolated.
  const curatedDeps = new Map<string, Set<string>>([
    ['cdm.trade', new Set(['cdm.base.datetime'])],
    ['cdm.base.datetime', new Set(['cdm.base.math'])],
    ['cdm.base.math', new Set()],
  ]);
  const closure = new Set(['cdm.trade', 'cdm.base.datetime', 'cdm.base.math']);

  it('transitively closes curated edges, every namespace is a key, values sorted + include self', () => {
    const g = buildDependencyGraph([], curatedDeps, closure);
    expect(g['cdm.trade']).toEqual(['cdm.base.datetime', 'cdm.base.math', 'cdm.trade']);
    expect(g['cdm.base.datetime']).toEqual(['cdm.base.math', 'cdm.base.datetime'].sort());
    expect(g['cdm.base.math']).toEqual(['cdm.base.math']);
    expect(Object.keys(g).sort()).toEqual(['cdm.base.datetime', 'cdm.base.math', 'cdm.trade']);
  });

  it('adds user→curated edges from imports (wildcard-expanded) and keys the user namespace', () => {
    const all = new Set([...closure, 'app']);
    const g = buildDependencyGraph([{ namespace: 'app', imports: ['cdm.trade'] }], curatedDeps, all);
    // app imports cdm.trade → app's closure pulls the whole transitive chain.
    expect(g['app']).toEqual(['app', 'cdm.base.datetime', 'cdm.base.math', 'cdm.trade']);
  });

  it('ignores import targets outside allNamespaces and self-imports', () => {
    const all = new Set([...closure, 'app']);
    const g = buildDependencyGraph(
      [{ namespace: 'app', imports: ['cdm.unknown', 'app', 'cdm.base.*'] }],
      curatedDeps,
      all
    );
    // cdm.unknown dropped (absent); 'app' self-edge dropped; cdm.base.* expands.
    expect(g['app']).toEqual(['app', 'cdm.base.datetime', 'cdm.base.math']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @rune-langium/studio test -- functions/test/curated-closure.test.ts`
Expected: FAIL — `expandWildcard`/`buildDependencyGraph` are not exported (`is not a function` / import resolves to undefined).

- [ ] **Step 3: Implement `expandWildcard` (extract the existing inline copy)**

In `apps/studio/functions/lib/curated-closure.ts`, add the `closeNamespaceDependencies` import to the existing import line and add the module-level export. Replace the inline `expand` inside `closeNamespacesFromManifest` with a call to the shared function.

At the top, change:
```ts
import { readSerializedModelMeta } from './serialized-model-meta.js';
```
to:
```ts
import { readSerializedModelMeta } from './serialized-model-meta.js';
import { closeNamespaceDependencies } from '@rune-langium/core';
```

Add near the top of the module (after imports):
```ts
/**
 * Expand a possibly-wildcarded namespace token against a known namespace set.
 * `a.b.*` → every ns equal to `a.b` or starting with `a.b.`; a bare name →
 * `[name]` iff present, else `[]`. Shared by closeNamespacesFromManifest and
 * buildDependencyGraph so both agree on wildcard semantics.
 */
export function expandWildcard(raw: string, allNs: ReadonlySet<string>): string[] {
  if (raw.endsWith('.*')) {
    const prefix = raw.slice(0, -2);
    return [...allNs].filter((ns) => ns === prefix || ns.startsWith(prefix + '.'));
  }
  return allNs.has(raw) ? [raw] : [];
}
```

In `closeNamespacesFromManifest`, delete its local `const expand = (raw) => {...}` and replace the two `expand(...)` call sites with `expandWildcard(raw, allNs)`:
```ts
  const allNs = new Set(Object.keys(namespaces));
  const visited = new Set<string>();
  const queue: string[] = [...seedNamespaces].flatMap((raw) => expandWildcard(raw, allNs));
  while (queue.length > 0) {
    const ns = queue.shift()!;
    if (!allNs.has(ns) || visited.has(ns)) continue;
    visited.add(ns);
    for (const raw of namespaces[ns]!.deps) {
      for (const target of expandWildcard(raw, allNs)) {
        if (!visited.has(target)) queue.push(target);
      }
    }
  }
  return visited;
```

- [ ] **Step 4: Implement `buildDependencyGraph`**

Add to `apps/studio/functions/lib/curated-closure.ts`:
```ts
/**
 * Build the /api/parse cross-namespace dependency graph WITHOUT deserializing or
 * linking any curated document. Curated→curated edges come from the precomputed
 * manifest `deps` (`curatedDeps`); user→* edges come from each user model's
 * import declarations. Returns every namespace in `allNamespaces` mapped to its
 * transitive dependency closure (including itself), sorted for stable bytes.
 *
 * @param userModels   user docs' {namespace, imports} (from readSerializedModelMeta)
 * @param curatedDeps  direct curated edges: ns → its direct dep namespaces
 * @param allNamespaces every namespace that must be a key (user ∪ curated closure)
 */
export function buildDependencyGraph(
  userModels: ReadonlyArray<{ namespace: string; imports: readonly string[] }>,
  curatedDeps: ReadonlyMap<string, ReadonlySet<string>>,
  allNamespaces: ReadonlySet<string>
): Record<string, string[]> {
  const directDeps = new Map<string, Set<string>>();
  const ensure = (ns: string): Set<string> => {
    let s = directDeps.get(ns);
    if (!s) {
      s = new Set<string>();
      directDeps.set(ns, s);
    }
    return s;
  };

  // Every namespace is a key even with no deps: consumers read Object.keys as
  // the namespace list, and a selected ns with no closure entry emits itself.
  for (const ns of allNamespaces) ensure(ns);

  // Curated → curated (precomputed manifest edges). Filter to known namespaces.
  for (const [ns, targets] of curatedDeps) {
    const bucket = ensure(ns);
    for (const t of targets) if (allNamespaces.has(t)) bucket.add(t);
  }

  // User → (user | curated) from import declarations, wildcard-expanded.
  for (const { namespace, imports } of userModels) {
    const bucket = ensure(namespace);
    for (const raw of imports) {
      for (const t of expandWildcard(raw, allNamespaces)) {
        if (t !== namespace) bucket.add(t);
      }
    }
  }

  const graph: Record<string, string[]> = {};
  for (const ns of allNamespaces) {
    graph[ns] = [...closeNamespaceDependencies(ns, directDeps)].sort();
  }
  return graph;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @rune-langium/studio test -- functions/test/curated-closure.test.ts`
Expected: PASS (all new `expandWildcard` + `buildDependencyGraph` cases, plus the pre-existing `closeNamespacesFromManifest`/`computeCuratedClosure` cases still green — the refactor is behavior-preserving).

- [ ] **Step 6: Type-check**

Run: `pnpm --filter @rune-langium/studio run type-check`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add apps/studio/functions/lib/curated-closure.ts apps/studio/functions/test/curated-closure.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(api/parse): add no-link buildDependencyGraph + shared expandWildcard"
```

---

## Task 2: Rewire `/api/parse` to the manifest-derived graph; remove v1; delete the link

**Files:**
- Modify: `apps/studio/functions/api/parse.ts`
- Modify: `apps/studio/functions/lib/curated-closure.ts` (delete v1-only dead code)
- Modify: `apps/studio/functions/test/parse-manifest.test.ts`
- Delete: `apps/studio/functions/test/parse-lazy-link.test.ts`

**Interfaces:**
- Consumes: `buildDependencyGraph`, `expandWildcard`, `closeNamespacesFromManifest` (from `curated-closure.js`); `readSerializedModelMeta` (from `serialized-model-meta.js`); `fetchCuratedManifest`, `fetchCuratedNamespace`, `CuratedBundleUnavailableError` (from `curated-fetch.js`).
- Produces: unchanged HTTP contract. `dependencyGraph` now manifest-derived; missing/empty manifest → HTTP 502 `curated_manifest_missing`.

- [ ] **Step 1: Update the integration tests to the new behavior (write the failing tests)**

In `apps/studio/functions/test/parse-manifest.test.ts`:

(a) Strengthen Test 1's `dependencyGraph` block (replace the `toHaveProperty` assertions at the end of Test 1) with full-value assertions:
```ts
    // ── dependencyGraph: transitive closures, manifest-derived (no link) ──
    expect(body.dependencyGraph['cdm.base.math']).toEqual(['cdm.base.math']);
    expect(body.dependencyGraph['cdm.base.datetime']).toEqual(
      ['cdm.base.datetime', 'cdm.base.math'].sort()
    );
    expect(body.dependencyGraph['cdm.trade']).toEqual(
      ['cdm.base.datetime', 'cdm.base.math', 'cdm.trade'].sort()
    );
    // app imports cdm.trade → its closure pulls the whole chain (import-based).
    expect(body.dependencyGraph['app']).toEqual(
      ['app', 'cdm.base.datetime', 'cdm.base.math', 'cdm.trade'].sort()
    );
    expect(body.dependencyGraph).not.toHaveProperty('cdm.other');
```

(b) Replace Test 3 ("empty namespaces falls through to v1") with a 502 expectation:
```ts
  it('Test 3 — empty namespaces map returns 502 (manifest required, no v1 fallback)', async () => {
    const mod = await import('../lib/curated-fetch.js');
    vi.spyOn(mod, 'fetchCuratedManifest').mockResolvedValue({ ...MANIFEST, namespaces: {} } as never);
    const nsSpy = vi.spyOn(mod, 'fetchCuratedNamespace');

    const res = await onRequestPost({
      request: makeRequest({
        files: [{ name: 'app.rune', content: 'namespace app\nimport cdm.trade\n' }],
        curatedBundles: [{ id: 'cdm', version: 'latest' }]
      })
    } as never);

    expect(res.status).toBe(502);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(nsSpy).not.toHaveBeenCalled();
  });
```

(c) Replace Test 3b ("manifest fetch failure falls back") with a 502 expectation:
```ts
  it('Test 3b — manifest fetch failure returns 502 (no whole-bundle fallback)', async () => {
    const mod = await import('../lib/curated-fetch.js');
    vi.spyOn(mod, 'fetchCuratedManifest').mockRejectedValue(
      new mod.CuratedBundleUnavailableError('cdm', 'latest', 503)
    );

    const res = await onRequestPost({
      request: makeRequest({
        files: [{ name: 'app.rune', content: 'namespace app\nimport cdm.trade\n' }],
        curatedBundles: [{ id: 'cdm', version: 'latest' }]
      })
    } as never);

    expect(res.status).toBe(502);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
  });
```

(d) Delete Test 2 ("v1 fallback: whole-bundle fetched") entirely, and remove the now-unused `CURATED_DOCS` constant and any `fetchCuratedBundle` references in this file.

Then delete the obsolete v1-link regression file:
```bash
SKIP_SIMPLE_GIT_HOOKS=1 git rm apps/studio/functions/test/parse-lazy-link.test.ts
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @rune-langium/studio test -- functions/test/parse-manifest.test.ts`
Expected: FAIL — Test 1's new value assertions fail against current behavior (current `dependencyGraph['app']` is `['app']`, not the import-based closure; current `dependencyGraph['cdm.trade']` may differ in edge set), and Test 3/3b fail because current code returns 200 via the v1 fallback, not 502.

- [ ] **Step 3: Remove the v1 fallback from the bundle loop**

In `apps/studio/functions/api/parse.ts`:

(a) Add a curated-deps accumulator next to `manifestClosureNamespaces` (replace the `let anyV1Fallback = false;` line and its accumulator comment):
```ts
    const manifestClosureNamespaces = new Set<string>();
    // Direct curated→curated edges per closure namespace, read from the
    // precomputed manifest graph (NO deserialize/link). Feeds buildDependencyGraph.
    const curatedDirectDeps = new Map<string, Set<string>>();
```

(b) Replace the manifest-fetch try/catch + `if (manifest && ...)` / `else { v1 }` block (the body inside `for (const bundle of body.curatedBundles)`) so the manifest is required. The new body:
```ts
        try {
          const manifest = await fetchCuratedManifest(bundle.id, bundle.version, curatedFetcher);
          if (!manifest?.namespaces || Object.keys(manifest.namespaces).length === 0) {
            return new Response(
              JSON.stringify({
                ok: false,
                error: 'curated_manifest_missing',
                bundleId: bundle.id,
                version: bundle.version
              }),
              { status: 502, headers: { 'Content-Type': 'application/json' } }
            );
          }
          // Manifest fast-path: fetch ONLY the user's closure, never the whole bundle.
          const nsGraph = manifest.namespaces;
          const closure = closeNamespacesFromManifest(seeds, nsGraph);
          for (const ns of closure) manifestClosureNamespaces.add(ns);
          // Record precomputed curated→curated edges for the dep graph (no link).
          for (const ns of closure) {
            const entry = nsGraph[ns];
            if (!entry) continue;
            const targets = new Set<string>();
            for (const raw of entry.deps) {
              for (const t of expandWildcard(raw, closure)) targets.add(t);
            }
            curatedDirectDeps.set(ns, targets);
          }
          const closureNs = [...closure].filter((ns) => nsGraph[ns]);
          const FETCH_CONCURRENCY = 8;
          for (let i = 0; i < closureNs.length; i += FETCH_CONCURRENCY) {
            const window = closureNs.slice(i, i + FETCH_CONCURRENCY);
            const fetchedPerNs = await Promise.all(
              window.map((ns) =>
                fetchCuratedNamespace(bundle.id, bundle.version, nsGraph[ns]!.artifact, curatedFetcher)
              )
            );
            for (const nsDocs of fetchedPerNs) {
              for (const doc of nsDocs) {
                documentsForHydration.push({ ...doc, bundleId: bundle.id });
                mergeCuratedDocIntoDeferredExports(doc, deferredExportsList);
              }
            }
          }
          // List every OTHER curated namespace so the explorer shows the full corpus.
          for (const [ns, entry] of Object.entries(nsGraph)) {
            if (closure.has(ns)) continue;
            deferredExportsList.push({
              filePath: `${bundle.id}/${ns}`,
              namespace: ns,
              entries: entry.exports.map((e) => ({ type: e.type, name: e.name }))
            });
          }
        } catch (err) {
          if (err instanceof CuratedBundleUnavailableError) {
            return new Response(
              JSON.stringify({
                ok: false,
                error: 'curated_bundle_unavailable',
                bundleId: err.bundleId,
                version: err.version,
                upstreamStatus: err.status
              }),
              { status: 502, headers: { 'Content-Type': 'application/json' } }
            );
          }
          throw err;
        }
```

This removes: the inner manifest-null try/catch, the `else { v1 fetchCuratedBundle }` branch, and all `anyV1Fallback` writes.

- [ ] **Step 4: Replace the dep-graph block (delete the link)**

Replace the dep-graph block (the `if (documentsForHydration.length > 0) { const closure = anyV1Fallback ? computeCuratedClosure(...) : ...; await populateDependencyGraph(...); }`) with the no-link assembly:
```ts
    // Build the cross-namespace dep graph from precomputed manifest edges +
    // user import declarations. No curated deserialize/link — see design
    // 2026-06-26-curated-dep-graph-no-link.
    if (documentsForHydration.length > 0) {
      const userModels: Array<{ namespace: string; imports: string[] }> = [];
      for (const entry of documentsForHydration) {
        if (entry.bundleId !== undefined) continue; // curated entries carry bundleId; user docs don't
        const meta = readSerializedModelMeta(entry.serializedModel);
        if (meta) userModels.push(meta);
      }
      const allNamespaces = new Set<string>(manifestClosureNamespaces);
      for (const m of userModels) allNamespaces.add(m.namespace);
      Object.assign(dependencyGraph, buildDependencyGraph(userModels, curatedDirectDeps, allNamespaces));
    }
```

- [ ] **Step 5: Delete `populateDependencyGraph` and fix imports**

Delete the entire `async function populateDependencyGraph(...)` definition (and its doc comment). Update the import block at the top of `parse.ts`:
- From `@rune-langium/core`: remove `collectNamespaceDependencies`, `closeNamespaceDependencies`, `hydrateModelDocument` (no longer used here). Keep `qualifiedExportPath`, `serializeRuneModel`, `runeBigIntReplacer`, `preserveCstText`, `namespaceFromModelName` (still used by `hydrateUserWorkspace` / serialization). Verify each against remaining references before removing.
- From `../lib/curated-fetch.js`: remove `fetchCuratedBundle`.
- From `../lib/curated-closure.js`: change to `import { closeNamespacesFromManifest, buildDependencyGraph, expandWildcard } from '../lib/curated-closure.js';` (remove `computeCuratedClosure`).
- Keep `readSerializedModelMeta` import (now used in Step 4).

- [ ] **Step 6: Delete v1-only dead code from `curated-closure.ts`**

Remove `computeCuratedClosure`, `extractCrossDocRefNamespaces`, `refUriToCuratedKey`, the `ClosureDoc` interface, and the `export { refUriToCuratedKey }` line — all only reachable through the deleted v1 path. Keep `closeNamespacesFromManifest`, `expandWildcard`, `buildDependencyGraph`, and the `readSerializedModelMeta` import only if still referenced (it is used by `computeCuratedClosure` — once that is gone, remove the now-unused `readSerializedModelMeta` import from this file).

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @rune-langium/studio test -- functions/test/parse-manifest.test.ts functions/test/curated-closure.test.ts`
Expected: PASS — Test 1 value assertions pass (manifest-derived graph), Test 3/3b return 502, curated-closure unit tests green.

- [ ] **Step 8: Run the full functions suite + type-check + lint**

Run: `pnpm --filter @rune-langium/studio test -- functions/test`
Expected: PASS, no references to the deleted `parse-lazy-link.test.ts` or `fetchCuratedBundle`/`computeCuratedClosure`.

Run: `pnpm --filter @rune-langium/studio run type-check`
Expected: no errors (catches any missed import removal or dangling reference).

Run: `pnpm run lint`
Expected: clean (no unused-import warnings for the symbols removed in Steps 5–6).

- [ ] **Step 9: Confirm no curated deserialize/link remains (structural regression check)**

Run: `rg -n "hydrateModelDocument|DocumentBuilder|collectNamespaceDependencies|populateDependencyGraph|fetchCuratedBundle|computeCuratedClosure" apps/studio/functions/api/parse.ts`
Expected: only the `hydrateUserWorkspace` `DocumentBuilder.build(docs, ...)` over **user** docs remains (line ~425). NO match for `hydrateModelDocument`, `collectNamespaceDependencies`, `populateDependencyGraph`, `fetchCuratedBundle`, or `computeCuratedClosure`. This is the proof the curated corpus is never linked.

- [ ] **Step 10: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add apps/studio/functions/api/parse.ts apps/studio/functions/lib/curated-closure.ts apps/studio/functions/test/parse-manifest.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git rm apps/studio/functions/test/parse-lazy-link.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "fix(api/parse): derive dep graph from manifest, drop curated link + v1 fallback (fixes curated 503 OOM)"
```

---

## Task 3: Memory verification + production smoke

**Files:** none (verification only; no committed flaky RSS assertion).

**Interfaces:** Consumes the deployed/preview `/api/parse`. Produces evidence the OOM is gone.

- [ ] **Step 1: Local memory spot-check (no link present)**

Recreate the throwaway probe to confirm a curated closure hydrates without the link. Create `apps/studio/functions/test/_memprobe.test.ts` (DELETE after) that POSTs a curated-bundle request through `onRequestPost` with `CURATED_MIRROR` mocked to serve the real CDM per-namespace artifacts for a deep namespace (e.g. `cdm.base.staticdata.party`), sampling `process.memoryUsage().rss`. Assert peak RSS stays well under 200 MB (the link path peaked ~238–548 MB). Surface the number via `expect.fail("MEMPROBE peakRSS=...MB")` (vitest swallows `console.log`).

Run: `pnpm --filter @rune-langium/studio test -- functions/test/_memprobe.test.ts`
Expected: peak RSS bounded (no 238 MB+ spike). Then `rm apps/studio/functions/test/_memprobe.test.ts` (do not commit).

- [ ] **Step 2: Production smoke**

After the branch is deployed to a preview (or merged to Production), run the prod-smoke Playwright spec that loads CDM and navigates to a never-hydrated curated namespace:

Run: `pnpm --filter @rune-langium/studio exec playwright test test/prod-smoke/production-checkout.spec.ts`
Expected: the test "Inspector populates members on first navigation to a never-hydrated curated namespace" PASSES (was 503/empty before the fix). `/api/parse` returns 200 for the CDM closure.

- [ ] **Step 3: Record the outcome**

No commit. Report peak RSS and the prod-smoke result in the PR description as the fix's evidence.

---

## Self-Review

**1. Spec coverage:**
- Manifest-derived graph (no link) → Task 1 (`buildDependencyGraph`) + Task 2 Step 4.
- Remove v1 fallback / manifest required → 502 → Task 2 Steps 3, 1(b/c/d).
- Delete dead code (`fetchCuratedBundle`, `computeCuratedClosure`, `extractCrossDocRefNamespaces`, `anyV1Fallback`, `populateDependencyGraph`) → Task 2 Steps 3, 5, 6.
- Consumer equivalence (keys = user ∪ closure; `?? [ns]` fail-soft; superset edges) → Task 1 tests + Task 2 Step 1(a).
- Testing: unit (Task 1), integration + 502 (Task 2), memory + prod-smoke (Task 3); `curated-closure.test.ts` loses `computeCuratedClosure` cases (Task 2 Step 6 deletes the function — remove its tests in the same step if present); dead-code grep (Task 2 Step 9).
- `$textRegion` trimming and browser-streaming are explicit non-goals — correctly absent.

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output. Task 2 Step 5 says "verify each against remaining references" — that is a real instruction (the implementer must grep), not a placeholder, because exact surviving usages depend on `hydrateUserWorkspace` internals the implementer will see in-file.

**3. Type consistency:** `buildDependencyGraph(userModels, curatedDeps, allNamespaces)` signature is identical in Task 1 (definition), its tests, and Task 2 Step 4 (call site). `expandWildcard(raw, allNs)` consistent across definition, `closeNamespacesFromManifest`, Task 2 Step 3, and `buildDependencyGraph`. `readSerializedModelMeta` returns `{ namespace, imports } | null` (matches `userModels` element shape). `curatedDirectDeps: Map<string, Set<string>>` matches the `ReadonlyMap<string, ReadonlySet<string>>` parameter.
