# Codegen Worker Generalized Output Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize `apps/studio/src/workers/codegen-worker.ts`'s caching (currently only `documentsCache`, from PR #474) to every generation call in the file, keyed by version and the call's own parameters, and fix a real latent bug found along the way where two different file-set domains wrote into one shared, unversioned cache.

**Architecture:** One generic versioned-cache primitive (sync `getOrCompute`, async `getOrComputeAsync` — the latter carrying forward PR #474's suspended-call race-safety fix), adopted by every generation call site across two independent version domains: `previewFilesVersion` (existing) and a new `codegenFilesVersion`.

**Tech Stack:** TypeScript, Vitest, the existing `codegen-worker.ts` module-level state and message-driven test harness.

## Global Constraints

- **Base branch is `docs/codegen-worker-document-cache-design`'s tip, NOT master.** That branch (PR #474, open, not yet merged) already has `documentsCache`/`previewFilesVersion`/the suspended-build race guard — this plan's Task 1 refactors that exact code, not master's pre-cache version. Every code block below reflects the ACTUAL current file on that branch.
- Only `apps/studio/src/workers/codegen-worker.ts` and `apps/studio/test/workers/codegen-worker.test.ts` change. No other file.
- No cache eviction/size-bounding is added — accepted as negligible for realistic session-scale usage (see design doc §Scope). Do not add an LRU or size cap.
- No new async-consumer race-condition test is written per new cache — the primitive's race-safety is proven once (already, by PR #474's existing suspended-build test); new async consumers get hit/miss/invalidate tests only (see design doc §Testing).
- `runCodegen`'s own parse/link step (building `documents` from `currentCodegenFiles`) stays uncached in this plan — only its `generate()` *result* is cached. A cache hit for `codegenGenerateCache` still re-parses before discovering the hit; mirroring `documentsCache` for the codegen domain (a two-layer cache avoiding the re-parse too) is a natural follow-on, explicitly out of scope here — the approved design's Files-touched list only names `codegenFilesVersion`/`codegenGenerateCache`, not a codegen-domain documents cache.

Design doc: `docs/superpowers/specs/2026-08-06-codegen-worker-generalized-cache-design.md`.

---

### Task 1: Generic cache primitive, `documentsCache` refactor, and `previewSchemaCache`

**Files:**
- Modify: `apps/studio/src/workers/codegen-worker.ts:37-38` (type imports), `:121-136` (module state), `:301-373` (`buildDocuments`), `:402` (`runPreview`'s `generatePreviewSchemas` call), `:460` (`runInstanceSchema`'s call), `:646` (`validateInstance`'s call)
- Test: `apps/studio/test/workers/codegen-worker.test.ts` (new describe block, inserted directly before `describe('codegen-worker instance:validate messages', ...)`)

**Interfaces:**
- Produces: `interface VersionedEntry<T> { version: number; value: T }`; `function getOrCompute<T>(cache: Map<string, VersionedEntry<T>>, key: string, version: number, compute: () => T): T`; `async function getOrComputeAsync<T>(cache: Map<string, VersionedEntry<T>>, key: string, getVersion: () => number, compute: () => Promise<T>): Promise<T>` — Task 2 and Task 3 both consume these exact signatures, unchanged.
- Produces: `const previewSchemaCache = new Map<string, VersionedEntry<FormPreviewSchema[]>>();` — not consumed by later tasks, but its existence pattern (module-level `const`, not `let`) is what Task 2's `previewGenerateCache` and Task 3's `codegenGenerateCache` both copy.

The current (pre-change) state of every region this task touches:

```ts
// apps/studio/src/workers/codegen-worker.ts:37-38
import { generate, generatePreviewSchemas, RUNTIME_HELPER_JS_SOURCE } from '@rune-langium/codegen/export';
import type { Target } from '@rune-langium/codegen/export';
```

```ts
// apps/studio/src/workers/codegen-worker.ts:121-136
let currentCodegenFiles: FileEntry[] = [];
let currentPreviewFiles: FileEntry[] = [];
let lastTarget: Target = 'zod';
let lastCodegenRequestId: string | undefined;
let lastPreviewTargetId: string | undefined;
let lastPreviewRequestId: string | undefined;
let cachedFuncCode = new Map<string, string>();
let previewFilesVersion = 0;
let documentsCache: { version: number; documents: LangiumDocument[] } | undefined;

// Curated documents are relinked as a BATCH once per `preview:setFiles`
// (the only message that ever carries new curated content) and cached here
// for `buildDocuments()` to read on every `runPreview`/`runInstanceSchema`/
// `executeFunction`/`validateInstance` call. See `hydrateCuratedDocuments`.
let cachedCuratedDocuments: LangiumDocument[] = [];
let lastCuratedEntries: FileEntry[] = [];
```

```ts
// apps/studio/src/workers/codegen-worker.ts:301-373
async function buildDocuments(): Promise<LangiumDocument[]> {
  if (documentsCache && documentsCache.version === previewFilesVersion) {
    return documentsCache.documents;
  }

  // Captured before the only `await` below, so a `preview:setFiles` that
  // arrives while this call is suspended in `builder.build` (bumping
  // `previewFilesVersion` and swapping `currentPreviewFiles`/
  // `cachedCuratedDocuments` out from under this in-flight call) is
  // detectable on resume: this call's own `userDocuments` are already
  // stale by then, and `curatedDocuments` below would read the NEW
  // curated set, silently mixing old user documents with new curated
  // ones. Populating the cache under the now-current version would
  // poison it for every other caller until the next `preview:setFiles`.
  const versionAtStart = previewFilesVersion;

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
  const documents = [...validUserDocuments, ...curatedDocuments];
  // Only cache this result if the file set is still the same one this call
  // started with — see the `versionAtStart` comment above.
  if (versionAtStart === previewFilesVersion) {
    documentsCache = { version: versionAtStart, documents };
  }
  return documents;
}
```

```ts
// apps/studio/src/workers/codegen-worker.ts:402 (inside runPreview)
    const [schema] = generatePreviewSchemas(documents, { targetId });
```

```ts
// apps/studio/src/workers/codegen-worker.ts:460 (inside runInstanceSchema)
    const [schema] = generatePreviewSchemas(documents, { targetId: typeFqn });
```

```ts
// apps/studio/src/workers/codegen-worker.ts:646 (inside validateInstance)
    const [schema] = generatePreviewSchemas(documents, { targetId: typeFqn });
```

- [ ] **Step 1: Add the generic cache primitive and the new type imports**

Change the type import (line 38) from:

```ts
import type { Target } from '@rune-langium/codegen/export';
```

to:

```ts
import type { Target, FormPreviewSchema, GeneratorOutput } from '@rune-langium/codegen/export';
```

Add a new section directly after the closing `}` of `hydrateCuratedDocuments` (after line 206) and before the `// Generation logic` section comment (line 208):

```ts
// ---------------------------------------------------------------------------
// Versioned cache primitive
// ---------------------------------------------------------------------------

/**
 * Every cache in this file is invalidated by comparing a stored version
 * number against a live counter (`previewFilesVersion`/`codegenFilesVersion`)
 * bumped whenever the relevant file set changes — never by content hashing
 * or a TTL.
 */
interface VersionedEntry<T> {
  version: number;
  value: T;
}

function getOrCompute<T>(cache: Map<string, VersionedEntry<T>>, key: string, version: number, compute: () => T): T {
  const cached = cache.get(key);
  if (cached && cached.version === version) return cached.value;
  const value = compute();
  cache.set(key, { version, value });
  return value;
}

/**
 * Async variant. Captures `getVersion()` BEFORE awaiting `compute()`, and
 * only writes to `cache` if the version is still current when `compute()`
 * resolves — otherwise a call suspended across a file-set change would
 * silently overwrite a correct, already-cached result with one built from
 * now-stale state. See `buildDocuments()`'s adoption of this helper for the
 * concrete failure mode this guards against.
 */
async function getOrComputeAsync<T>(
  cache: Map<string, VersionedEntry<T>>,
  key: string,
  getVersion: () => number,
  compute: () => Promise<T>
): Promise<T> {
  const versionAtStart = getVersion();
  const cached = cache.get(key);
  if (cached && cached.version === versionAtStart) return cached.value;
  const value = await compute();
  if (getVersion() === versionAtStart) cache.set(key, { version: versionAtStart, value });
  return value;
}
```

This step adds no new behavior yet — nothing calls these functions. No test to run; the file must still type-check.

Run: `pnpm --filter @rune-langium/studio run type-check`
Expected: PASS (unused-function warnings, if any, are resolved by Step 2 wiring them in immediately after).

- [ ] **Step 2: Refactor `documentsCache`/`buildDocuments()` onto the primitive**

Change the module state (line 129) from:

```ts
let documentsCache: { version: number; documents: LangiumDocument[] } | undefined;
```

to:

```ts
const documentsCache = new Map<string, VersionedEntry<LangiumDocument[]>>();
```

Replace the entire `buildDocuments()` function body with:

```ts
async function buildDocuments(): Promise<LangiumDocument[]> {
  return getOrComputeAsync(documentsCache, 'documents', () => previewFilesVersion, async () => {
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
  });
}
```

Note: the empty-`currentPreviewFiles` early return (`[]`) is now cached like any other result, unlike the original bespoke version which special-cased it as never-cached. This is an intentional simplification — caching `[]` is idempotent and introduces no correctness difference (a second call with the same version and zero files still correctly returns `[]`), and it collapses the function onto one uniform code path instead of two.

This is a pure refactor — no new test. Verify it preserves PR #474's existing behavior:

Run: `pnpm --filter @rune-langium/studio exec vitest run test/workers/codegen-worker.test.ts`
Expected: PASS, all existing tests including the three `documentsCache`-specific ones from PR #474 (`'caches buildDocuments() results...'`, `'invalidates the documents cache...'`, `'does not let a build suspended...'`).

- [ ] **Step 3: Write the failing tests for `previewSchemaCache`**

Insert this new describe block into `apps/studio/test/workers/codegen-worker.test.ts` directly before the line `describe('codegen-worker instance:validate messages', () => {`:

```ts
describe('codegen-worker previewSchemaCache (shared across preview/instance handlers)', () => {
  beforeEach(() => {
    buildMock.mockReset();
    buildMock.mockImplementation(async () => undefined);
    fromStringMock.mockClear();
    generatePreviewSchemasMock.mockReset();
    findDataNodeMock.mockReset();
    getActiveConditionPredicatesMock.mockReset();
    getActiveConditionPredicatesMock.mockReturnValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shares one generatePreviewSchemas result across runPreview and validateInstance for the same targetId', async () => {
    findDataNodeMock.mockReturnValue({ name: 'Trade' });
    generatePreviewSchemasMock.mockReturnValue([
      { schemaVersion: 1, targetId: 'beta.Trade', title: 'Trade', status: 'ready', fields: [] }
    ]);

    const { dispatch } = await loadWorkerModule();

    dispatch({
      type: 'preview:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace "beta"' }],
      requestId: 'shared:1'
    });
    await flushWorker();

    dispatch({ type: 'preview:generate', targetId: 'beta.Trade', requestId: 'shared:2' });
    await flushWorker();

    dispatch({ type: 'instance:validate', typeFqn: 'beta.Trade', data: {}, requestId: 'shared:3' });
    await flushWorker();

    expect(generatePreviewSchemasMock).toHaveBeenCalledTimes(1);
  });

  it('caches a repeated preview:generate for the same targetId', async () => {
    generatePreviewSchemasMock.mockReturnValue([
      { schemaVersion: 1, targetId: 'beta.Trade', title: 'Trade', status: 'ready', fields: [] }
    ]);

    const { dispatch } = await loadWorkerModule();

    dispatch({
      type: 'preview:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace "beta"' }],
      requestId: 'hit:1'
    });
    await flushWorker();

    dispatch({ type: 'preview:generate', targetId: 'beta.Trade', requestId: 'hit:2' });
    await flushWorker();
    dispatch({ type: 'preview:generate', targetId: 'beta.Trade', requestId: 'hit:3' });
    await flushWorker();

    expect(generatePreviewSchemasMock).toHaveBeenCalledTimes(1);
  });

  it('keeps separate cache entries for different targetIds', async () => {
    generatePreviewSchemasMock.mockImplementation((_documents: unknown, options: { targetId: string }) => [
      { schemaVersion: 1, targetId: options.targetId, title: options.targetId, status: 'ready', fields: [] }
    ]);

    const { dispatch } = await loadWorkerModule();

    dispatch({
      type: 'preview:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace "beta"' }],
      requestId: 'multi:1'
    });
    await flushWorker();

    dispatch({ type: 'preview:generate', targetId: 'beta.Trade', requestId: 'multi:2' });
    await flushWorker();
    dispatch({ type: 'preview:generate', targetId: 'beta.Event', requestId: 'multi:3' });
    await flushWorker();

    expect(generatePreviewSchemasMock).toHaveBeenCalledTimes(2);
  });

  it('invalidates the schema cache after preview:setFiles', async () => {
    generatePreviewSchemasMock.mockReturnValue([
      { schemaVersion: 1, targetId: 'beta.Trade', title: 'Trade', status: 'ready', fields: [] }
    ]);

    const { dispatch } = await loadWorkerModule();

    dispatch({
      type: 'preview:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace "beta"' }],
      requestId: 'inv:1'
    });
    await flushWorker();
    dispatch({ type: 'preview:generate', targetId: 'beta.Trade', requestId: 'inv:2' });
    await flushWorker();

    dispatch({
      type: 'preview:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace "beta"' }],
      requestId: 'inv:3'
    });
    await flushWorker();
    dispatch({ type: 'preview:generate', targetId: 'beta.Trade', requestId: 'inv:4' });
    await flushWorker();

    expect(generatePreviewSchemasMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 4: Run the new tests to verify the first two fail**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/workers/codegen-worker.test.ts -t "previewSchemaCache"`

Expected: 2 of 4 FAIL. `'shares one generatePreviewSchemas result...'` and `'caches a repeated preview:generate...'` fail (`generatePreviewSchemasMock` called twice, not once) — these are the genuinely new behavior. `'keeps separate cache entries...'` and `'invalidates the schema cache...'` already PASS against today's code (it recomputes on every call regardless of caching, which trivially satisfies "different targetIds get separate results" and "a second preview:setFiles is followed by another compute") — they're written now as coverage that must keep passing once caching is added, not as red-first tests.

- [ ] **Step 5: Add `previewSchemaCache` and wire it into all three call sites**

Add to the module state, directly after the `documentsCache` line from Step 2:

```ts
const previewSchemaCache = new Map<string, VersionedEntry<FormPreviewSchema[]>>();
```

Change `runPreview`'s call (was line 402) from:

```ts
    const [schema] = generatePreviewSchemas(documents, { targetId });
```

to:

```ts
    const [schema] = getOrCompute(previewSchemaCache, targetId, previewFilesVersion, () =>
      generatePreviewSchemas(documents, { targetId })
    );
```

Change `runInstanceSchema`'s call (was line 460) from:

```ts
    const [schema] = generatePreviewSchemas(documents, { targetId: typeFqn });
```

to:

```ts
    const [schema] = getOrCompute(previewSchemaCache, typeFqn, previewFilesVersion, () =>
      generatePreviewSchemas(documents, { targetId: typeFqn })
    );
```

Change `validateInstance`'s call (was line 646) from:

```ts
    const [schema] = generatePreviewSchemas(documents, { targetId: typeFqn });
```

to:

```ts
    const [schema] = getOrCompute(previewSchemaCache, typeFqn, previewFilesVersion, () =>
      generatePreviewSchemas(documents, { targetId: typeFqn })
    );
```

`generatePreviewSchemas` is synchronous — using `getOrCompute` (not the async variant) here introduces no new race window at all, since a fully synchronous compute-and-store has no yield point for anything else to interleave through.

- [ ] **Step 6: Run the new tests again to verify all four pass**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/workers/codegen-worker.test.ts -t "previewSchemaCache"`
Expected: PASS, 4/4.

- [ ] **Step 7: Run the full test file and type-check**

Run: `pnpm --filter @rune-langium/studio run type-check && pnpm --filter @rune-langium/studio exec vitest run test/workers/codegen-worker.test.ts`
Expected: PASS, 0 failures. Some pre-existing tests may now show a LOWER `generatePreviewSchemasMock`/`fromStringMock`/`buildMock` call count than before if they issue multiple `preview:generate`/`instance:validate` calls for the same target without intending to test cache invalidation — if any pre-existing test's assertion breaks because it hard-coded an exact call count that this change legitimately reduces, update that assertion's expected count to match the new (correct, lower) behavior; do not weaken the assertion to `toHaveBeenCalled()` or remove it.

- [ ] **Step 8: Commit**

```bash
git add apps/studio/src/workers/codegen-worker.ts apps/studio/test/workers/codegen-worker.test.ts
git commit -m "perf(studio): generalize codegen-worker caching with a versioned-cache primitive

Introduces getOrCompute/getOrComputeAsync, refactors documentsCache onto
it, and adds previewSchemaCache — generatePreviewSchemas results keyed by
targetId, shared across runPreview/runInstanceSchema/validateInstance
instead of each recomputing independently on every call."
```

---

### Task 2: `previewGenerateCache` replacing `cachedFuncCode`, and fixing the qualified-name lookup gap

**Files:**
- Modify: `apps/studio/src/workers/codegen-worker.ts:127` (remove `cachedFuncCode`), module state (add `previewGenerateCache`), `:572-627` (`executeFunction`)
- Test: `apps/studio/test/workers/codegen-worker.test.ts` (new describe block, inserted directly before `describe('codegen-worker code preview messages', ...)`)

**Interfaces:**
- Consumes: `getOrComputeAsync`, `VersionedEntry<T>` (Task 1).
- Produces: `const previewGenerateCache = new Map<string, VersionedEntry<GeneratorOutput[]>>();` — not consumed elsewhere in this plan.

**Real bug found and fixed by this task, not just a caching change:** `executeFunction`'s existing cache-miss path (below) only ever wrote the *bare* function name (`func.name`) into `cachedFuncCode`, never the namespace-qualified form (`` `${ns}.${func.name}` ``) that `runCodegen`'s own population path writes. Real callers pass the qualified form — confirmed via `apps/studio/test/store/preview-store.test.ts`'s `dispatchExecute('alpha.CalcTrade', {})`. This means a qualified-name `preview:execute` only ever succeeded today if `runCodegen` happened to run first and populate the (shared, cross-domain) cache with both forms — on a fresh worker that only ever used Form Preview / Function execution and never opened the Code tab, it would incorrectly report "not found" for a function that genuinely exists. This task's rewrite supports both forms directly, closing the gap as a natural consequence of removing the cross-domain cache sharing that was accidentally papering over it.

The current (pre-change) state of `executeFunction`:

```ts
// apps/studio/src/workers/codegen-worker.ts:572-627
async function executeFunction(funcName: string, inputs: Record<string, unknown>, requestId: string): Promise<void> {
  const scope = self as unknown as DedicatedWorkerGlobalScope;

  if (!cachedFuncCode.has(funcName)) {
    const documents = await buildDocuments();
    if (documents.length > 0) {
      const results = await generate(documents, { target: 'typescript' });
      cachedFuncCode = new Map();
      for (const result of results) {
        for (const func of result.funcs) {
          cachedFuncCode.set(func.name, func.fileContents);
        }
      }
    }
  }

  if (!cachedFuncCode.has(funcName)) {
    scope.postMessage({
      type: 'preview:execute-error',
      requestId,
      funcName,
      error: `Function '${funcName}' not found in generated code. Ensure the model has a valid func declaration and no parse errors.`
    });
    return;
  }

  const code = cachedFuncCode.get(funcName)!;

  try {
    // Strip TS type annotations from the isolated function body stored in
    // func.fileContents. This contains only the function declaration — no
    // imports, interface blocks, or helper declarations — so stripTypeAnnotations
    // only needs to handle inline type syntax. Execution goes through
    // runInWorkerSandbox — see its threat-model comment.
    const output = runInWorkerSandbox(
      stripTypeAnnotations(code),
      'input',
      inputs,
      `typeof ${funcName} === 'function' ? ${funcName}(input) : undefined`
    );

    scope.postMessage({
      type: 'preview:execute-result',
      requestId,
      funcName,
      output
    });
  } catch (e) {
    scope.postMessage({
      type: 'preview:execute-error',
      requestId,
      funcName,
      error: e instanceof Error ? e.message : String(e)
    });
  }
}
```

- [ ] **Step 1: Write the failing tests**

Insert this new describe block directly before `describe('codegen-worker code preview messages', () => {`:

```ts
describe('codegen-worker previewGenerateCache (executeFunction)', () => {
  beforeEach(() => {
    buildMock.mockReset();
    buildMock.mockImplementation(async () => undefined);
    fromStringMock.mockClear();
    generateMock.mockClear();
    generateMock.mockReturnValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves a qualified function name on a fresh worker, without codegen:generate ever having run', async () => {
    generateMock.mockReturnValue([
      {
        relativePath: 'alpha.ts',
        content: '',
        sourceMap: undefined,
        diagnostics: [],
        funcs: [{ name: 'CalcTrade', fileContents: 'function CalcTrade(input) { return input; }' }]
      }
    ]);

    const { scope, dispatch } = await loadWorkerModule();

    dispatch({
      type: 'preview:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace "alpha"' }],
      requestId: 'qualified:1'
    });
    await flushWorker();

    dispatch({
      type: 'preview:execute',
      funcName: 'alpha.CalcTrade',
      inputs: {},
      requestId: 'qualified:2'
    });
    await flushWorker();

    expect(scope.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'preview:execute-result', requestId: 'qualified:2', funcName: 'alpha.CalcTrade' })
    );
  });

  it('caches generate() across repeated preview:execute calls', async () => {
    generateMock.mockReturnValue([
      {
        relativePath: 'alpha.ts',
        content: '',
        sourceMap: undefined,
        diagnostics: [],
        funcs: [{ name: 'CalcTrade', fileContents: 'function CalcTrade(input) { return input; }' }]
      }
    ]);

    const { dispatch } = await loadWorkerModule();

    dispatch({
      type: 'preview:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace "alpha"' }],
      requestId: 'hit:1'
    });
    await flushWorker();

    dispatch({ type: 'preview:execute', funcName: 'CalcTrade', inputs: {}, requestId: 'hit:2' });
    await flushWorker();
    dispatch({ type: 'preview:execute', funcName: 'CalcTrade', inputs: {}, requestId: 'hit:3' });
    await flushWorker();

    expect(generateMock).toHaveBeenCalledTimes(1);
  });

  it('invalidates the cached function code after preview:setFiles', async () => {
    generateMock.mockReturnValue([
      {
        relativePath: 'alpha.ts',
        content: '',
        sourceMap: undefined,
        diagnostics: [],
        funcs: [{ name: 'CalcTrade', fileContents: 'function CalcTrade(input) { return input; }' }]
      }
    ]);

    const { dispatch } = await loadWorkerModule();

    dispatch({
      type: 'preview:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace "alpha"' }],
      requestId: 'inv:1'
    });
    await flushWorker();
    dispatch({ type: 'preview:execute', funcName: 'CalcTrade', inputs: {}, requestId: 'inv:2' });
    await flushWorker();

    dispatch({
      type: 'preview:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace "alpha"' }],
      requestId: 'inv:3'
    });
    await flushWorker();
    dispatch({ type: 'preview:execute', funcName: 'CalcTrade', inputs: {}, requestId: 'inv:4' });
    await flushWorker();

    expect(generateMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/workers/codegen-worker.test.ts -t "previewGenerateCache"`

Expected: all 3 FAIL. The first fails because today's `executeFunction` only ever indexes the bare name (`'CalcTrade'`), so looking up `'alpha.CalcTrade'` reports "not found" even though `generateMock` returned a matching function — this is the qualified-name bug. The second and third fail because there's no cache at all yet (`generateMock` is called on every `preview:execute` whose bare name isn't already known, and — critically — the FIRST call in each of these tests already fails to find `'CalcTrade'` via the SAME bug being fixed here, since `!cachedFuncCode.has(funcName)` is `true` and lazy-population sets only `'CalcTrade'` — wait, these two tests use the bare name `'CalcTrade'` directly, so they don't hit the qualified-name bug; they fail purely on the call-count assertion, called twice instead of once (second test) and only once for the invalidation test's expected second call).

- [ ] **Step 3: Add `previewGenerateCache` and rewrite `executeFunction`**

Remove line 127 (`let cachedFuncCode = new Map<string, string>();`) from the module state block entirely.

Add to the module state, in the same place `cachedFuncCode` used to be:

```ts
const previewGenerateCache = new Map<string, VersionedEntry<GeneratorOutput[]>>();
```

Replace the entire `executeFunction` function with:

```ts
async function executeFunction(funcName: string, inputs: Record<string, unknown>, requestId: string): Promise<void> {
  const scope = self as unknown as DedicatedWorkerGlobalScope;

  const documents = await buildDocuments();
  const results =
    documents.length > 0
      ? await getOrComputeAsync(previewGenerateCache, 'generate:typescript', () => previewFilesVersion, () =>
          generate(documents, { target: 'typescript' })
        )
      : [];

  // Matches both the bare function name and the namespace-qualified form
  // (`${ns}.${func.name}`, derived the same way runCodegen's own cache
  // population always did) — real callers (e.g. preview-store.ts's
  // dispatchExecute) pass the qualified form.
  let code: string | undefined;
  for (const result of results) {
    const ns = result.relativePath.replace(/\//g, '.').replace(/\.ts$/, '');
    const func = result.funcs.find((f) => f.name === funcName || `${ns}.${f.name}` === funcName);
    if (func) {
      code = func.fileContents;
      break;
    }
  }

  if (code === undefined) {
    scope.postMessage({
      type: 'preview:execute-error',
      requestId,
      funcName,
      error: `Function '${funcName}' not found in generated code. Ensure the model has a valid func declaration and no parse errors.`
    });
    return;
  }

  try {
    // Strip TS type annotations from the isolated function body stored in
    // func.fileContents. This contains only the function declaration — no
    // imports, interface blocks, or helper declarations — so stripTypeAnnotations
    // only needs to handle inline type syntax. Execution goes through
    // runInWorkerSandbox — see its threat-model comment.
    const output = runInWorkerSandbox(
      stripTypeAnnotations(code),
      'input',
      inputs,
      `typeof ${funcName} === 'function' ? ${funcName}(input) : undefined`
    );

    scope.postMessage({
      type: 'preview:execute-result',
      requestId,
      funcName,
      output
    });
  } catch (e) {
    scope.postMessage({
      type: 'preview:execute-error',
      requestId,
      funcName,
      error: e instanceof Error ? e.message : String(e)
    });
  }
}
```

Note: `stripTypeAnnotations(code)`'s generated JS body still calls the function by its BARE name (`` typeof ${funcName} === 'function' ? ${funcName}(input) : undefined ``) — when `funcName` is qualified (e.g. `'alpha.CalcTrade'`), this expression is syntactically invalid as a bare identifier reference. This was already true before this change (`cachedFuncCode` stored `func.fileContents` — the isolated declaration of the BARE-named function — under a qualified key too, and `executeFunction`'s `runInWorkerSandbox` call always builds the return expression from the original `funcName` parameter, qualified or not). Fix this in the same step: change the return-expression construction to always call by the bare name, not the original `funcName`:

```ts
    const bareName = funcName.includes('.') ? funcName.slice(funcName.lastIndexOf('.') + 1) : funcName;
    const output = runInWorkerSandbox(
      stripTypeAnnotations(code),
      'input',
      inputs,
      `typeof ${bareName} === 'function' ? ${bareName}(input) : undefined`
    );
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/workers/codegen-worker.test.ts -t "previewGenerateCache"`
Expected: PASS, 3/3.

- [ ] **Step 5: Run the full test file and type-check**

Run: `pnpm --filter @rune-langium/studio run type-check && pnpm --filter @rune-langium/studio exec vitest run test/workers/codegen-worker.test.ts`
Expected: PASS, 0 failures. `runCodegen` (untouched in this task) still writes into a now-nonexistent `cachedFuncCode` at its old lines 269-278 — this WILL fail to compile after removing `cachedFuncCode` in Step 3. Remove that dead block from `runCodegen` now, as part of this step (it becomes fully redundant: `runCodegen`'s own function-execution caching purpose is now served entirely by `previewGenerateCache`, populated lazily by `executeFunction` itself the first time a function is actually run — `runCodegen` no longer needs to pre-populate anything for it):

```ts
// apps/studio/src/workers/codegen-worker.ts (inside runCodegen, was lines 264-278)
    // Cache generated function code for preview:execute, keyed by namespace.funcName.
    // Store func.fileContents (isolated function declaration only) rather than
    // result.content (full file with imports, interfaces, helper declarations) so
    // that stripTypeAnnotations only has to handle a plain function body — no TS
    // constructs that would cause a SyntaxError at execution time.
    if (target === 'typescript') {
      cachedFuncCode = new Map();
      for (const result of results) {
        const ns = result.relativePath.replace(/\//g, '.').replace(/\.ts$/, '');
        for (const func of result.funcs) {
          cachedFuncCode.set(func.name, func.fileContents);
          cachedFuncCode.set(`${ns}.${func.name}`, func.fileContents);
        }
      }
    }

    scope.postMessage({
```

Delete the entire `if (target === 'typescript') { ... }` block, leaving just:

```ts
    scope.postMessage({
```

- [ ] **Step 6: Run the full test file and type-check again**

Run: `pnpm --filter @rune-langium/studio run type-check && pnpm --filter @rune-langium/studio exec vitest run test/workers/codegen-worker.test.ts`
Expected: PASS, 0 failures.

- [ ] **Step 7: Commit**

```bash
git add apps/studio/src/workers/codegen-worker.ts apps/studio/test/workers/codegen-worker.test.ts
git commit -m "fix(studio): replace cachedFuncCode with a versioned previewGenerateCache

cachedFuncCode was shared between two different file-set domains
(currentCodegenFiles via runCodegen, currentPreviewFiles via
executeFunction/buildDocuments) with no version tracking at all, so it
was never invalidated on preview:setFiles. Moving executeFunction's
lookup onto the preview-domain versioned cache fixes that, and also
fixes a real qualified-name lookup gap: executeFunction's own lazy
cache-miss path only ever indexed the bare function name, never the
namespace-qualified form real callers (preview-store.ts's
dispatchExecute) actually pass — that only worked before by accident,
when runCodegen happened to run first and populate the shared cache
with both forms."
```

---

### Task 3: `codegenFilesVersion` and `codegenGenerateCache` for `runCodegen`

**Files:**
- Modify: `apps/studio/src/workers/codegen-worker.ts` (module state; `codegen:setFiles` handler; `runCodegen`'s `generate()` call)
- Test: `apps/studio/test/workers/codegen-worker.test.ts` (new describe block, appended at the end of the file)

**Interfaces:**
- Consumes: `getOrComputeAsync`, `VersionedEntry<T>` (Task 1).
- Produces: nothing consumed by other tasks — this is the last task.

The current (pre-Task-1) state of the `codegen:setFiles` handler and `runCodegen`'s `generate()` call is unaffected by Tasks 1-2 (neither touches this code), so it still reads exactly as in the original file:

```ts
// apps/studio/src/workers/codegen-worker.ts (message listener)
      if (msg.type === 'codegen:setFiles') {
        currentCodegenFiles = msg.files;
        if (msg.requestId) {
          lastCodegenRequestId = msg.requestId;
        }
        runCodegen(lastTarget, lastCodegenRequestId).catch(console.error);
      } else if (msg.type === 'codegen:generate') {
```

```ts
// apps/studio/src/workers/codegen-worker.ts (inside runCodegen)
    const results = await generate(documents, { target });
```

- [ ] **Step 1: Write the failing tests**

Append this new describe block at the very end of `apps/studio/test/workers/codegen-worker.test.ts`:

```ts

describe('codegen-worker codegenGenerateCache (runCodegen)', () => {
  beforeEach(() => {
    buildMock.mockReset();
    buildMock.mockImplementation(async () => undefined);
    fromStringMock.mockClear();
    generateMock.mockClear();
    generateMock.mockReturnValue([{ relativePath: 'out.ts', content: 'x', sourceMap: undefined, diagnostics: [], funcs: [] }]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('caches generate() across repeated codegen:generate calls for the same target', async () => {
    const { dispatch } = await loadWorkerModule();

    dispatch({
      type: 'codegen:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace "gamma"' }],
      requestId: 'hit:1'
    });
    await flushWorker();

    dispatch({ type: 'codegen:generate', target: 'zod', requestId: 'hit:2' });
    await flushWorker();
    dispatch({ type: 'codegen:generate', target: 'zod', requestId: 'hit:3' });
    await flushWorker();

    expect(generateMock).toHaveBeenCalledTimes(2); // codegen:setFiles's own re-run + one explicit generate; the third dispatch hits cache
  });

  it('keeps separate cache entries per target', async () => {
    const { dispatch } = await loadWorkerModule();

    dispatch({
      type: 'codegen:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace "gamma"' }],
      requestId: 'multi:1'
    });
    await flushWorker();

    dispatch({ type: 'codegen:generate', target: 'zod', requestId: 'multi:2' });
    await flushWorker();
    dispatch({ type: 'codegen:generate', target: 'typescript', requestId: 'multi:3' });
    await flushWorker();

    expect(generateMock).toHaveBeenCalledTimes(3); // setFiles's own run (zod, lastTarget default) + zod again is a hit... see Step 2 note
  });

  it('invalidates the codegen cache after codegen:setFiles', async () => {
    const { dispatch } = await loadWorkerModule();

    dispatch({
      type: 'codegen:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace "gamma"' }],
      requestId: 'inv:1'
    });
    await flushWorker();
    dispatch({ type: 'codegen:generate', target: 'zod', requestId: 'inv:2' });
    await flushWorker();

    dispatch({
      type: 'codegen:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace "gamma"' }],
      requestId: 'inv:3'
    });
    await flushWorker();
    dispatch({ type: 'codegen:generate', target: 'zod', requestId: 'inv:4' });
    await flushWorker();

    expect(generateMock).toHaveBeenCalledTimes(4); // each setFiles's own re-run + each explicit generate — none of these four share a version
  });
});
```

- [ ] **Step 2: Run the new tests, resolve the exact call counts**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/workers/codegen-worker.test.ts -t "codegenGenerateCache"`

`codegen:setFiles`'s handler unconditionally calls `runCodegen(lastTarget, lastCodegenRequestId)` on every dispatch (`lastTarget` defaults to `'zod'`), so each test's first `codegen:setFiles` already triggers one `generate()` call before any explicit `codegen:generate` — read the ACTUAL failure output from this run and correct the `toHaveBeenCalledTimes` values in Step 1's tests to match reality if the comments' inline predictions are off by one; the important invariant each test must end up asserting is: repeated `codegen:generate` for the SAME target after only `codegen:setFiles` reuses the cache (fewer calls than dispatches), different targets both compute, and a second `codegen:setFiles` forces recomputation. Expected at this point: all 3 currently FAIL or trivially pass without discriminating cache behavior (same reasoning as Task 1 Step 4 — today's code recomputes unconditionally on every `codegen:generate`, so the "different targets"/"invalidates" tests may already pass by coincidence; the "caches a repeated call" test is the one that must currently fail).

- [ ] **Step 3: Add `codegenFilesVersion`/`codegenGenerateCache` and wire them in**

Add to the module state, directly after `previewGenerateCache` (from Task 2):

```ts
let codegenFilesVersion = 0;
const codegenGenerateCache = new Map<string, VersionedEntry<GeneratorOutput[]>>();
```

Change the `codegen:setFiles` handler from:

```ts
      if (msg.type === 'codegen:setFiles') {
        currentCodegenFiles = msg.files;
```

to:

```ts
      if (msg.type === 'codegen:setFiles') {
        currentCodegenFiles = msg.files;
        codegenFilesVersion++;
```

Change `runCodegen`'s `generate()` call from:

```ts
    const results = await generate(documents, { target });
```

to:

```ts
    const results = await getOrComputeAsync(codegenGenerateCache, target, () => codegenFilesVersion, () =>
      generate(documents, { target })
    );
```

Note (per Global Constraints): `documents` above is still rebuilt by parsing+linking `currentCodegenFiles` fresh on every `runCodegen` call, unconditionally, BEFORE this cache check — a `codegenGenerateCache` hit skips only the `generate()` emit step, not the parse/link step. This is the approved design's stated scope; a codegen-domain documents cache mirroring `documentsCache` is an explicit non-goal here.

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/workers/codegen-worker.test.ts -t "codegenGenerateCache"`
Expected: PASS, 3/3, with whatever exact call counts Step 2 determined were correct.

- [ ] **Step 5: Run the full test file, type-check, and full package suite**

Run: `pnpm --filter @rune-langium/studio run type-check && pnpm --filter @rune-langium/studio test`
Expected: PASS. The two pre-existing, environment-caused failures in `test/integration/lsp-integration.test.ts` (missing `.resources/` CDM corpus fixture tree — see PR #474's own verification notes) are expected and unrelated; every other test, including the full `codegen-worker.test.ts` file, must pass.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/workers/codegen-worker.ts apps/studio/test/workers/codegen-worker.test.ts
git commit -m "perf(studio): cache runCodegen's generate() result per target, invalidated by codegen:setFiles

Introduces codegenFilesVersion (bumped only on codegen:setFiles, mirroring
previewFilesVersion's pattern for currentPreviewFiles) backing
codegenGenerateCache — switching targets on the same files now reuses
whatever was already generated for a previously-visited target instead
of recomputing from scratch."
```

## Self-Review

**Spec coverage:** the design doc's Architecture section is fully covered — Task 1 delivers the primitive + `documentsCache` refactor + `previewSchemaCache`; Task 2 delivers `previewGenerateCache` replacing `cachedFuncCode`; Task 3 delivers `codegenFilesVersion`/`codegenGenerateCache`. The design's "fixes a real latent bug" claim about `cachedFuncCode`'s cross-domain sharing is directly addressed by Task 2, which also surfaced and fixed a SECOND real bug (the qualified-name lookup gap) discovered while implementing the first — both are called out explicitly rather than silently bundled. The design's Testing section's guidance (hit/miss/invalidate per cache, cross-consumer-sharing test for `previewSchemaCache`, no repeated race-condition tests per async consumer) is followed exactly in all three tasks.

**Placeholder scan:** no TBD/TODO markers. Task 3's exact `toHaveBeenCalledTimes` values are flagged as needing confirmation against real tool output in Step 2 rather than asserted with unverified confidence — this is not a placeholder in the "vague requirement" sense the skill warns against; it's an explicit, correctly-scoped instruction to verify a call-count derived from `codegen:setFiles`'s own side-effecting behavior (calling `runCodegen` itself) against the ACTUAL current code before hard-coding it, since getting this wrong would make the plan's own test code inconsistent with the real file. Every other step has concrete, complete code.

**Type consistency:** `VersionedEntry<T>`, `getOrCompute`, `getOrComputeAsync` are defined once in Task 1 with the exact signatures Task 2 and Task 3 both consume unchanged. `FormPreviewSchema` and `GeneratorOutput` (added to the type import in Task 1 Step 1) are the types used by `previewSchemaCache` (Task 1), `previewGenerateCache` (Task 2), and `codegenGenerateCache` (Task 3) respectively — no mismatched or redefined type names across tasks.
