# Codegen Worker Document Cache Design

**Goal:** Cache `apps/studio/src/workers/codegen-worker.ts`'s `buildDocuments()` result so it stops re-parsing and re-linking `currentPreviewFiles` from scratch on every single call — today it recomputes unconditionally on every call, including on every keystroke-triggered `instance:validate`, with zero caching.

**Architecture:** A single `previewFilesVersion` counter, bumped exactly where `currentPreviewFiles` is reassigned (the `preview:setFiles` handler — its only assignment site in this file), backs a one-slot cache for `buildDocuments()`'s result. A cache hit returns the same array immediately; a cache miss recomputes and repopulates it, exactly as today.

**Tech Stack:** TypeScript, the existing `codegen-worker.ts` module-level state.

## Background

`buildDocuments()` parses (`factory.fromString` + `builder.build`) every non-curated file in `currentPreviewFiles` and hydrates every curated file, on every call, with no memoization. It backs `validateInstance` (structural + condition validation, dispatched on every field edit via `instance-store.ts`'s `dispatchValidate`, itself unconditional and un-debounced), `runInstanceSchema`, and `runPreview`/`generatePreviewSchemas`. Confirmed via direct read: `currentPreviewFiles` has exactly one assignment site in the whole file (`preview:setFiles`'s handler), and `buildDocuments()` has no cache check at all — it re-does the full parse/link/hydrate pass every time it's called, even when `currentPreviewFiles` hasn't changed since the last call.

This was found while designing `docs/superpowers/specs/2026-08-06-retire-preview-validator-design.md`, which adds a new, more expensive per-call step (`compileStandaloneValidator`: real-schema closure walk + emit + TS strip + `new Function` compile) on top of this same uncached path. Rather than caching only that new step, this is split out as its own spec: the uncached-parse cost predates that work, affects every existing `buildDocuments()` consumer today, and is worth fixing at its root regardless of whether the validator-retirement work ships.

## Scope

**In scope:** caching `buildDocuments()`'s own result.

**Out of scope:**

- Caching anything driven by `currentCodegenFiles` (`cachedFuncCode`, the `codegen:generate`/`codegen:setFiles` path) — a separate, already-partially-cached concern, unrelated to `currentPreviewFiles`.
- Caching `compileStandaloneValidator`'s own result (structural-validator-retirement's own concern; that design's cache layers on top of the same `previewFilesVersion` counter this spec introduces, keyed separately by `typeFqn`).
- Solving the race window described below — accepted for this iteration, noted as a candidate follow-up only if it proves to matter in practice.

## Architecture

New module-level state:

```ts
let previewFilesVersion = 0;
let documentsCache: { version: number; documents: LangiumDocument[] } | undefined;
```

`previewFilesVersion` is incremented at the top of the `preview:setFiles` handler, right where `currentPreviewFiles = msg.files` is set — the single point where the underlying file set can change.

`buildDocuments()` gains a cache check as its first step:

```ts
async function buildDocuments(): Promise<LangiumDocument[]> {
  if (documentsCache && documentsCache.version === previewFilesVersion) {
    return documentsCache.documents;
  }
  // ...existing parse/link/hydrate logic, unchanged...
  documentsCache = { version: previewFilesVersion, documents };
  return documents;
}
```

Every existing early-return (`currentPreviewFiles.length === 0` → `[]`, `userDocuments.length === 0` after filtering) is left as-is; only the top-of-function cache check and the final cache-populate assignment are new. A cache hit skips `factory.fromString`, `builder.build`, and curated-document hydration entirely — the exact work this function otherwise redoes on every call.

**Known accepted gap:** `buildDocuments()` is `async` and yields at its `await builder.build(...)` point. Two calls issued close together (e.g. two `instance:validate` messages arriving before either resolves) can both observe a cache miss before either populates `documentsCache`, causing duplicate parse work in that race window. This is not a correctness issue — both calls still produce a correct (if redundant) result, and whichever finishes last simply overwrites `documentsCache` with an equivalent value — and it's no worse than today's unconditional-recompute-every-time baseline. Not solved here (e.g. via in-flight-promise memoization); worth revisiting only if profiling shows it matters in practice.

## Files touched

- `apps/studio/src/workers/codegen-worker.ts` only — `previewFilesVersion`/`documentsCache` module state, the `preview:setFiles` handler's version bump, and `buildDocuments()`'s cache check/populate. No other file changes.

## Testing

- `buildDocuments()` returns the exact same array reference on a second call with no intervening `preview:setFiles` message (cache hit — proves no re-parse happened, not just an equal-by-value result).
- `buildDocuments()` returns a freshly-parsed (different reference, correct new content) result after a `preview:setFiles` message changes the file set (cache correctly invalidated).
- A no-op `preview:setFiles` (same file contents resent) still invalidates the cache — this spec bumps the version on every `preview:setFiles` call unconditionally, not on a content-diff, so this is expected/by-design behavior, but worth a test asserting it explicitly so it doesn't read as a bug later.
- Existing `validateInstance`/`runInstanceSchema`/`runPreview` test coverage continues to pass unchanged (this is purely an internal optimization — none of their observable behavior changes).

## Decisions made during design

1. **A single monotonic counter, not content hashing.** `currentPreviewFiles` already has exactly one assignment site; bumping a counter there is the simplest possible invalidation trigger and requires no hashing of file contents. Rejected content-hashing as unnecessary complexity for a state transition that's already fully observable at one call site.
2. **The race window between concurrent uncached calls is accepted, not solved**, for this iteration — it's a wasted-work concern, not a correctness one, and no worse than the current always-recompute baseline. Revisit only if profiling shows it matters.
3. **Split out as its own spec** rather than folded into the structural-validator-retirement design — it's independently useful (every existing `buildDocuments()` consumer benefits today, not just future work) and independently shippable.
