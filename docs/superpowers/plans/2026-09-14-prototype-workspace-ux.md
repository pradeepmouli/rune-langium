# Prototype Workspace UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a persistent instance workspace with Inspector above a searchable grid, truthful save/validation feedback, independent function execution, and navigation from Explore previews.

**Architecture:** Consume the [shared workbench foundation](2026-09-14-workbench-foundation.md). Keep instance data in the existing OPFS-backed store, UI preferences separate, and schema/function semantics in the current codegen worker. Add explicit request ownership and readiness coordination instead of borrowing Explore's selected preview.

**Tech Stack:** React 19, Zustand 5, Dockview 8, existing TypeSelector and form renderer, codegen worker, OPFS, Vitest, Playwright; Node >=22.13.0, pnpm@11.5.0.

**Spec:** [Prototype workspace UX design](../specs/2026-09-14-prototype-workspace-ux-design.md).

## Global Constraints

- “The default is Inspector above and grid below.”
- “Keep instance name, type, save status, and validation summary visible across Form and Functions.”
- “Do not describe persisted values as an in-memory sample.”
- “Do not inherit an unrelated Explore preview selection.”
- “Invalid values are preserved with their diagnostics so editing can continue in Prototype.”
- “Open in Prototype is reserved for values already associated with a saved instance, preventing navigation from creating duplicates.”
- “Graph edges must represent actual instance relationships.”
- Reuse the authoritative codegen/validation/hydration pipeline; no local validation approximation or new emitter.
- New Studio source has FSL-1.1-ALv2 headers; new codegen source has MIT headers. No new packages required.
- Preserve existing OPFS queue ordering, workspace-change guards, unknown JSON fields, and generated function sandbox restrictions.

---

## Release boundary and file map

Prerequisite: all three shared-foundation tasks. This plan ships the complete grid/Inspector workflow plus an explicitly labeled nested-payload graph. Persisted links between separate instances are outside this release: the data model does not yet define those links, so do not manufacture them by matching values or type dependencies. The payload graph is read-only, selected-instance scoped, and never presented as a cross-instance relationship graph.

Use `superpowers:using-git-worktrees` at execution, preserve uncommitted plan/spec files, and inspect Infigraph context before changes. Existing files below were read while planning; line numbers can drift.

| File(s) | Responsibility |
| --- | --- |
| `src/services/instance-readiness.ts` (new) | Type hydration and worker-file readiness coordination |
| `src/shell/providers/CodegenProvider.tsx`, `src/workers/codegen-worker.ts`, `src/services/codegen-service.ts` | Single worker ownership, correlated requests/replies, file readiness |
| `src/store/instance-store.ts` | Records, validation state, queued persistence and lifecycle actions |
| `src/store/prototype-view-store.ts` (new) | Workspace-scoped selection, filter, pane/tab preferences |
| `src/shell/panels/InstanceGridPanel.tsx` (new) | Lookup and selection; no record copy |
| `src/shell/panels/InstanceInspectorPanel.tsx`, `InstanceFormPanel.tsx`, `InstanceFunctionPanel.tsx` | Persistent identity, form, independent runner |
| `src/components/InstanceCreateDialog.tsx`, `InstancePayloadPanel.tsx` (new) | Creation/import handoff, JSON/result rendering |
| `src/services/preview-session-client.ts`, `src/store/function-session-store.ts` (new) | Explicit schema/execution ownership |
| `src/services/prototype-navigation.ts` (new) | Shared preview/type/result-to-instance and reverse navigation |
| `src/services/instance-payload-graph.ts`, `src/shell/panels/InstanceGraphPanel.tsx` (new) | Read-only JSON containment graph |

Paths in this table are relative to `apps/studio/`. Exact task paths follow.

### Task 1: Restore curated instance schemas and validation without visiting Explore

**Files:** Create `apps/studio/src/services/instance-readiness.ts`, `apps/studio/test/services/instance-readiness.test.ts`; modify `apps/studio/src/{shell/providers/CodegenProvider.tsx,services/codegen-service.ts,workers/codegen-worker.ts,store/instance-store.ts,shell/panels/InstanceFormPanel.tsx}`; tests `apps/studio/test/{store/instance-store.test.ts,shell/providers/CodegenProvider.test.tsx,workers/codegen-worker.test.ts}` (use the worker suite's existing initialization pattern).

**Interfaces:** Existing `HydrationOrchestrator.requestHydration(namespace, { retryFor })` remains the shared hydration path. Define `InstanceReadiness` and a factory that receive injectable shared services:

```ts
export interface InstanceReadiness {
  ensure(typeFqn: string, signal: AbortSignal): Promise<number>;
  dispose(): void;
}
export interface ReadinessDeps {
  findNamespaces(typeFqn: string): readonly string[];
  hydrate(namespace: string, signal: AbortSignal): Promise<void>;
  waitForWorkerFiles(signal: AbortSignal): Promise<number>;
}
export function createInstanceReadiness(deps: ReadinessDeps): InstanceReadiness;
```

The returned number is the acknowledged worker file revision. `findNamespaces` uses the existing deferred-export lookup, not `split('.')` guesses. Add `setReadiness(readiness: InstanceReadiness | undefined): void` and `prepareInstance(id: string): Promise<void>` to the instance store. `validationStatus[id]` is `'pending' | 'valid' | 'invalid' | 'unavailable'`; schema failures retain diagnostic text separately.

- [ ] **Step 1: Add a readiness ordering test.**

```ts
it('waits for hydrated files to reach the worker', async () => {
  const calls: string[] = [];
  const readiness = createInstanceReadiness({
    findNamespaces: () => ['cdm.base.staticdata.party'],
    hydrate: async ns => { calls.push(`hydrate:${ns}`); },
    waitForWorkerFiles: async () => { calls.push('worker-ready'); return 7; }
  });
  expect(await readiness.ensure('cdm.base.staticdata.party.Address', new AbortController().signal)).toBe(7);
  expect(calls).toEqual(['hydrate:cdm.base.staticdata.party', 'worker-ready']);
  readiness.dispose();
});
```

Add store/provider tests for OPFS restore before worker installation, schema re-generation followed by validation without editing, missing type, failed hydration followed by Retry, and a response arriving after workspace switch. Reuse existing fake OPFS and worker message fixtures.
- [ ] **Step 2: Run red.** `pnpm --filter @rune-langium/studio exec vitest run test/services/instance-readiness.test.ts test/store/instance-store.test.ts test/shell/providers/CodegenProvider.test.tsx`.
- [ ] **Step 3: Add a worker acknowledgement.** Extend `createPreviewSetFilesMessage` and `preview:setFiles` handling with a monotonically increasing `filesRevision`; reply `{ type: 'preview:files-ready', requestId, filesRevision }` only after the new file set is installed. The provider correlates acknowledgements to workspace epoch and current files. Export typed request/reply guards from codegen-service. Do not treat editor hydrationNonce alone as worker readiness; provider file-sync effects can lag it.
- [ ] **Step 4: Implement readiness coordination.** For each requested namespace, register a waiter with the existing HydrationOrchestrator. On callback, inspect hydrated versus failed status; failure rejects with an actionable message instead of repeatedly retrying forever. Share concurrent requests for a type but let each caller abort its waiter. After hydration, explicitly flush the latest workspace-file snapshot through the provider's shared file-sync function, then wait for that dispatch's revision acknowledgement. Reuse this function from the normal provider effect; never resolve from an older already-acknowledged snapshot while React's hydration effect is still pending. Unknown user types reach codegen's real missing-target diagnostic; known deferred types request hydration. Disposing rejects waiters and unsubscribes. Keep the existing five-round cap for dependency retries and provide explicit user Retry after exhaustion.
- [ ] **Step 5: Wire store preparation and invalidation.** `prepareInstance` captures workspace epoch and record revision, marks pending, awaits readiness, then sends the existing instance schema request and validation request against the acknowledged files. Match schema and validation results to latest request IDs plus epoch. Revalidate restored records when the worker becomes ready and when relevant files change. Cancel preparation on deletion/workspace switch; retain values on failure. Detach worker/readiness on provider cleanup. Render Loading/Retry states from InstanceFormPanel; missing diagnostics means pending, never Valid.

```ts
const epoch = get().workspaceEpoch;
await readiness.ensure(record.typeFqn, controller.signal);
if (get().workspaceEpoch !== epoch || !get().instances[id]) return;
get().dispatchGenerateSchema(record.typeFqn);
get().dispatchValidate(id);
```

`workspaceEpoch: number` is a new store field incremented on context change; `controller` is owned by a per-instance preparation map in the store. Remove its entry only if it is still the latest controller.
- [ ] **Step 6: Run green and commit.** Run Step 2, worker tests, Studio type-check. Commit `fix(studio): restore curated instance readiness on reload` with the task's explicit file list.

### Task 2: Make persistence status and record actions truthful

**Files:** Modify `apps/studio/src/store/instance-store.ts`; create `apps/studio/src/store/instance-persistence.ts` by moving the existing queue and OPFS write/delete helpers; extend `apps/studio/test/store/instance-store.test.ts`; create `apps/studio/test/store/instance-persistence.test.ts`.

**Interfaces:** Preserve old create call sites with an optional third argument:

```ts
export interface CreateInstanceInput {
  data?: unknown;
  provenance?: InstanceProvenance;
}
export type InstanceSaveState =
  | { state: 'unsaved' | 'saving' | 'saved'; revision: number }
  | { state: 'failed'; revision: number; message: string };
// New/extended store actions:
createInstance(typeFqn: string, name: string, input?: CreateInstanceInput): string;
renameInstance(id: string, name: string): void;
duplicateInstance(id: string): string;
removeInstance(id: string): Promise<void>;
retrySave(id: string): Promise<void>;
flushInstance(id: string): Promise<void>;
```

Import `InstanceProvenance` from `@rune-langium/codegen/instances`. Add `saveStates: Record<string, InstanceSaveState>` and monotonic record revisions. Actions retain existing data/ID formats.

- [ ] **Step 1: Write tests for snapshot ownership and persistence.**

```ts
it('copies incoming preview values rather than aliasing them', () => {
  const payload = { address: { city: 'London' } };
  const id = useInstanceStore.getState().createInstance('test.Party', 'Party', { data: payload });
  payload.address.city = 'Paris';
  expect(useInstanceStore.getState().instances[id]?.data)
    .toEqual({ address: { city: 'London' } });
});
```

With existing fake OPFS fixture, await `flushInstance(id)` and assert saved state and re-read values. Simulate an old queued write finishing after an edit: it must not mark the newer revision saved. Fail a write, retry it, and reload. Fail deletion: the record must remain visible with an error, not resurrect unexpectedly on reload. Duplicate names auto-suffix within the workspace; duplicate data is a deep copy.
- [ ] **Step 2: Run red.** `pnpm --filter @rune-langium/studio exec vitest run test/store/instance-store.test.ts test/store/instance-persistence.test.ts`.
- [ ] **Step 3: Extract the existing write queue with explicit results.** Key queues by workspace root and instance ID, capture fs/root per operation, return promises, and allow subsequent operations after failure. Keep write/delete ordering. Apply completion status only when workspace epoch and record revision match; report both persistent failure and an Output line. No OPFS context means unsaved, never saved. The queue owns serialization, not a second record cache.
- [ ] **Step 4: Implement lifecycle actions.** `createInstance` uses `structuredClone(input?.data ?? {})` and starts prepare/save. Rename trims, rejects empty names with a user-readable error, and shares name de-duplication with create/duplicate. Duplicate retains type and values but receives a new ID/timestamps and a suffixed name. Delete awaits prior saves and disk deletion before removing the row; during deletion disable conflicting actions for that record. Retry persists the current revision; `flushInstance` rejects the latest failure. Keep unknown JSON fields unchanged.
- [ ] **Step 5: Run green and commit.** Run Step 2, OPFS instance tests, Studio type-check. Commit `feat(studio): expose instance persistence and lifecycle state`.

### Task 3: Build the grid, creation/import controls, and persistent selection

**Files:** Create `apps/studio/src/{store/prototype-view-store.ts,shell/panels/InstanceGridPanel.tsx,components/InstanceCreateDialog.tsx}`; replace `apps/studio/src/shell/perspectives/screens/PrototypePerspective.tsx` composition; modify `apps/studio/src/shell/perspectives/{PerspectiveHost.tsx,prototype-chrome.tsx}`; tests `apps/studio/test/{store/prototype-view-store.test.ts,shell/panels/InstanceGridPanel.test.tsx,components/InstanceCreateDialog.test.tsx,shell/perspectives/screens/PrototypePerspective.test.tsx}`.

**Interfaces:**

```ts
export interface PrototypeViewState {
  selectedId: string | null;
  query: string;
  typeFqn: string | null;
  inspectorTab: 'form' | 'functions';
  graphVisible: boolean;
}
export const DEFAULT_PROTOTYPE_VIEW: PrototypeViewState = {
  selectedId: null, query: '', typeFqn: null, inspectorTab: 'form', graphVisible: false
};
export function filterInstances(records: readonly InstanceRecord[], query: string, typeFqn: string | null): InstanceRecord[];
export interface InstanceSeed { typeFqn: string; data: unknown; provenance?: InstanceProvenance }
```

`usePrototypeViewStore` exposes `activate(workspaceId: string): Promise<void>`, `patch(patch: Partial<PrototypeViewState>): void`, and `state: PrototypeViewState`; capture an activation generation so late settings loads cannot replace a newer workspace. `InstanceCreateDialog` accepts `{ seed?: InstanceSeed; open: boolean; onClose(): void; onCreated(id: string): void }` and uses WorkspaceTypePicker.

- [ ] **Step 1: Write selection/filter and dialog tests.**

```ts
it('keeps selection when a filter hides the row', () => {
  usePrototypeViewStore.getState().patch({ selectedId: 'one', query: 'not a match' });
  expect(usePrototypeViewStore.getState().state.selectedId).toBe('one');
});
```

Render InstanceCreateDialog with seed `{ typeFqn: 'test.Party', data: { name: '' } }`, enter a name, create, and assert the empty required value is retained. Cancel must create nothing. Use two namespaces with Party to verify the shared picker does not select by bare name. Search tests match name/type case-insensitively and preserve store records.
- [ ] **Step 2: Run red.** `pnpm --filter @rune-langium/studio exec vitest run test/store/prototype-view-store.test.ts test/shell/panels/InstanceGridPanel.test.tsx test/components/InstanceCreateDialog.test.tsx test/shell/perspectives/screens/PrototypePerspective.test.tsx`.
- [ ] **Step 3: Implement the view store and grid.** Use foundation `readWorkbenchSettings`/`writeWorkbenchSettings` with perspective `prototype`; persist only preferences. Grid derives records from instance store and shows Name, Type, Validation, Saved/Updated. With one type selected, derive scalar field columns from its real schema; nested values show a compact summary. Use the installed react-virtual for long row lists, accessible row selection, and a visible “Selected instance is outside this filter” notice. Changing selection updates the store once; no cloned instance state in the grid.

```ts
export function filterInstances(records: readonly InstanceRecord[], query: string, typeFqn: string | null) {
  const needle = query.trim().toLocaleLowerCase();
  return records.filter(record => (!typeFqn || record.typeFqn === typeFqn)
    && `${record.name} ${record.typeFqn}`.toLocaleLowerCase().includes(needle));
}
```

- [ ] **Step 4: Compose WorkbenchHost.** Register stable panel components `prototype.inspector`, `prototype.grid`, `prototype.payloadGraph`, and shared utility components. Default build places Inspector first, grid below with about one-third height. Use existing Dockview API addPanel positions, matching foundation contracts. Pass workspaceId from PerspectiveHost. Keep shared header once; do not nest another AppHeader. Reset only Prototype's layout. On narrow widths show one main pane at a time, retain grid collapse controls, and keep the form usable.
- [ ] **Step 5: Wire creation and JSON I/O.** New instance opens the shared picker/naming dialog. Import reads text, calls existing `jsonCodec.import`, displays parse errors distinctly, then creates using the same dialog/seed path. Unknown fields survive. Export awaits `flushInstance`, serializes only `record.data`, and downloads JSON with a sanitized filename; Copy copies the same payload. Use object URLs with `finally` revocation. Add row menu rename/duplicate/delete using Task 2; destructive delete gets an in-app confirmation identifying the instance. Ensure one confirmation cannot delete a newly selected different row. Bundle I/O remains the existing service contract; this task adds single-record controls, not a new bundle format.
- [ ] **Step 6: Run green and commit.** Run Step 2 and Studio type-check. Commit `feat(studio): add prototype grid and instance lifecycle controls`.

### Task 4: Assemble one Inspector with form, validation, and payload

**Files:** Modify `apps/studio/src/{shell/panels/InstanceInspectorPanel.tsx,shell/panels/InstanceFormPanel.tsx,components/FormPreviewPanel.tsx}`; create `apps/studio/src/components/InstancePayloadPanel.tsx`; tests `apps/studio/test/{shell/panels/InstanceInspectorPanel.test.tsx,components/InstancePayloadPanel.test.tsx,components/FormPreviewPanel.test.tsx}`.

**Interfaces:** Add optional presentation props to FormPreviewPanel, preserving Explore defaults:

```ts
export interface PreviewPresentation {
  mode: 'scratch' | 'instance';
  showPayload: boolean;
  showHeader: boolean;
}
export type PayloadView =
  | { kind: 'instance'; value: unknown }
  | { kind: 'inputs'; value: Record<string, unknown> }
  | { kind: 'result'; value: unknown };
```

`InstancePayloadPanel({ payload, onExport }: { payload: PayloadView; onExport(): void }): ReactElement` owns one JSON rendering/copy surface. InstanceInspectorPanel accepts `instanceId: string`, reads identity/save/validation, and contains Form/Functions tabs with payload below.

- [ ] **Step 1: Write the incorrect-copy regression.** Extend the existing controlled FormPreviewPanel render fixture:

```tsx
expect(screen.queryByText('Sample data stays in-memory until you explicitly copy it.'))
  .not.toBeInTheDocument();
expect(screen.getByRole('status', { name: 'Save status' })).toHaveTextContent('Saved');
expect(screen.getByRole('heading', { name: 'Review Address' })).toBeVisible();
```

Add separate pending, failed save, invalid, and unavailable validation fixtures. “Valid” must require a current validation response. Verify switching tabs retains the identity header and exactly one instance payload view.
- [ ] **Step 2: Run red.** `pnpm --filter @rune-langium/studio exec vitest run test/shell/panels/InstanceInspectorPanel.test.tsx test/components/InstancePayloadPanel.test.tsx test/components/FormPreviewPanel.test.tsx`.
- [ ] **Step 3: Make presentation explicit.** InstanceFormPanel passes `{ mode: 'instance', showPayload: false, showHeader: false }`; Explore keeps scratch defaults. InstanceInspectorPanel shows the shared header and save/validation status. Replace Reset's ambiguity with “Reset values” and confirmation for a persisted instance; cancellation preserves values. Render payload once below tabs in a resizable/collapsible region. Keep validated field errors from the worker; no new browser-side schema.
- [ ] **Step 4: Add actionable field context.** Use schema cardinality to display required/multiple hints. For the shared root error `expected array, received undefined` on a required collection, display “Add at least one Street item” with the original diagnostic available as detail. Put this mapping in the shared form presentation utility, keyed by structured schema/error information rather than broad string replacements. Error summary buttons focus the matching field path, including nested array fields; unavailable targets expose Retry.
- [ ] **Step 5: Run green and commit.** Run Step 2 plus instance form tests and Studio type-check. Commit `feat(studio): unify prototype inspector and payload feedback`.

### Task 5: Give function execution independent, correlated inputs and results

**Files:** Create `apps/studio/src/{services/preview-session-client.ts,store/function-session-store.ts}`; modify `apps/studio/src/{shell/providers/CodegenProvider.tsx,services/codegen-service.ts,shell/panels/InstanceFunctionPanel.tsx,components/FormPreviewPanel.tsx}`; tests `apps/studio/test/{services/preview-session-client.test.ts,store/function-session-store.test.ts,shell/panels/InstanceFunctionPanel.test.tsx}`; add parsed-fixture assertions to the existing codegen-worker tests.

**Interfaces:**

```ts
export interface PreviewSessionClient {
  schema(typeFqn: string, signal: AbortSignal): Promise<FormPreviewSchema>;
  execute(functionFqn: string, inputs: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
  dispose(): void;
}
export interface FunctionSessionState {
  functionFqn: string | null;
  boundParameter: string | null;
  inputs: Record<string, unknown>;
  result: unknown;
  status: 'idle' | 'running' | 'succeeded' | 'failed';
  error?: string;
}
```

`createPreviewSessionClient(worker: Worker, readiness: InstanceReadiness): PreviewSessionClient` uses existing `instance:generateSchema` and `preview:execute` messages, with a unique client/request ID prefix. The provider owns a registry of clients and dispatches matching replies before the default singleton preview consumer. `createFunctionSession(client: PreviewSessionClient)` produces `{ getState, subscribe, selectFunction, setInput, bindInstance, run, dispose }`; signatures are `getState(): FunctionSessionState`, `subscribe(listener: () => void): () => void`, `selectFunction(fqn: string): Promise<void>`, `setInput(name: string, value: unknown): void`, `bindInstance(parameter: string, record: InstanceRecord): void`, `run(): Promise<void>`, `dispose(): void`.

- [ ] **Step 1: Write the ownership regression.** With a typed fake worker that captures posted messages, create two clients and send the same function different inputs. Deliver responses in reverse order; each promise receives its own result and singleton Explore preview remains unchanged. Add an abort test and a stale-result-after-function-selection test. Render Function with Explore's Address selected: it must show “Choose a function,” never Address's scratch form.

```ts
expect(screen.getByRole('button', { name: 'Function' })).toBeVisible();
expect(screen.queryByRole('textbox', { name: 'City', exact: true })).not.toBeInTheDocument();
expect(screen.getByText('Choose a function to run')).toBeVisible();
```

- [ ] **Step 2: Run red.** `pnpm --filter @rune-langium/studio exec vitest run test/services/preview-session-client.test.ts test/store/function-session-store.test.ts test/shell/panels/InstanceFunctionPanel.test.tsx`.
- [ ] **Step 3: Implement correlated client requests.** Await readiness, assign an opaque request ID, register resolve/reject callbacks, and post existing messages. Provider response routing must match exact IDs; remove entries on reply, abort, timeout, workspace change, and disposal. A client has a 120-second execution timeout and 30-second schema timeout with visible retryable failure. Worker errors reject every affected pending call. Share the existing worker execution/evaluator implementation; do not change its sandbox or route function schemas through Explore's selected-target channel.
- [ ] **Step 4: Implement explicit function selection/binding.** Keep immutable cached snapshots and notify subscribers on every state transition; consume the session through `useSyncExternalStore(session.subscribe, session.getState)`. Dispose the session when its workspace closes. Use WorkspaceTypePicker with `filterKinds={['func']}`. Load the actual function schema; render other parameters with the same form renderer. Bind the selected instance to an explicitly selected compatible parameter using a cloned input snapshot; changing the instance marks the binding snapshot stale and requires Refresh input. Initial compatibility suggestions may require exact resolved type/cardinality match; keep all functions searchable and do not claim full assignability. Use shared core signature/type normalization for dispatch, aliases, and runtime validation. Additional parameters remain visible and editable. Display “Run,” input snapshot, running/error/result status, and independent result JSON.
- [ ] **Step 5: Preserve temporal and multi-input behavior.** Add a real parsed Rune fixture with Party input plus string suffix and a Party output, execute through the real worker, and validate the result. Also test two consecutive runs where the older reply arrives last and a workspace switch during execution. Avoid assertions against handwritten copies of generated functions.
Use this Rune source through the existing worker-runtime test harness, with inputs `{ party: { name: 'Alice' }, suffix: ' Smith' }` and expected result `{ name: 'Alice Smith' }`:

```rune
namespace test

type Party:
  name string (1..1)

func Rename:
  inputs:
    party Party (1..1)
    suffix string (1..1)
  output:
    result Party (1..1)
  set result:
    Party { name: party -> name + suffix }
```

- [ ] **Step 6: Run green and commit.** Run Step 2, worker suite, Studio type-check. Commit `feat(studio): isolate prototype function sessions`.

### Task 6: Connect previews, types, and function results to saved instances

**Files:** Create `apps/studio/src/services/prototype-navigation.ts`; modify `apps/studio/src/{components/FormPreviewPanel.tsx,shell/panels/FormPreviewPanel.tsx,shell/ExplorePerspective.tsx,shell/panels/InstanceInspectorPanel.tsx,shell/panels/InstanceFunctionPanel.tsx}`; tests `apps/studio/test/{services/prototype-navigation.test.ts,components/FormPreviewPanel.test.tsx,shell/perspectives/screens/PrototypePerspective.test.tsx}`.

**Interfaces:**

```ts
export type PrototypeIntent =
  | { kind: 'create'; seed: InstanceSeed }
  | { kind: 'open'; instanceId: string };
export function requestPrototype(intent: PrototypeIntent): void;
export function viewInstanceType(typeFqn: string): void;
```

Use one Zustand intent holder exported from prototype-navigation; the create dialog consumes an intent exactly once. `requestPrototype` captures current workspace ID; no intent may carry into another workspace. Expose `onCreateInstance?(seed: InstanceSeed): void` and `associatedInstanceId?: string` through FormPreviewPanel's host props; the shared component itself does not import application stores.

- [ ] **Step 1: Add a no-duplicates test.**

```ts
const before = Object.keys(useInstanceStore.getState().instances).length;
requestPrototype({ kind: 'open', instanceId: existingId });
expect(Object.keys(useInstanceStore.getState().instances)).toHaveLength(before);
expect(usePrototypeViewStore.getState().state.selectedId).toBe(existingId);
```

`existingId` comes from `createInstance` at the beginning of the test. Add create cancellation, blank preview, invalid preview, stale workspace intent, and copy-by-value assertions.
- [ ] **Step 2: Run red.** `pnpm --filter @rune-langium/studio exec vitest run test/services/prototype-navigation.test.ts test/components/FormPreviewPanel.test.tsx test/shell/perspectives/screens/PrototypePerspective.test.tsx`.
- [ ] **Step 3: Wire entry points.** Form Preview “Create instance…” seeds current schema target and current values; naming confirmation calls Task 2 create, waits for `flushInstance`, then selects the row/Inspector. On save failure keep dialog/error and created ID so Retry cannot create another record. Type context action seeds `{}`. Associated instances use “Open in Prototype.” Function result “Save as instance…” appears only for a singular supported Data/Choice output resolved from its real signature; arrays require an explicit choice of item and must not be coerced to one object. Primitive results remain copy/export only.
- [ ] **Step 4: Wire return navigation.** “View type in Explore” activates Explore and invokes the existing node-navigation/hydration path. Publish that existing callback through a small context rather than writing only selectedNodeId and bypassing source/graph synchronization. Preserve Prototype state and Explore layout. No duplicate LSP or workers are mounted.
- [ ] **Step 5: Run green and commit.** Run Step 2 and Studio type-check. Commit `feat(studio): connect previews to persistent prototypes`.

### Task 7: Add a truthful, optional payload graph

**Files:** Create `apps/studio/src/{services/instance-payload-graph.ts,shell/panels/InstanceGraphPanel.tsx}`, `apps/studio/test/{services/instance-payload-graph.test.ts,shell/panels/InstanceGraphPanel.test.tsx}`; modify `apps/studio/src/shell/perspectives/screens/PrototypePerspective.tsx`.

**Interfaces:**

```ts
export interface PayloadGraphNode { id: string; instanceId: string; pointer: string; label: string }
export interface PayloadGraphEdge { id: string; source: string; target: string }
export interface PayloadGraph { nodes: PayloadGraphNode[]; edges: PayloadGraphEdge[]; truncated: boolean }
export function buildPayloadGraph(record: InstanceRecord, limit = 150): PayloadGraph;
export function payloadNodeId(instanceId: string, pointer: string): string {
  return JSON.stringify([instanceId, pointer]);
}
```

- [ ] **Step 1: Write a containment-only test.**

```ts
it('does not invent a relationship from a matching identifier', () => {
  const record: InstanceRecord = { id: 'one', name: 'Party', typeFqn: 'test.Party',
    data: { externalId: 'two', address: { city: 'London' } }, createdAt: 0, modifiedAt: 0 };
  const graph = buildPayloadGraph(record);
  expect(graph.nodes.map(n => n.pointer)).toEqual(['', '/address']);
  expect(graph.edges).toEqual([{ id: JSON.stringify(['one', '', '/address']),
    source: payloadNodeId('one', ''), target: payloadNodeId('one', '/address') }]);
});
```

- [ ] **Step 2: Run red.** `pnpm --filter @rune-langium/studio exec vitest run test/services/instance-payload-graph.test.ts test/shell/panels/InstanceGraphPanel.test.tsx`.
- [ ] **Step 3: Implement an iterative JSON walk.** Emit the root and object/array nodes in deterministic property order, using escaped JSON Pointers (`~`→`~0`, `/`→`~1`). Emit only containment edges, cap at 150 nodes, and display truncation with an expand-on-selection route through the form. Scalars appear in compact node summaries, not cross-instance edges. Use existing React Flow and layout facilities; do not add another graph library. Graph node selection retains instanceId and focuses the matching Inspector field; grid selection changes the root. Label the pane “Payload graph.”
- [ ] **Step 4: Run green and commit.** Run Step 2 plus view-store/grid tests. Commit `feat(studio): add optional prototype payload graph`. Update the spec to record these concrete graph semantics and keep cross-instance references a separately scoped feature, not an enabled blank pane.

### Task 8: Verify complete user journeys and document ownership

**Files:** Extend `apps/studio/test/prod-smoke/prototype-workspace-checkout.spec.ts`; create `apps/studio/test/e2e/prototype-workbench.spec.ts`; update `docs/agents/architecture.md`, `docs/TESTING.md`, and the linked design status.

**Interfaces:** UI labels and selectors introduced above are the test boundary. New stable test IDs: `prototype-grid`, `prototype-inspector`, `prototype-save-status`, `prototype-payload`, `prototype-payload-graph`. Existing `prototype-perspective` and rail IDs stay stable.

- [ ] **Step 1: Add the curated regression to the smoke suite.** Use existing model-loader helpers to load CDM, create Address through the picker without selecting it in Explore, edit City/Street, await Saved and Valid, reload, select its row, and assert editable values and Valid without an Explore detour. Browser assertions:

```ts
await expect(page.getByTestId('prototype-save-status')).toHaveText(/Saved/);
await page.reload();
await page.getByTestId('rail-prototype').click();
await page.getByRole('row', { name: /Review Address/ }).click();
await expect(page.getByTestId('prototype-inspector').getByRole('textbox', { name: 'City', exact: true }))
  .toHaveValue('London');
await expect(page.getByTestId('prototype-inspector')).toContainText('Valid');
```

- [ ] **Step 2: Add local end-to-end coverage.** Small uploaded Rune fixture: create from invalid preview and correct it, rename/duplicate/delete, JSON import/export, switch perspectives and workspaces, run a two-input function and save its result, resize grid/payload, toggle graph and focus a nested field. Use actual worker and OPFS; for a save-failure case inject the existing filesystem boundary and assert Retry preserves the ID. Inspect downloaded JSON content, not just a download event.
- [ ] **Step 3: Run the tests and inspect screenshots.** Run Studio tests/type-check/lint, affected visual-editor tests, then local Playwright `pnpm --filter @rune-langium/studio exec playwright test test/e2e/prototype-workbench.spec.ts`. Follow `docs/TESTING.md` for required local services. Inspect light/dark 1280px and wide desktop screenshots and keyboard operation. Record actual results.
- [ ] **Step 4: Update docs and commit.** Document readiness and function-session ownership in architecture; describe the new production journey in TESTING. Commit `test(studio): cover prototype navigation and reload workflows`. Production smoke runs only after a separately authorized deployment; a local pass is not labeled production verification.

## Self-review coverage

Curated reload/revalidation: Task 1. Save/failure/lifecycle semantics: Task 2. Grid, shared picker, independent view preferences: Task 3. Unified Inspector/payload, useful validation: Task 4. Independent functions and explicit inputs/results: Task 5. Preview/type/result navigation and duplicate prevention: Task 6. Optional graph with honest containment semantics: Task 7. Actual full journeys and docs: Task 8. Cross-instance reference creation is explicitly outside this release because neither current InstanceRecord nor the agreed spec defines its storage semantics.
