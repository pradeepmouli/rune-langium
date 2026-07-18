# Production UX Checkout Harness — Phase 2 (Mutation Loop + Completeness) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the mutation-loop and completeness journeys (J8–J11, J18) to the prod-ux checkout harness built in Phase 0-1 (PR #392, merged), per the spec's own Phase 2 scoping (`docs/superpowers/specs/2026-07-16-prod-ux-checkout-harness.md` §8).

**Architecture:** Two kinds of work: (1) a small amount of new production-code instrumentation (a `functionExecute` op-log span, and a new always-on read-only `window.__runeStudioTypeGraph` bridge mirroring the existing `op-log-window-bridge.ts` pattern) that the journeys need to assert against; (2) five new Playwright journey specs under `apps/studio/test/prod-ux/journeys/`, reusing the `checkout` fixture / `EvidenceCollector` / `appendJourneyRecord` machinery from Phase 0-1 unchanged. J8 is foundational — it establishes how a NEW type is authored in the scratch workspace (the app has no graphical "create type" affordance; this is confirmed, not assumed — see Task 2), and J9/J18 reuse a shared scratch-authoring helper rather than duplicating that setup.

**Tech Stack:** Same as Phase 0-1 — Playwright, Zustand stores, the existing `op-log.ts` aggregator, `@rune-langium/visual-editor`'s `useEditorStore`/`selectNodeRepository`.

## Global Constraints

- SPDX headers: `FSL-1.1-ALv2` for every file under `apps/studio/` (this app is source-available, not MIT — matches every other file in this tree).
- **No parallel implementations.** Extend `evidence.ts`/`fixtures.ts`/`anchors.ts`/`op-log.ts` — never fork a second copy of any of them. The type-closure walk logic lives ONLY in a new test-side helper (Task 5); it must not duplicate anything already in `op-log.ts` or `node-repository.ts`.
- **Read-only window globals are always-on, never test-mode-gated.** `window.__runeStudioTypeGraph` (Task 1) follows `op-log-window-bridge.ts`'s exact pattern (Phase 0 Task 4) — NOT `test-api.ts`'s `import.meta.env.MODE === 'test'` gate, which is confirmed unavailable in prod builds.
- **No destructive endpoints.** Every journey in this phase operates on the SCRATCH workspace only (curated corpus is read-only navigation/hydration, never mutated) — this matches J8's own spec title ("workspace file only, never curated").
- **No silent caps.** J18's closure walk must log any truncation into the manifest record, never truncate quietly.
- Run the full `apps/studio` package suite (`pnpm --filter @rune-langium/studio run test`) before considering any task complete — per this repo's established rule, a shared-component/logging behavior change needs the whole suite run, not a subset.
- `pnpm --filter @rune-langium/studio run type-check` must be clean before every task's commit.
- **Correction to prior session memory:** the Code tab's Download action (`CodePreviewPanel.tsx`'s `handleDownloadTarget` → `DownloadConfigDialog` → `downloadTargetViaRouter`) calls `/api/codegen` — the SAME server-backed, historically-503-prone endpoint as the topbar Export Code modal, confirmed by reading `apps/studio/src/services/workspace.ts`'s `downloadTargetViaRouter` (always `fetch('/api/codegen', ...)`, no client-side fallback) and `CodePreviewPanel.tsx`'s `handleDownloadTarget`/`handleDownloadConfirm` (both funnel into `downloadTargetViaRouter`). Only the *rendering* of code output per target (`code-preview-editor`) is genuinely client-side/network-free. Task 4 (J11) treats the download check as a **soft** assertion under the existing `KI-codegen-503` ledger entry, matching J13's precedent for the Export modal — NOT a hard pass/fail as the spec's original wording implied. (A stale memory note claiming the Code tab download is "client-side, distinct from Export Code modal" should be corrected/removed as a follow-up — not part of this plan's scope.)

---

### Task 1: Phase 2 instrumentation — `functionExecute` op-log span + `type-graph-window-bridge.ts`

**Files:**
- Modify: `apps/studio/src/store/preview-store.ts:480-492` (`dispatchExecute`), `apps/studio/src/store/preview-store.ts:458-468` (`receiveExecutionResult`/`receiveExecutionError`)
- Create: `apps/studio/src/services/type-graph-window-bridge.ts`
- Modify: `apps/studio/src/main.tsx` (install the new bridge alongside `installOpLogWindowBridge()`)
- Test: `apps/studio/test/store/preview-store.test.ts` (extend — find the existing file; if none exists, create it following `apps/studio/test/store/model-store.test.ts`'s pattern for the `modelLoad` span, which this instrumentation directly mirrors), `apps/studio/test/services/type-graph-window-bridge.test.ts` (new, mirrors `apps/studio/test/services/op-log-window-bridge.test.ts` — read it first for the exact test pattern to follow)

**Interfaces:**
- Consumes: `allocateOpId` and `fmtLine` from `apps/studio/src/services/op-log.ts` and `apps/studio/src/store/output-store.ts` (unchanged, Phase 0 infra); `useEditorStore`, `selectNodeRepository` from `@rune-langium/visual-editor` (already exported, already imported elsewhere in `apps/studio/src/shell/ExplorePerspective.tsx` — confirmed real import path).
- Produces: `functionExecute` op-log entries (`op: 'functionExecute'`, `subject: funcName`, `durationMs`, `opId`) that Task 3 (J9) reads via `readOpLog(page)`. `window.__runeStudioTypeGraph.snapshot(): Array<{id: string; data: unknown}>` that Task 5 (J18) reads via `page.evaluate()`.

**Design note — why `formRender` is NOT instrumented here:** research this session confirmed `FormPreviewPanel`'s rendering has no single clean async boundary (it's a synchronous schema-generation-then-render, not a worker round-trip like execution). Task 3 (J9) uses a test-side wall-clock stopwatch for `formRender` timing instead — the same pattern this session already established for J03's `cdmLoad` fix (PR #392) when an app-level span didn't cleanly bound the work being measured. Do not add `formRender` instrumentation to `FormPreviewPanel.tsx` in this task.

- [ ] **Step 1: Add the `functionExecute` span to `preview-store.ts`**

Read the current file first — `dispatchExecute`/`receiveExecutionResult`/`receiveExecutionError` are object-literal methods inside the store creator (not `set((state) => ...)` closures), confirmed at these exact lines:

```ts
// Current (preview-store.ts:480-492):
dispatchExecute(funcName, inputs) {
  if (!workerRef) return;
  const worker = workerRef;
  dispatchExecuteCounter++;
  const requestId = `exec:${funcName}:${dispatchExecuteCounter}`;
  _lastExecuteRequestId = requestId;
  worker.postMessage({
    type: 'preview:execute',
    funcName,
    inputs,
    requestId
  });
},
```

```ts
// Current (preview-store.ts:458-468):
receiveExecutionResult(funcName, output) {
  const executionResults = new Map(get().executionResults);
  executionResults.set(funcName, { output });
  set({ executionResults });
},
receiveExecutionError(funcName, error) {
  const executionResults = new Map(get().executionResults);
  executionResults.set(funcName, { output: undefined, error });
  set({ executionResults });
},
```

The span needs to correlate `dispatchExecute`'s start with `receiveExecutionResult`/`receiveExecutionError`'s end, keyed by `funcName` (there's no other correlator available at the store level — `requestId` isn't threaded through to the result handlers per the current message-routing in `CodegenProvider.tsx`, and widening that plumbing is out of scope for this task). Add a module-scope `Map<string, {opId: number; startedAt: number}>` alongside the existing `dispatchExecuteCounter`/`_lastExecuteRequestId` module state:

```ts
// Add near the top, alongside `let dispatchExecuteCounter = 0;`:
const executeSpans = new Map<string, { opId: number; startedAt: number }>();
```

```ts
// dispatchExecute — replace with:
dispatchExecute(funcName, inputs) {
  if (!workerRef) return;
  const worker = workerRef;
  dispatchExecuteCounter++;
  const requestId = `exec:${funcName}:${dispatchExecuteCounter}`;
  _lastExecuteRequestId = requestId;
  executeSpans.set(funcName, { opId: allocateOpId(), startedAt: performance.now() });
  worker.postMessage({
    type: 'preview:execute',
    funcName,
    inputs,
    requestId
  });
},
```

```ts
// receiveExecutionResult — replace with:
receiveExecutionResult(funcName, output) {
  const executionResults = new Map(get().executionResults);
  executionResults.set(funcName, { output });
  set({ executionResults });
  const span = executeSpans.get(funcName);
  if (span) {
    executeSpans.delete(funcName);
    const durationMs = performance.now() - span.startedAt;
    useOutputStore.getState().addLine(fmtLine('functionExecute', 'executed', funcName), 'success', {
      op: 'functionExecute',
      subject: funcName,
      durationMs,
      opId: span.opId
    });
    useActivityStore.getState().addActivity('functionExecute', true, `${funcName} executed`, {
      subject: funcName,
      durationMs,
      opId: span.opId
    });
  }
},
receiveExecutionError(funcName, error) {
  const executionResults = new Map(get().executionResults);
  executionResults.set(funcName, { output: undefined, error });
  set({ executionResults });
  const span = executeSpans.get(funcName);
  if (span) {
    executeSpans.delete(funcName);
    const durationMs = performance.now() - span.startedAt;
    useOutputStore.getState().addLine(fmtLine('functionExecute', 'execute failed', error), 'error', {
      op: 'functionExecute',
      subject: funcName,
      durationMs,
      opId: span.opId
    });
    useActivityStore.getState().addActivity('functionExecute', false, `${funcName} execute failed · ${error}`, {
      subject: funcName,
      durationMs,
      opId: span.opId
    });
  }
},
```

Add the needed imports at the top of `preview-store.ts` (check the existing import block first — `useOutputStore`/`fmtLine`/`useActivityStore`/`allocateOpId` may already be partially imported for other reasons; only add what's missing):
```ts
import { useOutputStore, fmtLine } from './output-store.js';
import { useActivityStore } from './activity-store.js';
import { allocateOpId } from '../services/op-log.js';
```

- [ ] **Step 2: Write a regression test for the new span**

In whichever test file you find/create (see Files above), follow `model-store.ts`'s existing `modelLoad` span test pattern (Task 6 of the Phase 0-1 plan, already merged — read `apps/studio/test/store/model-store.test.ts` for the exact assertion shape: filter `useActivityStore.getState().entries` by `tag`, assert `opId`/`durationMs` are defined on both success and failure paths). Mock `workerRef` via `setWorkerRef` (already an exported action) with a fake `Worker`-shaped object exposing `postMessage`, then directly call `receiveExecutionResult`/`receiveExecutionError` (bypassing the real worker round-trip, matching how this store's OTHER existing tests already exercise it — check the current test file for the established mocking pattern before writing new tests, to stay consistent).

Test cases:
1. `dispatchExecute` + `receiveExecutionResult` → exactly one `functionExecute`-tagged, success activity entry with `opId`/`durationMs` defined.
2. `dispatchExecute` + `receiveExecutionError` → exactly one `functionExecute`-tagged, failure activity entry.
3. `receiveExecutionResult` called for a `funcName` that was never dispatched (no matching span) → does NOT throw, does NOT log an entry (the `if (span)` guard handles this — assert no `functionExecute` entry appears).

- [ ] **Step 3: Run the test**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/store/preview-store.test.ts`
Expected: PASS (existing tests + your 3 new ones).

- [ ] **Step 4: Create `type-graph-window-bridge.ts`**

Read `apps/studio/src/services/op-log-window-bridge.ts` in full first (5-line install function, `declare global` block, no test-mode gate) — this is the exact template to mirror:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useEditorStore, selectNodeRepository } from '@rune-langium/visual-editor';

export interface TypeGraphNodeSnapshot {
  /** = the node's qualified name (makeNodeId(ns, name)). */
  id: string;
  /**
   * The node's raw domain payload (a lossless Dehydrated<T> per the
   * generated domain model — not a synthesized projection). Deliberately
   * NOT pre-extracted into an attribute/type-ref shape here: callers that
   * need to walk a specific node kind's members (Data.attributes,
   * Choice.options, Function.inputs, etc.) do their own kind-specific
   * extraction, keeping this bridge stable across domain-model shape
   * changes instead of duplicating that knowledge into production code.
   */
  data: unknown;
}

export interface RuneStudioTypeGraphBridge {
  snapshot(): TypeGraphNodeSnapshot[];
}

declare global {
  interface Window {
    __runeStudioTypeGraph?: RuneStudioTypeGraphBridge;
  }
}

/**
 * Installs an always-on, read-only window global exposing the currently
 * loaded graph nodes' raw domain data — unlike `test-api.ts`, this is NOT
 * gated by `import.meta.env.MODE`, so it works against the real production
 * build. It exposes nothing beyond what the graph/explorer already render;
 * there is no write method.
 */
export function installTypeGraphWindowBridge(): void {
  window.__runeStudioTypeGraph = {
    snapshot: () => {
      const nodesById = useEditorStore.getState().nodesById;
      const repo = selectNodeRepository(nodesById);
      return repo.all().map((node) => ({ id: node.id, data: node.data }));
    }
  };
}
```

- [ ] **Step 5: Wire the bridge into `main.tsx`**

Read the current file's `installOpLogWindowBridge()` call site (Phase 0 Task 4 added it before `render(...)`, with CSS-import-order comments to preserve). Add the new install call immediately alongside it:

```ts
import { installTypeGraphWindowBridge } from './services/type-graph-window-bridge.js';
// ... alongside the existing installOpLogWindowBridge() call:
installTypeGraphWindowBridge();
```

- [ ] **Step 6: Write a regression test for the bridge**

Mirror `apps/studio/test/services/op-log-window-bridge.test.ts` exactly (read it first). Mock/seed `useEditorStore`'s `nodesById` with 1-2 fake `TypeGraphNode`-shaped entries, call `installTypeGraphWindowBridge()`, assert `window.__runeStudioTypeGraph.snapshot()` returns the expected `{id, data}` pairs.

- [ ] **Step 7: Run tests, type-check, commit**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/type-graph-window-bridge.test.ts test/store/preview-store.test.ts`
Expected: PASS.

Run: `pnpm --filter @rune-langium/studio run type-check`
Expected: clean.

```bash
git add apps/studio/src/store/preview-store.ts apps/studio/src/services/type-graph-window-bridge.ts apps/studio/src/main.tsx apps/studio/test/store/preview-store.test.ts apps/studio/test/services/type-graph-window-bridge.test.ts
git commit -m "feat(studio): add functionExecute op-log span + type-graph window bridge"
```

---

### Task 2: Shared scratch-authoring helper + J8 edit round-trip journey

**Files:**
- Modify: `apps/studio/test/prod-ux/fixtures.ts` (add `authorScratchType` helper)
- Create: `apps/studio/test/prod-ux/journeys/j08-edit-roundtrip.spec.ts`

**Interfaces:**
- Consumes: `checkout`/`expect`/`readOpLog` from `fixtures.ts` (unchanged); `loadCdm`-adjacent pattern for the SCRATCH workspace (J8/J9/J18 use the blank/scratch workspace, not curated CDM — check J01/J02's spec files for how they reach a blank workspace, likely via the "New" button per `dock-chrome.spec.ts`'s `openBlankWorkspace` helper, or reuse `WORKSPACE_FILE_CONTENT`/`WORKSPACE_FILE_NAME` already defined in `fixtures.ts` for the CDM-load flow's starter file).
- Produces: `authorScratchType(page, {name, namespace, attributes})` — an exported helper Task 3 (J9) and Task 5 (J18) both call to get a deterministic, real scratch type in place before their own assertions.

**Confirmed design constraint (do not deviate without re-verifying):** this app has **no graphical "create new type" UI**. `packages/visual-editor/src/components/editors/TypeCreator.tsx` and `editor-store.ts`'s `createType` action are fully implemented but have zero JSX call sites anywhere in `apps/studio/src` or `packages/visual-editor/src` — confirmed via full-tree search this session. Every existing e2e test that involves a "new" type loads a pre-written `.rosetta` file via file input, then edits *existing* nodes graphically. Type creation for J8 must happen by typing raw Rune DSL text directly into the Source CodeMirror editor and letting the app's debounced reparse pick it up — this is genuinely new (first-of-its-kind) e2e territory for this app, not a well-trodden path. Before writing the full journey, the implementer MUST manually verify this works (e.g. via the `claude-in-chrome` MCP tools against the live site, or a local dev server) — type a `type Foo: bar string (1..1)` block into an already-open scratch workspace's Source pane and confirm a new graph node for `Foo` appears in the explorer/graph. If this does NOT work as expected, STOP and report back — do not silently substitute a different approach (e.g. re-uploading a modified file) without checking with the plan owner, since that would test a materially different code path (file-load parsing) than what J8 is meant to cover (live-edit reparse).

- [ ] **Step 1: Add `authorScratchType` to `fixtures.ts`**

This helper must, in order: (1) ensure a scratch workspace is loaded with the Source pane open (reuse `loadCdm`'s early steps as a reference — but this is a BLANK workspace, not CDM; check `j01-first-run.spec.ts`/`j02-workspace-lifecycle.spec.ts` for how they reach a fresh blank workspace, since J8 needs that same starting point); (2) open the Source pane (`getByRole('button', {name: 'Source'})`, matching J07's established pattern); (3) type the given type definition into `.cm-content` (CodeMirror); (4) wait for the new type to appear navigably in the explorer (via `namespaceSearch.fill(name)` + `getByTestId(\`ns-type-nav-${nodeId}\`)`, matching J04's pattern) as proof the reparse succeeded.

```ts
export interface ScratchAttributeSpec {
  name: string;
  typeName: string;
  cardinality: string; // e.g. '(1..1)', '(0..*)'
}

export interface ScratchTypeSpec {
  name: string;
  namespace: string;
  attributes: ScratchAttributeSpec[];
}

/**
 * Authors a new Data type in the scratch workspace by typing raw Rune DSL
 * into the Source editor — this app has no graphical "create type" UI (see
 * Task 2's design note in the Phase 2 plan). Shared by J8, J9, and J18 so
 * each doesn't duplicate this setup independently.
 */
export async function authorScratchType(page: Page, spec: ScratchTypeSpec): Promise<void> {
  await page.getByRole('button', { name: 'Source' }).click();
  const attributeLines = spec.attributes
    .map((a) => `  ${a.name} ${a.typeName} ${a.cardinality}`)
    .join('\n');
  const dsl = `namespace ${spec.namespace}\n\ntype ${spec.name}:\n${attributeLines}\n`;
  const editor = page.locator('.cm-content');
  await editor.click();
  await editor.press('Control+A'); // clear existing content — Meta+A on mac handled by Playwright's platform normalization; verify against J07/source-editor patterns for the actual modifier convention this app's tests use
  await editor.pressSequentially(dsl);

  const namespaceSearch = page.getByTestId('namespace-search');
  await namespaceSearch.fill(spec.name);
  await expect(page.getByTestId(`ns-type-nav-${spec.namespace}.${spec.name}`)).toBeVisible({ timeout: 15000 });
}
```

(The exact node-id format `${spec.namespace}.${spec.name}` and the `Control+A`-vs-platform-modifier question must be verified against this app's real Source-editor testid/interaction conventions during implementation — read `apps/studio/test/e2e/source-editor.spec.ts` and `apps/studio/test/e2e/undo-redo.spec.ts` for the established `Meta`-vs-`Control` platform-detection pattern (`process.platform === 'darwin' ? 'Meta' : 'Control'`) already used elsewhere in this repo, and reuse it rather than hardcoding `Control`.)

- [ ] **Step 2: Write `j08-edit-roundtrip.spec.ts`**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { checkout as test, expect, authorScratchType } from '../fixtures.js';

const platformModifier = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe('J8 — Edit round-trip (workspace file only, never curated)', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J8 create, add attribute, set cardinality, rename, undo/redo, reload persists', async ({ page, evidence }) => {
    // Setup: reach a fresh blank workspace (mirror J01/J02's start-page → New flow).
    // ... [implementer: reuse the exact blank-workspace-reach sequence from j02-workspace-lifecycle.spec.ts]

    await authorScratchType(page, {
      name: 'ScratchOrder',
      namespace: 'scratch.j8',
      attributes: [{ name: 'quantity', typeName: 'number', cardinality: '(1..1)' }]
    });
    await evidence.checkpoint('type-created');

    // Add an attribute via the graphical form (DataTypeForm.tsx add-attribute-btn).
    // Click the newly-created node to open its form panel (verify the current
    // click-to-open pattern against ExplorePerspective's wiring — this session's
    // research found `[data-slot="editor-form-panel"]` as a LEGACY selector that
    // predates the current shell; confirm/update against the live app before use).
    await page.getByTestId(`ns-type-nav-scratch.j8.ScratchOrder`).click();
    await page.getByRole('tab', { name: 'Members' }).click();
    await page.locator('[data-slot="add-attribute-btn"]').click();
    const newRow = page.locator('[data-slot="attribute-row"]').last(); // verify exact row selector against AttributeRow.tsx
    await newRow.getByRole('textbox', { name: /name/i }).fill('notes');
    // TypeReferenceField (Popover+chip) — click the type chip, type 'string', select it.
    // CardinalityPicker (Popover+chip) — click the cardinality chip, select a preset.
    // [implementer: verify both exact click sequences against CardinalityPicker.tsx/TypeReferenceField.tsx directly before finalizing]
    await evidence.checkpoint('attribute-added');

    // Rename (500ms debounced auto-save — DataTypeForm.tsx's useAutoSave).
    const nameInput = page.getByRole('textbox', { name: /type name/i });
    await nameInput.fill('ScratchOrderRenamed');
    await page.waitForTimeout(600); // clear the 500ms debounce
    await expect(page.getByText('ScratchOrderRenamed', { exact: true })).toBeVisible();
    await evidence.checkpoint('renamed');

    // Undo x2 / redo x2 — keyboard-only, no button testid (confirmed this session).
    await page.keyboard.press(`${platformModifier}+z`);
    await page.keyboard.press(`${platformModifier}+z`);
    await expect(page.getByText('ScratchOrder', { exact: true })).toBeVisible(); // back to original name
    await page.keyboard.press(`${platformModifier}+Shift+z`);
    await page.keyboard.press(`${platformModifier}+Shift+z`);
    await expect(page.getByText('ScratchOrderRenamed', { exact: true })).toBeVisible(); // redo restores rename
    await evidence.checkpoint('undo-redo');

    // Reload: saveWorkspaceFiles fires synchronously on every content change
    // (confirmed this session — NOT debounced, unlike the 500ms reparse), so
    // the UI already reflecting the edit is a safe proxy that OPFS has it.
    await page.reload();
    await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });
    await namespaceSearchAfterReload(page); // [implementer: re-search + assert ScratchOrderRenamed still present, still has the added attribute]
    await evidence.checkpoint('reloaded-persisted');

    // Source tab reflects the edits (source-graph sync) — J07's established pattern.
    await page.getByRole('button', { name: 'Source' }).click();
    await expect(page.getByText('ScratchOrderRenamed', { exact: false })).toBeVisible();
    await evidence.checkpoint('source-sync-verified');
  });
});
```

This test skeleton is intentionally left with a few `[implementer: verify ...]` markers at points this session's research could not fully pin down (the exact attribute-row/type-picker click sequence, the legacy `editor-form-panel` selector, the post-reload namespace re-search helper). These are NOT placeholders in the "no placeholders" sense — they're concrete, narrow, single-file verification tasks with a clear method (read the named component file, or use `claude-in-chrome` against the live/dev app) — resolve them during implementation, not by guessing.

- [ ] **Step 3: Manually verify the Source-editor type-creation step BEFORE finalizing the rest**

Before writing the remaining steps' exact selectors, use the `claude-in-chrome` MCP tools (or a local `pnpm --filter @rune-langium/studio dev` server) to manually confirm typing DSL into `.cm-content` produces a navigable graph node. If it doesn't work as expected (e.g. requires an explicit "Apply"/blur action, or the reparse needs a different trigger), update `authorScratchType` accordingly and note the real mechanism in a comment.

- [ ] **Step 4: Run the journey against production**

Run: `PLAYWRIGHT_PROD_SMOKE=1 pnpm --filter @rune-langium/studio exec playwright test --config playwright.prod.config.ts prod-ux/journeys/j08-edit-roundtrip.spec.ts`
Expected: PASS. Inspect `apps/studio/test/prod-ux/report/run-manifest.json` and the checkpoint screenshots for `J8` to confirm each step's screenshot shows the expected state.

- [ ] **Step 5: Run full suite, type-check, commit**

Run: `pnpm --filter @rune-langium/studio run type-check` — clean.
Run: `pnpm --filter @rune-langium/studio exec playwright test --config playwright.prod.config.ts prod-ux/journeys --list` — confirm 11 journeys now listed (10 from Phase 0-1 + J8), zero collection errors.

```bash
git add apps/studio/test/prod-ux/fixtures.ts apps/studio/test/prod-ux/journeys/j08-edit-roundtrip.spec.ts
git commit -m "feat(prod-ux): add J8 edit round-trip journey + scratch-authoring helper"
```

---

### Task 3: J9 — form preview & function execution journey

**Files:**
- Modify: `apps/studio/test/prod-ux/anchors.ts` (add `ANCHOR_FUNCTION`)
- Create: `apps/studio/test/prod-ux/journeys/j09-form-function.spec.ts`

**Interfaces:**
- Consumes: `authorScratchType` from Task 2's `fixtures.ts`; `readOpLog`, `checkout`, `expect`; the `functionExecute` op-log entries from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Pick and verify `ANCHOR_FUNCTION`**

`anchors.ts` currently has `ANCHOR_ENUM`/`ANCHOR_DATA`/`ANCHOR_NEVER_HYDRATED_DATA` — no function anchor exists yet. Find a small, low-churn curated-corpus function (check `.resources/` for the real curated corpus tree, or `packages/codegen/test/fixtures/funcs/*` for real CDM function examples already used in this repo's own codegen test suite — e.g. something in the spirit of `add-two`/`accumulator` naming seen in that fixture directory, but the REAL curated corpus fqn, not a test fixture name). Verify it against the live curated manifest before locking it in (the same verification discipline `ANCHOR_DATA`/`ANCHOR_ENUM` already document in their own comments — read those comments in `anchors.ts` for the exact "why this fqn is stable" convention to follow). Add:

```ts
/**
 * [implementer: fill in the same "why stable" justification style as
 * ANCHOR_DATA/ANCHOR_ENUM above, once a real curated function fqn is
 * chosen and verified against the live curated manifest]
 */
export const ANCHOR_FUNCTION = '<fqn>';
```

- [ ] **Step 2: Write `j09-form-function.spec.ts`**

Structure: load CDM (curated anchor available), separately author a scratch type+function via `authorScratchType`/a new small scratch-function-authoring step (functions also have no graphical "create" UI by the same constraint established in Task 2 — author via Source DSL the same way).

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { checkout as test, expect, loadCdm, authorScratchType, readOpLog } from '../fixtures.js';
import { ANCHOR_DATA, ANCHOR_FUNCTION } from '../anchors.js';

test.describe('J9 — Form preview & function execution', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J9 form preview + validation for curated and scratch data types', async ({ page, evidence }) => {
    await loadCdm(page);
    // Navigate to ANCHOR_DATA, open Form preview.
    // formRender timing: test-side stopwatch (no app span exists — see Task 1's design note).
    const curatedFormStartedAt = Date.now();
    // [navigate to ANCHOR_DATA via namespace-search + ns-type-nav, matching J04's pattern]
    await page.getByRole('button', { name: 'Form' }).click();
    await expect(page.getByTestId('panel-formPreview')).toBeVisible({ timeout: 20000 });
    const curatedFormRenderMs = Date.now() - curatedFormStartedAt;
    // Enter an invalid value → assert a `role="alert"` validation message renders
    // (FormPreviewPanel.tsx:706-712 — confirmed this session as the app's own
    // hand-rolled field-error renderer, not a raw z2f component).
    // [fill an invalid value into a required field, assert getByRole('alert') visible]
    // Enter a valid value → assert the alert clears.
    await evidence.checkpoint('curated-form-preview');

    await authorScratchType(page, {
      name: 'ScratchWidget',
      namespace: 'scratch.j9',
      attributes: [{ name: 'label', typeName: 'string', cardinality: '(1..1)' }]
    });
    const scratchFormStartedAt = Date.now();
    await page.getByRole('button', { name: 'Form' }).click();
    await expect(page.getByTestId('panel-formPreview')).toBeVisible({ timeout: 20000 });
    const scratchFormRenderMs = Date.now() - scratchFormStartedAt;
    // [repeat invalid/valid validation check for the scratch type]
    await evidence.checkpoint('scratch-form-preview');

    if (curatedFormRenderMs > 5000 || scratchFormRenderMs > 5000) {
      evidence.softFinding('formRender-budget', `formRender took ${Math.max(curatedFormRenderMs, scratchFormRenderMs)}ms`);
    }
  });

  test('J9 executes a curated corpus function and a scratch-authored function', async ({ page, evidence }) => {
    await loadCdm(page);
    // [navigate to ANCHOR_FUNCTION, open Form preview which switches into execution mode
    //  per FormPreviewPanel.tsx's schema.kind === 'function' branch]
    await page.getByRole('button', { name: 'Run' }).click();
    // Output renders under a "Output:" label in a <pre class="preview-panel__sample-output">
    // (confirmed this session — no testid, locate via text/class).
    await expect(page.locator('.preview-panel__sample-output')).toBeVisible({ timeout: 20000 });
    await evidence.checkpoint('curated-function-executed');

    // [author a scratch function with a trivial body via Source DSL, same
    //  no-graphical-creation constraint as types — see Task 2's design note]
    await page.getByRole('button', { name: 'Run' }).click();
    await expect(page.locator('.preview-panel__sample-output')).toBeVisible({ timeout: 20000 });
    await evidence.checkpoint('scratch-function-executed');

    const opLog = await readOpLog(page);
    const executeEntries = opLog.filter((e) => e.op === 'functionExecute');
    expect(executeEntries.length, 'expected functionExecute op-log entries (Task 1 instrumentation)').toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run the journey against production, verify manifest**

Run: `PLAYWRIGHT_PROD_SMOKE=1 pnpm --filter @rune-langium/studio exec playwright test --config playwright.prod.config.ts prod-ux/journeys/j09-form-function.spec.ts`
Expected: PASS. Confirm `functionExecute` entries appear in the manifest's `opLog` field for this journey (Task 1's instrumentation feeding through Phase 0's already-built `opLog` capture — no new plumbing needed here).

- [ ] **Step 4: Full suite, type-check, commit**

```bash
git add apps/studio/test/prod-ux/anchors.ts apps/studio/test/prod-ux/journeys/j09-form-function.spec.ts
git commit -m "feat(prod-ux): add J9 form preview & function execution journey"
```

---

### Task 4: J10 (expression lens) + J11 (codegen Code tab) journeys

**Files:**
- Create: `apps/studio/test/prod-ux/journeys/j10-expression-lens.spec.ts`
- Create: `apps/studio/test/prod-ux/journeys/j11-codegen-code-tab.spec.ts`

**Interfaces:**
- Consumes: `authorScratchType`-adjacent scratch-function-authoring (same pattern established in Task 3 for J9's scratch function — reuse verbatim, don't re-derive) for J10's expression-bearing member; `loadCdm`/`ANCHOR_DATA` for J11's curated anchor.

- [ ] **Step 1: Write `j10-expression-lens.spec.ts`**

`LanguageLensEditor` (confirmed this session at `apps/studio/src/components/LanguageLensEditor.tsx`) has no testids — selectors are plain button text (`getByRole('button', {name: 'Rune'|'TypeScript'|'Python'})`) and `role="textbox"` with `aria-label="{Language} expression"`. It's mounted as a FUNCTION's condition/precondition expression editor via `ExpressionEditorSlotProps` — so this journey needs a scratch function with a condition, same authoring constraint as J9's scratch function (reuse that setup).

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { checkout as test, expect } from '../fixtures.js';

test.describe('J10 — Expression language lens', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J10 Rune to TypeScript to Python and back round-trips without drift or console errors', async ({ page, evidence }) => {
    // [author a scratch function with a condition expression via Source DSL —
    //  reuse the same scratch-function-authoring step from J9's Task 3, do not
    //  duplicate; if it's not already factored into a shared fixtures.ts
    //  helper by the time this task runs, factor it out now rather than
    //  copy-pasting inline]
    await page.getByRole('button', { name: 'TypeScript' }).click();
    await expect(page.getByRole('textbox', { name: 'TypeScript expression' })).toBeVisible();
    await evidence.checkpoint('toggled-typescript');

    await page.getByRole('button', { name: 'Python' }).click();
    await expect(page.getByRole('textbox', { name: 'Python expression' })).toBeVisible();
    await evidence.checkpoint('toggled-python');

    await page.getByRole('button', { name: 'Rune' }).click();
    // No drift: the original Rune text is unchanged. No RawDsl residue: neither
    // the "can't be shown in {Language}" message nor a foreignError paragraph
    // is left visible (confirmed this session as the two real DOM markers for
    // a stuck/residue state — both plain rendered text, no dedicated testid).
    await expect(page.getByText(/can't be shown in/i)).toHaveCount(0);
    await evidence.checkpoint('back-to-rune');
  });
});
```

- [ ] **Step 2: Write `j11-codegen-code-tab.spec.ts`**

`CodePreviewPanel.tsx` testids (confirmed this session): `panel-codePreview`, `codegen-active-target` (Select trigger), `codegen-status`, `code-preview-editor`. Targets selectable: TypeScript, Zod, JSON Schema, OpenAPI, SQL. Download buttons: `codegen-targets-table__download-{target}` (e.g. `-typescript`, `-zod`, `-jsonschema`, `-openapi`, `-sql`) — **per this plan's Global Constraints correction, the download action calls `/api/codegen` (the same historically-503-prone endpoint as Export), so it must be a SOFT assertion under `KI-codegen-503`, not a hard pass/fail.**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { checkout as test, expect, loadCdm } from '../fixtures.js';
import { ANCHOR_DATA } from '../anchors.js';

const TARGETS = ['typescript', 'zod', 'jsonschema', 'openapi', 'sql'] as const;

test.describe('J11 — Client-side codegen (Code tab)', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J11 Code tab renders non-empty output per target for scratch and curated anchor', async ({ page, evidence }) => {
    await loadCdm(page);
    // [navigate to ANCHOR_DATA]
    await page.getByRole('button', { name: 'Code' }).click();
    await expect(page.getByTestId('panel-codePreview')).toBeVisible({ timeout: 20000 });

    for (const target of TARGETS) {
      await page.getByTestId('codegen-active-target').click();
      await page.getByRole('option', { name: new RegExp(target, 'i') }).click();
      await expect(page.getByTestId('codegen-status')).toContainText(/Generated/i, { timeout: 20000 });
      const output = await page.getByTestId('code-preview-editor').textContent();
      expect(output?.trim().length ?? 0, `expected non-empty ${target} output`).toBeGreaterThan(0);
    }
    await evidence.checkpoint('all-targets-rendered');

    // Download — SOFT assertion under KI-codegen-503 (see this plan's Global
    // Constraints correction: this path is server-backed /api/codegen, same
    // as the topbar Export Code modal, NOT a distinct client-side path).
    try {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15000 }),
        page.getByTestId('codegen-targets-table__download-typescript').click()
      ]);
      expect(download.suggestedFilename().length).toBeGreaterThan(0);
    } catch (err) {
      evidence.softFinding('KI-codegen-503', `Code tab download failed or timed out: ${err instanceof Error ? err.message : String(err)}`);
    }
    await evidence.checkpoint('download-attempted');
  });
});
```

- [ ] **Step 3: Run both journeys against production**

Run: `PLAYWRIGHT_PROD_SMOKE=1 pnpm --filter @rune-langium/studio exec playwright test --config playwright.prod.config.ts prod-ux/journeys/j10-expression-lens.spec.ts prod-ux/journeys/j11-codegen-code-tab.spec.ts`
Expected: PASS (J11's download soft-finding is acceptable either way — it must not hard-fail the journey).

- [ ] **Step 4: Full suite, type-check, commit**

```bash
git add apps/studio/test/prod-ux/journeys/j10-expression-lens.spec.ts apps/studio/test/prod-ux/journeys/j11-codegen-code-tab.spec.ts
git commit -m "feat(prod-ux): add J10 expression lens + J11 codegen Code tab journeys"
```

---

### Task 5: J18 — data-type closure mapping (scripted completeness check)

**Files:**
- Create: `apps/studio/test/prod-ux/type-closure.ts` (the walk algorithm — test-side only, no production code)
- Create: `apps/studio/test/prod-ux/journeys/j18-type-closure.spec.ts`
- Modify: `apps/studio/test/prod-ux/evidence.ts` (add `typeClosure` field to `JourneyRecord`)

**Interfaces:**
- Consumes: `window.__runeStudioTypeGraph.snapshot()` from Task 1's bridge (via `page.evaluate()`); `TypeLink.tsx`'s `disabled`-state pattern for the DOM-level "unmapped" cross-check; `authorScratchType` from Task 2.
- Produces: `JourneyRecord.typeClosure` manifest record, consumed by the `prod-ux-review` SKILL.md's existing "Type-closure mapping (J18)" review procedure (already written in Phase 0-1 — verify it still matches this record's actual shape once implemented; update the skill doc if it drifts).

**Design decisions locked in by this plan (per spec's own Open Question #4, which explicitly leaves this to the plan author):**
- Curated root: reuse the existing `ANCHOR_DATA` from `anchors.ts` — no new anchor needed.
- Closure size: cap the walk at **150 visited nodes**, matching the spec's own suggested example exactly. Any truncation is logged into the manifest's `typeClosure.truncated: boolean` field — never silent, per this plan's Global Constraints.
- Cycle safety: a `Set<string>` of visited fqns, checked before recursing into any sub-type.

- [ ] **Step 1: Write the closure-walk algorithm in `type-closure.ts`**

This walks the bridge's raw `{id, data}` snapshots. Since `data` is the raw domain payload (Data has `.attributes`, Choice has `.options`, Enum has neither), the walker must branch on `$type`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type { Page } from '@playwright/test';

export interface TypeClosureResult {
  rootFqn: string;
  visited: string[];
  mapped: string[];
  unmapped: string[];
  hydrationsTriggered: number;
  truncated: boolean;
}

const VISITED_CAP = 150;

/**
 * Reads the current window.__runeStudioTypeGraph snapshot and extracts a
 * given node's outgoing type references — branches on $type since Data,
 * Choice, and Enum shapes differ (Data.attributes[].typeCall.type.$refText,
 * Choice.options[].typeCall.type.$refText, Enum has none).
 * [implementer: verify these exact field paths against the real generated
 * domain model — AttributeRow.tsx's doc comment (packages/visual-editor/src/
 * components/editors/AttributeRow.tsx) documents the canonical AST paths
 * for Data; confirm Choice's equivalent in ChoiceForm.tsx before finalizing]
 */
function extractTypeRefs(nodeData: unknown): string[] {
  const data = nodeData as { $type?: string; attributes?: unknown[]; options?: unknown[] };
  const members = data.$type === 'Choice' ? (data.options ?? []) : (data.attributes ?? []);
  const refs: string[] = [];
  for (const m of members as Array<{ typeCall?: { type?: { $refText?: string } } }>) {
    const refText = m.typeCall?.type?.$refText;
    if (refText) refs.push(refText);
  }
  return refs;
}

const BUILTIN_TYPES = new Set(['string', 'number', 'boolean', 'date', 'dateTime', 'time', 'int', 'string']); // [implementer: confirm the exact builtin list against BUILTIN_TYPES already exported from @rune-langium/visual-editor per ExplorePerspective.tsx's import — reuse that constant, do not redefine it here]

/**
 * Walks the transitive attribute-type closure from `rootFqn`. Triggers
 * on-demand hydration for never-visited namespaces by navigating to each
 * discovered sub-type via the explorer (TypeLink's disabled state is the
 * "unmapped" signal — a node the bridge snapshot doesn't contain after
 * navigation+wait is genuinely unmapped, not just not-yet-hydrated).
 */
export async function walkTypeClosure(page: Page, rootFqn: string, namespaceSearchTestId: string): Promise<TypeClosureResult> {
  const visited = new Set<string>();
  const mapped: string[] = [];
  const unmapped: string[] = [];
  let hydrationsTriggered = 0;
  let truncated = false;
  const queue = [rootFqn];

  while (queue.length > 0) {
    const fqn = queue.shift()!;
    if (visited.has(fqn)) continue;
    if (visited.size >= VISITED_CAP) {
      truncated = true;
      break;
    }
    visited.add(fqn);

    // Navigate to fqn (triggers hydration if never-visited) — reuse J04's
    // namespace-search + ns-type-nav pattern.
    const shortName = fqn.split('.').pop()!;
    await page.getByTestId(namespaceSearchTestId).fill(shortName);
    const navLink = page.getByTestId(`ns-type-nav-${fqn}`);
    const isVisible = await navLink.isVisible().catch(() => false);
    if (!isVisible) {
      unmapped.push(fqn);
      continue;
    }
    await navLink.click();
    hydrationsTriggered++;

    const snapshot = await page.evaluate(() => window.__runeStudioTypeGraph?.snapshot() ?? []);
    const node = snapshot.find((n) => n.id === fqn);
    if (!node) {
      unmapped.push(fqn);
      continue;
    }
    mapped.push(fqn);

    for (const ref of extractTypeRefs(node.data)) {
      if (BUILTIN_TYPES.has(ref)) continue;
      if (!visited.has(ref)) queue.push(ref);
    }
  }

  return { rootFqn, visited: [...visited], mapped, unmapped, hydrationsTriggered, truncated };
}
```

- [ ] **Step 2: Extend `JourneyRecord` in `evidence.ts`**

```ts
export interface TypeClosureRecord {
  rootFqn: string;
  rootKind: 'curated' | 'scratch';
  visitedCount: number;
  mappedCount: number;
  unmapped: string[];
  hydrationsTriggered: number;
  truncated: boolean;
  typeClosureWalkMs: number;
}
```

Add `typeClosure?: TypeClosureRecord[];` to `JourneyRecord` (optional — only J18 populates it; every other journey's `finish()` call passes nothing for it, defaulting to `undefined`, matching how `previousAttempts` is already optional on this same interface).

Thread it through `EvidenceCollector.finish()` — add an optional parameter, mirroring how `opLog` was added in Phase 0-1:
```ts
async finish(verdict: JourneyRecord['verdict'], opLog: OpLogEntry[] = [], typeClosure: TypeClosureRecord[] = []): Promise<JourneyRecord> {
  return {
    // ...existing fields...
    typeClosure: typeClosure.length > 0 ? typeClosure : undefined
  };
}
```

- [ ] **Step 3: Write `j18-type-closure.spec.ts`**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { checkout as test, expect, loadCdm, authorScratchType } from '../fixtures.js';
import { ANCHOR_DATA } from '../anchors.js';
import { walkTypeClosure } from '../type-closure.js';

test.describe('J18 — Data-type closure mapping (scripted completeness check)', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J18 walks the curated and scratch type closures with zero unmapped', async ({ page, evidence }) => {
    await loadCdm(page);
    await page.getByTestId('rail-explore').click();
    await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });

    const curatedStartedAt = Date.now();
    const curatedResult = await walkTypeClosure(page, ANCHOR_DATA, 'namespace-search');
    const curatedWalkMs = Date.now() - curatedStartedAt;
    await evidence.checkpoint('curated-closure-walked');

    // The J8 type, extended with a nested type, enum, and choice reference.
    await authorScratchType(page, {
      name: 'ScratchClosureRoot',
      namespace: 'scratch.j18',
      attributes: [
        { name: 'nested', typeName: 'ScratchClosureNested', cardinality: '(1..1)' },
        { name: 'status', typeName: 'ScratchClosureEnum', cardinality: '(1..1)' }
        // [implementer: also author ScratchClosureNested (Data) and
        //  ScratchClosureEnum (Enum) and a Choice-typed attribute in the
        //  same authorScratchType DSL block or a follow-up one — the spec
        //  requires all three referenced-type kinds present in the closure]
      ]
    });
    const scratchStartedAt = Date.now();
    const scratchResult = await walkTypeClosure(page, 'scratch.j18.ScratchClosureRoot', 'namespace-search');
    const scratchWalkMs = Date.now() - scratchStartedAt;
    await evidence.checkpoint('scratch-closure-walked');

    // Form preview: no unknown-type stub for any field on the root.
    // [implementer: FormPreviewPanel.tsx's unresolved-type-field marker was
    //  NOT confirmed this session — read the component's field-rendering
    //  switch/fallback for an unmatched typeKind before writing this
    //  assertion; if no distinct DOM marker exists, narrow this specific
    //  sub-check to "form preview renders without throwing / without a
    //  visible error banner" and note the gap rather than asserting
    //  something unverifiable]
    await page.getByRole('button', { name: 'Form' }).click();
    await expect(page.getByTestId('panel-formPreview')).toBeVisible({ timeout: 20000 });

    const scratchUnmapped = scratchResult.unmapped;
    expect(scratchUnmapped, `scratch closure has unmapped types (unambiguous regression): ${scratchUnmapped.join(', ')}`).toEqual([]);

    if (curatedResult.unmapped.length > 0) {
      evidence.softFinding(
        'typeClosure-curated-unmapped',
        `curated closure has ${curatedResult.unmapped.length} unmapped types — review agent must check for corpus-drift: ${curatedResult.unmapped.join(', ')}`
      );
    }
    if (curatedResult.truncated || scratchResult.truncated) {
      evidence.softFinding('typeClosure-truncated', `closure walk hit the ${150} visited cap — see manifest for details`);
    }

    const opLog = await import('../fixtures.js').then((m) => m.readOpLog(page));
    const record = await evidence.finish('PASS', opLog, [
      {
        rootFqn: ANCHOR_DATA,
        rootKind: 'curated',
        visitedCount: curatedResult.visited.length,
        mappedCount: curatedResult.mapped.length,
        unmapped: curatedResult.unmapped,
        hydrationsTriggered: curatedResult.hydrationsTriggered,
        truncated: curatedResult.truncated,
        typeClosureWalkMs: curatedWalkMs
      },
      {
        rootFqn: 'scratch.j18.ScratchClosureRoot',
        rootKind: 'scratch',
        visitedCount: scratchResult.visited.length,
        mappedCount: scratchResult.mapped.length,
        unmapped: scratchResult.unmapped,
        hydrationsTriggered: scratchResult.hydrationsTriggered,
        truncated: scratchResult.truncated,
        typeClosureWalkMs: scratchWalkMs
      }
    ]);
    expect(record.typeClosure).toBeDefined();
  });
});
```

Note: this test builds its own `JourneyRecord` and calls `finish()`/appends it directly rather than relying purely on the `evidence` fixture's automatic teardown (which only calls `finish(verdict, opLog)` with no `typeClosure` arg) — because `typeClosure` is a J18-specific field the generic fixture teardown doesn't know about. Verify during implementation whether this causes a DOUBLE manifest append (once from this explicit call, once from the fixture's own teardown) — if so, either thread `typeClosure` through the fixture's `evidence` object as new mutable state (an `evidence.setTypeClosure(records)` method, checked by the generic teardown before calling `finish`) instead of calling `finish` directly in the test, which is the cleaner fix — do NOT ship a double-append.

- [ ] **Step 4: Run against production, verify manifest**

Run: `PLAYWRIGHT_PROD_SMOKE=1 pnpm --filter @rune-langium/studio exec playwright test --config playwright.prod.config.ts prod-ux/journeys/j18-type-closure.spec.ts`
Expected: PASS. Confirm `run-manifest.json`'s J18 record has a well-formed `typeClosure` array with two entries, `unmapped: []` for the scratch root.

- [ ] **Step 5: Update `prod-ux-review` SKILL.md if the record shape drifted**

Read `.agents/skills/prod-ux-review/SKILL.md`'s existing "Type-closure mapping (J18)" section (§4, already written in Phase 0-1 anticipating this record). Update field names only if what you actually implemented differs from what the skill doc describes — do not rewrite the review procedure itself.

- [ ] **Step 6: Full suite, type-check, commit**

```bash
git add apps/studio/test/prod-ux/type-closure.ts apps/studio/test/prod-ux/journeys/j18-type-closure.spec.ts apps/studio/test/prod-ux/evidence.ts .agents/skills/prod-ux-review/SKILL.md
git commit -m "feat(prod-ux): add J18 data-type closure mapping journey"
```

---

### Task 6: Phase 2 close-out — full run + manifest review

**Files:** none (verification-only task, mirrors Phase 0-1's Task 16)

- [ ] **Step 1: Type-check everything**

Run: `pnpm --filter @rune-langium/studio run type-check`
Expected: PASS.

- [ ] **Step 2: List the full prod-ux suite**

Run: `pnpm --filter @rune-langium/studio exec playwright test --config playwright.prod.config.ts prod-ux/journeys --list`
Expected: J00a, J01, J02, J03, J04a/b/c, J05, J06, J07, J08, J09 (×2 tests), J10, J11, J18 — 16 tests total, zero collection errors.

- [ ] **Step 3: Run the full phase against production**

Run: `PLAYWRIGHT_PROD_SMOKE=1 pnpm --filter @rune-langium/studio run test:prod-ux`
Expected: PASS (or DEGRADED with soft findings correctly recorded — J11's download check and J18's curated-unmapped check are both designed to soft-fail gracefully, not hard-fail the run). Inspect `run-manifest.json` for all 16 journey records.

- [ ] **Step 4: Run the full package suite one more time**

Run: `pnpm --filter @rune-langium/studio run test`
Expected: zero regressions vs. the baseline established at the start of this phase.

- [ ] **Step 5: Commit any close-out fixes**

If Steps 1-4 surface cross-task seam issues (the kind only a full-phase run reveals — matching Phase 0-1's own experience with the `test:prod-smoke` double-run bug), fix them here with a dedicated commit, same discipline as Phase 0-1's Task 16.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-17-prod-ux-checkout-harness-phase2.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
