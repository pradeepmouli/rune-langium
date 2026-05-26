# Curated On-Demand Namespace Hydration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore "loaded" status for curated bundles no user file imports, and make non-closure curated namespaces hydrate on demand when browsed in the namespace explorer — without browser-side corpus fetch and without reintroducing whole-bundle CPU exhaustion.

**Architecture:** On-demand hydration is closure-seed expansion. `/api/parse` gains an optional `hydrateNamespaces` list that is unioned into the closure seeds; the existing per-namespace fetch + transitive-dep closure walk does the rest. The browser tracks which namespaces it has asked for and re-issues a normal `parseWorkspaceFiles` round-trip (which re-hydrates the worker with replacement semantics) when the user selects a non-hydrated namespace. A small companion fix derives a bundle's "loaded" file count from `deferredExports` (every namespace) instead of only the import closure.

**Tech Stack:** TypeScript 5.9 ESM, Cloudflare Pages Function (`/api/parse`), Langium 4.2 parser Web Worker, React 19 + zustand, Vitest. `apps/studio` is FSL-1.1-ALv2 (SPDX header on new files).

**Reference:** `docs/superpowers/specs/2026-05-25-curated-on-demand-hydration-design.md`. Scope decision: this plan implements the **lean** scope — loaded-status fix + browse-on-select + server `hydrateNamespaces`. The worker-side re-link fixpoint loop ("trigger A") is intentionally OUT OF SCOPE: the server closure walk (`closeNamespacesFromManifest`, `apps/studio/functions/lib/curated-closure.ts:228`) already pulls a namespace's transitive deps, so requesting the browsed namespace hydrates everything it needs.

**Conventions:** Commits use `SKIP_SIMPLE_GIT_HOOKS=1 git commit` (NOT `--no-verify`). Run studio tests with `pnpm --filter @rune-langium/studio test <file>` and functions tests with `pnpm --filter @rune-langium/studio test functions/test/<file>` (confirm the filter name from `apps/studio/package.json` `name` field first; adjust if different). Do not push or merge.

---

### Task 1: Loaded-status from `deferredExports` (companion fix)

The `/api/parse` manifest fast-path hydrates only the import closure into `hydrationState`. `workspace.ts` builds `curatedRefOnlyFiles` from `hydrationState.documents` only, so a curated bundle that no user file imports gets zero files → `LoadedModel.files` stays `[]` → `ModelLoader`'s 30s hydration timeout fires → "load failed". `deferredExports` lists EVERY namespace in each loaded bundle; register the list-only ones (those not already added from the closure) as `refOnly` entries so the bundle reads as loaded.

**Files:**
- Modify: `apps/studio/src/services/workspace.ts` (imports near line 11; new code after the `hydrationState` loop that ends at line 579)
- Test: locate the existing studio test that exercises `parseWorkspaceViaRouter` / deferredExports mapping with `rg -l "parseWorkspaceViaRouter|curatedRefOnlyFiles" apps/studio/src/**/*.test.ts`; add the new test there. If none exists, create `apps/studio/src/services/workspace.curated-loaded-status.test.ts`.

- [ ] **Step 1: Add the curated-id value import**

In `apps/studio/src/services/workspace.ts`, the existing import at line 11 is type-only:
```typescript
import type { CuratedSerializedDocument } from '@rune-langium/curated-schema';
```
Add a value import + a module-level set directly beneath it:
```typescript
import type { CuratedSerializedDocument } from '@rune-langium/curated-schema';
import { CURATED_MODEL_IDS } from '@rune-langium/curated-schema';

/** Known curated bundle ids — guards deferredExports filePath prefixes so user
 *  files that happen to live under `${bundleId}/...` aren't mis-grouped. */
const CURATED_BUNDLE_IDS = new Set<string>(CURATED_MODEL_IDS);
```

- [ ] **Step 2: Write the failing test**

In the test file, add a test that drives `parseWorkspaceViaRouter` (or `parseWorkspaceFiles`) with a mocked `/api/parse` response whose `hydrationState.documents` is EMPTY but whose `deferredExports` lists two namespaces for bundle `cdm`. Mirror the fetch-mock style already used in the file. The assertion: `curatedRefOnlyFiles['cdm']` has length 2 (from deferredExports), each `refOnly: true` with the right `namespace`.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseWorkspaceFiles } from './workspace.js';

describe('curated loaded-status from deferredExports', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('registers list-only deferredExports namespaces as refOnly files when the closure is empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          models: [],
          errors: {},
          hydrationState: { documents: [] }, // empty closure (no user import)
          deferredExports: [
            { filePath: 'cdm/cdm.base.datetime', namespace: 'cdm.base.datetime', exports: [{ type: 'Data', name: 'A' }] },
            { filePath: 'cdm/cdm.base.math', namespace: 'cdm.base.math', exports: [{ type: 'Data', name: 'B' }] }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ) as Response
    );

    // A curated bundle marker file so collectCuratedBundlesFromWorkspace emits the bundle.
    const result = await parseWorkspaceFiles([
      { name: 'cdm/.bundle-marker', path: 'cdm/.bundle-marker', content: '', dirty: false, bundleId: 'cdm', bundleVersion: 'latest', serializedModelJson: '{}' }
    ] as Parameters<typeof parseWorkspaceFiles>[0]);

    const files = result.curatedRefOnlyFiles?.['cdm'] ?? [];
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.refOnly === true)).toBe(true);
    expect(new Set(files.map((f) => f.namespace))).toEqual(new Set(['cdm.base.datetime', 'cdm.base.math']));
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `pnpm --filter @rune-langium/studio test workspace` (narrow to the new file if the runner supports it).
Expected: FAIL — `curatedRefOnlyFiles['cdm']` is `undefined`/empty because the current code only reads `hydrationState.documents`.

- [ ] **Step 4: Implement the deferredExports pass**

In `apps/studio/src/services/workspace.ts`, immediately AFTER the `for (const doc of data.hydrationState.documents)` loop closes (current line 579, just before the blank line at 580 and the `// Hydrate the browser worker` comment block), insert:

```typescript
  // ── Restore "loaded" status for bundles outside the import closure ──────────
  // The manifest fast-path hydrates ONLY the user's import closure into
  // hydrationState, so a curated bundle that no user file imports yields zero
  // hydrationState docs → zero curatedRefOnlyFiles → LoadedModel.files stays []
  // → ModelLoader's 30s hydration timeout fires → "load failed". deferredExports
  // lists EVERY namespace in each loaded bundle; register the list-only ones
  // (those not already added from the closure above) as refOnly entries so the
  // bundle reads as loaded. They carry no serializedModelJson — their ASTs
  // hydrate on demand when the namespace is browsed (see Task 4).
  const seenPathByBundle = new Map<string, Set<string>>();
  for (const [bid, entries] of Object.entries(curatedRefOnlyFiles)) {
    seenPathByBundle.set(bid, new Set(entries.map((e) => e.path)));
  }
  for (const d of data.deferredExports ?? []) {
    const slash = d.filePath.indexOf('/');
    if (slash < 0) continue; // user-file entry: no bundle prefix
    const bundleId = d.filePath.slice(0, slash);
    if (!CURATED_BUNDLE_IDS.has(bundleId)) continue;
    const pathInBundle = d.filePath.slice(slash + 1);
    const seen = seenPathByBundle.get(bundleId) ?? new Set<string>();
    if (seen.has(pathInBundle)) continue; // already added from the closure
    seen.add(pathInBundle);
    seenPathByBundle.set(bundleId, seen);
    (curatedRefOnlyFiles[bundleId] ??= []).push({
      path: pathInBundle,
      content: '',
      namespace: d.namespace,
      // CachedFile.exports needs {type,name,path}; deferredExports omits path
      // (no AST yet). Path is only used to locate a node once hydrated.
      exports: d.exports.map((e) => ({ ...e, path: '' })),
      refOnly: true
    });
  }
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `pnpm --filter @rune-langium/studio test workspace`
Expected: PASS. Then run the full studio suite (`pnpm --filter @rune-langium/studio test`) to confirm no sibling test asserted the old empty-bundle behavior.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/services/workspace.ts apps/studio/src/services/*workspace*.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "fix(studio): derive curated loaded-status from deferredExports

A bundle no user file imports has an empty closure → 0 hydrationState docs →
0 files → ModelLoader's 30s timeout → 'load failed'. Register the list-only
deferredExports namespaces as refOnly files so the bundle reads as loaded.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Server — `hydrateNamespaces` seed union

`/api/parse` computes closure seeds from the user files' imports (`parse.ts:177`), then walks each bundle's manifest closure (`parse.ts:222`). Add an optional request field that lets the browser ask for extra namespaces; union them into the seeds. `closeNamespacesFromManifest` ignores seeds not in a bundle's graph and pulls transitive deps, so this is safe and complete.

**Files:**
- Modify: `apps/studio/functions/api/parse.ts` (`ParseRequestBody` at lines 49-52; seed computation at line 177)
- Test: `apps/studio/functions/test/parse.test.ts` (existing manifest fast-path integration tests)

- [ ] **Step 1: Write the failing test**

In `apps/studio/functions/test/parse.test.ts`, mirror an existing manifest fast-path test (one that stubs a v2 manifest + per-ns artifacts and asserts which namespaces land in `hydrationState`). Add a test that posts `{ files: [], curatedBundles: [{ id:'cdm', version:'...' }], hydrateNamespaces: ['cdm.base.math'] }` with NO user imports, and asserts `cdm.base.math` (and its manifest deps) appear in the response `hydrationState.documents` even though nothing imports it. Use the same fetch/stub harness as the neighboring tests.

```typescript
it('hydrateNamespaces unions requested namespaces into the closure seeds', async () => {
  // ... reuse the file's existing v2-manifest + per-ns-artifact stub setup ...
  const res = await onRequestPost(makeCtx({
    files: [],
    curatedBundles: [{ id: 'cdm', version: TEST_VERSION }],
    hydrateNamespaces: ['cdm.base.math']
  }));
  const body = await res.json();
  const uris = body.hydrationState.documents.map((d: { uri: string }) => d.uri);
  expect(uris.some((u: string) => u.startsWith('cdm/') && u.includes('math'))).toBe(true);
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm --filter @rune-langium/studio test functions/test/parse`
Expected: FAIL — `cdm.base.math` is not in the closure because no user file imports it and `hydrateNamespaces` is currently ignored.

- [ ] **Step 3: Add the request field**

In `apps/studio/functions/api/parse.ts`, extend `ParseRequestBody` (lines 49-52):
```typescript
type ParseRequestBody = {
  files: Array<{ name: string; content: string }>;
  curatedBundles?: Array<{ id: string; version: string }>;
  /** Fully-qualified namespaces to hydrate beyond the user's import closure
   *  (on-demand curated browsing). Unioned into the closure seeds; names not
   *  present in a loaded bundle's manifest are ignored. */
  hydrateNamespaces?: string[];
};
```

- [ ] **Step 4: Union the requested namespaces into the seeds**

Immediately AFTER line 177 (`const seeds = collectUserSeedNamespaces(workspaceContext?.userDocs ?? []);`), add:
```typescript
    // On-demand hydration: the browser may request namespaces beyond the user's
    // import closure (curated browsing). Union them into the seeds; each bundle's
    // closure walk picks up the ones present in its own manifest and pulls their
    // transitive deps (closeNamespacesFromManifest ignores unknown seeds).
    for (const ns of body.hydrateNamespaces ?? []) seeds.add(ns);
```
(`seeds` is a mutable `Set<string>` returned by `collectUserSeedNamespaces` — confirm at `parse.ts:576`.)

- [ ] **Step 5: Run the test, verify it passes**

Run: `pnpm --filter @rune-langium/studio test functions/test/parse`
Expected: PASS. Confirm the existing fast-path tests still pass (absent `hydrateNamespaces` must be a no-op).

- [ ] **Step 6: Commit**

```bash
git add apps/studio/functions/api/parse.ts apps/studio/functions/test/parse.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(api/parse): hydrateNamespaces unions on-demand namespaces into closure seeds

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Browser plumbing — thread `hydrateNamespaces` through `parseWorkspaceFiles`

Let callers ask for extra namespaces. `parseWorkspaceFiles` → `parseWorkspaceViaRouter` → POST body. The worker re-hydrate already has replacement semantics (`parser-worker.ts:452` `handleHydrate`), so re-parsing with a larger `hydrateNamespaces` cleanly replaces the worker's deferred-model map with the expanded closure.

**Files:**
- Modify: `apps/studio/src/services/workspace.ts` — `parseWorkspaceViaRouter` (lines 487-495 signature + body line 494), `parseWorkspaceFiles` (lines 413-435)
- Test: same studio test file as Task 1

- [ ] **Step 1: Write the failing test**

Add a test asserting the POST body carries `hydrateNamespaces`:
```typescript
it('forwards hydrateNamespaces to /api/parse', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ ok: true, models: [], errors: {}, hydrationState: { documents: [] }, deferredExports: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }) as Response
  );
  await parseWorkspaceFiles([], { hydrateNamespaces: ['cdm.base.math'] });
  const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
  expect(body.hydrateNamespaces).toEqual(['cdm.base.math']);
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm --filter @rune-langium/studio test workspace`
Expected: FAIL — `parseWorkspaceFiles` takes no options arg; `body.hydrateNamespaces` is `undefined`.

- [ ] **Step 3: Add the options param to `parseWorkspaceViaRouter`**

Change the signature (lines 487-490) and the POST body (line 494):
```typescript
export async function parseWorkspaceViaRouter(
  files: Array<{ name: string; content: string }>,
  options: { curatedBundles?: Array<{ id: string; version: string }>; hydrateNamespaces?: string[] } = {}
): Promise<ParseWorkspaceResponse> {
  const response = await fetch('/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files,
      curatedBundles: options.curatedBundles ?? [],
      hydrateNamespaces: options.hydrateNamespaces ?? []
    })
  });
```

- [ ] **Step 4: Add the options param to `parseWorkspaceFiles`**

Change the signature (line 413) and the `parseWorkspaceViaRouter` call (line 423):
```typescript
export async function parseWorkspaceFiles(
  files: WorkspaceFile[],
  options: { hydrateNamespaces?: string[] } = {}
): Promise<ParseWorkspaceFilesResult> {
  if (files.length === 0 && !(options.hydrateNamespaces && options.hydrateNamespaces.length > 0)) {
    return { models: [], parsedModels: [], errors: new Map(), parseMode: 'router' };
  }
```
and:
```typescript
    const response = await parseWorkspaceViaRouter(userFiles, {
      curatedBundles,
      hydrateNamespaces: options.hydrateNamespaces
    });
```
(Note: the early-return guard at line 414 must NOT short-circuit when files are empty but `hydrateNamespaces` is requested — though in practice Task 4 always passes the full file set.)

- [ ] **Step 5: Run the test, verify it passes**

Run: `pnpm --filter @rune-langium/studio test workspace`
Expected: PASS. Run the full studio suite to confirm the new optional params didn't break existing `parseWorkspaceFiles`/`parseWorkspaceViaRouter` callers (App.tsx passes no options — defaults apply).

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/services/workspace.ts apps/studio/src/services/*workspace*.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(studio): thread hydrateNamespaces through parseWorkspaceFiles → /api/parse

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Explorer browse-on-select → on-demand hydration

When the user selects a node in a non-hydrated curated namespace, request that namespace (server pulls its deps), re-parse, and re-link. Flow: explorer select → store records the namespace as pending hydration → App.tsx effect re-parses with the cumulative `hydrateNamespaces` set → `applyParseResult` re-hydrates the worker → `ExplorePerspective`'s existing `linkDocument` debounce (parser-worker.ts has the AST now) resolves the structure.

**Files (read each before editing to anchor exact line numbers):**
- Modify: the editor store that owns selection — find it: `rg -l "selectedNodeId|loadModels" apps/studio/src/store`. Add `pendingHydrationNamespaces: string[]` state + `requestNamespaceHydration(ns)` + `markNamespacesHydrated(ns[])` actions.
- Modify: `apps/studio/src/shell/ExplorePerspective.tsx` — `handleExplorerSelectNode` (the `onSelectNode` handler passed to `NamespaceExplorerPanel`, near the `FileTreePanelMounted` callback at lines 1188-1219) and/or `storeToggleNamespace`.
- Modify: `apps/studio/src/App.tsx` — add an effect that reacts to `pendingHydrationNamespaces` (alongside the existing parse effects at 215-227 / 819-836).
- Test: the editor store's existing test file (`rg -l "selectedNodeId" apps/studio/src/store/*.test.ts`) for the reducer logic; the cross-component effect is covered by the full studio suite + manual verification.

- [ ] **Step 1: Write the failing store test**

For the store action reducer (pure, easily unit-tested):
```typescript
it('requestNamespaceHydration queues a namespace; markNamespacesHydrated dequeues it', () => {
  const store = useEditorStore.getState();
  store.requestNamespaceHydration('cdm.base.math');
  expect(useEditorStore.getState().pendingHydrationNamespaces).toContain('cdm.base.math');
  store.markNamespacesHydrated(['cdm.base.math']);
  expect(useEditorStore.getState().pendingHydrationNamespaces).not.toContain('cdm.base.math');
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @rune-langium/studio test <store-test-file>`
Expected: FAIL — actions/state don't exist.

- [ ] **Step 3: Add store state + actions**

In the editor store, add to state: `pendingHydrationNamespaces: string[]` (init `[]`) and `hydratedNamespaces: string[]` (init `[]`). Add actions:
```typescript
requestNamespaceHydration: (ns: string) =>
  set((s) => {
    if (s.hydratedNamespaces.includes(ns) || s.pendingHydrationNamespaces.includes(ns)) return s;
    return { pendingHydrationNamespaces: [...s.pendingHydrationNamespaces, ns] };
  }),
markNamespacesHydrated: (names: string[]) =>
  set((s) => ({
    hydratedNamespaces: [...new Set([...s.hydratedNamespaces, ...names])],
    pendingHydrationNamespaces: s.pendingHydrationNamespaces.filter((n) => !names.includes(n))
  })),
```
Match the store's existing typing/action style (read the file first).

- [ ] **Step 4: Run, verify it passes**

Run: `pnpm --filter @rune-langium/studio test <store-test-file>`
Expected: PASS.

- [ ] **Step 5: Wire the explorer select handler**

In `apps/studio/src/shell/ExplorePerspective.tsx`, find `handleExplorerSelectNode` (the `onSelectNode` callback). After it sets the selected node, derive the node's namespace (the store node carries `data.namespace`; if the selected entry is a namespace header, use that namespace string) and call the store action:
```typescript
// On-demand curated hydration: selecting a node in a not-yet-hydrated namespace
// asks the server for that namespace (it pulls transitive deps) so the structure
// view can render. No-op for already-hydrated namespaces (store dedupes).
const ns = selectedNode?.data?.namespace;
if (ns) useEditorStore.getState().requestNamespaceHydration(ns);
```
If `onToggleNamespace` (expanding a namespace header) is the more natural browse gesture, call `requestNamespaceHydration(namespace)` there too.

- [ ] **Step 6: Wire the App.tsx re-parse effect**

In `apps/studio/src/App.tsx`, add an effect that re-parses when `pendingHydrationNamespaces` changes. Reuse the current `files` state and `applyParseResult`:
```typescript
const pendingHydration = useEditorStore((s) => s.pendingHydrationNamespaces);
useEffect(() => {
  if (pendingHydration.length === 0) return;
  let cancelled = false;
  // Cumulative: include already-hydrated names so the replacement-semantics
  // worker hydrate keeps prior namespaces hydrated.
  const hydratedSoFar = useEditorStore.getState().hydratedNamespaces;
  const requested = [...new Set([...hydratedSoFar, ...pendingHydration])];
  void parseWorkspaceFiles(files, { hydrateNamespaces: requested }).then((result) => {
    if (cancelled) return;
    applyParseResult(result);
    useEditorStore.getState().markNamespacesHydrated(pendingHydration);
  });
  return () => { cancelled = true; };
}, [pendingHydration, files, applyParseResult]);
```
(`files` is App.tsx's current workspace file state set by `setFiles`. Confirm the variable name when reading the file; the parse effects at 215-227 / 577-598 / 819-836 show the pattern.)

- [ ] **Step 7: Type-check + full suite**

Run: `pnpm --filter @rune-langium/studio run type-check && pnpm --filter @rune-langium/studio test`
Expected: PASS. Manually note: selecting a non-imported curated namespace's type should now populate its structure after the round-trip (verify in the next review step / smoke).

- [ ] **Step 8: Commit**

```bash
git add apps/studio/src/App.tsx apps/studio/src/shell/ExplorePerspective.tsx apps/studio/src/store
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(studio): hydrate curated namespaces on demand when browsed in the explorer

Selecting a node in a non-closure curated namespace re-parses with
hydrateNamespaces:[ns]; the server pulls its transitive deps and the worker
re-hydrates so the structure view resolves.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Final Review

After all tasks: dispatch a code reviewer over the full diff (`git diff origin/master...HEAD`). Verify: (1) absent `hydrateNamespaces` is a no-op everywhere (no behavior change for existing flows); (2) the loaded-status pass dedupes against closure docs and never wipes a populated bundle (note `setCuratedFiles`'s empty-wipe guard at `model-store.ts`); (3) no browser-side corpus fetch was introduced; (4) the App.tsx effect can't loop (store dedupes + `markNamespacesHydrated` clears pending). Then run `pnpm --filter @rune-langium/studio test`, `pnpm run lint`, `pnpm run type-check`, and use superpowers:finishing-a-development-branch.
