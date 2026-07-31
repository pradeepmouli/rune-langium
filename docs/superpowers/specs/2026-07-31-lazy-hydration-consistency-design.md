<!-- SPDX-License-Identifier: FSL-1.1-ALv2 -->
<!-- Copyright (c) 2026 Pradeep Mouli -->

# Consistent Lazy-Hydration Resolution Across Consumers — Design

**Status:** Approved (design, revision 2 — see Revision History); implementation plan pending revision.
**Scope:** `apps/studio` (FSL-1.1-ALv2) — codegen worker, `CodegenProvider`, `ExplorePerspective`. Consumes (does not modify the public shape of) `packages/visual-editor`'s `editor-store.ts` (MIT) and `packages/core`'s `hydrate-model-document.ts` (MIT).
**Originating bug report:** task #34 ("Fix Form Preview false-unresolved references"), root-caused 2026-07-31 via live reproduction on production + code research.
**Extends:** `docs/superpowers/specs/2026-05-25-curated-on-demand-hydration-design.md`'s deferred "Trigger A" concept — reused only where a live gap is confirmed (see §Structure/Inspector Path below); reuses the ALREADY-IMPLEMENTED `hydrateModelDocuments` relink mechanism from that same era rather than inventing a new one.

## Revision History

- **Revision 1** (2026-07-31, superseded): proposed a new `documentBuilder.update()`-based relink triggered by new `preview:relink`/`codegen:relink` worker messages, plus a parser-worker "Trigger A" surfaced through a new browser-side message channel to `ExplorePerspective`.
- **Revision 2** (this revision): rewritten after an adversarial review (Fable model) found Revision 1's core mechanism does not work — `documentBuilder.update()` throws in this worker (no filesystem, no CST on deserialized docs) and would violate the "no whole-bundle work" constraint even if it didn't throw — and found the parser-worker Trigger A premise was built on a browser-side message channel that doesn't exist (`ExplorePerspective` never receives direct worker messages). This revision replaces the relink mechanism with `packages/core/src/serializer/hydrate-model-document.ts`'s **already-existing** `hydrateModelDocuments()` batch relink function (used today by `apps/studio/functions/api/codegen.ts`), and narrows the Structure/Inspector-path work to verification rather than speculative new machinery, per findings below.

## Goal

Make lazy hydration of curated corpus namespaces work consistently for every consumer that can hit a reference into a not-yet-hydrated namespace. Confirmed in scope: Form Preview, codegen/code-export generation, and inheritance/`extends` resolution (all three share the codegen/preview worker's document store). The Structure/Inspector path is investigated but not assumed to need the same fix — see below.

## Background / Root Cause

Confirmed by live reproduction on the production site (`fpml.consolidated.shared.Party` → `Scheme` → `NormalizedString` reference chain) and by reading the relevant code — verified twice, once during initial root-causing and again during adversarial review — this is two compounding defects in the **codegen/preview worker** (`apps/studio/src/workers/codegen-worker.ts`):

1. **Nobody requests hydration on failure.** `apps/studio/src/shell/providers/CodegenProvider.tsx:131` filters any curated namespace that hasn't been hydrated yet (`refOnly && !serializedModelJson`) out of the file set sent to the codegen/preview worker. Hydration is only ever triggered by `apps/studio/src/shell/ExplorePerspective.tsx:1044,1058,1095` (`handleExplorerSelectNode`, `handleToggleNamespace`, `navigateToNode`), all gated on direct node selection/navigation ("Trigger B" in the 2026-05-25 design). Form Preview, codegen, and inheritance resolution are all passive consumers of whatever's already been browsed — never triggers.

2. **Even when hydration does arrive later, `buildDocuments()`'s per-entry curated-document registration never relinks.** `codegen-worker.ts:261-274` registers each curated document via `hydrateModelDocument(services, uri, json, { register: 'idempotent' })`, once per curated file, in a loop. Per `packages/core/src/serializer/hydrate-model-document.ts:46-52`, an idempotent register on a URI that's already registered returns the **existing** document object verbatim — including every `Reference` proxy's already-cached resolution attempt, success or failure — with no relink. So once a document's cross-reference fails to link (because its target wasn't yet registered), it stays broken forever, even after the target namespace is separately hydrated. This was verified live: hydrating `NormalizedString` directly did not retroactively fix `Scheme`'s already-broken reference to it; a document parsed *after* its dependency was already hydrated linked correctly on the first try. Order of navigation determines success or failure today.

**The fix for defect #2 already exists in this codebase and is unused by the worker.** `packages/core/src/serializer/hydrate-model-document.ts:130-168` exports `hydrateModelDocuments(services, entries)` — a **batch** version that, for the same `entries` set, does a bounded multi-round *delete-then-re-add* fixpoint: each round deserializes every entry fresh and swaps it into the document registry, so `Reference` proxies are always new objects with no stale cached failure, and later rounds see earlier rounds' newly-registered siblings. This is already used in production, server-side, by `apps/studio/functions/api/codegen.ts`'s `loadAllDocuments`. `buildDocuments()` should call this instead of looping the single-entry `hydrateModelDocument(..., {register: 'idempotent'})` — this is a straightforward case of this repo's #1 rule (DRY: don't hand-roll a second approximation of an existing, working implementation).

### Structure/Inspector Path

Investigated but **not confirmed to share defect #2**. The parser worker's hydrate handler (`apps/studio/src/workers/parser-worker.ts:422-465`, `handleHydrate`) has **full-replacement semantics**: every `hydrate` call deletes every previously-registered `LangiumDocument`, clears every index export, clears `deferredModelJson` entirely, then re-registers the full cumulative set fresh. Combined with `RuneDslLinker.loadAstNode` (`packages/core/src/services/rune-dsl-linker.ts:39-57`) lazily materializing curated docs on `.ref` access, every hydration round starts from a clean slate — there is no per-entry idempotent-reuse path to go stale the way `codegen-worker.ts`'s does. Whether a real gap exists for this path (e.g. an Inspector rendering an attribute reference into a namespace nobody has browsed, where the existing `$refText` fallback per ADR 007 may already degrade acceptably) is **unconfirmed** and is a verification step (see Testing), not something this design builds speculative machinery for. Building an unconfirmed fix would violate this repo's YAGNI convention.

## Constraints

- **No browser-side corpus fetch.** All hydration remains server-mediated through `/api/parse`'s `hydrateNamespaces`.
- **No whole-bundle work per request.** Each retry round requests only the namespace(s) that round discovered it needs — never a speculative eager prefetch of a whole transitive closure. (This constraint is also why `documentBuilder.update()` was rejected in Revision 1: it would force-rebuild the *entire* registered curated set, since every curated document in this worker is `addDocument`ed but never independently built/validated.)
- **Reuse, don't duplicate.** `hydratedNamespaces`, `pendingHydrationNamespaces`, `hydrationNonce`, `requestNamespaceHydration`, `markNamespacesHydrated` (all in `packages/visual-editor/src/store/editor-store.ts`) are the existing source of truth for hydration bookkeeping and are consumed as-is. `hydrateModelDocuments` (`packages/core`) is the existing source of truth for relinking a batch of curated documents and is consumed as-is, not reimplemented via `documentBuilder.update()`.
- **`useEditorStore` is plain Zustand + `temporal` (zundo)**, not wrapped in `subscribeWithSelector` — any subscription must use the vanilla single-argument `subscribe(listener: (state, prevState) => void)` form and diff manually; passing a selector as a second argument is silently a no-op.

## Architecture

A new framework-agnostic `HydrationOrchestrator` is the single place that turns "a consumer hit an unresolved reference against a namespace it doesn't have" into a deduped, capped hydration request against the existing `editor-store.ts` primitives, and notifies the consumer to retry once the namespace is confirmed hydrated. It does not replace any existing state — it is the missing caller that lets consumers reach `requestNamespaceHydration`, and the missing subscriber that reacts once hydration completes.

**The relink fix lives entirely inside `buildDocuments()`.** Once it calls `hydrateModelDocuments()` instead of the per-entry idempotent loop, every `runPreview`/`runCodegen`/`runInstanceSchema` call (they all call `buildDocuments()` — confirmed for all three) automatically produces a correctly-relinked document set from whatever's currently in `currentPreviewFiles`/`currentCodegenFiles`. **No new worker message types are needed.** The only thing still required from `CodegenProvider` is: detect an unresolved reference in a `preview:result`, ask the orchestrator to hydrate the owning namespace, and — once hydrated — re-post the **existing** `preview:generate` message for that specific target (not rely on "whatever's currently selected," since the worker's existing "re-run last target on `setFiles`" behavior only covers the case where the user hasn't navigated away).

`CodegenProvider.tsx` and `ExplorePerspective.tsx` both become thin callers of the orchestrator instead of each owning separate retry logic. `ExplorePerspective`'s existing Trigger B call sites route through the orchestrator so retry-count/cap bookkeeping is centralized in one place — this is worth doing for consistency (DRY) even though, per the investigation above, this path may not currently need the retry behavior to fire in practice.

**Lifecycle:** the orchestrator instance must be created and disposed inside a mount `useEffect`, not lazily on first render via a ref — React 19's `<StrictMode>` (used in `apps/studio/src/main.tsx`) double-invokes effects in development, and a render-time-created, effect-time-disposed instance leaves a *disposed* orchestrator sitting in the ref after the first mount/unmount/remount cycle, silently breaking every subsequent retry in dev.

## Components & Changes

1. **New** `apps/studio/src/services/hydration-orchestrator.ts` — framework-agnostic, unit-testable in isolation. Exposes `requestHydration(namespace, {retryFor: {targetId, onRetry}})`, `markResolved(targetId)` (resets a target's attempt counter on success, so an unrelated later failure for the same target isn't pre-penalized by an earlier episode), `getRemainingAttempts(targetId)`, and `dispose()`.
2. `packages/visual-editor/src/store/editor-store.ts` — no interface changes; existing hydration primitives are consumed, not modified.
3. `apps/studio/src/workers/codegen-worker.ts` — `buildDocuments()`'s curated-entry loop (lines 261-274) is replaced with a single `hydrateModelDocuments(services, entries)` batch call. **Trade-off, deliberately accepted:** the current per-entry `try/catch` (skip one bad curated doc, keep the rest) is lost — `hydrateModelDocuments` does not catch per-entry deserialize errors. The replacement wraps the *whole batch* in one `try/catch` (skip all curated docs for this build on any failure, log a warning) rather than silently losing error isolation; if this proves too coarse in practice (one malformed curated doc blocking preview for everything), a follow-up can add per-entry isolation to `hydrateModelDocuments` itself in `packages/core` — not duplicated locally.
4. `apps/studio/src/shell/providers/CodegenProvider.tsx` — on `preview:result`, detect `unresolved-reference:<name>` entries in `schema.unsupportedFeatures`, map each `name` to a namespace via `deferredExports` (from `useWorkspace()`), call the orchestrator, and on retry re-post `preview:generate` for the specific `targetId` that failed (not a new message type). On a `preview:result` with **no** unresolved-reference features for a target, call `orchestrator.markResolved(targetId)`. Codegen-path (`codegen:error`) unresolved-reference detection is **out of scope for this iteration** — see Non-Goals.
5. `apps/studio/src/shell/ExplorePerspective.tsx` — route the 3 existing `requestNamespaceHydration` call sites through the orchestrator (dedup/cap consistency). No new message consumption.
6. **UI:** a per-target "resolving…" state in `FormPreviewPanel.tsx`, replacing the "could not be resolved" text for a target while a retry is in flight, reverting to the real diagnostic once the retry cap is exhausted. This is per-*target* granularity (not per-individual-unresolved-reference-name within a multi-reference target) — a deliberate scope decision: the common case (a type alias with one reference) gets exact per-reference behavior for free, and a Data type with multiple simultaneously-unresolved fields shows one aggregate "resolving" state for the whole target rather than independent per-field counters, which would require threading per-reference-name attempt tracking through the orchestrator for a rare case.

## Data Flow

Traced through the reproduced case (`Party` → `Scheme` → `NormalizedString`):

```
Scheme's preview generation returns status: 'unsupported',
  unsupportedFeatures: ['unresolved-reference:NormalizedString']
  └─ CodegenProvider maps 'NormalizedString' → namespace via deferredExports
  └─ orchestrator.requestHydration(ns, { retryFor: { targetId: 'Scheme', onRetry } })
       dedupe vs hydratedNamespaces/pendingHydrationNamespaces; attempt 1/5
       requestNamespaceHydration(ns)                          # existing, unchanged
  └─ existing App.tsx effect hydrates → markNamespacesHydrated([ns]) → hydrationNonce++
  └─ orchestrator's manual hydrationNonce-diff subscriber sees the change,
     finds Scheme waiting on ns (now in hydratedNamespaces) → calls onRetry()
  └─ onRetry posts the EXISTING preview:generate message for targetId: 'Scheme'
  └─ worker's runPreview → buildDocuments() → hydrateModelDocuments() now
     includes NormalizedString's content in this round → relinks correctly
  └─ Scheme resolves → preview:result with no unresolved-reference features
     → CodegenProvider calls orchestrator.markResolved('Scheme')
     → UI hydrating indicator clears
```

If a retry round still reports an unresolved namespace (a deeper transitive dependency), the same loop repeats with the newly-reported namespace, up to the per-target cap. Each round requests exactly what that round discovered — no eager whole-closure prefetch.

## Error Handling

- **Retry cap:** 5 attempts per target, chosen independently for this browser-side orchestrator layer (not derived from the 2026-05-25 design, which specified an unspecified/prose-only cap for its own, different, worker-internal fixpoint loop; `hydrateModelDocuments`'s own `MAX_RELINK_ROUNDS` is a separate, lower-level bound of 8 rounds within a single relink call). The orchestrator's attempt counter increments on every `requestHydration` call for a target, including when the namespace is already (or falsely-appears) hydrated — this means the cap is also what bounds the case where the server silently ignores an off-manifest namespace name: `App.tsx`'s existing hydrate effect calls `markNamespacesHydrated(pendingHydration)` unconditionally on any successful parse response, regardless of whether the server actually returned data for every requested name, so a genuinely-unresolvable name still gets marked "hydrated" and the orchestrator's cap (not a separate timeout mechanism) is what stops the resulting retry loop after 5 attempts.
- **Attempt reset on success:** `orchestrator.markResolved(targetId)` resets that target's attempt counter to 0, so a target that failed 3 times, succeeded, and later independently fails again for an unrelated reason gets a fresh budget rather than inheriting the earlier episode's spent attempts.
- **UI distinction:** "still resolving (retry N/5)" vs. "unresolved" (cap exhausted) are shown differently so a real typo/missing-type error doesn't read as a stuck spinner.
- **Fetch/worker failure:** falls back to existing, unchanged error paths; the orchestrator simply stops waiting on that target, same as hitting the cap.
- **Concurrent consumers** needing the same namespace are already deduped by `pendingHydrationNamespaces`/`hydratedNamespaces`; the orchestrator lets multiple targets subscribe to one in-flight request rather than issuing duplicates.

## Testing

- `hydration-orchestrator.test.ts` (new, unit): dedupe, cap enforcement, `markResolved` reset, multiple targets waiting on one namespace, manual-diff nonce-subscription retry firing.
- Codegen-worker regression test proving the relink fix: exercised against a **lighter, more honest** mock than the existing fully-stubbed `DocumentBuilder`/`LangiumDocumentFactory`/`LangiumDocuments` scaffold in `codegen-worker.test.ts` (which would hide this exact bug class behind mocks) — matching the registered-`Map`-plus-`deserialize` style already used in `packages/core/test/serializer/hydrate-model-document.test.ts`, whose own doc comment states the real Langium contract this bug depends on: *"resolved at deserialize time against whatever is registered right now — never re-checked later."*
- `CodegenProvider.test.tsx`: simulate a `preview:result` with `unresolved-reference:`, assert `requestNamespaceHydration` fires, simulate `markNamespacesHydrated`, assert a fresh `preview:generate` is posted for the originally-failing target.
- **Structure/Inspector verification (not a fix — a check):** before writing any new parser-worker/ExplorePerspective code beyond routing Trigger B through the orchestrator, reproduce live whether viewing a type whose attribute references an unhydrated type *two levels deep* (without the user directly browsing the intermediate type) actually shows a broken/confusing result, or whether the existing `$refText` fallback (ADR 007) already degrades acceptably. Only add Structure/Inspector-specific hydration-request logic if this repro finds a real, user-visible gap.
- **Live verification** once implemented: re-run the `Party` → `Scheme` → `NormalizedString` repro on prod/preview, confirming the reference resolves without requiring a manual prior visit to `NormalizedString`.

## Non-Goals

- Codegen-path (`codegen:error`) unresolved-reference detection. Unresolved references during codegen generation are today non-fatal `z.unknown()` fallbacks that surface via `codegen:result` (which does not carry diagnostic information), not `codegen:error` (which only fires when generation produces no output at all) — there is currently no channel carrying unresolved-name diagnostics out of the codegen path the way `preview:result`'s `unsupportedFeatures` does for Form Preview. The underlying *data* is still fixed by the `buildDocuments()` relink fix (codegen shares the same worker document store), so exported code will be correct once the relevant namespace is hydrated via any path (typically Form Preview, previewed before export) — only the UI-level proactive-retry behavior is out of scope here. A follow-up could thread diagnostic info onto `codegen:result` if this proves to matter in practice.
- Speculative Structure/Inspector-path hydration-request machinery beyond routing the existing Trigger B calls through the shared orchestrator, unless the verification step above finds a real gap.
- Changing the artifact format, manifest schema, or server-side `/api/parse` hydration mechanics.
- Cross-session persistence of hydrated namespaces (per-session is sufficient, per the 2026-05-25 design).
- Background pre-warming / speculative hydration of namespaces not yet needed by any consumer.

## Licensing

Files under `apps/studio/` (all new/changed files in this design) carry the FSL-1.1-ALv2 SPDX header. `packages/visual-editor/src/store/editor-store.ts` and `packages/core/src/serializer/hydrate-model-document.ts` are consumed read-only (MIT, unchanged).
