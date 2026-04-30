// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const buildMock = vi.fn(async () => undefined);
const fromStringMock = vi.fn((content: string, uri: string) => ({
  uri,
  content,
  parseResult: {
    value: {
      $type: 'RosettaModel',
      elements: [],
      uri,
      content
    },
    lexerErrors: [],
    parserErrors: []
  }
}));

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

vi.mock('langium', () => ({
  URI: {
    parse: (value: string) => value
  }
}));

async function loadParserWorkerModule() {
  vi.resetModules();
  return await import('../../src/workers/parser-worker.ts');
}

describe('parser-worker', () => {
  beforeEach(() => {
    buildMock.mockReset();
    buildMock.mockImplementation(async () => undefined);
    fromStringMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds a single document with validation disabled for parse requests', async () => {
    const { handleParse } = await loadParserWorkerModule();

    const response = await handleParse({
      type: 'parse',
      id: 'parse-1',
      content: 'namespace demo',
      uri: 'file:///demo.rosetta'
    });

    expect(fromStringMock).toHaveBeenCalledWith('namespace demo', 'file:///demo.rosetta');
    expect(buildMock).toHaveBeenCalledWith(
      [expect.objectContaining({ uri: 'file:///demo.rosetta' })],
      { validation: false }
    );
    expect(response).toMatchObject({
      type: 'parseResult',
      id: 'parse-1',
      errors: []
    });
  });

  it('builds workspace documents with validation disabled and preserves file ordering', async () => {
    const { handleParseWorkspace } = await loadParserWorkerModule();

    const response = await handleParseWorkspace({
      type: 'parseWorkspace',
      id: 'workspace-1',
      files: [
        { name: 'a.rosetta', content: 'namespace a' },
        { name: 'b.rosetta', content: 'namespace b' }
      ]
    });

    expect(fromStringMock).toHaveBeenNthCalledWith(1, 'namespace a', 'a.rosetta');
    expect(fromStringMock).toHaveBeenNthCalledWith(2, 'namespace b', 'b.rosetta');
    expect(buildMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({ uri: 'a.rosetta' }),
        expect.objectContaining({ uri: 'b.rosetta' })
      ],
      { validation: false }
    );
    expect(response.type).toBe('parseWorkspaceResult');
    expect(response.id).toBe('workspace-1');
    expect(response.parsedModels.map((entry) => entry.filePath)).toEqual([
      'a.rosetta',
      'b.rosetta'
    ]);
  });

  it('returns per-file parser errors from the built documents', async () => {
    buildMock.mockImplementation(
      async (documents: Array<{ parseResult: { parserErrors: Array<{ message: string }> } }>) => {
        documents[1]!.parseResult.parserErrors = [{ message: 'Broken syntax' }];
      }
    );

    const { handleParseWorkspace } = await loadParserWorkerModule();

    const response = await handleParseWorkspace({
      type: 'parseWorkspace',
      id: 'workspace-2',
      files: [
        { name: 'good.rosetta', content: 'namespace good' },
        { name: 'bad.rosetta', content: 'not valid' }
      ]
    });

    expect(response.errors).toEqual({
      'bad.rosetta': ['Broken syntax']
    });
  });
});
