// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const buildMock = vi.fn(async () => undefined);
const fromStringMock = vi.fn((content: string, uri: string) => ({
  uri,
  content,
  diagnostics: [],
  parseResult: { value: { uri, content }, lexerErrors: [], parserErrors: [] }
}));
const generateMock = vi.fn(() => []);
const generatePreviewSchemasMock = vi.fn(() => []);
// 019 Task #88 follow-up — curated entries hit `RuneDsl.serializer.JsonSerializer.deserialize`
// in `buildDocuments`. Mock returns a marker object that the assertions
// can identify in the deserialized-docs array.
const deserializeMock = vi.fn((json: string) => ({
  __deserialized: true,
  json
}));
// PR #169 follow-up — curated entries are wrapped via
// `factory.fromModel(model, uri)` and registered through
// `langiumDocuments.addDocument(doc)` so Langium's linker can resolve
// cross-references through `.ref`. Mock both methods and a backing
// `getDocument` lookup so the worker's idempotence check works.
const fromModelMock = vi.fn((model: unknown, uri: string) => ({
  uri,
  parseResult: { value: model, lexerErrors: [], parserErrors: [] }
}));
const documentRegistry = new Map<string, unknown>();
const getDocumentMock = vi.fn((uri: string) => documentRegistry.get(uri));
const addDocumentMock = vi.fn((doc: { uri: string }) => {
  documentRegistry.set(doc.uri, doc);
});

vi.mock('@rune-langium/core', () => ({
  createRuneDslServices: () => ({
    RuneDsl: {
      shared: {
        workspace: {
          LangiumDocumentFactory: { fromString: fromStringMock, fromModel: fromModelMock },
          DocumentBuilder: { build: buildMock },
          LangiumDocuments: { getDocument: getDocumentMock, addDocument: addDocumentMock }
        }
      },
      serializer: {
        JsonSerializer: { deserialize: deserializeMock }
      }
    }
  }),
  hydrateModelDocument: (_services: unknown, uri: string, json: string, { register }: { register: string }) => {
    const model = deserializeMock(json);
    const existing = register === 'idempotent' ? getDocumentMock(uri) : undefined;
    if (existing) {
      return { model, document: existing };
    }
    const document = fromModelMock(model, uri);
    if (register === 'always' || register === 'idempotent') {
      addDocumentMock(document);
    }
    return { model, document };
  }
}));

vi.mock('@rune-langium/codegen/export', () => ({
  generate: generateMock,
  generatePreviewSchemas: generatePreviewSchemasMock,
  RUNTIME_HELPER_JS_SOURCE: ''
}));

const getActiveConditionPredicatesMock = vi.fn(() => []);
const findDataNodeMock = vi.fn(() => undefined);

vi.mock('@rune-langium/codegen/instances', () => ({
  getActiveConditionPredicates: getActiveConditionPredicatesMock,
  findDataNode: findDataNodeMock
}));

vi.mock('langium', () => ({
  URI: {
    parse: (value: string) => value
  }
}));

async function loadWorkerModule() {
  vi.resetModules();
  let messageHandler: ((event: MessageEvent<unknown>) => void) | undefined;
  const scope = {
    addEventListener: vi.fn((type: string, listener: (event: MessageEvent<unknown>) => void) => {
      if (type === 'message') {
        messageHandler = listener;
      }
    }),
    postMessage: vi.fn(),
    // Required by `isWorkerGlobalScope` in src/workers/runtime-guards.ts —
    // its fallback branch checks `typeof self.importScripts === 'function'`
    // when the env doesn't expose a `WorkerGlobalScope` constructor (as
    // jsdom/node don't). Without this the listener registration is skipped
    // and every dispatch below would throw "Worker message handler was not
    // registered".
    importScripts: () => {
      /* no-op */
    }
  };

  vi.stubGlobal('self', scope);
  await import('../../src/workers/codegen-worker.ts');

  return {
    scope,
    dispatch(data: unknown) {
      if (!messageHandler) {
        throw new Error('Worker message handler was not registered');
      }
      messageHandler({ data } as MessageEvent<unknown>);
    }
  };
}

async function flushWorker() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('codegen-worker preview messages', () => {
  beforeEach(() => {
    buildMock.mockReset();
    buildMock.mockImplementation(async () => undefined);
    fromStringMock.mockClear();
    generateMock.mockClear();
    generatePreviewSchemasMock.mockReset();
    deserializeMock.mockClear();
    deserializeMock.mockImplementation((json: string) => ({ __deserialized: true, json }));
    fromModelMock.mockClear();
    fromModelMock.mockImplementation((model: unknown, uri: string) => ({
      uri,
      parseResult: { value: model, lexerErrors: [], parserErrors: [] }
    }));
    documentRegistry.clear();
    getDocumentMock.mockClear();
    addDocumentMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts preview:stale with no-files when preview generation is requested before files are loaded', async () => {
    const { scope, dispatch } = await loadWorkerModule();

    dispatch({
      type: 'preview:generate',
      targetId: 'beta.Trade',
      requestId: 'preview:beta.Trade:1'
    });
    await flushWorker();

    expect(scope.postMessage).toHaveBeenCalledWith({
      type: 'preview:stale',
      targetId: 'beta.Trade',
      requestId: 'preview:beta.Trade:1',
      reason: 'no-files',
      message: 'No files are loaded for form preview.'
    });
  });

  it('re-runs the last preview target after preview:setFiles and posts preview:result', async () => {
    generatePreviewSchemasMock.mockReturnValue([
      {
        schemaVersion: 1,
        targetId: 'beta.Trade',
        title: 'Trade',
        status: 'ready',
        fields: []
      }
    ]);

    const { scope, dispatch } = await loadWorkerModule();

    dispatch({
      type: 'preview:generate',
      targetId: 'beta.Trade',
      requestId: 'preview:beta.Trade:2'
    });
    await flushWorker();

    dispatch({
      type: 'preview:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace "beta"' }],
      requestId: 'preview:beta.Trade:3'
    });
    await flushWorker();

    expect(fromStringMock).toHaveBeenCalledWith('namespace "beta"', 'file:///trade.rosetta');
    expect(generatePreviewSchemasMock).toHaveBeenCalledWith(expect.any(Array), {
      targetId: 'beta.Trade'
    });
    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: 'preview:result',
      targetId: 'beta.Trade',
      requestId: 'preview:beta.Trade:3',
      schema: {
        schemaVersion: 1,
        targetId: 'beta.Trade',
        title: 'Trade',
        status: 'ready',
        fields: []
      }
    });
  });

  it('posts preview:stale with unsupported-target when no preview schema is available', async () => {
    generatePreviewSchemasMock.mockReturnValue([]);

    const { scope, dispatch } = await loadWorkerModule();

    dispatch({
      type: 'preview:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace "beta"' }],
      requestId: 'preview:beta.Trade:4'
    });
    await flushWorker();

    dispatch({
      type: 'preview:generate',
      targetId: 'beta.Trade',
      requestId: 'preview:beta.Trade:5'
    });
    await flushWorker();

    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: 'preview:stale',
      targetId: 'beta.Trade',
      requestId: 'preview:beta.Trade:5',
      reason: 'unsupported-target',
      message: 'No form preview schema is available for beta.Trade.'
    });
  });

  it('posts preview:stale with parse-error when preview files fail validation', async () => {
    buildMock.mockImplementation(async (documents: Array<{ diagnostics: Array<{ severity: number }> }>) => {
      documents[0]!.diagnostics = [{ severity: 1 }];
    });

    const { scope, dispatch } = await loadWorkerModule();

    dispatch({
      type: 'preview:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace "beta"' }],
      requestId: 'preview:beta.Trade:6'
    });
    await flushWorker();

    dispatch({
      type: 'preview:generate',
      targetId: 'beta.Trade',
      requestId: 'preview:beta.Trade:7'
    });
    await flushWorker();

    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: 'preview:stale',
      targetId: 'beta.Trade',
      requestId: 'preview:beta.Trade:7',
      reason: 'parse-error',
      message: 'No valid files to generate a form preview from.'
    });
  });

  it('posts preview:stale with parse-error when preview files contain parser errors', async () => {
    buildMock.mockImplementation(
      async (documents: Array<{ parseResult: { parserErrors: Array<{ message: string }> } }>) => {
        documents[0]!.parseResult.parserErrors = [{ message: 'Unexpected token' }];
      }
    );

    const { scope, dispatch } = await loadWorkerModule();

    dispatch({
      type: 'preview:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'broken syntax' }],
      requestId: 'preview:beta.Trade:parser-error'
    });
    await flushWorker();

    dispatch({
      type: 'preview:generate',
      targetId: 'beta.Trade',
      requestId: 'preview:beta.Trade:parser-error:generate'
    });
    await flushWorker();

    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: 'preview:stale',
      targetId: 'beta.Trade',
      requestId: 'preview:beta.Trade:parser-error:generate',
      reason: 'parse-error',
      message: 'No valid files to generate a form preview from.'
    });
  });

  it('posts preview:stale with generation-error when preview schema generation throws', async () => {
    generatePreviewSchemasMock.mockImplementation(() => {
      throw new Error('Preview schema generation failed.');
    });

    const { scope, dispatch } = await loadWorkerModule();

    dispatch({
      type: 'preview:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace "beta"' }],
      requestId: 'preview:beta.Trade:8'
    });
    await flushWorker();

    dispatch({
      type: 'preview:generate',
      targetId: 'beta.Trade',
      requestId: 'preview:beta.Trade:9'
    });
    await flushWorker();

    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: 'preview:stale',
      targetId: 'beta.Trade',
      requestId: 'preview:beta.Trade:9',
      reason: 'generation-error',
      message: 'Preview schema generation failed.'
    });
  });

  it('does not rerun preview:setFiles when no consumable preview request id exists', async () => {
    const { scope, dispatch } = await loadWorkerModule();

    dispatch({
      type: 'preview:generate',
      targetId: 'beta.Trade'
    } as never);
    await flushWorker();

    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: 'preview:stale',
      targetId: 'beta.Trade',
      requestId: undefined,
      reason: 'no-files',
      message: 'No files are loaded for form preview.'
    });

    scope.postMessage.mockClear();
    generatePreviewSchemasMock.mockClear();

    dispatch({
      type: 'preview:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace "beta"' }]
    });
    await flushWorker();

    expect(generatePreviewSchemasMock).not.toHaveBeenCalled();
    expect(scope.postMessage).not.toHaveBeenCalled();
  });

  it("instance:generateSchema posts instance:generateSchemaResult and does NOT corrupt the Preview perspective's own re-run target (finding #6/#7)", async () => {
    generatePreviewSchemasMock.mockImplementation((_docs: unknown, opts: { targetId: string }) => {
      if (opts.targetId === 'beta.Trade') {
        return [{ schemaVersion: 1, targetId: 'beta.Trade', title: 'Trade', status: 'ready', fields: [] }];
      }
      if (opts.targetId === 'instance.Party') {
        return [{ schemaVersion: 1, targetId: 'instance.Party', title: 'Party', status: 'ready', fields: [] }];
      }
      return [];
    });

    const { scope, dispatch } = await loadWorkerModule();

    // Files are loaded and the Preview perspective selects `beta.Trade`.
    dispatch({
      type: 'preview:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace "beta"' }],
      requestId: 'preview:beta.Trade:1'
    });
    await flushWorker();
    dispatch({
      type: 'preview:generate',
      targetId: 'beta.Trade',
      requestId: 'preview:beta.Trade:2'
    });
    await flushWorker();

    // Instance-editing requests a schema for an UNRELATED type on its own
    // channel — this must not touch the worker's preview re-run target.
    dispatch({
      type: 'instance:generateSchema',
      typeFqn: 'instance.Party',
      requestId: 'schema:instance.Party:1'
    });
    await flushWorker();

    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: 'instance:generateSchemaResult',
      requestId: 'schema:instance.Party:1',
      schema: { schemaVersion: 1, targetId: 'instance.Party', title: 'Party', status: 'ready', fields: [] }
    });

    // A subsequent workspace file change re-runs the Preview perspective's
    // LAST target — must still be `beta.Trade`, not `instance.Party`.
    dispatch({
      type: 'preview:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace "beta" // edited' }],
      requestId: 'preview:beta.Trade:3'
    });
    await flushWorker();

    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: 'preview:result',
      targetId: 'beta.Trade',
      requestId: 'preview:beta.Trade:3',
      schema: { schemaVersion: 1, targetId: 'beta.Trade', title: 'Trade', status: 'ready', fields: [] }
    });
  });

  it('instance:generateSchema posts instance:generateSchemaStale with unsupported-target when no schema is available', async () => {
    generatePreviewSchemasMock.mockReturnValue([]);

    const { scope, dispatch } = await loadWorkerModule();

    dispatch({
      type: 'preview:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace "beta"' }],
      requestId: 'preview:beta.Trade:1'
    });
    await flushWorker();

    dispatch({
      type: 'instance:generateSchema',
      typeFqn: 'instance.Unknown',
      requestId: 'schema:instance.Unknown:1'
    });
    await flushWorker();

    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: 'instance:generateSchemaStale',
      requestId: 'schema:instance.Unknown:1',
      reason: 'unsupported-target',
      message: 'No form preview schema is available for instance.Unknown.'
    });
  });

  it('instance:generateSchema posts instance:generateSchemaStale with no-files before any files are loaded', async () => {
    const { scope, dispatch } = await loadWorkerModule();

    dispatch({
      type: 'instance:generateSchema',
      typeFqn: 'instance.Party',
      requestId: 'schema:instance.Party:1'
    });
    await flushWorker();

    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: 'instance:generateSchemaStale',
      requestId: 'schema:instance.Party:1',
      reason: 'no-files',
      message: 'No files are loaded for form preview.'
    });
  });
});

describe('codegen-worker execute messages', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts preview:execute-error when function is not in cache', async () => {
    const { scope, dispatch } = await loadWorkerModule();

    dispatch({
      type: 'preview:execute',
      funcName: 'beta.Trade',
      inputs: { symbol: 'AAPL', quantity: 10 },
      requestId: 'exec:beta.Trade:1'
    });

    await vi.waitFor(() => {
      expect(scope.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'preview:execute-error',
          requestId: 'exec:beta.Trade:1',
          funcName: 'beta.Trade'
        })
      );
    });
  });

  // Regression mirror of parser-worker.test.ts (PR #214). If anything in the
  // main bundle ever statically imports from `codegen-worker.ts` (e.g. for
  // type re-exports), the bottom-of-module listener must NOT register on
  // `window` / main-thread `self`. PR #214's body explicitly flagged this
  // worker as carrying the same anti-pattern; the shared
  // `isWorkerGlobalScope` helper from `src/workers/runtime-guards.ts`
  // closes the gap.
  it('does not register a message listener when imported in a non-worker context', async () => {
    const addListener = vi.fn();
    const postMessage = vi.fn();
    // Simulate browser-main-thread `self`: has postMessage, NOT a WorkerGlobalScope
    // and NO `importScripts`.
    vi.stubGlobal('self', {
      addEventListener: addListener,
      postMessage
    });

    vi.resetModules();
    await import('../../src/workers/codegen-worker.ts');

    const messageListenerCalls = addListener.mock.calls.filter((args) => args[0] === 'message');
    expect(messageListenerCalls).toEqual([]);
  });

  it('error message indicates function not found', async () => {
    const { scope, dispatch } = await loadWorkerModule();

    dispatch({
      type: 'preview:execute',
      funcName: 'alpha.Foo',
      inputs: {},
      requestId: 'exec:alpha.Foo:1'
    });

    await vi.waitFor(() => {
      expect(scope.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'preview:execute-error',
          funcName: 'alpha.Foo',
          error: expect.stringContaining('not found')
        })
      );
    });
  });
});

describe('codegen-worker code preview messages', () => {
  beforeEach(() => {
    buildMock.mockReset();
    buildMock.mockImplementation(async () => undefined);
    fromStringMock.mockClear();
    generateMock.mockReset();
    generatePreviewSchemasMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts codegen:result for the requested target after files are loaded', async () => {
    generateMock.mockReturnValue([
      {
        relativePath: 'trade.zod.ts',
        content: 'export const Trade = z.object({});',
        sourceMap: []
      }
    ]);

    const { scope, dispatch } = await loadWorkerModule();

    dispatch({
      type: 'codegen:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace demo' }]
    });
    await flushWorker();

    dispatch({
      type: 'codegen:generate',
      target: 'zod',
      requestId: 'codegen:zod:1'
    });
    await flushWorker();

    expect(generateMock).toHaveBeenCalledWith(expect.any(Array), { target: 'zod' });
    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: 'codegen:result',
      target: 'zod',
      requestId: 'codegen:zod:1',
      files: [
        {
          relativePath: 'trade.zod.ts',
          content: 'export const Trade = z.object({});',
          sourceMap: []
        }
      ]
    });
  });

  it('uses the latest codegen file-sync request id for regenerated output', async () => {
    generateMock.mockReturnValue([
      {
        relativePath: 'trade.zod.ts',
        content: 'export const Trade = z.object({});',
        sourceMap: []
      }
    ]);

    const { scope, dispatch } = await loadWorkerModule();

    dispatch({
      type: 'codegen:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace demo' }]
    });
    await flushWorker();

    dispatch({
      type: 'codegen:generate',
      target: 'zod',
      requestId: 'codegen:zod:7'
    });
    await flushWorker();

    dispatch({
      type: 'codegen:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace demo\n\ntype Trade:' }],
      requestId: 'codegen:zod:8'
    });
    await flushWorker();

    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: 'codegen:result',
      target: 'zod',
      requestId: 'codegen:zod:8',
      files: [
        {
          relativePath: 'trade.zod.ts',
          content: 'export const Trade = z.object({});',
          sourceMap: []
        }
      ]
    });
  });

  it('posts codegen:outdated when code preview files contain lexer or parser errors', async () => {
    buildMock.mockImplementation(
      async (
        documents: Array<{
          parseResult: {
            lexerErrors: Array<{ message: string }>;
            parserErrors: Array<{ message: string }>;
          };
        }>
      ) => {
        documents[0]!.parseResult.lexerErrors = [{ message: 'Bad token' }];
      }
    );

    const { scope, dispatch } = await loadWorkerModule();

    dispatch({
      type: 'codegen:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'broken syntax' }]
    });
    await flushWorker();

    dispatch({
      type: 'codegen:generate',
      target: 'zod',
      requestId: 'codegen:zod:syntax-error'
    });
    await flushWorker();

    expect(generateMock).not.toHaveBeenCalled();
    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: 'codegen:outdated',
      target: 'zod',
      requestId: 'codegen:zod:syntax-error',
      message: 'Fix model errors to refresh the code preview.'
    });
  });

  // 019 Task #88 follow-up — preview was broken for curated workspaces
  // because `buildDocuments` parsed empty `content` strings and filtered
  // the resulting parse-error docs out. Now entries with
  // `serializedModelJson` set take the deserialize path and reach the
  // preview generator.
  it('deserializes curated entries via JsonSerializer and forwards them to the preview generator', async () => {
    generatePreviewSchemasMock.mockReturnValue([
      {
        schemaVersion: 1,
        targetId: 'cdm.base.math.Quantity',
        title: 'Quantity',
        status: 'ready',
        fields: []
      }
    ]);

    const { scope, dispatch } = await loadWorkerModule();

    dispatch({
      type: 'preview:setFiles',
      files: [
        // Curated entry — content empty, serializedModelJson set.
        {
          uri: 'file:///cdm/base/math.rosetta',
          content: '',
          serializedModelJson: '{"$type":"RosettaModel","name":"cdm.base.math"}'
        }
      ],
      requestId: 'preview:curated:1'
    });
    await flushWorker();

    dispatch({
      type: 'preview:generate',
      targetId: 'cdm.base.math.Quantity',
      requestId: 'preview:curated:2'
    });
    await flushWorker();

    // The deserializer was called with the curated JSON; the parser was
    // NOT called for this entry (it would have hit `fromString` with an
    // empty content otherwise).
    expect(deserializeMock).toHaveBeenCalledWith('{"$type":"RosettaModel","name":"cdm.base.math"}');
    expect(fromStringMock).not.toHaveBeenCalledWith('', 'file:///cdm/base/math.rosetta');

    // The deserialized doc reached the preview generator.
    const previewCall = generatePreviewSchemasMock.mock.calls.at(-1);
    expect(previewCall).toBeDefined();
    const [forwardedDocs] = previewCall!;
    expect(forwardedDocs).toHaveLength(1);
    expect((forwardedDocs as Array<{ parseResult: { value: unknown } }>)[0]!.parseResult.value).toMatchObject({
      __deserialized: true
    });

    // Preview result posted back.
    expect(scope.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'preview:result', targetId: 'cdm.base.math.Quantity' })
    );
  });

  it('mixes curated and user entries in a single preview build', async () => {
    generatePreviewSchemasMock.mockReturnValue([
      { schemaVersion: 1, targetId: 'user.Trade', title: 'Trade', status: 'ready', fields: [] }
    ]);

    const { dispatch } = await loadWorkerModule();

    dispatch({
      type: 'preview:setFiles',
      files: [
        { uri: 'file:///user.rosetta', content: 'namespace user' },
        {
          uri: 'file:///cdm/base/math.rosetta',
          content: '',
          serializedModelJson: '{"$type":"RosettaModel","name":"cdm.base.math"}'
        }
      ],
      requestId: 'preview:mixed:1'
    });
    await flushWorker();

    dispatch({
      type: 'preview:generate',
      targetId: 'user.Trade',
      requestId: 'preview:mixed:2'
    });
    await flushWorker();

    expect(fromStringMock).toHaveBeenCalledWith('namespace user', 'file:///user.rosetta');
    // The deserializer was called for the curated entry. Each
    // `preview:setFiles` + `preview:generate` pair re-runs preview, so
    // the count is ≥ 1 — what matters is the curated JSON was processed
    // and the user file was NOT deserialized.
    expect(deserializeMock).toHaveBeenCalledWith('{"$type":"RosettaModel","name":"cdm.base.math"}');
    expect(deserializeMock).not.toHaveBeenCalledWith('namespace user');
    const previewCall = generatePreviewSchemasMock.mock.calls.at(-1);
    const [forwardedDocs] = previewCall!;
    // Both docs reach the generator: 1 parsed user doc + 1 deserialized curated doc.
    expect(forwardedDocs).toHaveLength(2);
  });

  it('ignores list-only curated refOnly entries without serializedModelJson during preview builds', async () => {
    generatePreviewSchemasMock.mockReturnValue([
      { schemaVersion: 1, targetId: 'user.Trade', title: 'Trade', status: 'ready', fields: [] }
    ]);

    const { dispatch } = await loadWorkerModule();

    dispatch({
      type: 'preview:setFiles',
      files: [
        { uri: 'file:///user.rosetta', content: 'namespace user' },
        { uri: 'file:///cdm/cdm.base.math', content: '' },
        {
          uri: 'file:///cdm/base/math.rosetta',
          content: '',
          serializedModelJson: '{"$type":"RosettaModel","name":"cdm.base.math"}'
        }
      ],
      requestId: 'preview:list-only:1'
    });
    await flushWorker();

    dispatch({
      type: 'preview:generate',
      targetId: 'user.Trade',
      requestId: 'preview:list-only:2'
    });
    await flushWorker();

    expect(fromStringMock).toHaveBeenCalledWith('namespace user', 'file:///user.rosetta');
    expect(fromStringMock).not.toHaveBeenCalledWith('', 'file:///cdm/cdm.base.math');
    expect(deserializeMock).toHaveBeenCalledWith('{"$type":"RosettaModel","name":"cdm.base.math"}');

    const previewCall = generatePreviewSchemasMock.mock.calls.at(-1);
    const [forwardedDocs] = previewCall!;
    expect(forwardedDocs).toHaveLength(2);
  });
});

describe('codegen-worker instance:validate messages', () => {
  beforeEach(() => {
    buildMock.mockReset();
    buildMock.mockImplementation(async () => undefined);
    fromStringMock.mockClear();
    generatePreviewSchemasMock.mockReset();
    generatePreviewSchemasMock.mockReturnValue([]);
    getActiveConditionPredicatesMock.mockReset();
    findDataNodeMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('handles instance:validate — structural error and condition violation both surface as diagnostics', async () => {
    findDataNodeMock.mockReturnValue({ name: 'Trade' });
    generatePreviewSchemasMock.mockReturnValue([
      {
        schemaVersion: 1,
        targetId: 'test.Trade',
        title: 'Trade',
        status: 'ready',
        fields: [
          { path: 'symbol', label: 'Symbol', kind: 'string', required: true },
          { path: 'quantity', label: 'Quantity', kind: 'number', required: true }
        ]
      }
    ]);
    getActiveConditionPredicatesMock.mockReturnValue([{ name: 'PositiveQuantity', predicate: 'data.quantity > 0' }]);

    const { scope, dispatch } = await loadWorkerModule();

    dispatch({
      type: 'preview:setFiles',
      files: [{ uri: 'file:///trade.rosetta', content: 'namespace test' }],
      requestId: 'validate:setup'
    });
    await flushWorker();

    dispatch({
      type: 'instance:validate',
      typeFqn: 'test.Trade',
      data: { quantity: -1 },
      requestId: 'validate:1'
    });
    await flushWorker();

    expect(findDataNodeMock).toHaveBeenCalledWith('test.Trade', expect.any(Array));
    expect(generatePreviewSchemasMock).toHaveBeenCalledWith(expect.any(Array), { targetId: 'test.Trade' });
    expect(getActiveConditionPredicatesMock).toHaveBeenCalledWith({ name: 'Trade' });

    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: 'instance:validateResult',
      requestId: 'validate:1',
      diagnostics: [
        { path: 'symbol', message: 'Symbol is required' },
        {
          path: 'PositiveQuantity',
          message: "Condition 'PositiveQuantity' failed",
          conditionName: 'PositiveQuantity'
        }
      ]
    });
  });

  it('posts an unknown-type diagnostic when the typeFqn cannot be resolved by either findDataNode or generatePreviewSchemas', async () => {
    findDataNodeMock.mockReturnValue(undefined);
    generatePreviewSchemasMock.mockReturnValue([]);

    const { scope, dispatch } = await loadWorkerModule();

    dispatch({
      type: 'instance:validate',
      typeFqn: 'test.Unknown',
      data: {},
      requestId: 'validate:2'
    });
    await flushWorker();

    expect(generatePreviewSchemasMock).toHaveBeenCalledWith(expect.any(Array), { targetId: 'test.Unknown' });
    expect(getActiveConditionPredicatesMock).not.toHaveBeenCalled();
    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: 'instance:validateResult',
      requestId: 'validate:2',
      diagnostics: [{ path: '', message: "Unknown type 'test.Unknown'" }]
    });
  });

  it('validates a Choice-type instance structurally via generatePreviewSchemas even though findDataNode cannot resolve it (Choice types are not Data nodes)', async () => {
    findDataNodeMock.mockReturnValue(undefined);
    generatePreviewSchemasMock.mockReturnValue([
      {
        schemaVersion: 1,
        kind: 'choice',
        targetId: 'test.PaymentMethod',
        title: 'PaymentMethod',
        status: 'ready',
        fields: [{ path: 'Cash', label: 'Cash', kind: 'string', required: false }]
      }
    ]);

    const { scope, dispatch } = await loadWorkerModule();

    dispatch({
      type: 'instance:validate',
      // Exactly one option present — the Choice "exactly one option" rule
      // (Codex round-2 finding #2) is covered separately in
      // preview-validator.test.ts; this test's own concern is only that
      // Choice targets get routed through generatePreviewSchemas at all
      // despite findDataNode returning undefined for them.
      typeFqn: 'test.PaymentMethod',
      data: { Cash: 'value' },
      requestId: 'validate:3'
    });
    await flushWorker();

    expect(findDataNodeMock).toHaveBeenCalledWith('test.PaymentMethod', expect.any(Array));
    expect(generatePreviewSchemasMock).toHaveBeenCalledWith(expect.any(Array), { targetId: 'test.PaymentMethod' });
    // Condition predicates need the real Data AST node; a Choice target has
    // none, so they must be skipped rather than blocking validation entirely.
    expect(getActiveConditionPredicatesMock).not.toHaveBeenCalled();
    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: 'instance:validateResult',
      requestId: 'validate:3',
      diagnostics: []
    });
  });
});
