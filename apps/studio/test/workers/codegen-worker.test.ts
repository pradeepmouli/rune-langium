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

vi.mock('@rune-langium/core', () => ({
  createRuneDslServices: () => ({
    RuneDsl: {
      shared: {
        workspace: {
          LangiumDocumentFactory: { fromString: fromStringMock },
          DocumentBuilder: { build: buildMock }
        }
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
    buildMock.mockImplementation(
      async (documents: Array<{ diagnostics: Array<{ severity: number }> }>) => {
        documents[0]!.diagnostics = [{ severity: 1 }];
      }
    );

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
      message: 'Fix model errors to refresh the form preview.'
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
      message: 'Fix model errors to refresh the form preview.'
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

  it('posts preview:execute-result with inputs passed through when preview:execute is received', async () => {
    const { scope, dispatch } = await loadWorkerModule();

    dispatch({
      type: 'preview:execute',
      funcName: 'beta.Trade',
      inputs: { symbol: 'AAPL', quantity: 10 },
      requestId: 'exec:beta.Trade:1'
    });

    expect(scope.postMessage).toHaveBeenCalledWith({
      type: 'preview:execute-result',
      requestId: 'exec:beta.Trade:1',
      funcName: 'beta.Trade',
      output: { symbol: 'AAPL', quantity: 10, _executed: true }
    });
  });

  it('posts preview:execute-result for an empty inputs object', async () => {
    const { scope, dispatch } = await loadWorkerModule();

    dispatch({
      type: 'preview:execute',
      funcName: 'alpha.Foo',
      inputs: {},
      requestId: 'exec:alpha.Foo:1'
    });

    expect(scope.postMessage).toHaveBeenCalledWith({
      type: 'preview:execute-result',
      requestId: 'exec:alpha.Foo:1',
      funcName: 'alpha.Foo',
      output: { _executed: true }
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
});
