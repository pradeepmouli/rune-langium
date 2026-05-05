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
const fromModelMock = vi.fn((model: unknown, uri: string) => ({
  uri,
  parseResult: {
    value: model,
    lexerErrors: [],
    parserErrors: []
  }
}));
const addDocumentMock = vi.fn();
const deserializeMock = vi.fn((json: string) => JSON.parse(json));
const hasDocumentMock = vi.fn((_uri: unknown) => false);
const getDocumentMock = vi.fn((_uri: unknown) => ({
  diagnostics: [],
  parseResult: { value: { $type: 'RosettaModel', elements: [] }, parserErrors: [] }
}));
const registerExportsMock = vi.fn();

vi.mock('@rune-langium/core', () => ({
  RuneDslIndexManager: class {},
  createRuneDslServices: () => ({
    RuneDsl: {
      serializer: {
        JsonSerializer: { deserialize: deserializeMock }
      },
      shared: {
        workspace: {
          LangiumDocumentFactory: { fromString: fromStringMock, fromModel: fromModelMock },
          DocumentBuilder: { build: buildMock },
          LangiumDocuments: {
            addDocument: addDocumentMock,
            hasDocument: hasDocumentMock,
            getDocument: getDocumentMock
          },
          IndexManager: { registerExports: registerExportsMock }
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
    fromModelMock.mockClear();
    addDocumentMock.mockClear();
    deserializeMock.mockClear();
    hasDocumentMock.mockReset();
    hasDocumentMock.mockReturnValue(false);
    getDocumentMock.mockClear();
    registerExportsMock.mockClear();
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
      { validation: false, eagerLinking: false }
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
      { validation: false, eagerLinking: false }
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

  it('deserializes corpus files without exports via JsonSerializer and fromModel (old artifact format)', async () => {
    const hydratedModel = { $type: 'RosettaModel', elements: [], hydrated: true };
    deserializeMock.mockReturnValue(hydratedModel);

    const { handleParseWorkspace } = await loadParserWorkerModule();

    const response = await handleParseWorkspace({
      type: 'parseWorkspace',
      id: 'workspace-3',
      files: [
        {
          name: '[cdm]/types.rosetta',
          content: 'ignored',
          serializedModelJson: '{"$type":"RosettaModel","elements":[]}'
          // No exports — old artifact format, deserialize fully
        },
        { name: 'local.rosetta', content: 'namespace local' }
      ]
    });

    expect(deserializeMock).toHaveBeenCalledWith('{"$type":"RosettaModel","elements":[]}');
    expect(fromModelMock).toHaveBeenCalledWith(hydratedModel, '[cdm]/types.rosetta');
    expect(addDocumentMock).toHaveBeenCalledTimes(1);
    expect(fromStringMock).toHaveBeenCalledWith('namespace local', 'local.rosetta');
    expect(registerExportsMock).not.toHaveBeenCalled();
    expect(response.type).toBe('parseWorkspaceResult');
    expect(response.models[0]).toBe(hydratedModel);
  });

  it('defers AST deserialization for corpus files that carry an exports manifest', async () => {
    const { handleParseWorkspace } = await loadParserWorkerModule();

    const response = await handleParseWorkspace({
      type: 'parseWorkspace',
      id: 'workspace-deferred',
      files: [
        {
          name: '[cdm]/types.rosetta',
          content: 'ignored',
          serializedModelJson: '{"$type":"RosettaModel","elements":[]}',
          exports: [{ type: 'RosettaType', name: 'Party', path: '/elements/0' }]
        },
        { name: 'local.rosetta', content: 'namespace local' }
      ]
    });

    // Corpus file with exports — must NOT deserialize, must register exports
    expect(deserializeMock).not.toHaveBeenCalled();
    expect(fromModelMock).not.toHaveBeenCalled();
    expect(registerExportsMock).toHaveBeenCalledWith('[cdm]/types.rosetta', [
      {
        type: 'RosettaType',
        name: 'Party',
        documentUri: '[cdm]/types.rosetta',
        path: '/elements/0'
      }
    ]);

    // User file must be parsed normally
    expect(fromStringMock).toHaveBeenCalledWith('namespace local', 'local.rosetta');

    // Only user file ends up in models (corpus deferred)
    expect(response.type).toBe('parseWorkspaceResult');
    expect(response.parsedModels.map((m) => m.filePath)).toEqual(['local.rosetta']);
  });

  it('on-demand deserializes a deferred corpus document when linkDocument is called', async () => {
    const hydratedModel = { $type: 'RosettaModel', elements: [], hydrated: true };
    deserializeMock.mockReturnValue(hydratedModel);

    const { handleParseWorkspace, handleLinkDocument } = await loadParserWorkerModule();

    // First load workspace with a deferred corpus file
    await handleParseWorkspace({
      type: 'parseWorkspace',
      id: 'ws-deferred',
      files: [
        {
          name: '[cdm]/types.rosetta',
          content: 'ignored',
          serializedModelJson: '{"$type":"RosettaModel","elements":[]}',
          exports: [{ type: 'RosettaType', name: 'Party', path: '/elements/0' }]
        }
      ]
    });

    // Deserialize should not have been called yet
    expect(deserializeMock).not.toHaveBeenCalled();
    expect(fromModelMock).not.toHaveBeenCalled();

    // Now link the deferred document — triggers on-demand deserialization
    const linkResult = await handleLinkDocument({
      type: 'linkDocument',
      id: 'link-deferred',
      uri: '[cdm]/types.rosetta'
    });

    expect(deserializeMock).toHaveBeenCalledWith('{"$type":"RosettaModel","elements":[]}');
    expect(fromModelMock).toHaveBeenCalledWith(hydratedModel, '[cdm]/types.rosetta');
    expect(addDocumentMock).toHaveBeenCalledTimes(1);
    expect(buildMock).toHaveBeenLastCalledWith(
      [
        expect.objectContaining({
          parseResult: { value: hydratedModel, lexerErrors: [], parserErrors: [] }
        })
      ],
      { validation: false, eagerLinking: true }
    );
    expect(linkResult.linked).toBe(true);
    expect(linkResult.type).toBe('linkDocumentResult');
  });

  it('does not deserialize a deferred document twice if linkDocument is called again', async () => {
    const hydratedModel = { $type: 'RosettaModel', elements: [] };
    deserializeMock.mockReturnValue(hydratedModel);

    const fakeDoc = {
      diagnostics: [],
      parseResult: { value: hydratedModel, lexerErrors: [], parserErrors: [] }
    };
    fromModelMock.mockReturnValue(fakeDoc);

    const { handleParseWorkspace, handleLinkDocument } = await loadParserWorkerModule();

    await handleParseWorkspace({
      type: 'parseWorkspace',
      id: 'ws-once',
      files: [
        {
          name: '[cdm]/types.rosetta',
          content: 'ignored',
          serializedModelJson: '{"$type":"RosettaModel","elements":[]}',
          exports: [{ type: 'RosettaType', name: 'Party', path: '/elements/0' }]
        }
      ]
    });

    // First linkDocument — triggers deserialization and removes from deferred map
    await handleLinkDocument({ type: 'linkDocument', id: 'link-1', uri: '[cdm]/types.rosetta' });
    expect(deserializeMock).toHaveBeenCalledTimes(1);

    // Second call — document is now in activeLangiumDocs (or returns linked:false if not tracked)
    // Either way, deserialize must NOT be called again
    hasDocumentMock.mockReturnValue(true);
    getDocumentMock.mockReturnValue(fakeDoc);
    await handleLinkDocument({ type: 'linkDocument', id: 'link-2', uri: '[cdm]/types.rosetta' });
    expect(deserializeMock).toHaveBeenCalledTimes(1);
  });

  it('links a single document on demand after lazy workspace parse', async () => {
    const fakeDoc = {
      diagnostics: [],
      parseResult: { value: { $type: 'RosettaModel', elements: [] }, parserErrors: [] }
    };
    hasDocumentMock.mockReturnValue(true);
    getDocumentMock.mockReturnValue(fakeDoc);

    const { handleParseWorkspace, handleLinkDocument } = await loadParserWorkerModule();

    const wsResult = await handleParseWorkspace({
      type: 'parseWorkspace',
      id: 'ws-link',
      files: [
        {
          name: 'inmemory:///types.rosetta',
          content: 'namespace test\n\ntype Foo:\n  bar string (1..1)'
        },
        {
          name: 'inmemory:///refs.rosetta',
          content: 'namespace test\n\ntype Bar:\n  foo Foo (1..1)'
        }
      ]
    });
    expect(wsResult.models).toHaveLength(2);

    const linkResult = await handleLinkDocument({
      type: 'linkDocument',
      id: 'link-1',
      uri: 'inmemory:///refs.rosetta'
    });
    expect(linkResult.linked).toBe(true);
    expect(linkResult.type).toBe('linkDocumentResult');
    expect(buildMock).toHaveBeenLastCalledWith([fakeDoc], {
      validation: false,
      eagerLinking: true
    });
  });

  it('returns linked: false for unknown document URIs', async () => {
    hasDocumentMock.mockReturnValue(false);

    const { handleLinkDocument } = await loadParserWorkerModule();

    const result = await handleLinkDocument({
      type: 'linkDocument',
      id: 'link-unknown',
      uri: 'inmemory:///does-not-exist.rosetta'
    });
    expect(result.linked).toBe(false);
    expect(result.type).toBe('linkDocumentResult');
    expect(result.errors).toEqual([]);
  });
});
