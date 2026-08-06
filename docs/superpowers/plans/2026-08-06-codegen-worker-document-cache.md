# Codegen Worker Document Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cache `apps/studio/src/workers/codegen-worker.ts`'s `buildDocuments()` result so it stops re-parsing and re-linking `currentPreviewFiles` from scratch on every call.

**Architecture:** A single `previewFilesVersion` counter, bumped in the `preview:setFiles` handler (the only place `currentPreviewFiles` is ever reassigned), backs a one-slot cache for `buildDocuments()`'s result. A cache hit returns the exact same array instance immediately; a cache miss recomputes and repopulates it, exactly as `buildDocuments()` does today.

**Tech Stack:** TypeScript, Vitest, the existing `codegen-worker.ts` module-level state and its message-driven test harness (`loadWorkerModule()`/`dispatch()`/`flushWorker()` in `apps/studio/test/workers/codegen-worker.test.ts`).

## Global Constraints

- Only `apps/studio/src/workers/codegen-worker.ts` and `apps/studio/test/workers/codegen-worker.test.ts` change. No other file is touched.
- `previewFilesVersion` is bumped unconditionally on every `preview:setFiles` message, not on a content diff — a resend of identical file content still invalidates the cache. This is by-design behavior (see the design doc's Decision #1), not a bug to fix later.
- The known race window (two overlapping uncached `buildDocuments()` calls before either resolves) is explicitly NOT solved by this plan — see the design doc's "Known accepted gap." Do not add promise-memoization or similar to close it.
- Every other early-return and code path inside `buildDocuments()` (the `currentPreviewFiles.length === 0` → `[]` case, curated-document hydration, user-file filtering) stays byte-for-byte unchanged — only a cache check at the top and a cache-populate at the end are new.

Design doc: `docs/superpowers/specs/2026-08-06-codegen-worker-document-cache-design.md`.

---

### Task 1: Cache `buildDocuments()`, invalidated by a `preview:setFiles`-driven version counter

**Files:**
- Modify: `apps/studio/src/workers/codegen-worker.ts:121-127` (module-level state block), `apps/studio/src/workers/codegen-worker.ts:299-350` (`buildDocuments()`), `apps/studio/src/workers/codegen-worker.ts:701-710` (`preview:setFiles` handler)
- Test: `apps/studio/test/workers/codegen-worker.test.ts` (add two new tests inside the existing `describe('codegen-worker preview messages', ...)` block, which already starts at line 160 and already exercises `preview:setFiles`/`preview:generate` with the same mocks this task needs)

**Interfaces:**
- Consumes: nothing new — `buildDocuments()`'s existing signature (`(): Promise<LangiumDocument[]>`), `currentPreviewFiles` (existing module state), the `preview:setFiles` handler's existing `msg.files` assignment.
- Produces: `buildDocuments()` keeps its exact existing signature and return type — this task changes its *internal* behavior only (cache check + populate), not its contract. No other file in the codebase calls `buildDocuments()` directly (it is not exported), so no downstream signature change is possible or needed.

The current (pre-change) state of the three regions this task touches:

```ts
// apps/studio/src/workers/codegen-worker.ts:121-127
let currentCodegenFiles: FileEntry[] = [];
let currentPreviewFiles: FileEntry[] = [];
let lastTarget: Target = 'zod';
let lastCodegenRequestId: string | undefined;
let lastPreviewTargetId: string | undefined;
let lastPreviewRequestId: string | undefined;
let cachedFuncCode = new Map<string, string>();
```

```ts
// apps/studio/src/workers/codegen-worker.ts:299-350
async function buildDocuments(): Promise<LangiumDocument[]> {
  if (currentPreviewFiles.length === 0) {
    return [];
  }

  // 019 Task #88 follow-up: split into user files (parse path) and
  // curated files (deserialize path). Curated entries arrive with
  // `serializedModelJson` set (the pre-parsed Langium AST) and
  // `content === ''` — parsing an empty string would produce a parse
  // error and the doc would be filtered out, leaving form preview
  // unable to find curated types. Hydrate them via the serializer
  // instead.
  const userEntries = currentPreviewFiles.filter((e) => !e.serializedModelJson && isPreviewUserEntryParseable(e));

  const userDocuments: LangiumDocument[] = userEntries.map(({ uri, content }) =>
    factory.fromString(content, URI.parse(uri))
  );
  if (userDocuments.length > 0) {
    await builder.build(userDocuments, { validation: false, eagerLinking: false });
  }

  // Curated docs come pre-linked from the curated-mirror build (CI runs
  // Langium with a higher heap budget than the browser can spare).
  // Build here would try to re-link and fail because the live Langium
  // service hasn't indexed cross-references.
  //
  // Codex review on PR #169: use `factory.fromModel` + add to the
  // service's document store. The earlier synthetic doc literal
  // (`{ uri, parseResult: { value, [], [] } }`) skipped Langium's
  // LangiumDocument ownership, which `RuneDslLinker.loadAstNode`
  // relies on to resolve cross-references through `.ref`. For curated
  // models with typed fields, refs would silently fail to resolve and
  // the preview / codegen output would be missing typed children.
  //
  // The batch relink itself already ran once in `hydrateCuratedDocuments`
  // (called from the `preview:setFiles` handler) — this just reads the
  // cached result rather than re-registering/re-linking on every build.
  const curatedDocuments = cachedCuratedDocuments;

  // Filter out user files with parse/lex errors. Corpus files may
  // contain constructs the parser doesn't fully support; excluding them
  // keeps the namespace index intact for the remaining files.
  const validUserDocuments = userDocuments.filter((d) => !hasDocumentErrors(d));
  if (validUserDocuments.length < userDocuments.length) {
    console.warn(
      `[codegen-worker] ${
        userDocuments.length - validUserDocuments.length
      } user file(s) had parse errors and were excluded from preview.`
    );
  }
  return [...validUserDocuments, ...curatedDocuments];
}
```

```ts
// apps/studio/src/workers/codegen-worker.ts:701-710 (inside the message listener)
      } else if (msg.type === 'preview:setFiles') {
        hydrateCuratedDocuments(msg.files);
        currentPreviewFiles = msg.files;
        if (msg.requestId) {
          lastPreviewRequestId = msg.requestId;
        }
        const requestId = msg.requestId ?? lastPreviewRequestId;
        if (lastPreviewTargetId && requestId) {
          runPreview(lastPreviewTargetId, requestId).catch(console.error);
        }
```

- [ ] **Step 1: Write the failing test — cache hit across two calls with no intervening `preview:setFiles`**

Add inside `describe('codegen-worker preview messages', ...)`, after the existing `'re-runs the last preview target after preview:setFiles and posts preview:result'` test (around line 246):

```ts
  it('caches buildDocuments() results across calls when files have not changed', async () => {
    generatePreviewSchemasMock.mockReturnValue([
      {
        schemaVersion: 1,
        targetId: 'beta.Trade',
        title: 'Trade',
        status: 'ready',
        fields: []
      }
    ]);

    const { dispatch } = await loadWorkerModule();

    dispatch({
      type: 'preview:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace "beta"' }],
      requestId: 'cache:1'
    });
    await flushWorker();

    dispatch({
      type: 'preview:generate',
      targetId: 'beta.Trade',
      requestId: 'cache:2'
    });
    await flushWorker();

    dispatch({
      type: 'preview:generate',
      targetId: 'beta.Trade',
      requestId: 'cache:3'
    });
    await flushWorker();

    // Only the FIRST preview:generate should have triggered a real parse —
    // the second must hit the cache instead of re-parsing.
    expect(fromStringMock).toHaveBeenCalledTimes(1);
    expect(buildMock).toHaveBeenCalledTimes(1);

    // Both calls to generatePreviewSchemas must have received the exact
    // same documents array instance (not just equal content) — proves
    // buildDocuments() returned its cached result, not a fresh array.
    const firstCallDocuments = generatePreviewSchemasMock.mock.calls[0]![0];
    const secondCallDocuments = generatePreviewSchemasMock.mock.calls[1]![0];
    expect(secondCallDocuments).toBe(firstCallDocuments);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/workers/codegen-worker.test.ts -t "caches buildDocuments"`

Expected: FAIL. Against today's uncached code, `fromStringMock`/`buildMock` are each called twice (once per `preview:generate`), so `toHaveBeenCalledTimes(1)` fails — and even if it didn't, `secondCallDocuments` would be a freshly-built array, not `===` to `firstCallDocuments`, so the `toBe` assertion fails too.

- [ ] **Step 3: Write the cache-invalidation test (also covers a no-op resend)**

Add directly after the test from Step 1:

```ts
  it('invalidates the documents cache after preview:setFiles, even when file content is unchanged', async () => {
    generatePreviewSchemasMock.mockReturnValue([
      {
        schemaVersion: 1,
        targetId: 'beta.Trade',
        title: 'Trade',
        status: 'ready',
        fields: []
      }
    ]);

    const files = [{ uri: 'file:///trade.rosetta', content: 'namespace "beta"' }];
    const { dispatch } = await loadWorkerModule();

    dispatch({ type: 'preview:setFiles', files, requestId: 'inval:1' });
    await flushWorker();
    dispatch({ type: 'preview:generate', targetId: 'beta.Trade', requestId: 'inval:2' });
    await flushWorker();

    // Resend the IDENTICAL file content — must still invalidate the cache.
    // previewFilesVersion bumps unconditionally on every preview:setFiles
    // call, not on a content diff (see the design doc's Decision #1).
    dispatch({ type: 'preview:setFiles', files: [...files], requestId: 'inval:3' });
    await flushWorker();
    dispatch({ type: 'preview:generate', targetId: 'beta.Trade', requestId: 'inval:4' });
    await flushWorker();

    expect(fromStringMock).toHaveBeenCalledTimes(2);
    expect(buildMock).toHaveBeenCalledTimes(2);

    const firstCallDocuments = generatePreviewSchemasMock.mock.calls[0]![0];
    const secondCallDocuments = generatePreviewSchemasMock.mock.calls[1]![0];
    expect(secondCallDocuments).not.toBe(firstCallDocuments);
  });
```

This test is not expected to be red before Step 4's implementation — today's code always re-parses on every call, which trivially satisfies "re-parses after `preview:setFiles`" too. It's written now so both tests land together; Step 5 confirms it (and the Step 1 test) both pass after the real implementation.

- [ ] **Step 4: Implement the counter and cache**

In `apps/studio/src/workers/codegen-worker.ts`, add two new module-level variables directly after the existing `cachedFuncCode` declaration (line 127):

```ts
let cachedFuncCode = new Map<string, string>();
let previewFilesVersion = 0;
let documentsCache: { version: number; documents: LangiumDocument[] } | undefined;
```

Change `buildDocuments()`'s opening (line 299-302) from:

```ts
async function buildDocuments(): Promise<LangiumDocument[]> {
  if (currentPreviewFiles.length === 0) {
    return [];
  }
```

to:

```ts
async function buildDocuments(): Promise<LangiumDocument[]> {
  if (documentsCache && documentsCache.version === previewFilesVersion) {
    return documentsCache.documents;
  }

  if (currentPreviewFiles.length === 0) {
    return [];
  }
```

Change the function's final line (line 349) from:

```ts
  return [...validUserDocuments, ...curatedDocuments];
}
```

to:

```ts
  const documents = [...validUserDocuments, ...curatedDocuments];
  documentsCache = { version: previewFilesVersion, documents };
  return documents;
}
```

Change the `preview:setFiles` handler (line 701-703) from:

```ts
      } else if (msg.type === 'preview:setFiles') {
        hydrateCuratedDocuments(msg.files);
        currentPreviewFiles = msg.files;
```

to:

```ts
      } else if (msg.type === 'preview:setFiles') {
        hydrateCuratedDocuments(msg.files);
        currentPreviewFiles = msg.files;
        previewFilesVersion++;
```

Note the empty-files early return (`currentPreviewFiles.length === 0 → []`) is deliberately left *uncached* — it stays below the cache check, not inside it, so an empty file set never populates or is served from `documentsCache`. This matches existing behavior: `currentPreviewFiles.length === 0` can only reflect the *current* state (there's nothing meaningful to cache — an empty result for one version isn't a claim about any other version), and every real `preview:setFiles` bumps the version anyway, so this path is cheap regardless.

- [ ] **Step 5: Run both new tests, then the full test file, to verify everything passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/workers/codegen-worker.test.ts`

Expected: PASS — all tests in the file, including both new ones and every pre-existing test (in particular the `'re-runs the last preview target after preview:setFiles and posts preview:result'` test and the whole `'codegen-worker preview:setFiles curated document relinking'` describe block, neither of which this task's change should affect — the curated-relink tests never dispatch `preview:generate`, so `buildDocuments()` is never invoked in them at all).

- [ ] **Step 6: Run the full studio test suite and type-check**

Run: `pnpm --filter @rune-langium/studio run type-check && pnpm --filter @rune-langium/studio test`

Expected: PASS, 0 failures — this change is internal-only (no exported signature changes), so no other test file should be affected, but the full-suite run is this repo's standing practice for exactly this kind of shared-file change.

- [ ] **Step 7: Commit**

```bash
git add apps/studio/src/workers/codegen-worker.ts apps/studio/test/workers/codegen-worker.test.ts
git commit -m "perf(studio): cache codegen-worker's buildDocuments() result, invalidated by preview:setFiles

buildDocuments() re-parsed and re-linked currentPreviewFiles from scratch
on every call, including every keystroke-triggered instance:validate, with
no caching. A previewFilesVersion counter bumped on preview:setFiles now
backs a one-slot cache, skipping the parse/link work on every call after
the first for a given file set."
```

---

## Self-Review

**Spec coverage:** the design doc's Architecture section (counter + one-slot cache, invalidated at the `preview:setFiles` handler) is fully covered by Task 1 Step 4. The Testing section's three required assertions (cache-hit same-reference, invalidation-after-`preview:setFiles`, no-op-resend-still-invalidates) are covered by Steps 1 and 3 — the no-op-resend case is folded into the invalidation test via `files: [...files]` (identical content, new array), rather than a fourth separate test, since both assertions (invalidates on real change, invalidates on no-op resend) are the exact same code path and the exact same observable assertions. The design's "existing `validateInstance`/`runInstanceSchema`/`runPreview` test coverage continues to pass unchanged" requirement is covered by Step 5/6's full-file and full-suite runs. The "Known accepted gap" (race window) is explicitly called out in Global Constraints as intentionally unaddressed.

**Placeholder scan:** no TBD/TODO markers; every code block above is the literal diff to make, not a description of one.

**Type consistency:** `documentsCache`'s shape (`{ version: number; documents: LangiumDocument[] }`) matches `buildDocuments()`'s existing `Promise<LangiumDocument[]>` return type exactly — `documents` is typed identically to the function's own local `const` in the unmodified body. No new exported symbols, so no cross-file type-consistency risk.
