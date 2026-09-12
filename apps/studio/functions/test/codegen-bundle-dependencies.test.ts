// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { afterEach, expect, it, vi } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import type { CuratedManifest } from '@rune-langium/curated-schema';
import { URI } from 'langium';
import JSZip from 'jszip';
import * as curated from '../../src/services/curated-fetch.js';
import { onRequestPost, __resetDocumentCacheForTests } from '../api/codegen.js';

afterEach(() => {
  vi.restoreAllMocks();
  __resetDocumentCacheForTests();
});

function manifest(id: 'cdm' | 'fpml'): CuratedManifest {
  return {
    schemaVersion: 2,
    modelId: id,
    version: 'latest',
    sha256: 'a'.repeat(64),
    sizeBytes: 1,
    generatedAt: 'now',
    upstreamCommit: '',
    upstreamRef: 'master',
    archiveUrl: `https://example.com/${id}.tar.gz`,
    history: [],
    dependencies: id === 'cdm' ? { fpml: 'latest' } : { cdm: 'latest' },
    namespaces: {
      [id]: { deps: id === 'cdm' ? ['fpml'] : [], exports: [], artifact: `${id}.json.gz` },
      [`${id}.unused`]: { deps: [], exports: [], artifact: `${id}.unused.json.gz` }
    }
  };
}

function request(): Request {
  return new Request('http://example.com/api/codegen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: [],
      target: 'typescript',
      curatedBundles: [{ id: 'cdm', version: 'latest' }],
      namespaces: ['cdm']
    })
  });
}

it('loads cyclic bundle dependencies once and emits a linked cross-bundle namespace closure', async () => {
  const { RuneDsl } = createRuneDslServices();
  const sources = new Map([
    [
      'cdm',
      'namespace cdm\nimport fpml.*\nfunc Use:\n inputs: value Amount (1..1)\n output: result int (1..1)\n set result: value -> quantity'
    ],
    ['fpml', 'namespace fpml\ntype Amount:\n quantity int (1..1)']
  ]);
  const docs = [...sources].map(([id, source]) =>
    RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(source, URI.parse(`file:///[${id}]/model.rosetta`))
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build(docs, { validation: false });
  const serialized = new Map(
    docs.map((doc, index) => {
      const id = [...sources.keys()][index]!;
      return [
        id,
        {
          uri: `${id}/model.rosetta`,
          content: '',
          exports: [],
          serializedModel: RuneDsl.serializer.JsonSerializer.serialize(doc.parseResult.value, { refText: true })
        }
      ];
    })
  );
  const manifests = vi
    .spyOn(curated, 'fetchCuratedManifest')
    .mockImplementation(async (id) => manifest(id as 'cdm' | 'fpml'));
  const namespaces = vi.spyOn(curated, 'fetchCuratedNamespace').mockImplementation(async (id) => [serialized.get(id)!]);
  const response = await onRequestPost({ request: request() } as never);
  expect(response.status).toBe(200);
  expect(manifests.mock.calls.map((call) => call[0])).toEqual(['cdm', 'fpml']);
  expect(namespaces.mock.calls.map((call) => call[2])).toEqual(['cdm.json.gz', 'fpml.json.gz']);
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(['cdm.ts', 'fpml.ts']));
  expect(Object.keys(zip.files).some((path) => path.includes('unused'))).toBe(false);
  expect(await zip.file('cdm.ts')!.async('string')).toContain('quantity');
});

it('returns a dependency fetch failure as a structured 502', async () => {
  vi.spyOn(curated, 'fetchCuratedManifest').mockImplementation(async (id) => {
    if (id === 'fpml') throw new curated.CuratedBundleUnavailableError(id, 'latest', 404);
    return manifest('cdm');
  });
  const response = await onRequestPost({ request: request() } as never);
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ error: 'curated_bundle_unavailable', bundleId: 'fpml' });
});
