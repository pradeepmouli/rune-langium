<!-- SPDX-License-Identifier: FSL-1.1-ALv2 -->
<!-- Copyright (c) 2026 Pradeep Mouli -->

# Consistent Lazy-Hydration Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Form Preview, codegen/export generation, and inheritance/`extends` resolution — all three consumers of `apps/studio/src/workers/codegen-worker.ts`'s document store — recover automatically from a reference into a not-yet-hydrated curated namespace, instead of only working when a user happens to have already browsed the referenced type.

**Architecture:** A framework-agnostic `HydrationOrchestrator` (Task 1) turns "a consumer hit an unresolved reference" into a deduped, capped hydration request against the existing `editor-store.ts` primitives. The actual relink fix (Task 2) is inside `codegen-worker.ts`'s `buildDocuments()`: swap its per-entry `hydrateModelDocument(..., {register:'idempotent'})` loop — which silently reuses a stale, already-failed document forever — for the ALREADY-EXISTING batch `hydrateModelDocuments()` from `packages/core`, which does a proper delete-and-re-add relink round every call. `CodegenProvider` (Task 3) wires the two together: detect an unresolved reference in a preview result, ask the orchestrator to hydrate the owning namespace, and re-post the existing `preview:generate` for the specific failing target once hydrated — no new worker message types needed. Task 4 is a verification step, not a blind implementation, for whether the Structure/Inspector path needs anything beyond what it already has. Task 5 routes `ExplorePerspective`'s existing hydration triggers through the orchestrator for consistency. Task 6 adds a per-target "resolving…" UI state. Task 7 verifies live.

**This is Revision 2 of this plan.** Revision 1 was reviewed adversarially (Fable model) and found to rely on a relink mechanism (`documentBuilder.update()`) that throws at runtime in this worker, and a parser-worker→`ExplorePerspective` message channel that does not exist. This revision replaces both. See `docs/superpowers/specs/2026-07-31-lazy-hydration-consistency-design.md`'s Revision History for the full account.

**Tech Stack:** TypeScript 5.9 (strict, ESM), Vitest, Langium 4.3.x, Zustand (`editor-store.ts`, plain `create()` + `temporal`, no `subscribeWithSelector`), React 19 (`<StrictMode>`), Web Workers.

## Global Constraints

- No browser-side corpus fetch — all hydration stays server-mediated through `/api/parse`'s `hydrateNamespaces`.
- No whole-bundle work per request — each retry round requests only the namespace(s) that round discovered it needs.
- Reuse `hydratedNamespaces` / `pendingHydrationNamespaces` / `hydrationNonce` / `requestNamespaceHydration` / `markNamespacesHydrated` in `packages/visual-editor/src/store/editor-store.ts` exactly as they are today — do not change that file's public shape.
- Reuse `hydrateModelDocuments` in `packages/core/src/serializer/hydrate-model-document.ts` exactly as it is today — do not reimplement relink logic locally (this repo's #1 DRY rule; see the incident recorded for `preview-validator.ts` vs. `zod-emitter.ts` in this repo's CLAUDE.md).
- `useEditorStore.subscribe` is vanilla Zustand: `(listener: (state, prevState) => void) => unsubscribe`. It does NOT support a `(selector, callback)` two-argument form — that requires the `subscribeWithSelector` middleware, which this store does not use. Any subscription must diff the field of interest manually inside a single-argument listener.
- Retry cap: 5 attempts per target (`MAX_HYDRATION_RETRIES_PER_TARGET`), reset to 0 on success via `markResolved(targetId)`.
- Orchestrator instances must be created and disposed inside a mount `useEffect`, never lazily on first render via a ref — `apps/studio/src/main.tsx` wraps the app in `<StrictMode>`, which double-invokes effects in development; a render-time-created instance survives StrictMode's extra unmount as a *disposed* object sitting in the ref, silently breaking every subsequent retry.
- All new/modified files under `apps/studio/` carry the `FSL-1.1-ALv2` SPDX header. `packages/` files touched (read-only) are MIT and unmodified by this plan.

---

### Task 1: `HydrationOrchestrator` shared module

**Files:**
- Create: `apps/studio/src/services/hydration-orchestrator.ts`
- Test: `apps/studio/test/services/hydration-orchestrator.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks — this is a leaf module, written against a small `HydrationOrchestratorDeps` interface so it never imports `editor-store.ts` directly. Task 3 and Task 5 supply the real store bindings when they construct it.
- Produces (for Tasks 3 and 5):
  ```ts
  export const MAX_HYDRATION_RETRIES_PER_TARGET = 5;

  export interface HydrationRetryTarget {
    targetId: string;
    onRetry: () => void;
  }

  export interface RequestHydrationOptions {
    retryFor: HydrationRetryTarget;
  }

  export interface HydrationOrchestratorDeps {
    getHydratedNamespaces: () => string[];
    getPendingHydrationNamespaces: () => string[];
    requestNamespaceHydration: (ns: string) => void;
    /** Vanilla single-argument subscribe — caller diffs whatever field it cares about itself and invokes this. */
    subscribeToHydrationChange: (onChange: () => void) => () => void;
  }

  export class HydrationOrchestrator {
    constructor(deps: HydrationOrchestratorDeps);
    requestHydration(namespace: string, options: RequestHydrationOptions): void;
    /** Reset a target's attempt counter to 0 on success, so a later unrelated failure gets a fresh budget. */
    markResolved(targetId: string): void;
    getRemainingAttempts(targetId: string): number;
    dispose(): void;
  }
  ```
  Note the renamed `subscribeToHydrationChange` (was `subscribeToHydrationNonce` in Revision 1): the orchestrator itself no longer assumes a `hydrationNonce` field exists on whatever store it's wired to — the CALLER (Task 3, Task 5) is responsible for diffing its own store's `hydrationNonce` (or `hydratedNamespaces`) inside a vanilla Zustand listener and invoking `onChange()`. This keeps the orchestrator's dependency surface minimal and avoids baking in a Zustand-specific subscribe signature that turned out to be wrong in Revision 1.

- [ ] **Step 1: Write the failing test for dedupe against already-hydrated namespaces**

```ts
// apps/studio/test/services/hydration-orchestrator.test.ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it, vi } from 'vitest';
import {
  HydrationOrchestrator,
  MAX_HYDRATION_RETRIES_PER_TARGET,
  type HydrationOrchestratorDeps
} from '../../src/services/hydration-orchestrator';

function makeDeps(overrides: Partial<HydrationOrchestratorDeps> = {}) {
  const hydrated = new Set<string>();
  const pending = new Set<string>();
  let changeListener: (() => void) | undefined;
  const requestNamespaceHydration = vi.fn((ns: string) => pending.add(ns));
  return {
    hydrated,
    pending,
    requestNamespaceHydration,
    fireChange: () => changeListener?.(),
    deps: {
      getHydratedNamespaces: () => [...hydrated],
      getPendingHydrationNamespaces: () => [...pending],
      requestNamespaceHydration,
      subscribeToHydrationChange: (cb: () => void) => {
        changeListener = cb;
        return () => {
          changeListener = undefined;
        };
      },
      ...overrides
    }
  };
}

describe('HydrationOrchestrator', () => {
  it('does not request hydration for a namespace that is already hydrated', () => {
    const { hydrated, deps, requestNamespaceHydration } = makeDeps();
    hydrated.add('fpml.consolidated.shared.scheme');
    const orchestrator = new HydrationOrchestrator(deps);
    const onRetry = vi.fn();
    orchestrator.requestHydration('fpml.consolidated.shared.scheme', {
      retryFor: { targetId: 'Scheme', onRetry }
    });
    expect(requestNamespaceHydration).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/hydration-orchestrator.test.ts`
Expected: FAIL — `Cannot find module '../../src/services/hydration-orchestrator'`

- [ ] **Step 3: Write the minimal implementation**

```ts
// apps/studio/src/services/hydration-orchestrator.ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

export const MAX_HYDRATION_RETRIES_PER_TARGET = 5;

export interface HydrationRetryTarget {
  /** Opaque id the caller uses to know which of its own retries this is (a preview targetId, etc). */
  targetId: string;
  /** Invoked once per retry attempt after the namespace(s) this target was waiting on have hydrated. */
  onRetry: () => void;
}

export interface RequestHydrationOptions {
  retryFor: HydrationRetryTarget;
}

export interface HydrationOrchestratorDeps {
  getHydratedNamespaces: () => string[];
  getPendingHydrationNamespaces: () => string[];
  requestNamespaceHydration: (ns: string) => void;
  subscribeToHydrationChange: (onChange: () => void) => () => void;
}

export class HydrationOrchestrator {
  private readonly waitingByNamespace = new Map<string, Map<string, HydrationRetryTarget>>();
  private readonly attemptsByTarget = new Map<string, number>();
  private readonly unsubscribe: () => void;

  constructor(private readonly deps: HydrationOrchestratorDeps) {
    this.unsubscribe = deps.subscribeToHydrationChange(() => this.onHydrationChanged());
  }

  requestHydration(namespace: string, { retryFor }: RequestHydrationOptions): void {
    const attempts = this.attemptsByTarget.get(retryFor.targetId) ?? 0;
    if (attempts >= MAX_HYDRATION_RETRIES_PER_TARGET) return;
    this.attemptsByTarget.set(retryFor.targetId, attempts + 1);

    if (this.deps.getHydratedNamespaces().includes(namespace)) {
      // Already hydrated by someone else — retry on the next microtask so
      // callers never re-enter synchronously from inside requestHydration.
      queueMicrotask(() => retryFor.onRetry());
      return;
    }

    let waiters = this.waitingByNamespace.get(namespace);
    if (!waiters) {
      waiters = new Map();
      this.waitingByNamespace.set(namespace, waiters);
    }
    waiters.set(retryFor.targetId, retryFor);

    if (!this.deps.getPendingHydrationNamespaces().includes(namespace)) {
      this.deps.requestNamespaceHydration(namespace);
    }
  }

  markResolved(targetId: string): void {
    this.attemptsByTarget.delete(targetId);
  }

  getRemainingAttempts(targetId: string): number {
    return MAX_HYDRATION_RETRIES_PER_TARGET - (this.attemptsByTarget.get(targetId) ?? 0);
  }

  dispose(): void {
    this.unsubscribe();
    this.waitingByNamespace.clear();
    this.attemptsByTarget.clear();
  }

  private onHydrationChanged(): void {
    const hydrated = new Set(this.deps.getHydratedNamespaces());
    for (const [namespace, waiters] of [...this.waitingByNamespace.entries()]) {
      if (!hydrated.has(namespace)) continue;
      this.waitingByNamespace.delete(namespace);
      for (const target of waiters.values()) target.onRetry();
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/hydration-orchestrator.test.ts`
Expected: PASS

- [ ] **Step 5: Add dedupe/retry/cap/markResolved tests, run, confirm pass**

```ts
  it('requests hydration once, then retries every waiting target when the namespace hydrates', () => {
    const { deps, hydrated, requestNamespaceHydration, fireChange } = makeDeps();
    const orchestrator = new HydrationOrchestrator(deps);
    const onRetryA = vi.fn();
    const onRetryB = vi.fn();
    orchestrator.requestHydration('cdm.base.staticdata.party.Scheme', {
      retryFor: { targetId: 'Scheme', onRetry: onRetryA }
    });
    orchestrator.requestHydration('cdm.base.staticdata.party.Scheme', {
      retryFor: { targetId: 'NonEmptyScheme', onRetry: onRetryB }
    });
    expect(requestNamespaceHydration).toHaveBeenCalledTimes(1);
    expect(requestNamespaceHydration).toHaveBeenCalledWith('cdm.base.staticdata.party.Scheme');

    hydrated.add('cdm.base.staticdata.party.Scheme');
    fireChange();
    expect(onRetryA).toHaveBeenCalledTimes(1);
    expect(onRetryB).toHaveBeenCalledTimes(1);
  });

  it('stops requesting once a target hits the retry cap', () => {
    const { deps, requestNamespaceHydration } = makeDeps();
    const orchestrator = new HydrationOrchestrator(deps);
    for (let i = 0; i < MAX_HYDRATION_RETRIES_PER_TARGET + 2; i++) {
      orchestrator.requestHydration(`ns-${i}`, { retryFor: { targetId: 'Scheme', onRetry: vi.fn() } });
    }
    expect(requestNamespaceHydration).toHaveBeenCalledTimes(MAX_HYDRATION_RETRIES_PER_TARGET);
  });

  it('resets a target attempt counter on markResolved, giving it a fresh budget later', () => {
    const { deps, requestNamespaceHydration } = makeDeps();
    const orchestrator = new HydrationOrchestrator(deps);
    for (let i = 0; i < MAX_HYDRATION_RETRIES_PER_TARGET; i++) {
      orchestrator.requestHydration(`ns-${i}`, { retryFor: { targetId: 'Scheme', onRetry: vi.fn() } });
    }
    expect(orchestrator.getRemainingAttempts('Scheme')).toBe(0);
    orchestrator.markResolved('Scheme');
    expect(orchestrator.getRemainingAttempts('Scheme')).toBe(MAX_HYDRATION_RETRIES_PER_TARGET);
    orchestrator.requestHydration('ns-fresh', { retryFor: { targetId: 'Scheme', onRetry: vi.fn() } });
    expect(requestNamespaceHydration).toHaveBeenCalledWith('ns-fresh');
  });
```

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/hydration-orchestrator.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/services/hydration-orchestrator.ts apps/studio/test/services/hydration-orchestrator.test.ts
git commit -m "feat(studio): add HydrationOrchestrator for consistent lazy-hydration retries"
```

---

### Task 2: Fix `buildDocuments()`'s stale curated-document registration (the mechanical fix)

This is the fix for defect #2: `codegen-worker.ts:261-274` registers each curated document via `hydrateModelDocument(services, uri, json, { register: 'idempotent' })` in a per-entry loop. Per `packages/core/src/serializer/hydrate-model-document.ts:46-52`, an idempotent register on an already-registered URI returns the existing document verbatim — including cached-failed `Reference` resolutions — with no relink, forever. The fix already exists in `packages/core`: `hydrateModelDocuments()` (`hydrate-model-document.ts:130-168`) does a bounded multi-round delete-then-re-add fixpoint over a *batch* of entries, producing fresh `Reference` proxies every call. It is already used in production by `apps/studio/functions/api/codegen.ts`'s `loadAllDocuments`. `runCodegen` and `runPreview` and `runInstanceSchema` (`codegen-worker.ts:350-396`, confirmed to call `buildDocuments()` the same way) all build against the same `RuneDsl.shared.workspace` singleton and all call `buildDocuments()`, so this one fix covers Form Preview, codegen/export, inheritance/`extends` resolution, and instance schema generation together.

**Files:**
- Modify: `apps/studio/src/workers/codegen-worker.ts`
- Test: `apps/studio/test/workers/codegen-worker.test.ts`

**Interfaces:**
- Consumes: `hydrateModelDocuments` from `@rune-langium/core` (already imported in this file as `hydrateModelDocument` is — add the batch import alongside it).
- Produces: no new message types, no new exports. `buildDocuments()`'s external behavior (return type `Promise<LangiumDocument[]>`) is unchanged — only its internal curated-document registration changes.

- [ ] **Step 1: Confirm the current exact code before editing**

Re-read `apps/studio/src/workers/codegen-worker.ts` lines 227-288 directly (line numbers may have shifted since this plan was written). Confirm the curated-entry loop still matches:

```ts
const curatedDocuments: LangiumDocument[] = [];
for (const entry of curatedEntries) {
  try {
    const { document } = hydrateModelDocument(
      { RuneDsl, shared: RuneDsl.shared },
      URI.parse(entry.uri),
      entry.serializedModelJson!,
      { register: 'idempotent' }
    );
    curatedDocuments.push(document);
  } catch (err) {
    console.warn(`[codegen-worker] Failed to deserialize curated AST for ${entry.uri}; excluded from preview.`, err);
  }
}
```

- [ ] **Step 2: Write the failing test proving the staleness bug and the fix, using a lighter mock that actually exercises relink logic**

The existing `codegen-worker.test.ts` mock stubs `RuneDsl.shared.workspace.{LangiumDocumentFactory, DocumentBuilder, LangiumDocuments}` and `RuneDsl.serializer.JsonSerializer` all the way down (confirmed at the top of the file). That level of mocking would hide this exact bug class — a test built entirely on those stubs can assert `hydrateModelDocuments` was *called* without proving it *works*. Instead, loosen the mock to match the lighter, more honest pattern already used in `packages/core/test/serializer/hydrate-model-document.test.ts` (a `registered: Map<string, unknown>` plus a real `deserialize` implementation whose own doc comment states the exact Langium contract this bug depends on: *"resolved at deserialize time against whatever is registered right now — never re-checked later"*). Read that file first to match its exact mock shape, then adapt `codegen-worker.test.ts`'s top-of-file mock to use the same `registered`-map-backed fakes for `LangiumDocuments.getDocument`/`addDocument`/`deleteDocument` and `LangiumDocumentFactory.fromModel`, so a reference that points at a symbol not yet in `registered` genuinely resolves to `undefined`, and a reference to a symbol that IS in `registered` genuinely resolves to it — no `vi.fn()` return-value stubbing standing in for real resolution.

```ts
// Add to apps/studio/test/workers/codegen-worker.test.ts, in the same
// describe block that exercises preview:setFiles/preview:generate:

it('relinks a previously-registered curated document once its dependency becomes available, instead of reusing its stale failed reference', async () => {
  const { dispatch } = await loadWorkerModule();

  // Round 1: Scheme registers with a reference to NormalizedString, which
  // is not yet in the registered-document map — resolves to undefined.
  await dispatch({
    type: 'preview:setFiles',
    requestId: 'files:1',
    files: [
      {
        uri: 'curated:///fpml/consolidated/shared/Scheme.rosetta',
        content: '',
        serializedModelJson: schemeAliasReferencingNormalizedStringJson
      }
    ]
  });
  const first = await dispatch({ type: 'preview:generate', targetId: 'Scheme', requestId: 'gen:1' });
  expect(first.schema.status).toBe('unsupported');
  expect(first.schema.unsupportedFeatures).toContain('unresolved-reference:NormalizedString');

  // Round 2: NormalizedString's namespace hydrates and is sent to the worker
  // alongside Scheme (unchanged content — same JSON as round 1).
  await dispatch({
    type: 'preview:setFiles',
    requestId: 'files:2',
    files: [
      {
        uri: 'curated:///fpml/consolidated/shared/Scheme.rosetta',
        content: '',
        serializedModelJson: schemeAliasReferencingNormalizedStringJson
      },
      {
        uri: 'curated:///fpml/consolidated/shared/NormalizedString.rosetta',
        content: '',
        serializedModelJson: normalizedStringJson
      }
    ]
  });
  const second = await dispatch({ type: 'preview:generate', targetId: 'Scheme', requestId: 'gen:2' });

  // Pre-fix (idempotent per-entry registration), this would still report
  // unresolved-reference:NormalizedString because Scheme's document object
  // — and its Reference proxy's cached failed resolution — never changes.
  expect(second.schema.status).toBe('ready');
  expect(second.schema.unsupportedFeatures ?? []).not.toContain('unresolved-reference:NormalizedString');
});
```

(`schemeAliasReferencingNormalizedStringJson` / `normalizedStringJson` are small fixture strings matching whatever serialized-model JSON shape the loosened mock's `deserialize` expects — build them the same way `hydrate-model-document.test.ts`'s existing fixtures are built; match that file's exact fixture-construction helper rather than inventing a new one.)

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/workers/codegen-worker.test.ts -t "relinks a previously-registered"`
Expected: FAIL — `second.schema.status` is still `'unsupported'`, still contains `unresolved-reference:NormalizedString`, proving the pre-fix bug reproduces under the new, honest mock.

- [ ] **Step 4: Implement the fix**

```ts
import { hydrateModelDocument, hydrateModelDocuments } from '@rune-langium/core';
// (add hydrateModelDocuments to the existing import line for hydrateModelDocument)
```

Replace the curated-entry loop:

```ts
const services = { RuneDsl, shared: RuneDsl.shared };
let curatedDocuments: LangiumDocument[] = [];
try {
  curatedDocuments = hydrateModelDocuments(
    services,
    curatedEntries.map((entry) => ({ uri: entry.uri, json: entry.serializedModelJson! }))
  ).map((r) => r.document);
} catch (err) {
  // hydrateModelDocuments does not isolate per-entry deserialize failures the
  // way the old per-entry loop did (one bad curated doc now skips the whole
  // curated batch for this build rather than just itself). Accepted
  // trade-off — see design doc §Components #3. If this proves too coarse in
  // practice, add per-entry isolation to hydrateModelDocuments itself in
  // packages/core, not a local workaround here (DRY).
  console.warn('[codegen-worker] Failed to hydrate curated documents for this build; excluded from preview.', err);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/workers/codegen-worker.test.ts`
Expected: PASS, whole file — confirms the fix works and nothing else in the file's existing coverage broke from loosening the mock.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/workers/codegen-worker.ts apps/studio/test/workers/codegen-worker.test.ts
git commit -m "fix(studio): relink stale curated documents via hydrateModelDocuments instead of idempotent reuse"
```

---

### Task 3: `CodegenProvider.tsx` — wire orchestrator to Form Preview/codegen

**Files:**
- Modify: `apps/studio/src/shell/providers/CodegenProvider.tsx`
- Modify: `apps/studio/src/store/preview-store.ts`
- Test: `apps/studio/test/shell/providers/CodegenProvider.test.tsx`

**Interfaces:**
- Consumes: `HydrationOrchestrator` from `../../services/hydration-orchestrator` (Task 1); Task 2's fix (no interface dependency — Task 2 makes retries actually work, but Task 3 doesn't call any new Task 2 API); existing `useEditorStore` primitives (`hydratedNamespaces`, `pendingHydrationNamespaces`, `hydrationNonce`, `requestNamespaceHydration`); existing `deferredExports: DeferredExportEntry[]` from `useWorkspace()`.
- Produces (for Task 6): a new field + action on `usePreviewStore`, following the store's existing action-method pattern:
  ```ts
  interface PreviewStoreState {
    // ...existing fields, unchanged...
    hydrationRetriesRemaining: Record<string, number>;
    setHydrationRetriesRemaining: (targetId: string, remaining: number) => void;
  }
  ```

- [ ] **Step 1: Read the current exact effect structure before editing**

Re-read `apps/studio/src/shell/providers/CodegenProvider.tsx` directly (line numbers may have shifted). Confirm: (a) the file-sync effect (originally lines 113-151, deps `[codegenWorker, files, handlePreviewWorkerFailure]`), (b) the `handleMessage`/`preview:result` effect (originally lines 170-248, deps `[codegenWorker, handlePreviewWorkerFailure, previewSelectedTargetId, receivePreviewResult, receivePreviewStale, receiveExecutionResult, receiveExecutionError, setWorkerRef]`), and (c) confirm `deferredExports` from `useWorkspace()` is not referenced anywhere in this file yet (it wasn't as of this plan's research). The new code in Step 4 reads `deferredExports` inside effect (b) — add it to that effect's dependency array (not (a)'s), since (b) is where the new `preview:result` handling logic lives.

- [ ] **Step 2: Write the failing test**

```ts
// Add to apps/studio/test/shell/providers/CodegenProvider.test.tsx, using
// this file's EXISTING FakeWorker class, wsState() helper, and the Host
// component render pattern already present in the file — do not invent new
// render helpers. Confirm the file's existing async-flush idiom (e.g.
// `await act(async () => {...})` or `waitFor`) by reading an existing async
// test in this file before writing this one, and match it.

it('requests hydration and re-generates the failed target when a preview result reports an unresolved curated reference', async () => {
  render(<Host />);
  const worker = FakeWorker.instances[0];
  usePreviewStore.getState().setSelectedTargetId('Scheme');
  await act(async () => {});

  const generateMsg = worker.posted.find((m) => m.type === 'preview:generate');
  await act(async () => {
    worker.listeners.message?.forEach((cb) =>
      cb({
        data: {
          type: 'preview:result',
          requestId: generateMsg.requestId,
          schema: {
            schemaVersion: 1,
            kind: 'typeAlias',
            targetId: 'Scheme',
            title: 'Scheme',
            status: 'unsupported',
            fields: [],
            unsupportedFeatures: ['unresolved-reference:NormalizedString']
          }
        }
      })
    );
  });

  expect(useEditorStore.getState().pendingHydrationNamespaces).toContain('fpml.consolidated.shared');
  expect(usePreviewStore.getState().hydrationRetriesRemaining['Scheme']).toBe(4);

  await act(async () => {
    useEditorStore.getState().markNamespacesHydrated(['fpml.consolidated.shared']);
  });

  const secondGenerateMsg = worker.posted.filter((m) => m.type === 'preview:generate').at(-1);
  expect(secondGenerateMsg).toMatchObject({ targetId: 'Scheme' });
  expect(secondGenerateMsg).not.toBe(generateMsg);
});
```

`wsState()`'s `deferredExports` fixture (or the `Host` component's `WorkspaceStateContext.Provider value`) must include an entry mapping `NormalizedString` to namespace `fpml.consolidated.shared` — extend `wsState()`'s fixture data or pass an override the same way other tests in this file customize `wsState()`'s output; match the existing pattern rather than hand-rolling a parallel fixture.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/providers/CodegenProvider.test.tsx -t "requests hydration and re-generates"`
Expected: FAIL — `pendingHydrationNamespaces` never gets `'fpml.consolidated.shared'`; only one `preview:generate` message posted.

- [ ] **Step 4: Add the `hydrationRetriesRemaining` field to `preview-store.ts`**

```ts
hydrationRetriesRemaining: {},

setHydrationRetriesRemaining(targetId: string, remaining: number) {
  set((s) => ({
    hydrationRetriesRemaining: { ...s.hydrationRetriesRemaining, [targetId]: remaining }
  }));
},
```

- [ ] **Step 5: Implement the wiring in `CodegenProvider.tsx`**

Construct the orchestrator inside a mount effect (StrictMode-safe — see Global Constraints), not lazily on render:

```ts
const orchestratorRef = useRef<HydrationOrchestrator | null>(null);
useEffect(() => {
  let lastHydrationNonce = useEditorStore.getState().hydrationNonce;
  const orchestrator = new HydrationOrchestrator({
    getHydratedNamespaces: () => useEditorStore.getState().hydratedNamespaces,
    getPendingHydrationNamespaces: () => useEditorStore.getState().pendingHydrationNamespaces,
    requestNamespaceHydration: (ns) => useEditorStore.getState().requestNamespaceHydration(ns),
    subscribeToHydrationChange: (onChange) =>
      useEditorStore.subscribe((state) => {
        if (state.hydrationNonce !== lastHydrationNonce) {
          lastHydrationNonce = state.hydrationNonce;
          onChange();
        }
      })
  });
  orchestratorRef.current = orchestrator;
  return () => {
    orchestrator.dispose();
    orchestratorRef.current = null;
  };
}, []);
```

Note: `useEditorStore.subscribe` here takes a single listener `(state) => void` — no selector argument (the store is plain `create()` + `temporal`, not wrapped in `subscribeWithSelector`; a two-argument form would silently be ignored). The listener manually diffs `hydrationNonce` itself.

Add near the other store hooks:

```ts
const { deferredExports } = useWorkspace();
const setHydrationRetriesRemaining = usePreviewStore((s) => s.setHydrationRetriesRemaining);
```

Add a lookup helper (module scope, above the component):

```ts
function findNamespaceForExport(deferredExports: DeferredExportEntry[], name: string): string | undefined {
  return deferredExports.find((entry) => entry.exports.some((e) => e.name === name))?.namespace;
}

function extractUnresolvedNames(unsupportedFeatures: string[] | undefined): string[] {
  return (unsupportedFeatures ?? [])
    .filter((f) => f.startsWith('unresolved-reference:'))
    .map((f) => f.slice('unresolved-reference:'.length));
}
```

In the `handleMessage` function's `preview:result` branch, after `receivePreviewResult(e.data.schema)`:

```ts
if (e.data.type === 'preview:result') {
  receivePreviewResult(e.data.schema);
  const targetId = e.data.schema.targetId;
  const unresolvedNames = extractUnresolvedNames(e.data.schema.unsupportedFeatures);
  const orchestrator = orchestratorRef.current;
  if (orchestrator) {
    if (unresolvedNames.length === 0) {
      orchestrator.markResolved(targetId);
    } else {
      for (const name of unresolvedNames) {
        const namespace = findNamespaceForExport(deferredExports, name);
        if (!namespace) continue; // not a known curated export — genuinely unresolved, don't retry
        orchestrator.requestHydration(namespace, {
          retryFor: {
            targetId,
            onRetry: () => {
              if (!codegenWorker) return;
              const requestId = `preview:${targetId}:${++previewRequestSequenceRef.current}`;
              currentPreviewRequestIdRef.current = requestId;
              codegenWorker.postMessage(createPreviewGenerateMessage(targetId, requestId));
            }
          }
        });
        setHydrationRetriesRemaining(targetId, orchestrator.getRemainingAttempts(targetId));
      }
    }
  }
} else {
  receivePreviewStale(e.data);
}
```

Add `deferredExports` and `setHydrationRetriesRemaining` to this effect's dependency array (the `handleMessage` effect — confirmed as effect (b) in Step 1, not the file-sync effect).

**Codegen-path (`codegen:error`) detection is explicitly out of scope for this task** — see design doc §Non-Goals. Do not add regex-based detection against `msg.message` in `handleCodegenMessage`'s `codegen:error` case; there is no reliable diagnostic channel for it today (unresolved refs there are non-fatal `z.unknown()` fallbacks that surface via `codegen:result`, which carries no diagnostic info, not `codegen:error`).

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/providers/CodegenProvider.test.tsx`
Expected: PASS, whole file.

- [ ] **Step 7: Commit**

```bash
git add apps/studio/src/shell/providers/CodegenProvider.tsx apps/studio/src/store/preview-store.ts apps/studio/test/shell/providers/CodegenProvider.test.tsx
git commit -m "feat(studio): auto-hydrate and re-generate Form Preview on unresolved curated references"
```

---

### Task 4: Structure/Inspector path — verify before building anything

Research into `apps/studio/src/workers/parser-worker.ts`'s `handleHydrate` (lines 422-465) found it uses **full-replacement semantics**: every `hydrate` call deletes every previously-registered document, clears every index export, and clears `deferredModelJson` entirely before re-registering the full cumulative set fresh. This is structurally different from `codegen-worker.ts`'s per-entry idempotent reuse (Task 2's bug) — there is no stale-document-reuse path here, so this consumer likely does **not** share defect #2. Whether it still needs anything for defect #1 (a reference the Inspector renders into a namespace nobody has browsed) is unconfirmed — building speculative machinery for an unverified gap would violate this repo's YAGNI convention. This task verifies first.

**Files:** none yet — this task may produce zero code changes.

- [ ] **Step 1: Reproduce live**

Using browser automation (or manual browsing) against a running studio instance with the curated corpus loaded: find a type `A` (already hydrated / visible in Structure) with an attribute whose type reference `B` belongs to a namespace that has **not** been hydrated and has **not** been directly browsed — critically, two levels deep, i.e. `A`'s attribute references `B`, and separately confirm `B` itself hasn't been visited (not merely that `A` hasn't). View `A` in the Structure view and the Inspector.

- [ ] **Step 2: Judge the result**

- If the attribute renders a reasonable fallback (e.g. shows `B`'s type name via `$refText`, per ADR 007's documented fallback behavior, without a confusing error or crash) — **no fix needed.** Record this finding in the design doc (update §Structure/Inspector Path from "unconfirmed" to "confirmed no gap, `$refText` fallback is acceptable") and close this task.
- If the attribute renders something actively broken or confusing (not just "shows the raw name," but e.g. throws, shows `undefined`, or silently omits the attribute) — this is a real, scoped gap. Do not fix it inline in this task; write a new task (or a short follow-up plan) specifically for it, since the shape of the fix depends on what's actually broken and this plan was not able to determine that without reproducing it first.

- [ ] **Step 3: Commit the design doc update (no-gap case) or open a follow-up (gap-found case)**

```bash
# no-gap case:
git add docs/superpowers/specs/2026-07-31-lazy-hydration-consistency-design.md
git commit -m "docs: confirm Structure/Inspector path does not need lazy-hydration retry machinery"
```

(Skip the commit if a gap was found — file it as a follow-up instead, referencing this task's repro steps.)

---

### Task 5: `ExplorePerspective.tsx` — route existing Trigger B calls through the orchestrator

This task does not depend on Task 4's outcome — routing the three existing `requestNamespaceHydration` call sites through the shared orchestrator is worth doing for retry-cap/dedup consistency (DRY) regardless of whether Task 4 finds Structure/Inspector needs additional retry-triggering logic.

**Files:**
- Modify: `apps/studio/src/shell/ExplorePerspective.tsx`
- Test: extend `apps/studio/test/pages/editor-page-harness.tsx` / `apps/studio/test/shell/perspectives-integration.test.tsx` (the real existing harnesses for this component — there is no dedicated `ExplorePerspective.test.tsx`; do not create one from scratch)

**Interfaces:**
- Consumes: `HydrationOrchestrator` (Task 1).
- Produces: nothing for later tasks.

- [ ] **Step 1: Read the real test harnesses before writing anything**

Read `apps/studio/test/pages/editor-page-harness.tsx` and `apps/studio/test/shell/perspectives-integration.test.tsx` in full. Identify their exact render/setup helper names and how they seed store state and mock the parser worker. Use those real names in Step 2 — do not invent `renderExplorePerspective`/`selectExplorerNode`-style helpers.

- [ ] **Step 2: Read the exact current call sites**

Re-read `apps/studio/src/shell/ExplorePerspective.tsx` directly (line numbers may have shifted after Tasks 1-4). Confirm the three call sites (`handleExplorerSelectNode`, `handleToggleNamespace`, `navigateToNode`), each guarded by `if (meta?.deferred && meta.namespace) { useEditorStore.getState().requestNamespaceHydration(meta.namespace); }` or equivalent.

- [ ] **Step 3: Write the failing test**

Using the real harness identified in Step 1, write a test asserting the externally-observable behavior is unchanged after the refactor (this guards against a regression in the refactor, not against the internal call path):

```ts
// Match the real harness's exact render/setup call signature found in Step 1.
it('requests hydration when selecting a deferred explorer node', () => {
  const requestSpy = vi.spyOn(useEditorStore.getState(), 'requestNamespaceHydration');
  // ...seed a deferred node named e.g. 'n1' with namespace 'cdm.base.staticdata.party'
  // using the harness's real fixture/seeding API, then trigger selection through
  // the harness's real interaction API (a click, a store action call, etc — whatever
  // the harness actually exposes)...
  expect(requestSpy).toHaveBeenCalledWith('cdm.base.staticdata.party');
});
```

- [ ] **Step 4: Run test to verify it currently passes (baseline) before refactoring**

Run: `pnpm --filter @rune-langium/studio exec vitest run <the harness's test file> -t "requests hydration when selecting"`
Expected: PASS (this is a characterization test of existing behavior — it should already pass before the refactor; its purpose is to catch a regression, not to drive new behavior). If it does NOT already pass, the call site assumptions in Step 2 are wrong — stop and re-read the component before proceeding.

- [ ] **Step 5: Implement**

Construct the orchestrator inside a mount effect (same StrictMode-safe pattern as Task 3):

```ts
const orchestratorRef = useRef<HydrationOrchestrator | null>(null);
useEffect(() => {
  let lastHydrationNonce = useEditorStore.getState().hydrationNonce;
  const orchestrator = new HydrationOrchestrator({
    getHydratedNamespaces: () => useEditorStore.getState().hydratedNamespaces,
    getPendingHydrationNamespaces: () => useEditorStore.getState().pendingHydrationNamespaces,
    requestNamespaceHydration: (ns) => useEditorStore.getState().requestNamespaceHydration(ns),
    subscribeToHydrationChange: (onChange) =>
      useEditorStore.subscribe((state) => {
        if (state.hydrationNonce !== lastHydrationNonce) {
          lastHydrationNonce = state.hydrationNonce;
          onChange();
        }
      })
  });
  orchestratorRef.current = orchestrator;
  return () => {
    orchestrator.dispose();
    orchestratorRef.current = null;
  };
}, []);
```

Replace each of the three direct calls:

```ts
useEditorStore.getState().requestNamespaceHydration(meta.namespace);
```

with:

```ts
orchestratorRef.current?.requestHydration(meta.namespace, {
  retryFor: {
    targetId: nodeId,
    onRetry: () => {
      // Re-selecting re-reads the AST node fresh. Per Task 4, the parser
      // worker's hydrate handler already does a full-replacement relink on
      // every hydrate round, so no separate relink trigger is needed here —
      // only re-selecting to force a fresh render.
      storeSelectNode(nodeId, { reapplyFocusMode: false });
    }
  }
});
```

- [ ] **Step 6: Run test to verify it still passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run <the harness's test file>`
Expected: PASS, whole file.

- [ ] **Step 7: Commit**

```bash
git add apps/studio/src/shell/ExplorePerspective.tsx
git commit -m "refactor(studio): route ExplorePerspective hydration triggers through the shared orchestrator"
```

---

### Task 6: Per-target "resolving…" UI state

**Files:**
- Modify: `apps/studio/src/components/FormPreviewPanel.tsx`
- Test: `apps/studio/test/components/FormPreviewPanel.test.tsx` (extend existing tests — confirm the file exists first)

**Interfaces:**
- Consumes: `usePreviewStore`'s `hydrationRetriesRemaining: Record<string, number>` field (Task 3) — read directly via the hook.
- Produces: nothing for later tasks.

**Scope note:** this is per-*target* granularity, not per-individual-unresolved-reference-name within a target with multiple simultaneously-unresolved fields — see design doc §Components #6 for the reasoning. A type alias (the common case, one reference) gets exact per-reference behavior; a Data type with several unresolved fields shows one aggregate "resolving" state for the whole target.

- [ ] **Step 1: Locate the existing hydrating-spinner pattern before writing new UI**

Search for an existing hydrating/loading-indicator component before writing a new one:

```
mcp__infigraph__search({ path: "<repo>", query: "hydrating spinner isHydrating loading indicator namespace", scope: "code" })
```

Reuse whatever is found. Do not invent a new spinner component if one already exists (this repo's DRY rule).

- [ ] **Step 2: Write the failing test**

```ts
// Extend apps/studio/test/components/FormPreviewPanel.test.tsx

const schemeSchema = {
  schemaVersion: 1,
  kind: 'typeAlias',
  targetId: 'Scheme',
  title: 'Scheme',
  status: 'unsupported',
  fields: [{ path: 'value', label: 'Value', kind: 'unknown', required: true, description: 'Type reference NormalizedString could not be resolved for form preview.' }],
  unsupportedFeatures: ['unresolved-reference:NormalizedString']
};

it('shows a resolving indicator instead of "could not be resolved" while a retry is in flight', () => {
  usePreviewStore.setState({ hydrationRetriesRemaining: { Scheme: 3 } });
  render(<FormPreviewPanel schema={schemeSchema} />);
  expect(screen.getByText(/resolving/i)).toBeInTheDocument();
  expect(screen.queryByText(/could not be resolved/i)).not.toBeInTheDocument();
});

it('shows the real unresolved diagnostic once retries are exhausted', () => {
  usePreviewStore.setState({ hydrationRetriesRemaining: { Scheme: 0 } });
  render(<FormPreviewPanel schema={schemeSchema} />);
  expect(screen.getByText(/could not be resolved/i)).toBeInTheDocument();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/components/FormPreviewPanel.test.tsx -t "resolving indicator"`
Expected: FAIL — component has no notion of `hydrationRetriesRemaining` yet; always renders the `summarizeUnsupportedFeatures` text.

- [ ] **Step 4: Implement**

```ts
const hydrationRetriesRemaining = usePreviewStore((s) => s.hydrationRetriesRemaining[schema.targetId]);
```

In the rendering path that currently calls `summarizeUnsupportedFeatures(schema.unsupportedFeatures)` for a field whose description matches `unresolved-reference:`, branch on it:

```ts
{hydrationRetriesRemaining !== undefined && hydrationRetriesRemaining > 0 ? (
  <ResolvingIndicator label={`Resolving reference… (${hydrationRetriesRemaining} ${hydrationRetriesRemaining === 1 ? 'retry' : 'retries'} left)`} />
) : (
  <UnsupportedFeatureWarning message={summarizeUnsupportedFeatures(schema.unsupportedFeatures)} />
)}
```

(`ResolvingIndicator` is whatever component Step 1's search located — substitute its real import and props; `UnsupportedFeatureWarning` is the existing rendering already in this file for the unresolved-diagnostic case, given its own real name.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/components/FormPreviewPanel.test.tsx`
Expected: PASS, whole file.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/components/FormPreviewPanel.tsx apps/studio/test/components/FormPreviewPanel.test.tsx
git commit -m "feat(studio): show per-target resolving state while a hydration retry is in flight"
```

---

### Task 7: Live verification

**Files:** none (verification only, no code changes).

- [ ] **Step 1: Run the full studio suite**

Run: `pnpm --filter @rune-langium/studio run test`
Expected: all suites green.

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @rune-langium/studio run type-check`
Expected: no errors.

- [ ] **Step 3: Re-run the exact live repro from task #34's root-cause investigation**

Using browser automation against a preview deploy (or prod, if no preview deploy is available for this branch):
1. Navigate to `fpml.consolidated.shared.Party` — confirm the Output panel no longer reports `Scheme`, `NormalizedString`, etc. as permanently unresolved.
2. Navigate directly to `fpml.consolidated.shared.Scheme` without having visited `NormalizedString` first — confirm Form Preview shows the new "resolving…" state briefly and then resolves, instead of getting stuck on "could not be resolved."
3. Confirm the retry count is bounded — check the Output panel / console for no runaway request loop.

- [ ] **Step 4: Confirm Task 4's verification result is reflected**

If Task 4 found no Structure/Inspector gap, confirm the design doc was updated accordingly. If it found a gap, confirm a follow-up was actually filed (not silently dropped).

- [ ] **Step 5: Update task tracker**

Mark task #34 ("Fix Form Preview false-unresolved references") completed once step 3 passes.

- [ ] **Step 6: Commit (if step 3 required any last-mile fixes)**

```bash
git add -A
git commit -m "fix(studio): address live-verification findings for lazy-hydration consistency"
```

(Skip this commit if no changes were needed.)
