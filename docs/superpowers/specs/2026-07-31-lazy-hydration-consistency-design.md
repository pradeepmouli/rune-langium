<!-- SPDX-License-Identifier: FSL-1.1-ALv2 -->
<!-- Copyright (c) 2026 Pradeep Mouli -->

# Consistent Lazy-Hydration Resolution Across Consumers — Design

**Status:** Approved (design); implementation plan pending.
**Scope:** `apps/studio` (FSL-1.1-ALv2) — codegen worker, parser worker, `CodegenProvider`, `ExplorePerspective`. Consumes (does not modify the public shape of) `packages/visual-editor`'s `editor-store.ts` (MIT).
**Originating bug report:** task #34 ("Fix Form Preview false-unresolved references"), root-caused 2026-07-31 via live reproduction on production + code research.
**Extends/completes:** `docs/superpowers/specs/2026-05-25-curated-on-demand-hydration-design.md`'s deferred "Trigger A" (worker-side re-link fixpoint loop).

## Goal

Make lazy hydration of curated corpus namespaces work consistently for every consumer that can hit a reference into a not-yet-hydrated namespace — Form Preview, codegen/code-export generation, inheritance/`extends` resolution, and the main Structure/Inspector path — instead of only working when a user happens to have directly browsed to the referenced type first.

## Background / Root Cause

Confirmed by live reproduction on the production site (`fpml.consolidated.shared.Party` → `Scheme` → `NormalizedString` reference chain) and by reading the relevant code, this is two compounding defects:

1. **Nobody requests hydration on failure.** `apps/studio/src/shell/providers/CodegenProvider.tsx:131` filters any curated namespace that hasn't been hydrated yet (`refOnly && !serializedModelJson`) out of the file set sent to the codegen/preview worker. Hydration is only ever triggered by `apps/studio/src/shell/ExplorePerspective.tsx:1044,1058,1095`, all gated on direct node selection/navigation ("Trigger B" in the 2026-05-25 design). Form Preview, codegen, and inheritance resolution are all passive consumers of whatever's already been browsed — never triggers.

2. **Even when hydration does arrive later, nothing relinks already-failed references.** `apps/studio/src/workers/codegen-worker.ts`'s `buildDocuments()` registers curated documents via `hydrateModelDocument(..., { register: 'idempotent' })`. Per `packages/core/src/serializer/hydrate-model-document.ts:46-52`, an idempotent register on a URI that's already registered returns the **existing** document object verbatim — including every `Reference` proxy's already-cached resolution attempt, success or failure — with no relink. So once a document's cross-reference fails to link (because its target wasn't yet registered), it stays broken forever, even after the target namespace is separately hydrated. This was verified live: hydrating `NormalizedString` directly did not retroactively fix `Scheme`'s already-broken reference to it; a document parsed *after* its dependency was already hydrated linked correctly on the first try. Order of navigation determines success or failure today.

The 2026-05-25 design already specced the fix for defect #1 — a worker-side re-link fixpoint loop ("Trigger A") — but deferred it, reasoning that since `closeNamespacesFromManifest` walks a namespace's transitive deps server-side, hydrating a browsed namespace already pulls in what it needs, making the loop "largely redundant." That reasoning holds for the parser-worker/Structure path (which Trigger B already serves) but not for the codegen/preview worker, which has its own entirely separate document set assembled by `CodegenProvider.tsx` — a gap the original design didn't anticipate. Defect #2 (the `idempotent`-register staleness bug) is new information this design surfaces; the 2026-05-25 design didn't need to address it because it never got past the "deferred" stage.

## Constraints (inherited from the 2026-05-25 design, unchanged)

- **No browser-side corpus fetch.** All hydration remains server-mediated through `/api/parse`'s `hydrateNamespaces`.
- **Synchronous linker.** Relinking must be triggered by explicitly rebuilding/invalidating documents after hydrated content arrives — not mid-link.
- **No whole-bundle work per request.** Hydration stays per-namespace; each round requests only what that round discovered it needs (see Data Flow) — no eager transitive-closure prefetch.
- **Reuse, don't duplicate.** `hydratedNamespaces`, `pendingHydrationNamespaces`, `hydrationNonce`, `requestNamespaceHydration`, `markNamespacesHydrated` (all in `packages/visual-editor/src/store/editor-store.ts`) are the existing source of truth for hydration bookkeeping and are consumed as-is, not reimplemented.

## Architecture

A new shared module, `apps/studio/src/services/hydration-orchestrator.ts`, is the single place that turns "a consumer hit an unresolved reference against a namespace it doesn't have" into a hydration request and a bounded retry. It does not replace any existing state — it is the missing caller that lets *workers* reach `requestNamespaceHydration`, and the missing subscriber that reacts when `hydrationNonce` bumps.

Two worker-side capabilities are new:

- **Parser worker** (`apps/studio/src/workers/parser-worker.ts`) gains the unresolved-reporting half of the deferred "Trigger A": after a link pass, it reports which curated namespaces remain unresolved, in addition to today's browse-driven Trigger B.
- **Codegen worker** (`apps/studio/src/workers/codegen-worker.ts`) gains the same reporting capability for Form Preview/codegen/inheritance, plus the actual fix for defect #2: it tracks, per registered curated document URI, which target names it last failed to resolve. On being told namespaces have hydrated, it calls `documentBuilder.update(affectedUris, [])` — Langium's API for "these documents' dependencies changed, relink them" — for exactly the affected documents, instead of relying on idempotent re-registration to self-heal.

`CodegenProvider.tsx` and `ExplorePerspective.tsx` both become thin callers of the orchestrator instead of each owning separate retry logic. `ExplorePerspective`'s existing Trigger B call sites route through the orchestrator so retry-count/cap bookkeeping is centralized in one place, not duplicated.

## Components & Changes

1. **New** `apps/studio/src/services/hydration-orchestrator.ts` — framework-agnostic, unit-testable in isolation. Exposes something like `requestHydration(namespace, { retryFor: targetId })` and a subscription for "namespace X is now hydrated, retry your targets."
2. `packages/visual-editor/src/store/editor-store.ts` — no interface changes; existing hydration primitives are consumed, not modified.
3. `apps/studio/src/workers/parser-worker.ts` — implement the unresolved-curated-refs reporting the 2026-05-25 design specced as `collectUnresolvedCuratedRefs` (or equivalent), wired to fire after every link pass, not only on demand.
4. `apps/studio/src/workers/codegen-worker.ts` —
   - Track registered curated document URIs → last-seen unresolved target names.
   - New message handling (e.g. `preview:relink` / `codegen:relink`): on receipt, call `documentBuilder.update(affectedUris, [])` for the affected documents, then re-run generation for the pending target(s).
   - Emit `preview:unresolved` / `codegen:unresolved` messages (`{ requestId, targetId, unresolvedNamespaces: string[] }`) when a generation pass produces diagnostics that map to known-curated-but-unhydrated namespaces (vs. genuinely unknown names, which are not retried).
5. `apps/studio/src/shell/providers/CodegenProvider.tsx` — wire worker `*:unresolved` messages into the orchestrator; track a small "pending retry targets" set; on `hydrationNonce` change, post `*:relink` and re-generate for the *originally failing* target(s), not just whatever's currently selected (the exact gap that left `Scheme` broken in the live repro even after `NormalizedString` was separately hydrated).
6. `apps/studio/src/shell/ExplorePerspective.tsx` — route existing Trigger B calls through the orchestrator; consume the parser worker's new Trigger-A unresolved report.
7. **UI:** per-node/per-field hydrating indicator. The affected reference specifically (not the whole panel) shows an inline "resolving…" state, reusing the existing curated-namespace hydrating-spinner visual pattern (PR #250), replacing the current "could not be resolved" text while a retry is in flight, and reverting to a genuine unresolved-diagnostic only after the retry cap is exhausted.

## Data Flow

Traced through the reproduced case (`Party` → `Scheme` → `NormalizedString`):

```
Scheme's preview generation fails
  └─ codegen-worker emits preview:unresolved
       { targetId: 'Scheme', unresolvedNamespaces: ['fpml.consolidated.shared.<ns>'] }
  └─ CodegenProvider → orchestrator.requestHydration(ns, { retryFor: 'Scheme' })
       orchestrator: dedupe vs hydratedNamespaces/pendingHydrationNamespaces
                     increment Scheme's retry counter (1/5)
                     requestNamespaceHydration(ns)                      # existing, unchanged
  └─ existing App.tsx effect hydrates → markNamespacesHydrated([ns]) → hydrationNonce++
  └─ CodegenProvider's existing files-sync effect resends preview:setFiles (already
     depends on `files`, unchanged) — now includes the hydrated namespace's content
  └─ orchestrator's hydrationNonce subscriber finds Scheme pending
       → posts preview:relink { uris: [schemeUri] }
  └─ codegen-worker: documentBuilder.update([schemeUri], [])   # invalidates cached refs
                      re-run preview:generate for Scheme
  └─ NormalizedString now registered and linkable → Scheme resolves → preview:result
     UI hydrating indicator clears
```

If a retry round still reports an unresolved namespace (a deeper transitive dependency), the same loop repeats with the newly-reported namespace, up to the per-target cap. Each round requests exactly what that round discovered — no eager whole-closure prefetch, satisfying the "separate hydration requests as the transitive closure is navigated" requirement directly.

## Error Handling

- **Retry cap:** 5 attempts per target (matches the 2026-05-25 design's fixpoint cap). On exceeding the cap, or if a requested namespace never appears in a subsequent `hydratedNamespaces` update after several rounds (e.g. an off-manifest name the server silently ignored, per existing behavior), the orchestrator stops retrying and the real "could not be resolved" diagnostic stands.
- **UI distinction:** "still resolving (retry N/5)" vs. "unresolved" (cap exhausted or genuinely unknown name) are shown differently so a real typo/missing-type error doesn't read as a stuck spinner.
- **Fetch/worker failure:** falls back to existing, unchanged error paths (`CuratedBundleUnavailableError`, router fallback); the orchestrator simply stops waiting on that target, same as hitting the cap.
- **Concurrent consumers** needing the same namespace (e.g. Form Preview and Inspector both missing the same type around the same time) are already deduped by `pendingHydrationNamespaces`/`hydratedNamespaces`; the orchestrator lets multiple targets subscribe to one in-flight request rather than issuing duplicates.

## Testing

- `hydration-orchestrator.test.ts` (new, unit): dedupe against existing hydrated/pending state; cap enforcement; multiple targets waiting on one namespace; `hydrationNonce`-triggered retry firing.
- `codegen-worker.test.ts`: register a document with an unresolved curated reference, simulate `preview:relink` after its dependency becomes available, assert `documentBuilder.update` is called with the correct URI and the second generation attempt succeeds. This is the regression test proving the `register: 'idempotent'` staleness bug (defect #2) is fixed.
- `parser-worker.test.ts`: analogous test for the new Trigger-A unresolved-reporting.
- `CodegenProvider.test.tsx`: simulate `preview:unresolved` → assert `requestNamespaceHydration` fires → simulate `markNamespacesHydrated` → assert `*:relink` and regeneration is posted for the *originally failing* target, not just whatever happens to be currently selected.
- **Live verification** once implemented: re-run the `Party` → `Scheme` → `NormalizedString` repro on prod/preview via browser automation, confirming the reference resolves without requiring a manual prior visit to `NormalizedString`.

## Non-Goals

- Changing the artifact format, manifest schema, or server-side `/api/parse` hydration mechanics (already correct; this design only changes who calls into it and how relinking is triggered client-side).
- Cross-session persistence of hydrated namespaces (per-session is sufficient, per the 2026-05-25 design).
- Background pre-warming / speculative hydration of namespaces not yet needed by any consumer.
- Reworking `ExplorePerspective`'s Structure/Inspector rendering beyond routing its existing hydration trigger through the shared orchestrator.

## Licensing

Files under `apps/studio/` (all new/changed files in this design) carry the FSL-1.1-ALv2 SPDX header. `packages/visual-editor/src/store/editor-store.ts` is consumed read-only (MIT, unchanged).
