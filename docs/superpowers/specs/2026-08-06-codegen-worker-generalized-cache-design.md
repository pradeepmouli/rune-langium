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

function getOrCompute<T>(
  cache: Map<string, VersionedEntry<T>>,
  key: string,
  version: number,
  compute: () => T
): VersionedEntry<T> {
  const cached = cache.get(key);
  if (cached && cached.version === version) return cached;
  const entry: VersionedEntry<T> = { version, value: compute() };
  // Never let a write tagged with a STALE version clobber an already-cached NEWER entry.
  if (!cached || cached.version < version) cache.set(key, entry);
  return entry;
}

async function getOrComputeAsync<T>(
  cache: Map<string, VersionedEntry<T>>,
  key: string,
  getVersion: () => number,
  compute: () => Promise<T>
): Promise<VersionedEntry<T>> {
  const versionAtStart = getVersion();
  const cached = cache.get(key);
  if (cached && cached.version === versionAtStart) return cached;
  const value = await compute();
  const entry: VersionedEntry<T> = { version: versionAtStart, value };
  // Compare against the cache's OWN current state, not getVersion() re-invoked
  // — see the note on downstream callers below for why.
  const cachedNow = cache.get(key);
  if (!cachedNow || cachedNow.version < versionAtStart) cache.set(key, entry);
  return entry;
}
```

Both helpers now return the full `VersionedEntry<T>`, not just its `value`. This matters for any caller that feeds its result into a FURTHER downstream cache (e.g. `buildDocuments()`'s result feeding `previewSchemaCache`/`previewGenerateCache`, or `runCodegen`'s own document-build feeding `codegenGenerateCache`): that downstream write must be tagged with the version the input was ACTUALLY built from, not with whatever the live file-set counter (`previewFilesVersion`/`codegenFilesVersion`) reads at that later point — re-sampling the live counter after an intervening `await` can tag a stale-derived result as valid for a version it doesn't represent, silently poisoning the cache until the next file change.

`getOrComputeAsync`'s write guard compares the new entry's version against the cache's *own current state* (mirroring `getOrCompute`'s guard above), not against `getVersion()` re-invoked. Re-reading `getVersion()` is correct for a caller passing a live counter (`buildDocuments()`'s `() => previewFilesVersion`), but a no-op for a caller passing a closure over an already-fixed version (`executeFunction`/`runCodegen`'s `() => documentsVersion`, threaded forward from an earlier `getOrComputeAsync` call per the paragraph above) — that closure returns the same value both before and after `await compute()`, so re-checking it would trivially always pass, letting an out-of-order caller (started under an older version, but whose own `compute()` settles after a concurrent newer call's) overwrite an already-cached newer entry with its stale one. The cache-state comparison catches this uniformly for both kinds of callers, and every async cache consumer gets it for free by construction.

### Preview domain (`previewFilesVersion`)

- `documentsCache: Map<string, VersionedEntry<LangiumDocument[]>>` — `buildDocuments()` refactored onto `getOrComputeAsync` with a single constant key (e.g. `'documents'`), replacing its bespoke single-slot object with the same mechanism every other cache uses, and now returns the `VersionedEntry` (not just the documents) so callers can thread its actual version forward.
- `previewSchemaCache: Map<string, VersionedEntry<FormPreviewSchema[]>>` — keyed directly by `targetId`. `runPreview`, `runInstanceSchema`, and `validateInstance` each `await buildDocuments()`, destructure its `{ version: documentsVersion, value: documents }`, and call `getOrCompute(previewSchemaCache, targetId, documentsVersion, () => generatePreviewSchemas(documents, { targetId }))` — tagged with the documents' actual version, not the live `previewFilesVersion`. Since `generatePreviewSchemas` is synchronous (no `await` inside it), this call introduces no new race window at all; a synchronous compute-and-store has no yield point for anything else to interleave through. All three call sites for the same `targetId` now share one cache entry, not just each independently avoiding its own redundant recompute.
- `previewGenerateCache: Map<string, VersionedEntry<GeneratorOutput[]>>` — `executeFunction` destructures `buildDocuments()`'s `{ version: documentsVersion, value: documents }` and calls `getOrComputeAsync(previewGenerateCache, 'generate:typescript', () => documentsVersion, () => generate(documents, { target: 'typescript' }))`, then finds the requested function by name via a small loop over the (now-cached) `results[].funcs`. This replaces `cachedFuncCode` entirely — no separate persistent name-indexed map is kept; rebuilding the lookup from the cached array on each call is cheap (an in-memory loop, no re-generation, no re-parsing) since the expensive step is what's actually cached.

### Codegen domain (`codegenFilesVersion`, new)

Bumped in the `codegen:setFiles` handler only, mirroring exactly how `previewFilesVersion` is bumped in `preview:setFiles`. `codegen:generate` (which can change only `target`, not `currentCodegenFiles`) never bumps it — switching targets on the same files reuses whatever's already cached for a previously-generated target.

`codegenGenerateCache: Map<string, VersionedEntry<GeneratorOutput[]>>`, keyed by `target`. `runCodegen` captures `const documentsVersion = codegenFilesVersion` before its own `await builder.build(...)` (mirroring `buildDocuments()`'s own guard — a `codegen:setFiles` arriving while that build is suspended must not let the resulting documents be tagged with the now-current counter), then calls `getOrComputeAsync(codegenGenerateCache, target, () => documentsVersion, () => generate(documents, { target }))`.

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
7. **Post-implementation (PR #475 review):** the initial `getOrComputeAsync` (re-checking `getVersion()` after `compute()` resolves) turned out to be insufficient for a downstream cache tagged with an already-fixed version rather than a live counter — see the Architecture section above, now updated to the corrected primitive. The implementation plan's own Task 1-3 code blocks were intentionally left as originally written (historically accurate to what each task shipped at the time) rather than rewritten to match; it carries a pointer note to this design instead.
