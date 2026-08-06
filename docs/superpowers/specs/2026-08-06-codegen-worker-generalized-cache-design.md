# Codegen Worker Generalized Output Cache Design

**Goal:** Generalize `apps/studio/src/workers/codegen-worker.ts`'s caching beyond the parse/link layer (`documentsCache`, PR #474) to every generation call in the file — `generatePreviewSchemas` results and `generate()` results — keyed by version *and* the call's own parameters (`targetId`, `target`), and fix a real latent invalidation bug found along the way in the existing `cachedFuncCode` cache.

**Architecture:** One small generic versioned-cache primitive (a sync and an async variant, the latter carrying forward PR #474's suspended-build race-safety fix), used consistently by every generation call site across two independent version domains — `previewFilesVersion` (existing) and a new `codegenFilesVersion` — since `runCodegen` turned out to run on entirely separate file-set state from `preview:*`/`instance:*`.

**Tech Stack:** TypeScript, Vitest, the existing `codegen-worker.ts` module-level state and message-driven test harness.

## Background

PR #474 added `documentsCache`, caching only the Langium parse/link step (`buildDocuments()`), keyed by a `previewFilesVersion` counter. Everything generated *on top of* those documents was still recomputed from scratch on every call:

- `generatePreviewSchemas(documents, { targetId })` is called identically from three places — `runPreview`, `runInstanceSchema`, `validateInstance` — with zero caching anywhere. `validateInstance` runs on every keystroke, so this is the actual hot-path waste.
- `runCodegen`'s `generate(documents, { target })` (the "Code" tab / Export Code path) is likewise recomputed on every `codegen:generate`, with no caching of the result itself.
- `executeFunction` (the Function-execution "Run" feature) has a bespoke, ad-hoc cache — `cachedFuncCode`, a `Map<string, string>` of function name to source — populated either inside `runCodegen` (when its target is `'typescript'`) or lazily inside `executeFunction` itself on a cache miss.

Investigating `cachedFuncCode` surfaced a real, pre-existing bug: `runCodegen` builds its documents from `currentCodegenFiles` (set only by `codegen:setFiles`), while `executeFunction` builds its documents from `currentPreviewFiles` via `buildDocuments()` (set only by `preview:setFiles`) — **two different file sets, feeding one shared, unversioned cache.** `cachedFuncCode` is never invalidated on `preview:setFiles` at all; it's only ever reset when `runCodegen` happens to run with the `'typescript'` target (an unrelated trigger — the Code tab, not Form Preview/Prototype Workspace), or lazily the first time a given function name isn't yet present. In practice, editing a model in Form Preview and then running a function can silently execute code generated from stale, previously-loaded files.

## Scope

**In scope:**
- A generic versioned-cache primitive (sync `getOrCompute` and async `getOrComputeAsync`), replacing `documentsCache`'s bespoke single-slot logic with the same reusable mechanism.
- Caching `generatePreviewSchemas` results, keyed by `targetId`, shared across all three of its call sites, versioned by `previewFilesVersion`.
- Caching `generate()`'s result for `executeFunction` (constant key `'generate:typescript'`), replacing `cachedFuncCode` — fixing the cross-domain invalidation bug described above by putting this on the *preview* domain, matching what it's actually fed by.
- A new `codegenFilesVersion` counter (bumped only on `codegen:setFiles`, not `codegen:generate`) backing a codegen-domain cache of `generate()`'s result for `runCodegen`, keyed by `target`.

**Out of scope:**
- The future `compileStandaloneValidator` cache (from `docs/superpowers/specs/2026-08-06-retire-preview-validator-design.md`, not yet implemented) — that design already specifies using this same primitive once it exists; no changes needed here to accommodate it.
- Cache eviction/size-bounding. Preview-domain per-`targetId`/per-`target` entries persist for the worker's lifetime once written, even after their version goes stale (only overwritten, never actively pruned). Given realistic usage (a handful of distinct types/targets browsed per session, small `FormPreviewSchema`/`GeneratorOutput` payloads, and a worker that's torn down on tab close), this is accepted as negligible rather than solved — no LRU or size cap is added.
- Re-deriving the suspended-call race scenario as a full end-to-end test for every new async cache consumer — see Testing.

## Architecture

### The generic primitive

```ts
interface VersionedEntry<T> {
  version: number;
  value: T;
}

function getOrCompute<T>(cache: Map<string, VersionedEntry<T>>, key: string, version: number, compute: () => T): T {
  const cached = cache.get(key);
  if (cached && cached.version === version) return cached.value;
  const value = compute();
  cache.set(key, { version, value });
  return value;
}

async function getOrComputeAsync<T>(
  cache: Map<string, VersionedEntry<T>>,
  key: string,
  getVersion: () => number,
  compute: () => Promise<T>
): Promise<T> {
  const versionAtStart = getVersion();
  const cached = cache.get(key);
  if (cached && cached.version === versionAtStart) return cached.value;
  const value = await compute();
  if (getVersion() === versionAtStart) cache.set(key, { version: versionAtStart, value });
  return value;
}
```

`getOrComputeAsync` carries forward PR #474's fix directly: it captures the version *before* awaiting `compute()`, and only writes to the cache if that version is still current when `compute()` resolves — the same guard that stops a build suspended across a file change from poisoning the cache with stale results. Every async cache consumer gets this for free by construction, instead of needing to independently discover and hand-roll the same fix (as `documentsCache` originally did).

### Preview domain (`previewFilesVersion`)

- `documentsCache: Map<string, VersionedEntry<LangiumDocument[]>>` — `buildDocuments()` refactored onto `getOrComputeAsync` with a single constant key (e.g. `'documents'`), replacing its bespoke single-slot object with the same mechanism every other cache uses. Behavior is unchanged; only the storage shape is generalized.
- `previewSchemaCache: Map<string, VersionedEntry<FormPreviewSchema[]>>` — keyed directly by `targetId`. `runPreview`, `runInstanceSchema`, and `validateInstance` all call `getOrCompute(previewSchemaCache, targetId, previewFilesVersion, () => generatePreviewSchemas(documents, { targetId }))` — since `generatePreviewSchemas` is synchronous (no `await` inside it), this call introduces no new race window at all; a synchronous compute-and-store has no yield point for anything else to interleave through. All three call sites for the same `targetId` now share one cache entry, not just each independently avoiding its own redundant recompute.
- `previewGenerateCache: Map<string, VersionedEntry<GeneratorOutput[]>>` — `executeFunction` calls `getOrComputeAsync(previewGenerateCache, 'generate:typescript', () => previewFilesVersion, () => generate(documents, { target: 'typescript' }))`, then finds the requested function by name via a small loop over the (now-cached) `results[].funcs`. This replaces `cachedFuncCode` entirely — no separate persistent name-indexed map is kept; rebuilding the lookup from the cached array on each call is cheap (an in-memory loop, no re-generation, no re-parsing) since the expensive step is what's actually cached.

### Codegen domain (`codegenFilesVersion`, new)

Bumped in the `codegen:setFiles` handler only, mirroring exactly how `previewFilesVersion` is bumped in `preview:setFiles`. `codegen:generate` (which can change only `target`, not `currentCodegenFiles`) never bumps it — switching targets on the same files reuses whatever's already cached for a previously-generated target.

`codegenGenerateCache: Map<string, VersionedEntry<GeneratorOutput[]>>`, keyed by `target`. `runCodegen` calls `getOrComputeAsync(codegenGenerateCache, target, () => codegenFilesVersion, () => generate(documents, { target }))`.

## Files touched

- `apps/studio/src/workers/codegen-worker.ts` — the two generic helpers; `documentsCache`'s refactor; new `previewSchemaCache`, `previewGenerateCache`, `codegenFilesVersion`, `codegenGenerateCache`; `runPreview`/`runInstanceSchema`/`validateInstance` route through `previewSchemaCache`; `executeFunction` routes through `previewGenerateCache` instead of `cachedFuncCode`; `runCodegen` routes through `codegenGenerateCache`; `cachedFuncCode` deleted; `codegen:setFiles` handler bumps `codegenFilesVersion`.
- `apps/studio/test/workers/codegen-worker.test.ts` — new tests per cache (see Testing), and updates to any existing test whose assertions depended on `generatePreviewSchemasMock`/`generateMock`/`buildMock` call counts that this change now reduces (call counts across multiple `preview:generate`/`instance:validate` dispatches for the same target will drop from N to 1 in tests that don't intentionally exercise cache invalidation).

## Error handling

A `generate()`/`generatePreviewSchemas()` result that comes back containing only errors (e.g. `runCodegen`'s existing `allOutputsAreErrors` check) is cached exactly like a successful result — caching sits *beneath* that error-branching logic, transparent to it. This means a persistently-broken model doesn't get silently treated as fixed, but also doesn't re-attempt generation on every call until the underlying files actually change, matching the precedent already established for `documentsCache`.

## Testing

Per new cache: a hit test (same key, no intervening `preview:setFiles`/`codegen:setFiles` → underlying mock call count stays flat), a miss-on-different-key test (different `targetId`/`target` → both cache entries coexist, mock called once per distinct key), and an invalidation test (a `preview:setFiles`/`codegen:setFiles` bumps the relevant version and forces recomputation).

For `previewSchemaCache` specifically, one additional test proves **cross-consumer sharing**: dispatching `preview:generate` and then `instance:validate` for the same `targetId` (two different call sites, `runPreview` and `validateInstance`) results in exactly one `generatePreviewSchemasMock` call, not two.

For `previewGenerateCache` (the `cachedFuncCode` replacement), a regression test proves the latent cross-domain bug is fixed: a `preview:setFiles` between two `preview:execute` calls for the same function name now correctly triggers regeneration — before this change, `cachedFuncCode` would have kept serving the stale function body indefinitely.

Race-safety of `getOrComputeAsync` itself is not re-derived as a full suspended-call race test at every new call site — PR #474's existing test (a build suspended across a `preview:setFiles`) already proves the shared primitive's guard works, and every consumer of `getOrComputeAsync` gets that guarantee by construction, not by re-implementing it. New async consumers (`previewGenerateCache`, `codegenGenerateCache`) get the lighter hit/miss/invalidate tests described above, not a full race re-test each — re-deriving the same race scenario per call site would be redundant coverage of the primitive, not of the call site's own (different) behavior.

Full `apps/studio` suite run after the change, per this repo's standing practice, since this touches shared worker infrastructure with several existing test consumers.

## Decisions made during design

1. **Scope covers both domains** (preview and codegen), not just the preview hot path — confirmed with the project owner, specifically to fix `cachedFuncCode`'s cross-domain invalidation bug as part of the same generalization rather than leaving it as a separately-tracked latent issue.
2. **Two independent version counters**, not one shared global — `runCodegen` turned out to run on entirely separate file-set state (`currentCodegenFiles`, no existing version signal) from `preview:*`/`instance:*`'s `currentPreviewFiles`/`previewFilesVersion`. Forcing them onto one counter would either invalidate the codegen cache on unrelated preview file changes, or vice versa.
3. **`executeFunction`'s cache moves to the preview domain**, not the codegen domain, despite conceptually resembling `runCodegen`'s `generate({target:'typescript'})` call — because it's actually fed by `buildDocuments()`/`currentPreviewFiles`, not `currentCodegenFiles`. This is the direct fix for the cross-domain bug found during design.
4. **No persistent name-indexed lookup structure survives** for function execution — the cached `generate()` result is the single source of truth; the name→code lookup is rebuilt cheaply on each call from that already-cached array, rather than maintaining a second cache layer that could itself drift out of sync with the first.
5. **No eviction/size-bounding** — accepted as negligible for realistic session-scale usage rather than solved; see Scope.
6. **Race-safety tests are not repeated per async cache consumer** — the primitive itself is the single source of correctness for that property, proven once against `documentsCache`'s existing race test.
