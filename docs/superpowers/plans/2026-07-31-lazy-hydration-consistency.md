<!-- SPDX-License-Identifier: FSL-1.1-ALv2 -->
<!-- Copyright (c) 2026 Pradeep Mouli -->

# Consistent Lazy-Hydration Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every consumer that can hit a reference into a not-yet-hydrated curated namespace (Form Preview, codegen/export generation, inheritance/`extends` resolution, and the Structure/Inspector path) recover automatically, instead of only working when a user happens to have already browsed the referenced type.

**Architecture:** A new framework-agnostic `HydrationOrchestrator` (Task 1) turns "a consumer hit an unresolved reference" into a deduped, capped hydration request against the existing `editor-store.ts` primitives, and notifies the consumer to retry once `hydrationNonce` advances. The codegen/preview worker (Task 2) gets the actual relink fix — `documentBuilder.update()` on its registered curated documents, replacing the current dead-end where `hydrateModelDocument(..., {register:'idempotent'})` silently returns a stale, already-failed document forever. `CodegenProvider` (Task 3) wires the two together for Form Preview/codegen/inheritance. The parser worker and `ExplorePerspective` (Tasks 4–5) get the equivalent treatment for the Structure/Inspector path. Task 6 adds a per-field "resolving…" UI state. Task 7 verifies live.

**Tech Stack:** TypeScript 5.9 (strict, ESM), Vitest, Langium 4.3.x (`DocumentBuilder.update`), Zustand (`editor-store.ts`), React 19, Web Workers.

## Global Constraints

- No browser-side corpus fetch — all hydration stays server-mediated through `/api/parse`'s `hydrateNamespaces`.
- Synchronous linker — relinking is triggered by explicitly invalidating/rebuilding documents after hydrated content arrives, never mid-link.
- No whole-bundle work per request — each retry round requests only the namespace(s) that round discovered it needs, never a speculative eager prefetch of a whole transitive closure.
- Reuse `hydratedNamespaces` / `pendingHydrationNamespaces` / `hydrationNonce` / `requestNamespaceHydration` / `markNamespacesHydrated` in `packages/visual-editor/src/store/editor-store.ts` exactly as they are today — do not change that file's public shape.
- Retry cap: 5 attempts per target (`MAX_HYDRATION_RETRIES_PER_TARGET`).
- All new/modified files under `apps/studio/` carry the `FSL-1.1-ALv2` SPDX header (this repo is split-licensed; `packages/` is MIT and is only read, not modified, by this plan).

---

### Task 1: `HydrationOrchestrator` shared module

**Files:**
- Create: `apps/studio/src/services/hydration-orchestrator.ts`
- Test: `apps/studio/test/services/hydration-orchestrator.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks — this is a leaf module. It is written against a small `HydrationOrchestratorDeps` interface (defined in this file) so it never imports `editor-store.ts` directly; Task 3 and Task 5 supply the real store bindings when they construct it.
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
    subscribeToHydrationNonce: (onChange: (nonce: number) => void) => () => void;
  }

  export class HydrationOrchestrator {
    constructor(deps: HydrationOrchestratorDeps);
    requestHydration(namespace: string, options: RequestHydrationOptions): void;
    getRemainingAttempts(targetId: string): number;
    dispose(): void;
  }
  ```

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
  let nonceListener: ((nonce: number) => void) | undefined;
  const requestNamespaceHydration = vi.fn((ns: string) => pending.add(ns));
  return {
    hydrated,
    pending,
    requestNamespaceHydration,
    fireNonce: (n: number) => nonceListener?.(n),
    deps: {
      getHydratedNamespaces: () => [...hydrated],
      getPendingHydrationNamespaces: () => [...pending],
      requestNamespaceHydration,
      subscribeToHydrationNonce: (cb: (nonce: number) => void) => {
        nonceListener = cb;
        return () => {
          nonceListener = undefined;
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
  /** Opaque id the caller uses to know which of its own retries this is (a preview targetId, a document URI, etc). */
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
  subscribeToHydrationNonce: (onChange: (nonce: number) => void) => () => void;
}

export class HydrationOrchestrator {
  private readonly waitingByNamespace = new Map<string, Map<string, HydrationRetryTarget>>();
  private readonly attemptsByTarget = new Map<string, number>();
  private readonly unsubscribe: () => void;

  constructor(private readonly deps: HydrationOrchestratorDeps) {
    this.unsubscribe = deps.subscribeToHydrationNonce(() => this.onHydrationNonceChanged());
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

  getRemainingAttempts(targetId: string): number {
    return MAX_HYDRATION_RETRIES_PER_TARGET - (this.attemptsByTarget.get(targetId) ?? 0);
  }

  dispose(): void {
    this.unsubscribe();
    this.waitingByNamespace.clear();
    this.attemptsByTarget.clear();
  }

  private onHydrationNonceChanged(): void {
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

- [ ] **Step 5: Add the pending-namespace dedupe + retry-on-hydration test, run it, confirm it passes**

```ts
  it('requests hydration once, then retries every waiting target when the namespace hydrates', () => {
    const { deps, hydrated, requestNamespaceHydration, fireNonce } = makeDeps();
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
    fireNonce(1);
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
```

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/hydration-orchestrator.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/services/hydration-orchestrator.ts apps/studio/test/services/hydration-orchestrator.test.ts
git commit -m "feat(studio): add HydrationOrchestrator for consistent lazy-hydration retries"
```

---

### Task 2: Codegen/preview worker relink capability (the mechanical fix)

This is the fix for the concrete bug: `hydrateModelDocument(..., { register: 'idempotent' })` (`packages/core/src/serializer/hydrate-model-document.ts:46-52`) returns a previously-registered document verbatim — including every `Reference`'s already-cached resolution, success or failure — with no relink. `runCodegen` and `runPreview` both build against the same `RuneDsl.shared.workspace` singleton (confirmed: `builder`/`factory` are module-level, shared by both), so this one fix covers Form Preview, codegen/export, and inheritance/`extends` resolution together.

**Files:**
- Modify: `apps/studio/src/workers/codegen-worker.ts`
- Test: `apps/studio/test/workers/codegen-worker.test.ts`

**Interfaces:**
- Consumes: nothing new from Task 1 (workers can't import browser-only store code) — Task 2 is purely worker-internal.
- Produces (for Task 3): two new inbound worker message types, added to the existing `WorkerInboundMessage` union in `apps/studio/src/workers/codegen-worker.ts`:
  ```ts
  interface PreviewRelinkMessage {
    type: 'preview:relink';
    targetId: string;
    requestId: string;
  }
  interface CodegenRelinkMessage {
    type: 'codegen:relink';
    target?: Target;
    requestId?: string;
  }
  ```
  On `preview:relink`, the worker re-emits the existing `preview:result` / `preview:stale` messages (unchanged shape) once relinked. On `codegen:relink`, it re-emits the existing `codegen:result` / `codegen:outdated` / `codegen:error` messages. No new outbound message types.

- [ ] **Step 1: Read the current `DocumentBuilder` mock and message dispatch in the existing test file**

The existing mock (`apps/studio/test/workers/codegen-worker.test.ts`, top of file) stubs `RuneDsl.shared.workspace.DocumentBuilder` with only `{ build: buildMock }`. Confirm this before writing Step 2 — if it has changed since this plan was written, adjust the mock additions in Step 2 to match the current shape rather than assuming it's unchanged.

- [ ] **Step 2: Write the failing test proving the staleness bug and the fix**

```ts
// Add to apps/studio/test/workers/codegen-worker.test.ts, inside the existing
// top-of-file mock for '@rune-langium/core', add an `update` spy to the
// DocumentBuilder mock:
//
//   const updateMock = vi.fn(async () => undefined);
//   ...
//   DocumentBuilder: { build: buildMock, update: updateMock }
//
// then add this test in the existing describe block that exercises
// preview:setFiles / preview:generate (match the existing dispatch helper's
// name and calling convention used elsewhere in this file, e.g. `dispatch`):

it('relinks a previously-registered curated document on preview:relink instead of reusing its stale failed reference', async () => {
  const { dispatch } = loadWorkerModule();

  // First round: Scheme registers with a reference that cannot resolve yet
  // because NormalizedString hasn't been sent to the worker.
  await dispatch({
    type: 'preview:setFiles',
    requestId: 'files:1',
    files: [
      {
        uri: 'curated:///fpml/consolidated/shared/Scheme.rosetta',
        content: '',
        serializedModelJson: JSON.stringify({ /* Scheme alias referencing NormalizedString, unresolved */ })
      }
    ]
  });
  await dispatch({ type: 'preview:generate', targetId: 'Scheme', requestId: 'gen:1' });
  expect(deserializeMock).toHaveBeenCalled();

  // NormalizedString's namespace hydrates and is sent to the worker.
  await dispatch({
    type: 'preview:setFiles',
    requestId: 'files:2',
    files: [
      {
        uri: 'curated:///fpml/consolidated/shared/Scheme.rosetta',
        content: '',
        serializedModelJson: JSON.stringify({ /* same Scheme content */ })
      },
      {
        uri: 'curated:///fpml/consolidated/shared/NormalizedString.rosetta',
        content: '',
        serializedModelJson: JSON.stringify({ /* NormalizedString */ })
      }
    ]
  });

  // Without a relink, buildDocuments()'s idempotent re-registration would
  // return Scheme's ORIGINAL stale document object and the retry would fail
  // identically. preview:relink must force a relink instead.
  await dispatch({ type: 'preview:relink', targetId: 'Scheme', requestId: 'gen:2' });

  expect(updateMock).toHaveBeenCalledTimes(1);
  const [changedUris, deletedUris] = updateMock.mock.calls[0];
  expect(changedUris).toEqual(expect.arrayContaining(['curated:///fpml/consolidated/shared/Scheme.rosetta']));
  expect(deletedUris).toEqual([]);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/workers/codegen-worker.test.ts -t "relinks a previously-registered"`
Expected: FAIL — `updateMock` never called (no `preview:relink` handler exists yet), or `Unhandled message type: preview:relink`.

- [ ] **Step 4: Implement the relink handler in `codegen-worker.ts`**

Add to the message type union near the existing `PreviewExecuteMessage` (codegen-worker.ts:73-78):

```ts
interface PreviewRelinkMessage {
  type: 'preview:relink';
  targetId: string;
  requestId: string;
}

interface CodegenRelinkMessage {
  type: 'codegen:relink';
  target?: Target;
  requestId?: string;
}
```

Add both to the `WorkerInboundMessage` union (codegen-worker.ts:94-99):

```ts
type WorkerInboundMessage =
  | InboundMessage
  | PreviewWorkerRequest
  | PreviewExecuteMessage
  | PreviewRelinkMessage
  | CodegenRelinkMessage
  | InstanceValidateMessage
  | InstanceGenerateSchemaMessage;
```

In the dispatch switch (wherever the existing `case 'preview:generate':` / `case 'codegen:generate':` arms live), add:

```ts
case 'preview:relink': {
  const curatedUris = currentPreviewFiles.filter((f) => f.serializedModelJson).map((f) => f.uri);
  if (curatedUris.length > 0) {
    await builder.update(curatedUris, []);
  }
  await runPreview(msg.targetId, msg.requestId);
  break;
}
case 'codegen:relink': {
  const curatedUris = currentCodegenFiles.filter((f) => f.serializedModelJson).map((f) => f.uri);
  if (curatedUris.length > 0) {
    await builder.update(curatedUris, []);
  }
  await runCodegen(msg.target ?? lastTarget, msg.requestId ?? lastCodegenRequestId ?? '');
  break;
}
```

Relinking *every* currently-registered curated URI (not just the one target's own document) is a deliberate simplification: `documentBuilder.update()` only marks documents dirty for the next build/link pass — it does not eagerly re-link anything itself — so the cost is bounded by what `runPreview`/`runCodegen` subsequently touch for the requested target, not by the full relinked set. This avoids needing a target-id → document-URI lookup that doesn't exist anywhere in the codebase today (confirmed: no such mapping was found during research for this plan).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/workers/codegen-worker.test.ts`
Expected: PASS, all tests in the file (not just the new one) — confirms the new message types don't break existing dispatch.

- [ ] **Step 6: Emit unresolved-namespace-mappable info for Task 3 to consume**

No new outbound message type is needed here: `unresolved-reference:<refText>` entries already reach the main thread today inside `schema.unsupportedFeatures` on the existing `preview:result` message (confirmed in `packages/codegen/src/preview-schema.ts`'s `buildTypeAliasSchema`, e.g. `unsupportedFeatures.add(\`unresolved-reference:${refText ?? alias.name}\`)`). Task 3 reads this existing field — nothing to change here. Skip to commit.

- [ ] **Step 7: Commit**

```bash
git add apps/studio/src/workers/codegen-worker.ts apps/studio/test/workers/codegen-worker.test.ts
git commit -m "fix(studio): relink stale curated documents on preview:relink/codegen:relink"
```

---

### Task 3: `CodegenProvider.tsx` — wire orchestrator to Form Preview/codegen

**Files:**
- Modify: `apps/studio/src/shell/providers/CodegenProvider.tsx`
- Modify: `apps/studio/src/store/preview-store.ts`
- Test: `apps/studio/test/shell/providers/CodegenProvider.test.tsx`

**Interfaces:**
- Consumes: `HydrationOrchestrator`, `MAX_HYDRATION_RETRIES_PER_TARGET` from `../../services/hydration-orchestrator` (Task 1); `preview:relink` / `codegen:relink` message types from Task 2; existing `useEditorStore` primitives (`hydratedNamespaces`, `pendingHydrationNamespaces`, `hydrationNonce`, `requestNamespaceHydration`); existing `deferredExports: DeferredExportEntry[]` from `useWorkspace()` (`DeferredExportEntry = { filePath: string; namespace: string; exports: Array<{ type: string; name: string }> }`, already exposed on `WorkspaceState`).
- Produces (for Task 6): a new field + action on `usePreviewStore`, following the store's existing action-method pattern (`receivePreviewResult`, `receivePreviewStale`, etc.):
  ```ts
  interface PreviewStoreState {
    // ...existing fields, unchanged...
    hydrationRetriesRemaining: Record<string, number>;
    setHydrationRetriesRemaining: (targetId: string, remaining: number) => void;
  }
  ```

- [ ] **Step 1: Write the failing test**

```ts
// Add to apps/studio/test/shell/providers/CodegenProvider.test.tsx, using
// the file's existing FakeWorker + WorkspaceStateContext.Provider render
// helper (match the exact render/wsState() helpers already in this file).

it('requests hydration and relinks the failed target when a preview result reports an unresolved curated reference', async () => {
  const { worker, rerender } = renderCodegenProvider({
    deferredExports: [
      { filePath: 'fpml/consolidated/shared.rosetta', namespace: 'fpml.consolidated.shared', exports: [{ type: 'TypeAlias', name: 'NormalizedString' }] }
    ]
  });
  usePreviewStore.getState().setSelectedTargetId('Scheme');
  await flushEffects();

  const generateMsg = worker.posted.find((m) => m.type === 'preview:generate');
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

  expect(useEditorStore.getState().pendingHydrationNamespaces).toContain('fpml.consolidated.shared');

  useEditorStore.getState().markNamespacesHydrated(['fpml.consolidated.shared']);
  await flushEffects();

  const relinkMsg = worker.posted.find((m) => m.type === 'preview:relink');
  expect(relinkMsg).toMatchObject({ targetId: 'Scheme' });
  expect(usePreviewStore.getState().hydrationRetriesRemaining['Scheme']).toBe(4);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/providers/CodegenProvider.test.tsx -t "requests hydration and relinks"`
Expected: FAIL — `pendingHydrationNamespaces` never gets `'fpml.consolidated.shared'`; no `preview:relink` message posted.

- [ ] **Step 3: Add the `hydrationRetriesRemaining` field to `preview-store.ts`**

Add to the store's state interface and initial state (following the file's existing pattern for a simple keyed record — match whatever the file's existing `Record`/`Map`-based fields, e.g. `schemas: Map<string, FormPreviewSchema>`, use for their initializer and setter style):

```ts
hydrationRetriesRemaining: {},

setHydrationRetriesRemaining(targetId: string, remaining: number) {
  set((s) => ({
    hydrationRetriesRemaining: { ...s.hydrationRetriesRemaining, [targetId]: remaining }
  }));
},
```

- [ ] **Step 4: Implement the wiring in `CodegenProvider.tsx`**

Add near the other store hooks (around line 46-51):

```ts
const { deferredExports } = useWorkspace();
const setHydrationRetriesRemaining = usePreviewStore((s) => s.setHydrationRetriesRemaining);
const orchestratorRef = useRef<HydrationOrchestrator | null>(null);
if (!orchestratorRef.current) {
  orchestratorRef.current = new HydrationOrchestrator({
    getHydratedNamespaces: () => useEditorStore.getState().hydratedNamespaces,
    getPendingHydrationNamespaces: () => useEditorStore.getState().pendingHydrationNamespaces,
    requestNamespaceHydration: (ns) => useEditorStore.getState().requestNamespaceHydration(ns),
    subscribeToHydrationNonce: (onChange) =>
      useEditorStore.subscribe((s) => s.hydrationNonce, onChange)
  });
}
useEffect(() => () => orchestratorRef.current?.dispose(), []);
```

Add a lookup helper (module scope, above the component, so it's independently testable if needed later):

```ts
function findNamespaceForExport(deferredExports: DeferredExportEntry[], name: string): string | undefined {
  return deferredExports.find((entry) => entry.exports.some((e) => e.name === name))?.namespace;
}

function extractUnresolvedNames(unsupportedFeatures: string[] | undefined): string[] {
  return (unsupportedFeatures ?? [])
    .filter((f) => f.startsWith('unresolved-reference:'))
    .map((f) => f.slice('unresolved-reference:'.length));
}

function requestHydrationForUnresolvedNames(params: {
  names: string[];
  targetId: string;
  deferredExports: DeferredExportEntry[];
  orchestrator: HydrationOrchestrator;
  setHydrationRetriesRemaining: (targetId: string, remaining: number) => void;
  onRetry: () => void;
}): void {
  const { names, targetId, deferredExports, orchestrator, setHydrationRetriesRemaining, onRetry } = params;
  for (const name of names) {
    const namespace = findNamespaceForExport(deferredExports, name);
    if (!namespace) continue; // not a known curated export — genuinely unresolved, don't retry
    orchestrator.requestHydration(namespace, { retryFor: { targetId, onRetry } });
    setHydrationRetriesRemaining(targetId, orchestrator.getRemainingAttempts(targetId));
  }
}
```

In the existing `handleMessage` function's `preview:result` branch (around line 210-211), after `receivePreviewResult(e.data.schema)`, add:

```ts
if (e.data.type === 'preview:result') {
  receivePreviewResult(e.data.schema);
  if (orchestratorRef.current) {
    requestHydrationForUnresolvedNames({
      names: extractUnresolvedNames(e.data.schema.unsupportedFeatures),
      targetId: e.data.schema.targetId,
      deferredExports,
      orchestrator: orchestratorRef.current,
      setHydrationRetriesRemaining,
      onRetry: () => {
        if (!codegenWorker) return;
        const requestId = `preview:relink:${e.data.schema.targetId}:${++previewRequestSequenceRef.current}`;
        currentPreviewRequestIdRef.current = requestId;
        codegenWorker.postMessage({ type: 'preview:relink', targetId: e.data.schema.targetId, requestId });
      }
    });
  }
} else {
  receivePreviewStale(e.data);
}
```

In `handleCodegenMessage`'s `codegen:error` case (around line 282-286), add the equivalent handling using the same `unresolved-reference:` prefix convention the shared `preview-schema.ts` diagnostics use (the same code path `zod-emitter.ts`/`ts-emitter.ts` invoke for inheritance/`extends` resolution emits diagnostics through `msg.message` here, since `codegen:error` carries a message string rather than a schema object):

```ts
case 'codegen:error': {
  useOutputStore.getState().addLine(fmtLine('codegen', msg.message), 'error');
  useActivityStore.getState().addActivity('gen', false, msg.message);
  store.markCodePreviewUnavailable({ target: msg.target, message: msg.message });
  if (orchestratorRef.current) {
    const unresolvedMatch = msg.message.match(/unresolved-reference:(\S+)/g) ?? [];
    requestHydrationForUnresolvedNames({
      names: unresolvedMatch.map((m) => m.slice('unresolved-reference:'.length)),
      targetId: msg.target,
      deferredExports,
      orchestrator: orchestratorRef.current,
      setHydrationRetriesRemaining,
      onRetry: () => {
        if (!codegenWorker) return;
        const requestId = `codegen:relink:${msg.target}:${++codegenRequestSequenceRef.current}`;
        codegenCurrentRequestIdRef.current = requestId;
        codegenWorker.postMessage({ type: 'codegen:relink', target: msg.target, requestId });
      }
    });
  }
  break;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/providers/CodegenProvider.test.tsx`
Expected: PASS, whole file.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/shell/providers/CodegenProvider.tsx apps/studio/src/store/preview-store.ts apps/studio/test/shell/providers/CodegenProvider.test.tsx
git commit -m "feat(studio): auto-hydrate and relink Form Preview/codegen on unresolved curated references"
```

---

### Task 4: Parser worker — Trigger A unresolved-reporting

**Files:**
- Modify: `apps/studio/src/workers/parser-worker.ts`
- Test: `apps/studio/test/workers/parser-worker.test.ts` (create if it does not already exist — confirm with `ls apps/studio/test/workers/` first)

**Interfaces:**
- Consumes: nothing from earlier tasks (worker-internal, same pattern as Task 2).
- Produces (for Task 5): the existing hydrate/link response message gains one new optional field:
  ```ts
  interface HydrateResponse {
    // ...existing fields, unchanged...
    unresolvedCuratedNamespaces?: string[];
  }
  ```

- [ ] **Step 1: Read the current exact message/response shapes before writing code**

This plan was written without direct access to `parser-worker.ts`'s exact `HydrateRequest`/`HydrateResponse`/`ParseWorkspaceResponse` field names (flagged as a research gap). Before writing Step 2, run:

```
mcp__infigraph__get_doc_context({ path: "<repo>", symbol_id: "apps/studio/src/workers/parser-worker.ts::handleHydrate", detail: true })
```

and confirm the exact response type name and field names. Use the REAL names found there in place of `HydrateResponse`/`unresolvedCuratedNamespaces` below if they differ.

- [ ] **Step 2: Write the failing test**

```ts
// apps/studio/test/workers/parser-worker.test.ts
// (Match the mocking/dispatch style found in apps/studio/test/workers/codegen-worker.test.ts —
// both workers wrap the same @rune-langium/core services, so the same
// vi.mock('@rune-langium/core', ...) scaffolding applies here.)

it('reports unresolved curated cross-reference namespaces after a link pass', async () => {
  const { dispatch } = loadWorkerModule();
  await dispatch({
    type: 'hydrate',
    // a document whose linked references include one Langium marks as
    // unresolved (`.error` set) against a curated namespace URI
  });
  const response = await dispatch({ type: 'hydrate', /* ... */ });
  expect(response.unresolvedCuratedNamespaces).toEqual(
    expect.arrayContaining(['fpml.consolidated.shared'])
  );
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/workers/parser-worker.test.ts`
Expected: FAIL — `response.unresolvedCuratedNamespaces` is `undefined`.

- [ ] **Step 4: Implement `collectUnresolvedCuratedRefs` and wire it into the hydrate/link response**

This realizes the deferred design's "Trigger A" (`docs/superpowers/specs/2026-05-25-curated-on-demand-hydration-design.md`), which specced this exact function name and behavior but never implemented it (confirmed: no symbol or text match for `collectUnresolvedCuratedRefs` exists anywhere in the codebase today). Implement it as: for each built document, walk `document.references` for entries where `.error` is set (Langium marks unresolved cross-references this way), take the reference's target URI's namespace (the same namespace-from-URI derivation `handleHydrate` already uses elsewhere in this file for hydrated documents — reuse that helper rather than re-deriving namespace-from-URI logic), dedupe, and exclude any namespace already present in `deferredModelJson` (the worker's own hydrated-namespace map, per the 2026-05-25 design) since those are resolved-or-genuinely-broken, not pending.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/workers/parser-worker.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/workers/parser-worker.ts apps/studio/test/workers/parser-worker.test.ts
git commit -m "feat(studio): report unresolved curated namespaces after parser-worker link pass"
```

---

### Task 5: `ExplorePerspective.tsx` — route Trigger B through the orchestrator, consume Trigger A

**Files:**
- Modify: `apps/studio/src/shell/ExplorePerspective.tsx`
- Test: `apps/studio/test/shell/ExplorePerspective.test.tsx` (extend existing tests — do not create a new file if one already covers this component; confirm with a search first)

**Interfaces:**
- Consumes: `HydrationOrchestrator` (Task 1); `unresolvedCuratedNamespaces` field on the parser worker's hydrate/link response (Task 4).
- Produces: nothing for later tasks.

- [ ] **Step 1: Read the exact current call sites before editing**

Re-confirm the three exact `requestNamespaceHydration` call sites (`handleExplorerSelectNode`, `handleToggleNamespace`, `navigateToNode`) and the `deferredExportsRef`-adjacent "hydration relink effect" mentioned in a comment near line 1025, by re-reading `apps/studio/src/shell/ExplorePerspective.tsx` directly before this task's diff, since line numbers may have shifted after Tasks 1-4 land on this branch.

- [ ] **Step 2: Write the failing test**

```ts
// Extend the existing ExplorePerspective test suite (match its existing
// render/store-seeding conventions) with:

it('routes explorer node selection through the hydration orchestrator instead of calling requestNamespaceHydration directly', () => {
  const requestSpy = vi.spyOn(useEditorStore.getState(), 'requestNamespaceHydration');
  renderExplorePerspective({
    nodes: [{ id: 'n1', meta: { deferred: true, namespace: 'cdm.base.staticdata.party' } }]
  });
  selectExplorerNode('n1');
  // Same externally-observable effect as before the refactor — this test
  // guards against a behavior regression, not against the internal call path.
  expect(requestSpy).toHaveBeenCalledWith('cdm.base.staticdata.party');
});

it('retries the previously-selected node once its namespace hydrates after being reported unresolved by the parser worker', async () => {
  const { worker } = renderExplorePerspective({ /* ... */ });
  selectExplorerNode('scheme-node');
  worker.listeners.message?.forEach((cb) =>
    cb({ data: { type: 'hydrate:result', unresolvedCuratedNamespaces: ['fpml.consolidated.shared'] } })
  );
  expect(useEditorStore.getState().pendingHydrationNamespaces).toContain('fpml.consolidated.shared');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/ExplorePerspective.test.tsx -t "hydration orchestrator"`
Expected: FAIL (first test may pass trivially since the direct call still satisfies it pre-refactor; the second fails — no consumption of `unresolvedCuratedNamespaces` exists yet).

- [ ] **Step 4: Implement**

Construct one `HydrationOrchestrator` instance for the component (same pattern as Task 3's `orchestratorRef`), and replace each of the three direct calls:

```ts
useEditorStore.getState().requestNamespaceHydration(meta.namespace);
```

with:

```ts
orchestratorRef.current?.requestHydration(meta.namespace, {
  retryFor: {
    targetId: nodeId,
    onRetry: () => {
      // Re-selecting is enough to re-trigger whatever downstream render
      // (Structure/Inspector) previously read a stale/unresolved `.ref` —
      // it re-reads the AST node fresh, and the parser worker's own
      // documentBuilder link state has since been invalidated for this
      // namespace's dependents by the analogous relink handling in
      // parser-worker.ts (Task 4's link pass runs again once the
      // hydrate round-trip completes, per the existing App.tsx effect).
      storeSelectNode(nodeId, { reapplyFocusMode: false });
    }
  }
});
```

Add a handler for the parser worker's new `unresolvedCuratedNamespaces` field (wherever this component currently receives parser-worker responses — likely the same message-handling effect that already consumes `hydrationNonce`/hydrate results near line 830) that calls `orchestrator.requestHydration(ns, {retryFor: {targetId: <currently selected node id>, onRetry: ...}})` for each reported namespace, mirroring Task 3's pattern.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/ExplorePerspective.test.tsx`
Expected: PASS, whole file.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/shell/ExplorePerspective.tsx apps/studio/test/shell/ExplorePerspective.test.tsx
git commit -m "refactor(studio): route ExplorePerspective hydration triggers through the shared orchestrator"
```

---

### Task 6: Per-field "resolving…" UI state

**Files:**
- Modify: `apps/studio/src/components/FormPreviewPanel.tsx`
- Test: `apps/studio/test/components/FormPreviewPanel.test.tsx` (extend existing tests — confirm the file exists first)

**Interfaces:**
- Consumes: `usePreviewStore`'s `hydrationRetriesRemaining: Record<string, number>` field (Task 3) — read directly via the hook, the same way this component already reads other preview-store fields, rather than a new prop.
- Produces: nothing for later tasks.

- [ ] **Step 1: Locate the existing hydrating-spinner pattern before writing new UI**

Research for this plan could not confirm the exact name/path of the "curated-hydrating-spinner" component referenced in project memory as shipped in PR #250. Before writing Step 2, run:

```
mcp__infigraph__search({ path: "<repo>", query: "hydrating spinner isHydrating loading indicator namespace", scope: "code" })
```

and reuse whatever component that finds. Do not invent a new spinner component if one already exists — that would violate this repo's DRY rule.

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
Expected: FAIL — component has no `hydrationRetriesRemaining` prop yet; always renders the `summarizeUnsupportedFeatures` text.

- [ ] **Step 4: Implement**

Read the retry count from the store inside the component (no new prop):

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

(`ResolvingIndicator` is whatever component Step 1's search located — substitute its real import and props here; `UnsupportedFeatureWarning` is the existing rendering already in this file for the unresolved-diagnostic case, given its own real name.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/components/FormPreviewPanel.test.tsx`
Expected: PASS, whole file.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/components/FormPreviewPanel.tsx apps/studio/test/components/FormPreviewPanel.test.tsx
git commit -m "feat(studio): show per-field resolving state while a hydration retry is in flight"
```

---

### Task 7: Live verification

**Files:** none (verification only, no code changes).

- [ ] **Step 1: Run the full studio suite**

Run: `pnpm --filter @rune-langium/studio run test`
Expected: all suites green, including the five new/extended test files from Tasks 1-6.

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @rune-langium/studio run type-check`
Expected: no errors.

- [ ] **Step 3: Re-run the exact live repro from task #34's root-cause investigation**

Using browser automation against a preview deploy (or prod, if no preview deploy is available for this branch), repeat exactly:
1. Navigate to `fpml.consolidated.shared.Party` (or the current equivalent path) — confirm the Output panel no longer reports `Scheme`, `NormalizedString`, etc. as permanently unresolved.
2. Navigate directly to `fpml.consolidated.shared.Scheme` without having visited `NormalizedString` first — confirm Form Preview either resolves immediately (if `NormalizedString`'s namespace was already pulled in via the same closure) or shows the new "resolving…" state briefly and then resolves, instead of getting stuck on "could not be resolved."
3. Confirm the retry count is bounded — check the Output panel / console for no runaway request loop.

- [ ] **Step 4: Update task tracker**

Mark task #34 ("Fix Form Preview false-unresolved references") completed once step 3 passes.

- [ ] **Step 5: Commit (if step 3 required any last-mile fixes)**

```bash
git add -A
git commit -m "fix(studio): address live-verification findings for lazy-hydration consistency"
```

(Skip this commit if no changes were needed.)
