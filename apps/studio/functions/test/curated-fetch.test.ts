// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi } from 'vitest';
import { gzip } from 'pako';
import {
  fetchCuratedManifest,
  fetchCuratedNamespace,
  CuratedBundleUnavailableError,
  type CuratedFetcher
} from '../lib/curated-fetch.js';

const MIRROR = 'https://www.daikonic.dev/curated';

/** Minimal valid v2 manifest with a namespaces map. */
const VALID_MANIFEST = {
  schemaVersion: 2,
  modelId: 'cdm',
  version: '2026-05-22',
  sha256: 'a'.repeat(64),
  sizeBytes: 1,
  generatedAt: '2026-05-22T00:00:00Z',
  upstreamCommit: 'abc123',
  upstreamRef: 'master',
  archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz',
  history: [],
  namespaces: {
    'cdm.base': {
      deps: [],
      exports: [{ type: 'Data', name: 'Foo' }],
      artifact: 'artifacts/2026-05-22/ns/cdm.base.json.gz'
    }
  }
};

// ---------------------------------------------------------------------------
// fetchCuratedManifest
// ---------------------------------------------------------------------------

describe('fetchCuratedManifest', () => {
  it('happy path: fetches and returns valid manifest', async () => {
    const stub: CuratedFetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(VALID_MANIFEST), { status: 200 }));

    const manifest = await fetchCuratedManifest('cdm', '2026-05-22', stub);

    expect(stub).toHaveBeenCalledOnce();
    expect(stub).toHaveBeenCalledWith(`${MIRROR}/cdm/manifest.json`, undefined);
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.modelId).toBe('cdm');
    expect(manifest.namespaces?.['cdm.base']?.artifact).toBe('artifacts/2026-05-22/ns/cdm.base.json.gz');
  });

  it('non-200 status: rejects with CuratedBundleUnavailableError (status 404)', async () => {
    const stub: CuratedFetcher = vi.fn().mockResolvedValue(new Response('', { status: 404 }));

    await expect(fetchCuratedManifest('cdm', '2026-05-22', stub)).rejects.toThrow(CuratedBundleUnavailableError);

    const err = await fetchCuratedManifest('cdm', '2026-05-22', stub).catch((e) => e);
    expect(err).toBeInstanceOf(CuratedBundleUnavailableError);
    expect(err.status).toBe(404);
    expect(err.bundleId).toBe('cdm');
  });

  it('schema mismatch: rejects with CuratedBundleUnavailableError when schema invalid', async () => {
    const badManifest = { schemaVersion: 99, modelId: 'cdm' }; // invalid
    const stub: CuratedFetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(badManifest), { status: 200 }));

    await expect(fetchCuratedManifest('cdm', '2026-05-22', stub)).rejects.toThrow(CuratedBundleUnavailableError);
  });

  it('network error: fetch throw wrapped as CuratedBundleUnavailableError', async () => {
    const stub: CuratedFetcher = vi.fn().mockRejectedValue(new Error('boom'));

    const err = await fetchCuratedManifest('cdm', '2026-05-22', stub).catch((e) => e);
    expect(err).toBeInstanceOf(CuratedBundleUnavailableError);
    expect(err.bundleId).toBe('cdm');
  });

  it('malformed JSON body: rejects with CuratedBundleUnavailableError', async () => {
    const stub: CuratedFetcher = vi.fn().mockResolvedValue(new Response('not json{', { status: 200 }));

    const err = await fetchCuratedManifest('cdm', '2026-05-22', stub).catch((e) => e);
    expect(err).toBeInstanceOf(CuratedBundleUnavailableError);
    expect(err.bundleId).toBe('cdm');
  });
});

// ---------------------------------------------------------------------------
// fetchCuratedNamespace
// ---------------------------------------------------------------------------

/** Build a per-ns artifact payload and gzip it. */
function makeNsArtifact(
  docs: Array<{ path: string; modelJson: string; exports?: Array<{ type: string; name: string; path: string }> }>
) {
  const payload = { documents: docs };
  return gzip(JSON.stringify(payload));
}

describe('fetchCuratedNamespace', () => {
  it('happy path: inflates and maps documents to CuratedDocument[]', async () => {
    const modelJson = '{"$type":"RosettaModel","name":"cdm.base"}';
    const gzBytes = makeNsArtifact([{ path: 'a/b.rosetta', modelJson, exports: [] }]);

    const artifactKey = 'artifacts/2026-05-22/ns/cdm.base.json.gz';
    const stub: CuratedFetcher = vi.fn().mockResolvedValue(new Response(gzBytes, { status: 200 }));

    const docs = await fetchCuratedNamespace('cdm', '2026-05-22', artifactKey, stub);

    expect(stub).toHaveBeenCalledOnce();
    expect(stub).toHaveBeenCalledWith(
      `${MIRROR}/cdm/${artifactKey}`,
      expect.objectContaining({ headers: expect.objectContaining({ 'Accept-Encoding': 'identity' }) })
    );
    expect(docs).toHaveLength(1);
    expect(docs[0].uri).toBe('cdm/a/b.rosetta');
    expect(docs[0].serializedModel).toBe(modelJson);
    expect(docs[0].content).toBe('');
    expect(docs[0].exports).toEqual([]);
  });

  it('absolute artifact URL is fetched as-is (not prefixed with the mirror base)', async () => {
    const modelJson = '{"$type":"RosettaModel","name":"cdm.abs"}';
    const gzBytes = makeNsArtifact([{ path: 'a/abs.rosetta', modelJson, exports: [] }]);
    // The manifest now carries absolute artifact URLs; the fetcher must use them
    // verbatim, NOT `${MIRROR}/cdm/${absoluteUrl}` (which would double-prefix → 404).
    const artifactKey = `${MIRROR}/cdm/artifacts/2026-05-23/ns/cdm.abs.json.gz`;
    const stub: CuratedFetcher = vi.fn().mockResolvedValue(new Response(gzBytes, { status: 200 }));

    const docs = await fetchCuratedNamespace('cdm', '2026-05-23', artifactKey, stub);

    expect(stub).toHaveBeenCalledOnce();
    expect(stub).toHaveBeenCalledWith(
      artifactKey,
      expect.objectContaining({ headers: expect.objectContaining({ 'Accept-Encoding': 'identity' }) })
    );
    expect(docs).toHaveLength(1);
    expect(docs[0].uri).toBe('cdm/a/abs.rosetta');
  });

  it('rejects an off-mirror absolute artifact URL without fetching it (SSRF guard)', async () => {
    const stub: CuratedFetcher = vi.fn();
    const evil = 'https://evil.example.com/artifacts/2026-05-23/ns/cdm.pwn.json.gz';

    const err = await fetchCuratedNamespace('cdm', '2026-05-23', evil, stub).catch((e) => e);

    expect(err).toBeInstanceOf(CuratedBundleUnavailableError);
    expect(stub).not.toHaveBeenCalled(); // never fetched the foreign host
  });

  it('non-200 status: rejects with CuratedBundleUnavailableError', async () => {
    // Use a distinct key so the namespace cache from the happy path test doesn't interfere.
    const artifactKey = 'artifacts/2026-05-22/ns/cdm.error-case.json.gz';
    const stub: CuratedFetcher = vi.fn().mockResolvedValue(new Response('', { status: 503 }));

    const err = await fetchCuratedNamespace('cdm', '2026-05-22', artifactKey, stub).catch((e) => e);
    expect(err).toBeInstanceOf(CuratedBundleUnavailableError);
    expect(err.status).toBe(503);
  });

  it('caching: versioned artifactKey fetched only once on concurrent calls', async () => {
    const modelJson = '{"$type":"RosettaModel","name":"cdm.base"}';
    const gzBytes = makeNsArtifact([{ path: 'x.rosetta', modelJson }]);

    const artifactKey = 'artifacts/2026-05-22/ns/cdm.base-cache.json.gz';
    let callCount = 0;
    const stub: CuratedFetcher = vi.fn().mockImplementation(async () => {
      callCount++;
      return new Response(gzBytes, { status: 200 });
    });

    // Call twice — should dedupe to one fetch
    const [a, b] = await Promise.all([
      fetchCuratedNamespace('cdm', '2026-05-22', artifactKey, stub),
      fetchCuratedNamespace('cdm', '2026-05-22', artifactKey, stub)
    ]);

    expect(callCount).toBe(1);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('exports default to [] when absent from document', async () => {
    const modelJson = '{"$type":"RosettaModel","name":"cdm.base"}';
    // no `exports` field on the doc
    const gzBytes = makeNsArtifact([{ path: 'no-exports.rosetta', modelJson }]);

    const artifactKey = 'artifacts/2026-05-22/ns/cdm.no-exports.json.gz';
    const stub: CuratedFetcher = vi.fn().mockResolvedValue(new Response(gzBytes, { status: 200 }));

    const docs = await fetchCuratedNamespace('cdm', '2026-05-22', artifactKey, stub);
    expect(docs[0].exports).toEqual([]);
  });
});
