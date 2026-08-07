# Retire preview-validator.ts's Structural Validator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `apps/studio/src/services/preview-validator.ts`'s hand-rolled structural Zod validator (`buildFieldValidator`/`buildSchemaValidator`/`validatePreviewSample`/`formatIssuePath`) with real validation against the actual generated Zod schema (`emitStandaloneZodSchema`), at both of its call sites — Prototype Workspace's instance editor and the plain Form Preview panel.

**Architecture:** `codegen-worker.ts` gains `compileStandaloneValidator` (emit → strip TS → `new Function` compile, cached via the existing `getOrCompute`/`VersionedEntry<T>` primitive) and a rewritten `validateInstance` that runs one `.safeParse()` against the real compiled schema instead of the old structural-validator-plus-condition-loop. Both consumers route through this one worker path via `instance:validate`/`instance:validateResult`: the uncontrolled Form Preview panel gains a new `preview-store.ts` `dispatchValidate`/`receiveValidateResult` pair mirroring `instance-store.ts`'s existing one; the controlled Prototype Workspace editor already round-trips through the worker via `instance-store.ts`, but its `FormPreviewPanel` never read the result — it computed its own local approximation instead, which this plan also fixes.

**Tech Stack:** TypeScript, Zod, the existing Web Worker (`codegen-worker.ts`) sandbox infrastructure, zustand stores, Vitest, React Testing Library.

## Global Constraints

- Base branch is `docs/retire-preview-validator-design`'s tip, which is rebased onto current `master` (includes the merged generalized-cache work, PR #474 + #475). `codegen-worker.ts` already has `getOrCompute`/`getOrComputeAsync`/`VersionedEntry<T>`, `buildDocuments()` returning `VersionedEntry<LangiumDocument[]>`, and `previewSchemaCache`/`previewGenerateCache`/`codegenGenerateCache` as established precedent — every code block below reflects the ACTUAL current file, not an older shape.
- Only these files change: `apps/studio/src/workers/codegen-worker.ts`, `apps/studio/test/workers/codegen-worker.test.ts`, `apps/studio/src/store/preview-store.ts`, `apps/studio/test/store/preview-store.test.ts`, `apps/studio/src/shell/providers/CodegenProvider.tsx`, `apps/studio/src/components/FormPreviewPanel.tsx`, `apps/studio/test/components/FormPreviewPanel.test.tsx`, `apps/studio/src/shell/panels/InstanceFormPanel.tsx`, `apps/studio/src/services/preview-validator.ts`, `apps/studio/test/services/preview-validator.test.ts` (deleted).
- No new worker message types — reuse `instance:validate`/`instance:validateResult` (`createInstanceValidateMessage`, `isInstanceValidateResultMessage` from `codegen-service.ts`) for both consumers.
- `standaloneValidatorCache`'s write must be tagged with `documentsVersion` (the version `documents` was actually built from, from `buildDocuments()`'s own returned `VersionedEntry`) — never a re-sampled live `previewFilesVersion` — matching every other cache in this file (see `getOrCompute`'s own doc comment). It uses the SYNC `getOrCompute`, not `getOrComputeAsync`, since `compileStandaloneValidator` has no `await` in it anywhere.
- `runInWorkerSandbox` is the single hardened-execution path in this worker (its own doc comment says "do not add a second one") — `compileStandaloneValidator` reuses it directly rather than constructing its own `new Function` call.
- `preview-validator.ts`'s default-value/path helpers (`fieldRootKey`, `fieldLeafKey`, `resolveArmPaths`, `splitChoiceArmFields`, `buildDefaultValue`, `buildDefaultObjectValue`, `buildArmValue`, `buildDefaultFieldsObject`, `buildDefaultValues`) are OUT OF SCOPE — never touched by this plan.

---

### Task 1: Worker-side standalone validator compilation + caching + `validateInstance` rewrite

**Files:**
- Modify: `apps/studio/src/workers/codegen-worker.ts`
- Test: `apps/studio/test/workers/codegen-worker.test.ts`

**Interfaces:**
- Consumes: existing `getOrCompute<T>(cache, key, version, compute): VersionedEntry<T>`, `buildDocuments(): Promise<VersionedEntry<LangiumDocument[]>>`, `runInWorkerSandbox(jsSource, argName, argValue, returnExpr): unknown`, `findDataNode(typeFqn, documents)`, `getActiveConditionPredicates(dataNode): Array<{ name: string; predicate: string }>` — all already in the file.
- Produces: `compileStandaloneValidator(documents: LangiumDocument[], typeFqn: string): StandaloneValidatorResult` and `standaloneValidatorCache: Map<string, VersionedEntry<StandaloneValidatorResult>>` — module-private, not consumed by Tasks 2/3 (they only depend on `validateInstance`'s external `instance:validate`/`instance:validateResult` message contract, unchanged).

This task is fully self-contained and independently testable via the worker's existing message-dispatch harness — no store/UI changes needed yet.

- [ ] **Step 1: Refactor `stripTypeAnnotations` into a reusable per-line helper**

Find the current `stripTypeAnnotations` function (in the "TS → JS stripping for @rune-langium/codegen output" section):

```ts
function stripTypeAnnotations(tsCode: string): string {
  const lines = tsCode.split('\n');
  const output: string[] = [];

  for (const line of lines) {
    // Drop the export keyword — functions cached from func.fileContents are
    // declared at top scope and will be referenced by name after the body.
    let cleaned = line.replace(/^export\s+/, '');

    // Strip object literal type annotations in parameters:
    // (param: { field: Type })  →  (param)
    cleaned = cleaned.replace(/(\w+)\??\s*:\s*\{[^{}]*\}\s*(?=[,)])/g, '$1');

    // Strip union/intersection/array/generic type annotations in parameters:
    // (param: TypeA | TypeB[], param2?: Generic<T>)  →  (param, param2)
    cleaned = cleaned.replace(/(\w+)\??\s*:\s*[\w.<>()[\] |&?,]+\s*(?=[,)])/g, '$1');

    // Strip arrow function return type: ): ReturnType =>  →  ) =>
    cleaned = cleaned.replace(/\)\s*:\s*[\w.<>()[\] |&?,]+\s*=>/g, ') =>');

    // Strip regular function/method return type: ): ReturnType {  →  ) {
    cleaned = cleaned.replace(/\)\s*:\s*[\w.<>()[\] |&?| ]+\s*\{/g, ') {');
    cleaned = cleaned.replace(/\)\s*:\s*\w+\s+is\s+\w+\s*\{/g, ') {');

    // Strip variable type annotations: let/const x: Type = or let x: Type;
    cleaned = cleaned.replace(/((?:const|let|var)\s+\w+)\s*:\s*[\w.<>()[\] |&?,]+\s*(=|;)/g, '$1 $2');

    // Strip type casts
    cleaned = cleaned.replace(/\s+as\s+typeof\s+this\.\w+/g, '');
    cleaned = cleaned.replace(/\s+as\s+const/g, '');
    cleaned = cleaned.replace(/\s+as\s+\w+/g, '');

    output.push(cleaned);
  }

  return output.join('\n');
}
```

Replace it with:

```ts
function stripLineTypeAnnotations(line: string): string {
  // Drop the export keyword — functions cached from func.fileContents are
  // declared at top scope and will be referenced by name after the body.
  let cleaned = line.replace(/^export\s+/, '');

  // Strip object literal type annotations in parameters:
  // (param: { field: Type })  →  (param)
  cleaned = cleaned.replace(/(\w+)\??\s*:\s*\{[^{}]*\}\s*(?=[,)])/g, '$1');

  // Strip union/intersection/array/generic type annotations in parameters:
  // (param: TypeA | TypeB[], param2?: Generic<T>)  →  (param, param2)
  cleaned = cleaned.replace(/(\w+)\??\s*:\s*[\w.<>()[\] |&?,]+\s*(?=[,)])/g, '$1');

  // Strip arrow function return type: ): ReturnType =>  →  ) =>
  cleaned = cleaned.replace(/\)\s*:\s*[\w.<>()[\] |&?,]+\s*=>/g, ') =>');

  // Strip regular function/method return type: ): ReturnType {  →  ) {
  cleaned = cleaned.replace(/\)\s*:\s*[\w.<>()[\] |&?| ]+\s*\{/g, ') {');
  cleaned = cleaned.replace(/\)\s*:\s*\w+\s+is\s+\w+\s*\{/g, ') {');

  // Strip variable type annotations: let/const x: Type = or let x: Type;
  cleaned = cleaned.replace(/((?:const|let|var)\s+\w+)\s*:\s*[\w.<>()[\] |&?,]+\s*(=|;)/g, '$1 $2');

  // Strip type casts
  cleaned = cleaned.replace(/\s+as\s+typeof\s+this\.\w+/g, '');
  cleaned = cleaned.replace(/\s+as\s+const/g, '');
  cleaned = cleaned.replace(/\s+as\s+\w+/g, '');

  return cleaned;
}

function stripTypeAnnotations(tsCode: string): string {
  return tsCode.split('\n').map(stripLineTypeAnnotations).join('\n');
}
```

This is a pure refactor — `stripTypeAnnotations`'s external behavior is unchanged (same input → same output), only its regex passes are now extracted into `stripLineTypeAnnotations` so Step 2's `stripModuleTypeAnnotations` can reuse them without duplicating the six regex lines.

- [ ] **Step 2: Verify the refactor is behavior-preserving**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/workers/codegen-worker.test.ts -t "previewGenerateCache"`
Expected: PASS, unchanged — these are `executeFunction`'s existing tests, the only current consumer of `stripTypeAnnotations`.

- [ ] **Step 3: Add `stripModuleTypeAnnotations`**

Directly below `stripTypeAnnotations`, add:

```ts
// Balanced-brace scan (not regex — a cyclic type's interface body could in
// principle nest braces, e.g. a field typed as an inline object) for
// `export interface <Name> { ... }` blocks — emitStandaloneZodSchema
// predeclares these for cyclic targets (zod-emitter.ts's
// emitCyclicInterface), and stripLineTypeAnnotations only strips inline
// type annotations, not whole declaration blocks.
function stripInterfaceBlocks(tsCode: string): string {
  const marker = 'export interface ';
  let result = '';
  let i = 0;
  while (i < tsCode.length) {
    const idx = tsCode.indexOf(marker, i);
    if (idx === -1) {
      result += tsCode.slice(i);
      break;
    }
    result += tsCode.slice(i, idx);
    const braceStart = tsCode.indexOf('{', idx);
    let depth = 0;
    let j = braceStart;
    for (; j < tsCode.length; j++) {
      if (tsCode[j] === '{') depth++;
      else if (tsCode[j] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    i = j + 1;
    if (tsCode[i] === '\n') i++;
  }
  return result;
}

/**
 * Turns `emitStandaloneZodSchema`'s returned TypeScript module into plain,
 * `runInWorkerSandbox`-evaluable JavaScript: drops any cyclic-type
 * `export interface` predeclaration block, drops the `import { z } from
 * 'zod';` header line (the caller binds `z` as an explicit sandbox
 * parameter instead — `new Function` bodies cannot contain `import`
 * statements), then delegates to `stripLineTypeAnnotations` for the
 * remaining per-line type syntax (`export const Name: z.ZodType<X> = ...`,
 * `as` casts).
 */
function stripModuleTypeAnnotations(tsCode: string): string {
  const withoutInterfaces = stripInterfaceBlocks(tsCode);
  const withoutImports = withoutInterfaces
    .split('\n')
    .filter((line) => !/^import .*;$/.test(line))
    .join('\n');
  return withoutImports.split('\n').map(stripLineTypeAnnotations).join('\n');
}
```

- [ ] **Step 4: Add `compileStandaloneValidator` and its cache**

Add the import (top of file, alongside the existing `@rune-langium/codegen/export` import):

```ts
import { generate, generatePreviewSchemas, emitStandaloneZodSchema, RUNTIME_HELPER_JS_SOURCE } from '@rune-langium/codegen/export';
import type { Target, FormPreviewSchema, GeneratorOutput, GeneratorDiagnostic } from '@rune-langium/codegen/export';
```

(This replaces the current `import { generate, generatePreviewSchemas, RUNTIME_HELPER_JS_SOURCE } from '@rune-langium/codegen/export';` and `import type { Target, FormPreviewSchema, GeneratorOutput } from '@rune-langium/codegen/export';` lines — `emitStandaloneZodSchema` and `GeneratorDiagnostic` are new.)

Add a value import for `z` (needed at runtime — it's bound as the sandbox's `z` parameter, not just used as a type):

```ts
import { z } from 'zod';
```

Add to the module state, directly after `const codegenGenerateCache = new Map<string, VersionedEntry<GeneratorOutput[]>>();`:

```ts
const standaloneValidatorCache = new Map<string, VersionedEntry<StandaloneValidatorResult>>();
```

Add near the end of the "Versioned cache primitive" section (after `getOrComputeAsync`, before "Generation logic"):

```ts
interface StandaloneValidatorResult {
  validator: z.ZodTypeAny | undefined;
  diagnostics: GeneratorDiagnostic[];
}

/**
 * Compiles `typeFqn`'s real Zod schema via `emitStandaloneZodSchema`
 * (packages/codegen/src/emit/standalone-schema.ts) and evaluates it through
 * `runInWorkerSandbox` — the same hardened `new Function` path
 * `executeFunction`/`validateInstance`'s condition predicates already use;
 * do not add a second one.
 *
 * Fully synchronous — `emitStandaloneZodSchema` and the sandbox eval both
 * have no `await` anywhere in this call — so its cache (below) uses the
 * sync `getOrCompute`, not `getOrComputeAsync`.
 */
function compileStandaloneValidator(documents: LangiumDocument[], typeFqn: string): StandaloneValidatorResult {
  const { code, diagnostics } = emitStandaloneZodSchema(documents, typeFqn);
  if (diagnostics.some((d) => d.severity === 'error')) {
    return { validator: undefined, diagnostics };
  }
  // emitStandaloneZodSchema always names the target's own schema constant
  // `${bareName}Schema` (zod-emitter.ts's schemaName convention), and
  // typeFqn's own bare name (its final `.`-segment) is exactly that name.
  const targetName = typeFqn.slice(typeFqn.lastIndexOf('.') + 1);
  try {
    const stripped = stripModuleTypeAnnotations(code);
    const validator = runInWorkerSandbox(stripped, 'z', z, `${targetName}Schema`) as z.ZodTypeAny;
    return { validator, diagnostics };
  } catch (err) {
    return {
      validator: undefined,
      diagnostics: [
        ...diagnostics,
        {
          severity: 'error',
          code: 'compile-error',
          message: err instanceof Error ? err.message : String(err)
        }
      ]
    };
  }
}
```

- [ ] **Step 5: Run type-check to catch import/reference issues before wiring `validateInstance`**

Run: `pnpm --filter @rune-langium/studio run type-check`
Expected: PASS. `standaloneValidatorCache`/`compileStandaloneValidator` are currently unused outside their own declarations, which is fine — Step 7 wires them in.

- [ ] **Step 6: Write the failing worker-level tests for `validateInstance`'s new structural-validation path**

The existing `codegen-worker.test.ts` mocks `@rune-langium/codegen/export` (`generateMock`, `generatePreviewSchemasMock`, `RUNTIME_HELPER_JS_SOURCE: ''`) — add an `emitStandaloneZodSchemaMock` to that same mock so these tests exercise `stripModuleTypeAnnotations`/`compileStandaloneValidator`/`runInWorkerSandbox` FOR REAL against realistic fixture strings (not a mocked-out compile step), matching the existing "mock external generation, test the worker's own orchestration/caching/message-routing for real" convention this file already follows throughout.

Change (near the top of the file):

```ts
const generateMock = vi.fn(() => []);
const generatePreviewSchemasMock = vi.fn(() => []);
```

to:

```ts
const generateMock = vi.fn(() => []);
const generatePreviewSchemasMock = vi.fn(() => []);
const emitStandaloneZodSchemaMock = vi.fn(() => ({ code: '', diagnostics: [] }));
```

Change:

```ts
vi.mock('@rune-langium/codegen/export', () => ({
  generate: generateMock,
  generatePreviewSchemas: generatePreviewSchemasMock,
  RUNTIME_HELPER_JS_SOURCE: ''
}));
```

to:

```ts
vi.mock('@rune-langium/codegen/export', () => ({
  generate: generateMock,
  generatePreviewSchemas: generatePreviewSchemasMock,
  emitStandaloneZodSchema: emitStandaloneZodSchemaMock,
  RUNTIME_HELPER_JS_SOURCE: ''
}));
```

Insert this new describe block directly before `describe('codegen-worker instance:validate messages', () => {` (the existing instance-validate describe block covers the OLD `validatePreviewSample`-backed behavior and stays for now — this new block covers the new path; the existing block is deleted in Step 9 once this replaces it):

```ts
describe('codegen-worker validateInstance (real standalone Zod validator)', () => {
  beforeEach(() => {
    buildMock.mockReset();
    buildMock.mockImplementation(async () => undefined);
    fromStringMock.mockClear();
    emitStandaloneZodSchemaMock.mockReset();
    findDataNodeMock.mockReset();
    findDataNodeMock.mockReturnValue(undefined);
    getActiveConditionPredicatesMock.mockReset();
    getActiveConditionPredicatesMock.mockReturnValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function setFilesAndFlush(dispatch: (data: unknown) => void, flushWorker: () => Promise<void>) {
    dispatch({
      type: 'preview:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace "beta"' }],
      requestId: 'setup:1'
    });
    await flushWorker();
  }

  it('validates real sample data through a plain-object emitted schema', async () => {
    emitStandaloneZodSchemaMock.mockReturnValue({
      code: [
        "import { z } from 'zod';",
        '',
        'export const TradeSchema = z',
        '  .object({',
        '    id: z.string().min(1)',
        '  })',
        '  .strict();'
      ].join('\n'),
      diagnostics: []
    });

    const { scope, dispatch } = await loadWorkerModule();
    await setFilesAndFlush(dispatch, flushWorker);

    dispatch({ type: 'instance:validate', typeFqn: 'beta.Trade', data: { id: 'T-1' }, requestId: 'v:1' });
    await flushWorker();
    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: 'instance:validateResult',
      requestId: 'v:1',
      diagnostics: []
    });

    dispatch({ type: 'instance:validate', typeFqn: 'beta.Trade', data: {}, requestId: 'v:2' });
    await flushWorker();
    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: 'instance:validateResult',
      requestId: 'v:2',
      diagnostics: [{ path: 'id', message: expect.any(String) }]
    });
  });

  it('exercises the cyclic-type interface-stripping path end-to-end', async () => {
    // Mirrors zod-emitter.ts's emitCyclicInterface + the z.ZodType<Name> =
    // z.lazy(...) shape it pairs with for a self-referencing Data type.
    emitStandaloneZodSchemaMock.mockReturnValue({
      code: [
        "import { z } from 'zod';",
        '',
        'export interface Node {',
        '  value: string;',
        '  child?: Node;',
        '}',
        '',
        'export const NodeSchema: z.ZodType<Node> = z.lazy(() =>',
        '  z',
        '    .object({',
        '      value: z.string().min(1),',
        '      child: NodeSchema.optional()',
        '    })',
        '    .strict()',
        ');'
      ].join('\n'),
      diagnostics: []
    });

    const { scope, dispatch } = await loadWorkerModule();
    await setFilesAndFlush(dispatch, flushWorker);

    dispatch({
      type: 'instance:validate',
      typeFqn: 'beta.Node',
      data: { value: 'root', child: { value: 'leaf' } },
      requestId: 'v:1'
    });
    await flushWorker();
    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: 'instance:validateResult',
      requestId: 'v:1',
      diagnostics: []
    });
  });

  it('reports "Structural validation unavailable" when the closure has an error diagnostic', async () => {
    emitStandaloneZodSchemaMock.mockReturnValue({
      code: '',
      diagnostics: [{ severity: 'error', code: 'unknown-target', message: "Target 'beta.Ghost' was not found." }]
    });

    const { scope, dispatch } = await loadWorkerModule();
    await setFilesAndFlush(dispatch, flushWorker);

    dispatch({ type: 'instance:validate', typeFqn: 'beta.Ghost', data: {}, requestId: 'v:1' });
    await flushWorker();

    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: 'instance:validateResult',
      requestId: 'v:1',
      diagnostics: [{ path: '', message: "Structural validation unavailable: Target 'beta.Ghost' was not found." }]
    });
  });

  it('reports "Structural validation unavailable" when the stripped script throws on compile/eval', async () => {
    emitStandaloneZodSchemaMock.mockReturnValue({
      code: "import { z } from 'zod';\n\nexport const TradeSchema = z.object({ id: notAFunction() });",
      diagnostics: []
    });

    const { scope, dispatch } = await loadWorkerModule();
    await setFilesAndFlush(dispatch, flushWorker);

    dispatch({ type: 'instance:validate', typeFqn: 'beta.Trade', data: {}, requestId: 'v:1' });
    await flushWorker();

    const call = scope.postMessage.mock.calls.at(-1)![0];
    expect(call.type).toBe('instance:validateResult');
    expect(call.requestId).toBe('v:1');
    expect(call.diagnostics).toHaveLength(1);
    expect(call.diagnostics[0].path).toBe('');
    expect(call.diagnostics[0].message).toMatch(/^Structural validation unavailable:/);
  });

  it('attributes a multi-condition superRefine issue to its condition name via path', async () => {
    emitStandaloneZodSchemaMock.mockReturnValue({
      code: [
        "import { z } from 'zod';",
        '',
        'export const TradeSchema = z',
        '  .object({',
        '    fixedRate: z.string().optional(),',
        '    floatingRate: z.string().optional()',
        '  })',
        '  .strict()',
        '  .superRefine((data, ctx) => {',
        "    const present = [data.fixedRate, data.floatingRate].filter((v) => v !== undefined).length;",
        '    if (present !== 1) {',
        "      ctx.addIssue({ code: 'custom', message: 'oneRateKind: exactly one of [fixedRate, floatingRate] must be present in Trade', path: ['oneRateKind'] });",
        '    }',
        '  });'
      ].join('\n'),
      diagnostics: []
    });
    findDataNodeMock.mockReturnValue({ name: 'Trade' });
    getActiveConditionPredicatesMock.mockReturnValue([{ name: 'oneRateKind', predicate: 'runeCheckOneOf([...])' }]);

    const { scope, dispatch } = await loadWorkerModule();
    await setFilesAndFlush(dispatch, flushWorker);

    dispatch({ type: 'instance:validate', typeFqn: 'beta.Trade', data: {}, requestId: 'v:1' });
    await flushWorker();

    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: 'instance:validateResult',
      requestId: 'v:1',
      diagnostics: [
        {
          path: 'oneRateKind',
          message: 'oneRateKind: exactly one of [fixedRate, floatingRate] must be present in Trade',
          conditionName: 'oneRateKind'
        }
      ]
    });
  });

  it('attributes a single-condition refine issue (empty path) to the sole active condition', async () => {
    emitStandaloneZodSchemaMock.mockReturnValue({
      code: [
        "import { z } from 'zod';",
        '',
        'export const TradeSchema = z',
        '  .object({ id: z.string().optional() })',
        '  .strict()',
        "  .refine((data) => data.id !== undefined, 'hasId: id must be present in Trade');"
      ].join('\n'),
      diagnostics: []
    });
    findDataNodeMock.mockReturnValue({ name: 'Trade' });
    getActiveConditionPredicatesMock.mockReturnValue([{ name: 'hasId', predicate: 'runeAttrExists(data.id)' }]);

    const { scope, dispatch } = await loadWorkerModule();
    await setFilesAndFlush(dispatch, flushWorker);

    dispatch({ type: 'instance:validate', typeFqn: 'beta.Trade', data: {}, requestId: 'v:1' });
    await flushWorker();

    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: 'instance:validateResult',
      requestId: 'v:1',
      diagnostics: [
        { path: 'hasId', message: 'hasId: id must be present in Trade', conditionName: 'hasId' }
      ]
    });
  });

  it('caches the compiled validator across repeated instance:validate calls for the same typeFqn', async () => {
    emitStandaloneZodSchemaMock.mockReturnValue({
      code: "import { z } from 'zod';\n\nexport const TradeSchema = z.object({}).strict();",
      diagnostics: []
    });

    const { dispatch } = await loadWorkerModule();
    await setFilesAndFlush(dispatch, flushWorker);

    dispatch({ type: 'instance:validate', typeFqn: 'beta.Trade', data: {}, requestId: 'v:1' });
    await flushWorker();
    dispatch({ type: 'instance:validate', typeFqn: 'beta.Trade', data: {}, requestId: 'v:2' });
    await flushWorker();

    expect(emitStandaloneZodSchemaMock).toHaveBeenCalledTimes(1);
  });

  it('recompiles the validator after a preview:setFiles bumps the file version', async () => {
    emitStandaloneZodSchemaMock.mockReturnValue({
      code: "import { z } from 'zod';\n\nexport const TradeSchema = z.object({}).strict();",
      diagnostics: []
    });

    const { dispatch } = await loadWorkerModule();
    await setFilesAndFlush(dispatch, flushWorker);

    dispatch({ type: 'instance:validate', typeFqn: 'beta.Trade', data: {}, requestId: 'v:1' });
    await flushWorker();

    dispatch({
      type: 'preview:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace "beta" // changed' }],
      requestId: 'setup:2'
    });
    await flushWorker();

    dispatch({ type: 'instance:validate', typeFqn: 'beta.Trade', data: {}, requestId: 'v:2' });
    await flushWorker();

    expect(emitStandaloneZodSchemaMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 7: Run the new tests to verify they fail**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/workers/codegen-worker.test.ts -t "real standalone Zod validator"`
Expected: FAIL — `validateInstance` still calls the deleted-in-Step-9 `validatePreviewSample`/`previewSchemaCache` path, never touches `compileStandaloneValidator`/`emitStandaloneZodSchemaMock`, and its diagnostics won't match. Some may even throw, since `emitStandaloneZodSchemaMock` is never invoked by the current code and `findDataNodeMock`/`getActiveConditionPredicatesMock` are configured for the NEW attribution shape.

- [ ] **Step 8: Rewrite `validateInstance`**

Find the current `validateInstance` function (the entire "Instance validation" section):

```ts
async function validateInstance(typeFqn: string, data: Record<string, unknown>, requestId: string): Promise<void> {
  const scope = self as unknown as DedicatedWorkerGlobalScope;

  try {
    const { version: documentsVersion, value: documents } = await buildDocuments();
    const dataNode = findDataNode(typeFqn, documents);
    const {
      value: [schema]
    } = getOrCompute(previewSchemaCache, typeFqn, documentsVersion, () =>
      generatePreviewSchemas(documents, { targetId: typeFqn })
    );
    if (!dataNode && !schema) {
      scope.postMessage({
        type: 'instance:validateResult',
        requestId,
        diagnostics: [{ path: '', message: `Unknown type '${typeFqn}'` }]
      });
      return;
    }

    const structural = validatePreviewSample(
      schema ?? { schemaVersion: 1, targetId: typeFqn, title: dataNode!.name, status: 'ready', fields: [] },
      data
    );
    const structuralDiagnostics: ValidationDiagnostic[] = Object.entries(structural.errors).map(([path, message]) => ({
      path,
      message
    }));

    const conditionDiagnostics: ValidationDiagnostic[] = [];
    if (dataNode) {
      for (const { name, predicate } of getActiveConditionPredicates(dataNode)) {
        if (!runInWorkerSandbox('', 'data', data, `(${predicate})`)) {
          conditionDiagnostics.push({ path: name, message: `Condition '${name}' failed`, conditionName: name });
        }
      }
    }

    scope.postMessage({
      type: 'instance:validateResult',
      requestId,
      diagnostics: [...structuralDiagnostics, ...conditionDiagnostics]
    });
  } catch (err) {
    console.error('[codegen-worker] Instance validation error:', err);
    scope.postMessage({
      type: 'instance:validateResult',
      requestId,
      diagnostics: [{ path: '', message: err instanceof Error ? err.message : 'Instance validation failed.' }]
    });
  }
}
```

Replace it with:

```ts
// Translates issue path back to the Rune-idiomatic dotted/bracketed form
// preview-validator.ts's original formatIssuePath used — presentation logic
// only, not part of the deleted structural validator.
function formatIssuePath(path: ReadonlyArray<PropertyKey>): string {
  return path
    .filter((segment): segment is string | number => typeof segment === 'string' || typeof segment === 'number')
    .map((segment) => (typeof segment === 'number' ? `[${segment}]` : segment))
    .join('.')
    .replace('.[', '[');
}

/**
 * Translates real Zod issues into ValidationDiagnostic[], attributing an
 * issue back to a named Rune condition when possible:
 *  - path.length >= 1 and path[0] matches an active condition's name → the
 *    multi-condition .superRefine() case (zod-emitter.ts's emitOneOf/
 *    emitChoice/etc. always emit `path: [conditionName]`).
 *  - path.length === 0 and there is exactly one active condition → the
 *    single-condition .refine() case (Zod's shorthand form carries no path;
 *    its message is always prefixed with the condition name).
 *  - everything else → an ordinary field-structural diagnostic.
 */
function translateValidationIssues(
  issues: z.ZodError['issues'],
  activeConditionNames: string[]
): ValidationDiagnostic[] {
  const conditionNameSet = new Set(activeConditionNames);
  const soleConditionName = activeConditionNames.length === 1 ? activeConditionNames[0] : undefined;
  return issues.map((issue) => {
    const first = issue.path[0];
    if (issue.path.length >= 1 && typeof first === 'string' && conditionNameSet.has(first)) {
      return { path: first, message: issue.message, conditionName: first };
    }
    if (issue.path.length === 0 && soleConditionName) {
      return { path: soleConditionName, message: issue.message, conditionName: soleConditionName };
    }
    return { path: formatIssuePath(issue.path), message: issue.message };
  });
}

async function validateInstance(typeFqn: string, data: Record<string, unknown>, requestId: string): Promise<void> {
  const scope = self as unknown as DedicatedWorkerGlobalScope;

  try {
    const { version: documentsVersion, value: documents } = await buildDocuments();
    const { value: compiled } = getOrCompute(standaloneValidatorCache, typeFqn, documentsVersion, () =>
      compileStandaloneValidator(documents, typeFqn)
    );

    if (!compiled.validator) {
      const firstError = compiled.diagnostics.find((d) => d.severity === 'error');
      scope.postMessage({
        type: 'instance:validateResult',
        requestId,
        diagnostics: [
          { path: '', message: `Structural validation unavailable: ${firstError?.message ?? 'unknown error'}` }
        ]
      });
      return;
    }

    // Condition NAMES are still needed to attribute a Zod issue back to a
    // named Rune condition (translateValidationIssues) — the predicates
    // themselves are no longer executed separately; the real schema already
    // embeds every active condition as a .refine()/.superRefine().
    const dataNode = findDataNode(typeFqn, documents);
    const activeConditionNames = dataNode ? getActiveConditionPredicates(dataNode).map(({ name }) => name) : [];

    const result = compiled.validator.safeParse(data);
    const diagnostics: ValidationDiagnostic[] = result.success
      ? []
      : translateValidationIssues(result.error.issues, activeConditionNames);

    scope.postMessage({ type: 'instance:validateResult', requestId, diagnostics });
  } catch (err) {
    console.error('[codegen-worker] Instance validation error:', err);
    scope.postMessage({
      type: 'instance:validateResult',
      requestId,
      diagnostics: [{ path: '', message: err instanceof Error ? err.message : 'Instance validation failed.' }]
    });
  }
}
```

Remove the now-unused import: `import { validatePreviewSample } from '../services/preview-validator.js';` — this is `codegen-worker.ts`'s only remaining reference to `preview-validator.ts`; deleting this line fully decouples the worker from that service module (Task 3 deletes the function itself).

- [ ] **Step 9: Run the new tests to verify they pass**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/workers/codegen-worker.test.ts -t "real standalone Zod validator"`
Expected: PASS, 8/8.

- [ ] **Step 10: Delete the old `instance:validate` describe block**

Find and delete the existing `describe('codegen-worker instance:validate messages', () => { ... });` block — it exercises the deleted `validatePreviewSample`-backed behavior (structural + separately-executed condition predicates via `runInWorkerSandbox('', 'data', data, ...)`) and is fully superseded by Step 6's new block, which covers the same surface (structural errors, condition attribution, unknown-type handling) against the real schema instead.

- [ ] **Step 11: Run the full worker test file and type-check**

Run: `pnpm --filter @rune-langium/studio run type-check && pnpm --filter @rune-langium/studio exec vitest run test/workers/codegen-worker.test.ts`
Expected: PASS, 0 failures, 0 references to `validatePreviewSample`/`previewSchemaCache` remaining inside `validateInstance`.

- [ ] **Step 12: Commit**

```bash
git add apps/studio/src/workers/codegen-worker.ts apps/studio/test/workers/codegen-worker.test.ts
git commit -m "feat(studio): validate instances against the real generated Zod schema

Replaces preview-validator.ts's hand-rolled structural validator inside
codegen-worker.ts's validateInstance with a real schema compiled via
emitStandaloneZodSchema (stripped to JS, evaluated through the existing
runInWorkerSandbox hardened-execution path) and cached with the file's
established getOrCompute/VersionedEntry<T> primitive. A single
.safeParse() call now covers both structural validation and every
active Rune condition (already embedded in the real schema's own
.refine()/.superRefine() blocks), replacing the separate condition-
predicate execution loop."
```

---

### Task 2: Uncontrolled Form Preview panel — worker round trip via `preview-store.ts`

**Files:**
- Modify: `apps/studio/src/store/preview-store.ts`
- Modify: `apps/studio/test/store/preview-store.test.ts`
- Modify: `apps/studio/src/shell/providers/CodegenProvider.tsx`
- Modify: `apps/studio/src/components/FormPreviewPanel.tsx` (uncontrolled branch only — Task 3 handles the controlled branch)

**Interfaces:**
- Consumes: `instance:validate`/`instance:validateResult` message contract (unchanged, from Task 1); existing `createInstanceValidateMessage(typeFqn, data, requestId)` and `isInstanceValidateResultMessage(msg)` from `apps/studio/src/services/codegen-service.ts` (both already exist, used today by `instance-store.ts`).
- Produces: `usePreviewStore`'s new `updateSampleValues(targetId, values, validated): void`, `dispatchValidate(targetId, data): void`, `receiveValidateResult(requestId, diagnostics): void` — Task 3 does not depend on these (it only touches the controlled branch of `FormPreviewPanel.tsx`), but keep signatures exact since this task's own tests pin them.

- [ ] **Step 1: Write the failing store-level tests**

`instance-store.ts`'s existing `dispatchValidate`/`receiveValidateResult` tests (`apps/studio/test/store/instance-store.test.ts`) are the template this mirrors. Add to `apps/studio/test/store/preview-store.test.ts` (a new describe block; place it near the existing `updateSample`-adjacent tests):

```ts
describe('preview-store dispatchValidate/receiveValidateResult', () => {
  beforeEach(() => {
    usePreviewStore.getState().resetPreviewState();
  });

  it('dispatchValidate posts an instance:validate message and receiveValidateResult writes errors/valid onto the sample', () => {
    const postMessage = vi.fn();
    usePreviewStore.getState().setWorkerRef({ postMessage } as unknown as Worker);
    usePreviewStore.getState().updateSampleValues('alpha.Trade', { value: '' }, true);

    usePreviewStore.getState().dispatchValidate('alpha.Trade', { value: '' });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'instance:validate', typeFqn: 'alpha.Trade', data: { value: '' } })
    );
    const requestId = postMessage.mock.calls[0]![0].requestId as string;

    usePreviewStore.getState().receiveValidateResult(requestId, [{ path: 'value', message: 'Value is required' }]);

    expect(usePreviewStore.getState().samples.get('alpha.Trade')).toMatchObject({
      values: { value: '' },
      errors: { value: 'Value is required' },
      valid: false,
      validated: true
    });
    expect(usePreviewStore.getState().status).toEqual({ state: 'invalid', targetId: 'alpha.Trade' });
  });

  it('drops a stale out-of-order receiveValidateResult in favor of the latest dispatched request', () => {
    const postMessage = vi.fn();
    usePreviewStore.getState().setWorkerRef({ postMessage } as unknown as Worker);
    usePreviewStore.getState().updateSampleValues('alpha.Trade', { value: 'a' }, true);

    usePreviewStore.getState().dispatchValidate('alpha.Trade', { value: 'a' });
    const firstRequestId = postMessage.mock.calls[0]![0].requestId as string;
    usePreviewStore.getState().dispatchValidate('alpha.Trade', { value: 'ab' });
    const secondRequestId = postMessage.mock.calls[1]![0].requestId as string;

    usePreviewStore.getState().receiveValidateResult(secondRequestId, []);
    usePreviewStore.getState().receiveValidateResult(firstRequestId, [{ path: 'value', message: 'stale' }]);

    expect(usePreviewStore.getState().samples.get('alpha.Trade')).toMatchObject({ errors: {}, valid: true });
  });

  it('updateSampleValues clears prior errors/valid immediately so stale errors never linger against new values', () => {
    usePreviewStore.getState().updateSampleValues('alpha.Trade', { value: '' }, true);
    usePreviewStore.getState().receiveValidateResult('nonexistent', []); // no-op, requestId never dispatched

    const postMessage = vi.fn();
    usePreviewStore.getState().setWorkerRef({ postMessage } as unknown as Worker);
    usePreviewStore.getState().dispatchValidate('alpha.Trade', { value: '' });
    const requestId = postMessage.mock.calls[0]![0].requestId as string;
    usePreviewStore.getState().receiveValidateResult(requestId, [{ path: 'value', message: 'Value is required' }]);
    expect(usePreviewStore.getState().samples.get('alpha.Trade')?.errors).toEqual({ value: 'Value is required' });

    usePreviewStore.getState().updateSampleValues('alpha.Trade', { value: 'x' }, true);
    expect(usePreviewStore.getState().samples.get('alpha.Trade')).toMatchObject({
      values: { value: 'x' },
      errors: {},
      valid: true
    });
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/store/preview-store.test.ts -t "dispatchValidate/receiveValidateResult"`
Expected: FAIL — `updateSampleValues`/`dispatchValidate`/`receiveValidateResult` don't exist on the store yet.

- [ ] **Step 3: Update the 2 existing `updateSample` call sites in `preview-store.test.ts`**

Find:

```ts
    usePreviewStore.getState().updateSample('alpha.Trade', { value: '' }, { value: 'Value is required' }, false, true);
```

(appears twice, at the two call sites identified during planning — inside `'tracks invalid sample state and resets back to ready for the active target'` and `'preserves sample values and invalid status when a selected target is renamed by source identity'`). Each test's local scope is independent, so the same replacement applies verbatim to both — set values via `updateSampleValues`, then drive a real `dispatchValidate`/`receiveValidateResult` round trip (capturing the requestId off a spied `postMessage`, the same pattern Step 1's new tests use) to populate errors/valid:

```ts
    usePreviewStore.getState().updateSampleValues('alpha.Trade', { value: '' }, true);
    const postMessage = vi.fn();
    usePreviewStore.getState().setWorkerRef({ postMessage } as unknown as Worker);
    usePreviewStore.getState().dispatchValidate('alpha.Trade', { value: '' });
    usePreviewStore
      .getState()
      .receiveValidateResult(postMessage.mock.calls[0]![0].requestId, [{ path: 'value', message: 'Value is required' }]);
```

- [ ] **Step 4: Add `updateSampleValues`/`dispatchValidate`/`receiveValidateResult` to `preview-store.ts`**

Add the import (top of file, alongside the existing `preview-validator.js` import):

```ts
import { createInstanceValidateMessage } from '../services/codegen-service.js';
import type { ValidationDiagnostic } from '@rune-langium/codegen/instances';
```

Add module-level state, directly after `const executeSpans = new Map<string, { opId: number; startedAt: number }>();`:

```ts
let dispatchValidateCounter = 0;
const pendingValidateRequests = new Map<string, string>(); // requestId -> targetId
// Tracks the LATEST outstanding validate requestId per targetId so an
// out-of-order response (an older request's result arriving after a newer
// one) can be dropped instead of overwriting fresher diagnostics with stale
// ones — mirrors instance-store.ts's identical latestValidateRequestForInstance.
const latestValidateRequestForTarget = new Map<string, string>();
```

In `PreviewStoreActions`, replace:

```ts
  updateSample(
    targetId: string,
    values: Record<string, unknown>,
    errors: Record<string, string>,
    valid: boolean,
    validated: boolean
  ): void;
```

with:

```ts
  updateSampleValues(targetId: string, values: Record<string, unknown>, validated: boolean): void;
  dispatchValidate(targetId: string, data: Record<string, unknown>): void;
  receiveValidateResult(requestId: string, diagnostics: ValidationDiagnostic[]): void;
```

Replace the `updateSample` implementation:

```ts
  updateSample(targetId, values, errors, valid, validated) {
    const samples = new Map(get().samples);
    samples.set(targetId, {
      targetId,
      values,
      serialized: serializeSampleValues(values),
      errors,
      valid,
      validated,
      updatedAt: Date.now()
    });
    const currentStatus = get().status;
    let nextStatus: PreviewStatus;
    if (currentStatus.state === 'stale' || currentStatus.state === 'unavailable') {
      nextStatus = currentStatus;
    } else if (validated && !valid) {
      nextStatus = { state: 'invalid', targetId };
    } else {
      nextStatus = { state: 'ready', targetId };
    }
    set({ samples, status: nextStatus });
  },
```

with:

```ts
  // Updates values immediately (optimistic — no wait for the worker) and
  // clears errors/valid to the "nothing wrong yet" state, so a still-in-
  // flight validate response for the PREVIOUS values can never be
  // displayed against these NEW values once it arrives late (see
  // receiveValidateResult's staleness guard for the complementary half of
  // this invariant). The real errors/valid land asynchronously via
  // dispatchValidate → receiveValidateResult.
  updateSampleValues(targetId, values, validated) {
    const samples = new Map(get().samples);
    samples.set(targetId, {
      targetId,
      values,
      serialized: serializeSampleValues(values),
      errors: {},
      valid: true,
      validated,
      updatedAt: Date.now()
    });
    const currentStatus = get().status;
    set({
      samples,
      status:
        currentStatus.state === 'stale' || currentStatus.state === 'unavailable'
          ? currentStatus
          : { state: 'ready', targetId }
    });
  },

  dispatchValidate(targetId, data) {
    if (!workerRef) return;
    const worker = workerRef;
    dispatchValidateCounter++;
    const requestId = `validate:${targetId}:${dispatchValidateCounter}`;
    pendingValidateRequests.set(requestId, targetId);
    latestValidateRequestForTarget.set(targetId, requestId);
    worker.postMessage(createInstanceValidateMessage(targetId, data, requestId));
  },

  receiveValidateResult(requestId, diagnostics) {
    const targetId = pendingValidateRequests.get(requestId);
    if (!targetId) return;
    pendingValidateRequests.delete(requestId);
    // Drop an out-of-order response: only the LATEST request issued for
    // this target is allowed to write errors/valid.
    if (latestValidateRequestForTarget.get(targetId) !== requestId) return;
    const sample = get().samples.get(targetId);
    if (!sample) return;
    const errors: Record<string, string> = Object.fromEntries(diagnostics.map((d) => [d.path, d.message]));
    const valid = diagnostics.length === 0;
    const samples = new Map(get().samples);
    samples.set(targetId, { ...sample, errors, valid });
    const currentStatus = get().status;
    const nextStatus: PreviewStatus =
      currentStatus.state === 'stale' || currentStatus.state === 'unavailable'
        ? currentStatus
        : sample.validated && !valid
          ? { state: 'invalid', targetId }
          : { state: 'ready', targetId };
    set({ samples, status: nextStatus });
  },
```

Update `resetPreviewState` to also clear the two new module-level maps, alongside its existing `workerRef = null; executeSpans.clear();`:

```ts
  resetPreviewState() {
    set({
      targets: [],
      selectedTargetId: undefined,
      selectedTarget: undefined,
      lastResolvedTarget: undefined,
      schemas: new Map(),
      samples: new Map(),
      status: { state: 'waiting' },
      executionResults: new Map(),
      hydrationRetriesRemaining: {}
    });
    workerRef = null;
    executeSpans.clear();
    pendingValidateRequests.clear();
    latestValidateRequestForTarget.clear();
  }
```

- [ ] **Step 5: Run the store tests to verify they pass**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/store/preview-store.test.ts`
Expected: PASS, 0 failures.

- [ ] **Step 6: Run type-check**

Run: `pnpm --filter @rune-langium/studio run type-check`
Expected: FAIL — `FormPreviewPanel.tsx` still calls the now-deleted `updateSample`. Step 8 below fixes this; this failure is expected and confirms the old call site is the only remaining reference.

- [ ] **Step 7: Route `instance:validateResult` to `usePreviewStore` in `CodegenProvider.tsx`**

Add the hooked selector near the other `usePreviewStore` selectors (after `const receiveExecutionError = usePreviewStore((s) => s.receiveExecutionError);`):

```ts
    const receiveValidateResult = usePreviewStore((s) => s.receiveValidateResult);
```

Change:

```ts
        if (isInstanceValidateResultMessage(msg)) {
          useInstanceStore.getState().receiveValidateResult(msg.requestId, msg.diagnostics);
          return;
        }
```

to:

```ts
        if (isInstanceValidateResultMessage(msg)) {
          useInstanceStore.getState().receiveValidateResult(msg.requestId, msg.diagnostics);
          receiveValidateResult(msg.requestId, msg.diagnostics);
          return;
        }
```

(Each store's own `pendingRequests`/`pendingValidateRequests` map ignores a requestId that isn't theirs, so both calls are safe unconditionally — no coordination logic needed.)

Add `receiveValidateResult` to the `useEffect`'s dependency array, alongside the existing `receiveExecutionResult, receiveExecutionError,`:

```ts
    ]);
```

becomes (inserting the new dependency in the same list):

```ts
      receiveExecutionResult,
      receiveExecutionError,
      receiveValidateResult,
      setHydrationRetriesRemaining,
```

- [ ] **Step 8: Wire the uncontrolled branch of `FormPreviewPanel.tsx`**

Change the store selector (near the top of the component, alongside `ensureSample`/`updateSample`/`resetSample`):

```ts
    const updateSample = usePreviewStore((s) => s.updateSample);
```

to:

```ts
    const updateSampleValues = usePreviewStore((s) => s.updateSampleValues);
    const dispatchValidate = usePreviewStore((s) => s.dispatchValidate);
```

Change `applyValidation`:

```ts
    const applyValidation = useCallback(
      (nextValues: Record<string, unknown>, validated: boolean) => {
        if (!schema) return;
        const result = validated
          ? validatePreviewSample(schema, nextValues)
          : { errors: {} as Record<string, string>, valid: true };
        if (isControlled) {
          setControlledMeta({ errors: result.errors, valid: result.valid, validated });
          onValuesChange?.(nextValues);
          return;
        }
        updateSample(schema.targetId, nextValues, result.errors, result.valid, validated);
      },
      [isControlled, onValuesChange, schema, updateSample]
    );
```

to (uncontrolled branch only — the `isControlled` branch's `validatePreviewSample`/`controlledMeta` call stays for now; Task 3 replaces it):

```ts
    const applyValidation = useCallback(
      (nextValues: Record<string, unknown>, validated: boolean) => {
        if (!schema) return;
        if (isControlled) {
          const result = validated
            ? validatePreviewSample(schema, nextValues)
            : { errors: {} as Record<string, string>, valid: true };
          setControlledMeta({ errors: result.errors, valid: result.valid, validated });
          onValuesChange?.(nextValues);
          return;
        }
        updateSampleValues(schema.targetId, nextValues, validated);
        if (validated) {
          dispatchValidate(schema.targetId, nextValues);
        }
      },
      [dispatchValidate, isControlled, onValuesChange, schema, updateSampleValues]
    );
```

This is an intermediate state — the uncontrolled path is now fully real-schema-backed; the controlled path still uses the old local `validatePreviewSample`/`controlledMeta` (unchanged from today), which Task 3 replaces.

- [ ] **Step 9: Run type-check and the full studio test suite**

Run: `pnpm --filter @rune-langium/studio run type-check && pnpm --filter @rune-langium/studio exec vitest run`
Expected: PASS. `preview-validator.ts`'s `validatePreviewSample` import stays in `FormPreviewPanel.tsx` for now (still used by the controlled branch) — no unused-import failure yet.

Manually verify the uncontrolled Form Preview panel still behaves correctly: start the dev server (`pnpm --filter @rune-langium/studio run dev`), load a workspace with a Data type that has a required field and at least one active condition, select it in the Preview perspective, edit a field, blur it, and confirm an inline error appears under the field for a missing required value, and that a condition violation surfaces with the expected message — both now sourced from the real worker round trip instead of the local validator.

- [ ] **Step 10: Commit**

```bash
git add apps/studio/src/store/preview-store.ts apps/studio/test/store/preview-store.test.ts apps/studio/src/shell/providers/CodegenProvider.tsx apps/studio/src/components/FormPreviewPanel.tsx
git commit -m "feat(studio): route the plain Form Preview panel's validation through the worker

Adds preview-store.ts's dispatchValidate/receiveValidateResult, mirroring
instance-store.ts's existing no-debounce/requestId-staleness-guard
pattern exactly. CodegenProvider now routes instance:validateResult to
both stores. The uncontrolled Form Preview panel's applyValidation drops
its local validatePreviewSample call in favor of this real worker round
trip; the controlled (Prototype Workspace) branch is unchanged in this
commit, landing in the next one."
```

---

### Task 3: Controlled mode wiring, `preview-validator.ts` deletion, full regression

**Files:**
- Modify: `apps/studio/src/components/FormPreviewPanel.tsx` (controlled branch)
- Modify: `apps/studio/test/components/FormPreviewPanel.test.tsx`
- Modify: `apps/studio/src/shell/panels/InstanceFormPanel.tsx`
- Modify: `apps/studio/src/services/preview-validator.ts` (delete 4 functions)
- Delete: `apps/studio/test/services/preview-validator.test.ts`

**Interfaces:**
- Consumes: `instance-store.ts`'s existing `validationErrors: Record<string, ValidationDiagnostic[]>` state (unchanged, already populated by the existing `updateInstanceData → dispatchValidate → instance:validate → receiveValidateResult` round trip — Task 1's `validateInstance` rewrite already makes these diagnostics real-schema-backed; no `instance-store.ts` changes needed).
- Produces: `FormPreviewPanelProps` gains optional `errors?: Record<string, string>`, `valid?: boolean`, `validated?: boolean`.

- [ ] **Step 1: Write the failing component-level test for the new controlled-mode props**

Add to `apps/studio/test/components/FormPreviewPanel.test.tsx`, in a new describe block (place it near the existing `describe('controlled mode (values/onValuesChange props)', ...)` block):

```ts
describe('controlled mode error display (errors/valid/validated props)', () => {
  it('shows an inline field error sourced from the errors prop, gated by validated', () => {
    const { rerender } = render(
      <FormPreviewPanel
        schema={validationTradeSchema}
        status={{ state: 'ready', targetId: validationTradeSchema.targetId }}
        values={{ tradeId: '', party: { name: '' }, aliases: [] }}
        errors={{ tradeId: 'Trade id is required' }}
        valid={false}
        validated={false}
      />
    );
    expect(screen.queryByText('Trade id is required')).not.toBeInTheDocument();

    rerender(
      <FormPreviewPanel
        schema={validationTradeSchema}
        status={{ state: 'ready', targetId: validationTradeSchema.targetId }}
        values={{ tradeId: '', party: { name: '' }, aliases: [] }}
        errors={{ tradeId: 'Trade id is required' }}
        valid={false}
        validated={true}
      />
    );
    expect(screen.getByText('Trade id is required')).toBeInTheDocument();
  });

  it('shows no errors when errors/valid/validated props are omitted (defaults)', () => {
    render(
      <FormPreviewPanel
        schema={validationTradeSchema}
        status={{ state: 'ready', targetId: validationTradeSchema.targetId }}
        values={{ tradeId: '', party: { name: '' }, aliases: [] }}
      />
    );
    expect(screen.queryByText(/is required/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/components/FormPreviewPanel.test.tsx -t "controlled mode error display"`
Expected: FAIL — `FormPreviewPanel` doesn't accept `errors`/`valid`/`validated` props yet; controlled mode still computes its own `controlledMeta` locally.

- [ ] **Step 3: Add the new props and delete `controlledMeta`**

Change `FormPreviewPanelProps`:

```ts
export interface FormPreviewPanelProps {
  schema?: FormPreviewSchema;
  status: PreviewStatus;
  target?: FormPreviewTarget;
  getFieldSource?: (fieldPath: string) => PreviewSourceMapEntry | undefined;
  onExecute?: (funcName: string, inputs: Record<string, unknown>) => void;
  values?: Record<string, unknown>;
  onValuesChange?: (values: Record<string, unknown>) => void;
}
```

to:

```ts
export interface FormPreviewPanelProps {
  schema?: FormPreviewSchema;
  status: PreviewStatus;
  target?: FormPreviewTarget;
  getFieldSource?: (fieldPath: string) => PreviewSourceMapEntry | undefined;
  onExecute?: (funcName: string, inputs: Record<string, unknown>) => void;
  values?: Record<string, unknown>;
  onValuesChange?: (values: Record<string, unknown>) => void;
  /** Controlled-mode only — sourced from the real worker-validated
   *  diagnostics (e.g. InstanceFormPanel reading instance-store.ts's
   *  validationErrors). Ignored in uncontrolled mode, which reads its own
   *  errors/valid/validated from usePreviewStore's samples map instead. */
  errors?: Record<string, string>;
  valid?: boolean;
  validated?: boolean;
}
```

Change the destructured props (function signature):

```ts
  function FormPreviewPanel({
    schema,
    status,
    target: _target,
    getFieldSource,
    onExecute,
    values,
    onValuesChange
  }: FormPreviewPanelProps): ReactElement {
```

to:

```ts
  function FormPreviewPanel({
    schema,
    status,
    target: _target,
    getFieldSource,
    onExecute,
    values,
    onValuesChange,
    errors: controlledErrors,
    valid: controlledValid,
    validated: controlledValidated
  }: FormPreviewPanelProps): ReactElement {
```

Delete the `controlledMeta` state declaration:

```ts
    const [controlledMeta, setControlledMeta] = useState<{
      errors: Record<string, string>;
      valid: boolean;
      validated: boolean;
    }>({ errors: {}, valid: true, validated: false });
```

Change the `activeSample` `useMemo`'s controlled branch:

```ts
    const activeSample = useMemo<PreviewSampleState | undefined>(() => {
      if (!schema) return undefined;
      if (isControlled) {
        return {
          targetId: schema.targetId,
          values: values ?? defaultValues,
          serialized: JSON.stringify(values ?? defaultValues, null, 2),
          errors: controlledMeta.errors,
          valid: controlledMeta.valid,
          validated: controlledMeta.validated,
          updatedAt: 0
        };
      }
      return (
        sample ?? {
          targetId: schema.targetId,
          values: defaultValues,
          serialized: JSON.stringify(defaultValues, null, 2),
          errors: {},
          valid: true,
          validated: false,
          updatedAt: 0
        }
      );
    }, [controlledMeta, defaultValues, isControlled, sample, schema, values]);
```

to:

```ts
    const activeSample = useMemo<PreviewSampleState | undefined>(() => {
      if (!schema) return undefined;
      if (isControlled) {
        return {
          targetId: schema.targetId,
          values: values ?? defaultValues,
          serialized: JSON.stringify(values ?? defaultValues, null, 2),
          errors: controlledErrors ?? {},
          valid: controlledValid ?? true,
          validated: controlledValidated ?? false,
          updatedAt: 0
        };
      }
      return (
        sample ?? {
          targetId: schema.targetId,
          values: defaultValues,
          serialized: JSON.stringify(defaultValues, null, 2),
          errors: {},
          valid: true,
          validated: false,
          updatedAt: 0
        }
      );
    }, [controlledErrors, controlledValid, controlledValidated, defaultValues, isControlled, sample, schema, values]);
```

Change `applyValidation` (from Task 2's intermediate state):

```ts
    const applyValidation = useCallback(
      (nextValues: Record<string, unknown>, validated: boolean) => {
        if (!schema) return;
        if (isControlled) {
          const result = validated
            ? validatePreviewSample(schema, nextValues)
            : { errors: {} as Record<string, string>, valid: true };
          setControlledMeta({ errors: result.errors, valid: result.valid, validated });
          onValuesChange?.(nextValues);
          return;
        }
        updateSampleValues(schema.targetId, nextValues, validated);
        if (validated) {
          dispatchValidate(schema.targetId, nextValues);
        }
      },
      [dispatchValidate, isControlled, onValuesChange, schema, updateSampleValues]
    );
```

to:

```ts
    const applyValidation = useCallback(
      (nextValues: Record<string, unknown>, validated: boolean) => {
        if (!schema) return;
        if (isControlled) {
          // Structural + condition validation already round-trips through
          // the worker via the caller's own onValuesChange handler (e.g.
          // InstanceFormPanel's updateInstanceData → dispatchValidate) —
          // this component only forwards the edit. `validated` is not used
          // here; the errors/valid/validated PROPS (sourced from that real
          // round trip) drive activeSample above instead of a locally
          // computed approximation.
          onValuesChange?.(nextValues);
          return;
        }
        updateSampleValues(schema.targetId, nextValues, validated);
        if (validated) {
          dispatchValidate(schema.targetId, nextValues);
        }
      },
      [dispatchValidate, isControlled, onValuesChange, schema, updateSampleValues]
    );
```

Remove the now-unused `validatePreviewSample` import:

```ts
import {
  buildArmValue,
  buildDefaultObjectValue,
  buildDefaultValue,
  buildDefaultValues,
  resolveArmPaths,
  splitChoiceArmFields,
  validatePreviewSample
} from '../services/preview-validator.js';
```

becomes:

```ts
import {
  buildArmValue,
  buildDefaultObjectValue,
  buildDefaultValue,
  buildDefaultValues,
  resolveArmPaths,
  splitChoiceArmFields
} from '../services/preview-validator.js';
```

- [ ] **Step 4: Run the new test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/components/FormPreviewPanel.test.tsx -t "controlled mode error display"`
Expected: PASS, 2/2.

- [ ] **Step 5: Run the full `FormPreviewPanel.test.tsx` file**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/components/FormPreviewPanel.test.tsx`
Expected: PASS. The existing `describe('controlled mode (values/onValuesChange props)', ...)` tests never pass `errors`/`valid`/`validated`, so `activeSample` now defaults to `{ errors: {}, valid: true, validated: false }` for them — identical to what `controlledMeta`'s initial state produced, so their `onValuesChange` payload-shape assertions are unaffected.

- [ ] **Step 6: Wire `InstanceFormPanel.tsx` to pass the new props**

Change:

```ts
export const InstanceFormPanel = withInstrumentation(
  function InstanceFormPanel({ instanceId }: InstanceFormPanelProps): ReactElement {
    const record = useInstanceStore((s) => s.instances[instanceId]);
    const schema = useInstanceStore((s) => (record ? s.schemas.get(record.typeFqn) : undefined));
    const schemaError = useInstanceStore((s) => (record ? s.schemaErrors.get(record.typeFqn) : undefined));
    const updateInstanceData = useInstanceStore((s) => s.updateInstanceData);

    useEffect(() => {
      if (!record) return;
      useInstanceStore.getState().dispatchGenerateSchema(record.typeFqn);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [record?.typeFqn]);

    if (!record) {
      return (
        <section role="status" className="p-3 text-sm text-muted-foreground">
          Instance not found.
        </section>
      );
    }

    const status: PreviewStatus = schema
      ? { state: 'ready', targetId: record.typeFqn }
      : schemaError
        ? { state: 'unavailable', targetId: record.typeFqn, reason: schemaError.reason, message: schemaError.message }
        : { state: 'waiting', targetId: record.typeFqn };

    return (
      <FormPreviewPanel
        schema={schema}
        status={status}
        values={record.data as Record<string, unknown>}
        onValuesChange={(values) => updateInstanceData(instanceId, values)}
      />
    );
  },
  { op: 'InstanceFormPanel' }
);
```

to:

```ts
export const InstanceFormPanel = withInstrumentation(
  function InstanceFormPanel({ instanceId }: InstanceFormPanelProps): ReactElement {
    const record = useInstanceStore((s) => s.instances[instanceId]);
    const schema = useInstanceStore((s) => (record ? s.schemas.get(record.typeFqn) : undefined));
    const schemaError = useInstanceStore((s) => (record ? s.schemaErrors.get(record.typeFqn) : undefined));
    const updateInstanceData = useInstanceStore((s) => s.updateInstanceData);
    const rawDiagnostics = useInstanceStore((s) => s.validationErrors[instanceId]);

    useEffect(() => {
      if (!record) return;
      useInstanceStore.getState().dispatchGenerateSchema(record.typeFqn);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [record?.typeFqn]);

    if (!record) {
      return (
        <section role="status" className="p-3 text-sm text-muted-foreground">
          Instance not found.
        </section>
      );
    }

    const status: PreviewStatus = schema
      ? { state: 'ready', targetId: record.typeFqn }
      : schemaError
        ? { state: 'unavailable', targetId: record.typeFqn, reason: schemaError.reason, message: schemaError.message }
        : { state: 'waiting', targetId: record.typeFqn };

    // `undefined` means no instance:validateResult has arrived yet for this
    // instance (e.g. it was just created and the round trip is still in
    // flight) — treat as "nothing to show yet", matching the uncontrolled
    // panel's own pre-first-validation convention, rather than surfacing a
    // stale/empty result as either "all valid" or "all invalid".
    const { errors, valid, validated } = rawDiagnostics
      ? {
          errors: Object.fromEntries(rawDiagnostics.map((d) => [d.path, d.message])),
          valid: rawDiagnostics.length === 0,
          validated: true
        }
      : { errors: {}, valid: true, validated: false };

    return (
      <FormPreviewPanel
        schema={schema}
        status={status}
        values={record.data as Record<string, unknown>}
        onValuesChange={(values) => updateInstanceData(instanceId, values)}
        errors={errors}
        valid={valid}
        validated={validated}
      />
    );
  },
  { op: 'InstanceFormPanel' }
);
```

- [ ] **Step 7: Run type-check**

Run: `pnpm --filter @rune-langium/studio run type-check`
Expected: PASS.

- [ ] **Step 8: Delete `preview-validator.ts`'s structural validator functions**

In `apps/studio/src/services/preview-validator.ts`, delete `buildFieldValidator`, `buildSchemaValidator`, `validatePreviewSample`, and `formatIssuePath` (the last four exports in the file, in that order). Keep `fieldRootKey`, `fieldLeafKey`, `resolveArmPaths`, `splitChoiceArmFields`, `buildDefaultValue`, `buildDefaultObjectValue`, `buildArmValue`, `buildDefaultFieldsObject`, `buildDefaultValues`, and the `import { z } from 'zod';`/`import type { FormPreviewSchema, PreviewField } from '@rune-langium/codegen/export';` imports — check whether `FormPreviewSchema` and `z` are still referenced by the retained code after deletion (`resolveArmPaths` uses `FormPreviewSchema['kind']`; `z` was ONLY used by the four deleted functions) — remove the now-unused `import { z } from 'zod';` line, but keep the `FormPreviewSchema`/`PreviewField` type import.

- [ ] **Step 9: Delete the obsolete test file**

```bash
git rm apps/studio/test/services/preview-validator.test.ts
```

Every describe block in this file (`validatePreviewSample — array cardinality vs. field.required`, `— optional number field blank handling`, `— unknown/extra fields`, `— Data-extends-Choice inherited fields`, `— Data-extends-Choice exactly-one-arm enforcement`, `— nested object Choice-arm enforcement`, `— Choice "exactly one option present"`, `— Choice selected-arm payload must be genuinely non-empty`) covers ONLY the four just-deleted functions — none of the retained default-value helpers have dedicated unit tests in this file (they're exercised indirectly through `preview-store.test.ts`/`FormPreviewPanel.test.tsx`), so there is no partial-deletion split to make.

- [ ] **Step 10: Run the full `apps/studio` suite and type-check**

Run: `pnpm --filter @rune-langium/studio run type-check && pnpm --filter @rune-langium/studio exec vitest run`
Expected: PASS, 0 failures, per this repo's standing "run the whole package suite" practice — this catches any other caller of the deleted exports this plan's file list didn't anticipate.

- [ ] **Step 11: Manual verification — Prototype Workspace**

Start the dev server (`pnpm --filter @rune-langium/studio run dev`), open Prototype Workspace, create an instance of a Data type with a required field and at least one active condition, and confirm:
- Leaving the required field blank shows an inline error under that field in the instance edit form (not just in the separate Inspector panel).
- The `InstanceInspectorPanel`'s diagnostics list still shows the same underlying issues (unchanged — it was already reading the real worker round trip).
- Fixing the field clears the inline error.

- [ ] **Step 12: Commit**

```bash
git add apps/studio/src/components/FormPreviewPanel.tsx apps/studio/test/components/FormPreviewPanel.test.tsx apps/studio/src/shell/panels/InstanceFormPanel.tsx apps/studio/src/services/preview-validator.ts
git rm apps/studio/test/services/preview-validator.test.ts
git commit -m "feat(studio): retire preview-validator.ts's hand-rolled structural validator

Controlled mode (Prototype Workspace's instance editor) now reads its
inline field errors from instance-store.ts's real worker-validated
diagnostics (via new errors/valid/validated props on FormPreviewPanel,
populated by InstanceFormPanel) instead of a redundant local
validatePreviewSample call. Deletes buildFieldValidator/
buildSchemaValidator/validatePreviewSample/formatIssuePath — the
hand-rolled Zod approximation CLAUDE.md documents as the incident that
established this repo's 'never build a parallel implementation' rule.
Both consumers of structural validation now go through the one real
generated Zod schema, compiled in codegen-worker.ts (previous commits
in this branch)."
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers the design's "Worker-side compilation" + "TS erasure" + "Result caching" sections. Task 2 covers "Routing both consumers through one path"'s uncontrolled half + the "Data flow" diagram. Task 3 covers the controlled half (including the resolved controlled-mode error-display gap) + "Files touched"'s `preview-validator.ts`/test-file deletions. "Error handling" section's three cases (unresolvable target, closure error/compile-error, warning-severity diagnostics) are covered by Task 1 Step 6's tests (`'reports "Structural validation unavailable"...'` × 2) and the passthrough of warning diagnostics (never blocking — `compileStandaloneValidator` only refuses to build on `severity: 'error'`, matching the design exactly).
- **Type consistency:** `StandaloneValidatorResult`, `compileStandaloneValidator`, `standaloneValidatorCache` (Task 1) are internal to `codegen-worker.ts` and not referenced by Task 2/3's signatures. `updateSampleValues`/`dispatchValidate`/`receiveValidateResult` (Task 2) match exactly between the `PreviewStoreActions` interface, the implementation, and every test call site across Tasks 2 and 3. `errors`/`valid`/`validated` props (Task 3) match exactly between `FormPreviewPanelProps`, the destructuring, and `InstanceFormPanel.tsx`'s passed values.
- **No placeholders:** every step above shows the actual before/after code, not a description of it.
