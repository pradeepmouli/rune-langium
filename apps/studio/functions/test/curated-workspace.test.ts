// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, expect, it, vi } from 'vitest';
import type { CuratedManifest } from '@rune-langium/curated-schema';
import * as curated from '../../src/services/curated-fetch.js';
import { loadCuratedWorkspace } from '../../src/services/curated-workspace.js';

afterEach(() => vi.restoreAllMocks());

const oldCohort = `cohort-${'a'.repeat(64)}`;
const newCohort = `cohort-${'b'.repeat(64)}`;

function manifest(id: 'cdm' | 'fpml', cohort: string): CuratedManifest {
  return {
    schemaVersion: 2,
    modelId: id,
    cohort,
    version: '2026-09-12',
    sha256: 'a'.repeat(64),
    sizeBytes: 1,
    generatedAt: 'now',
    upstreamCommit: '',
    upstreamRef: 'master',
    archiveUrl: `https://example.com/${id}`,
    history: [],
    dependencies: { [id === 'cdm' ? 'fpml' : 'cdm']: cohort },
    namespaces: {
      [id]: { deps: id === 'cdm' ? ['fpml'] : [], exports: [], artifact: `${cohort}/${id}.json.gz` },
      [`${id}.unused`]: { deps: [], exports: [], artifact: `${cohort}/${id}.unused.json.gz` }
    }
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it('starts independent pinned manifests and namespace artifacts in the same wave', async () => {
  const cohort = oldCohort;
  const cdm = manifest('cdm', cohort);
  cdm.dependencies = { fpml: cohort, 'rune-dsl': cohort };
  cdm.namespaces!.cdm!.deps = ['fpml', 'rune-dsl'];
  const fpml = manifest('fpml', cohort);
  const rune = {
    ...manifest('fpml', cohort),
    modelId: 'rune-dsl',
    dependencies: {},
    namespaces: { 'rune-dsl': { deps: [], exports: [], artifact: `${cohort}/rune-dsl.json.gz` } }
  } satisfies CuratedManifest;
  const fpmlManifest = deferred<CuratedManifest>();
  const runeManifest = deferred<CuratedManifest>();
  const cdmNamespace = deferred<[]>();
  const manifests = vi.spyOn(curated, 'fetchCuratedManifest').mockImplementation(async (id) => {
    if (id === 'cdm') return cdm;
    return id === 'fpml' ? fpmlManifest.promise : runeManifest.promise;
  });
  const namespaces = vi
    .spyOn(curated, 'fetchCuratedNamespace')
    .mockImplementation(async (id) => (id === 'cdm' ? cdmNamespace.promise : []));

  const loading = loadCuratedWorkspace([{ id: 'cdm', version: cohort }], new Set(['cdm']));
  await vi.waitFor(() => expect(manifests.mock.calls.map(([id]) => id)).toEqual(['cdm', 'fpml', 'rune-dsl']));
  fpmlManifest.resolve(fpml);
  runeManifest.resolve(rune);
  await vi.waitFor(() => expect(namespaces.mock.calls.map(([id]) => id)).toEqual(['cdm', 'fpml', 'rune-dsl']));
  cdmNamespace.resolve([]);
  const loaded = await loading;
  expect(loaded.bundles.map(({ id }) => id)).toEqual(['cdm', 'fpml', 'rune-dsl']);
});

it.each([
  ['cdm', 'fpml'],
  ['fpml', 'cdm']
] as const)('pins floating roots %s and %s to one cohort despite partial latest publication', async (first, second) => {
  const manifests = vi
    .spyOn(curated, 'fetchCuratedManifest')
    .mockImplementation(async (id, version) =>
      manifest(id as 'cdm' | 'fpml', version === 'latest' ? (id === 'cdm' ? newCohort : oldCohort) : version)
    );
  const namespaces = vi.spyOn(curated, 'fetchCuratedNamespace').mockResolvedValue([]);
  const loaded = await loadCuratedWorkspace(
    [
      { id: first, version: 'latest' },
      { id: second, version: 'latest' }
    ],
    new Set(['cdm'])
  );
  const cohort = first === 'cdm' ? newCohort : oldCohort;
  expect([...loaded.closure].sort()).toEqual(['cdm', 'fpml']);
  expect(loaded.bundles.every((bundle) => bundle.manifest.cohort === cohort)).toBe(true);
  expect(manifests.mock.calls.map(([id, version]) => [id, version])).toEqual([
    [first, 'latest'],
    [first, cohort],
    [second, cohort]
  ]);
  expect(namespaces.mock.calls.map(([id, version, artifact]) => [id, version, artifact])).toEqual([
    [first, cohort, `${cohort}/${first}.json.gz`],
    [second, cohort, `${cohort}/${second}.json.gz`]
  ]);
});

it('rejects incompatible pinned roots before fetching namespace documents', async () => {
  vi.spyOn(curated, 'fetchCuratedManifest').mockResolvedValue(manifest('cdm', newCohort));
  const namespaces = vi.spyOn(curated, 'fetchCuratedNamespace');
  await expect(
    loadCuratedWorkspace(
      [
        { id: 'cdm', version: newCohort },
        { id: 'fpml', version: oldCohort }
      ],
      new Set(['cdm'])
    )
  ).rejects.toThrow(curated.CuratedBundleUnavailableError);
  expect(namespaces).not.toHaveBeenCalled();
});
