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

  it('rejects an artifact key outside the curated namespace mirror path', async () => {
    const fetcher = await import('../../src/services/curated-fetch.js');
    const fetchManifest = vi.spyOn(fetcher, 'fetchCuratedManifest');
    const fetchNamespace = vi.spyOn(fetcher, 'fetchCuratedNamespace');

    const response = await onRequestPost({
      request: request({
        bundleId: 'cdm',
        version: 'latest',
        namespace: 'cdm.base.math',
        expectedArtifactKey: JSON.stringify(['cdm', 'https://example.com/private.json.gz'])
      })
    } as never);

    expect(response.status).toBe(400);
    expect(fetchManifest).not.toHaveBeenCalled();
    expect(fetchNamespace).not.toHaveBeenCalled();
  });

  it('uses the exact cached date-and-hash artifact after latest moves', async () => {
    const fetcher = await import('../../src/services/curated-fetch.js');
    const cachedArtifact =
      'https://www.daikonic.dev/curated/cdm/artifacts/2026-09-13-abc123def456/ns/cdm.base.math.json.gz';
    const manifestSpy = vi.spyOn(fetcher, 'fetchCuratedManifest');
    const fetchNamespace = vi.spyOn(fetcher, 'fetchCuratedNamespace').mockResolvedValue([]);

    const response = await onRequestPost({
      request: request({
        bundleId: 'cdm',
        version: 'latest',
        namespace: 'cdm.base.math',
        expectedArtifactKey: JSON.stringify(['cdm', cachedArtifact])
      })
    } as never);

    expect(response.status).toBe(200);
    expect(manifestSpy).not.toHaveBeenCalled();
    expect(fetchNamespace).toHaveBeenCalledWith('cdm', 'latest', cachedArtifact, undefined);
    expect(await response.json()).toEqual({
      artifactKey: JSON.stringify(['cdm', cachedArtifact]),
      documents: []
    });
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
