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
  })
}));

vi.mock('@rune-langium/codegen', () => ({
  generate: generateMock,
  generatePreviewSchemas: generatePreviewSchemasMock
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
    postMessage: vi.fn()
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
});
