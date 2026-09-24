// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from '../api/curated-source.js';

const artifact = 'artifacts/cohort-1/ns/cdm.base.math.json.gz';
const manifest = {
  namespaces: { 'cdm.base.math': { artifact, deps: [], exports: [] } }
};

function request(body: unknown): Request {
  return new Request('http://example.com/api/curated-source', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('POST /api/curated-source', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns only original source for the selected namespace', async () => {
    const fetcher = await import('../../src/services/curated-fetch.js');
    vi.spyOn(fetcher, 'fetchCuratedManifest').mockResolvedValue(manifest as never);
    const fetchNamespace = vi.spyOn(fetcher, 'fetchCuratedNamespace').mockResolvedValue([
      {
        uri: 'cdm/base/math.rosetta',
        content: 'namespace cdm.base.math\n',
        serializedModel: '{"$type":"RosettaModel"}',
        exports: [{ type: 'Data', name: 'Number', path: '/elements@0' }]
      }
    ]);

    const response = await onRequestPost({
      request: request({ bundleId: 'cdm', version: 'latest', namespace: 'cdm.base.math' })
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      artifactKey: JSON.stringify(['cdm', artifact]),
      documents: [{ uri: 'cdm/base/math.rosetta', content: 'namespace cdm.base.math\n' }]
    });
    expect(fetchNamespace).toHaveBeenCalledWith('cdm', 'latest', artifact, undefined);
  });

  it('rejects a changed artifact before fetching its source', async () => {
    const fetcher = await import('../../src/services/curated-fetch.js');
    vi.spyOn(fetcher, 'fetchCuratedManifest').mockResolvedValue(manifest as never);
    const fetchNamespace = vi.spyOn(fetcher, 'fetchCuratedNamespace');

    const response = await onRequestPost({
      request: request({
        bundleId: 'cdm',
        version: 'latest',
        namespace: 'cdm.base.math',
        expectedArtifactKey: JSON.stringify(['cdm', 'artifacts/older/ns/cdm.base.math.json.gz'])
      })
    } as never);

    expect(response.status).toBe(409);
    expect(fetchNamespace).not.toHaveBeenCalled();
  });

  it('pins source lookup to the cohort of an already downloaded JSON artifact', async () => {
    const fetcher = await import('../../src/services/curated-fetch.js');
    const cohort = `cohort-${'a'.repeat(64)}`;
    const pinnedArtifact = `artifacts/${cohort}/ns/cdm.base.math.json.gz`;
    const manifestSpy = vi.spyOn(fetcher, 'fetchCuratedManifest').mockResolvedValue({
      namespaces: { 'cdm.base.math': { artifact: pinnedArtifact, deps: [], exports: [] } }
    } as never);
    vi.spyOn(fetcher, 'fetchCuratedNamespace').mockResolvedValue([]);

    const response = await onRequestPost({
      request: request({
        bundleId: 'cdm',
        version: 'latest',
        namespace: 'cdm.base.math',
        expectedArtifactKey: JSON.stringify(['cdm', pinnedArtifact])
      })
    } as never);

    expect(response.status).toBe(200);
    expect(manifestSpy).toHaveBeenCalledWith('cdm', cohort, undefined);
  });

  it('reports a legacy artifact with declarations but no original source', async () => {
    const fetcher = await import('../../src/services/curated-fetch.js');
    vi.spyOn(fetcher, 'fetchCuratedManifest').mockResolvedValue(manifest as never);
    vi.spyOn(fetcher, 'fetchCuratedNamespace').mockResolvedValue([
      {
        uri: 'cdm/base/math.rosetta',
        content: '',
        serializedModel: '{}',
        exports: [{ type: 'Data', name: 'Number', path: '/elements@0' }]
      }
    ]);

    const response = await onRequestPost({
      request: request({ bundleId: 'cdm', version: 'latest', namespace: 'cdm.base.math' })
    } as never);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Original source is unavailable for this artifact' });
  });
});
