// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Stale-while-revalidate freshness check.
 *
 * The client-side check MUST:
 *  - return immediately with no archive download
 *  - distinguish three observable mirror states (ok / unreachable /
 *    malformed) so callers drive different stale-while-revalidate UX
 *  - never throw on transient network errors
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readMirrorVersion } from '../../src/services/curated-loader.js';

const MANIFEST_URL = 'https://www.daikonic.dev/curated/cdm/manifest.json';
const VALID_MANIFEST = {
  schemaVersion: 1,
  modelId: 'cdm',
  version: '2026-04-25',
  sha256: 'a'.repeat(64),
  sizeBytes: 100,
  generatedAt: '2026-04-25T03:00:00Z',
  upstreamCommit: '',
  upstreamRef: 'master',
  archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz',
  history: []
};

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => fetchSpy.mockRestore());

describe('readMirrorVersion', () => {
  it('returns kind:ok with version on a valid manifest response', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(VALID_MANIFEST)));
    const r = await readMirrorVersion('https://www.daikonic.dev/curated', 'cdm');
    expect(r).toEqual({ kind: 'ok', version: '2026-04-25' });
    // Sanity: it does NOT fetch the archive (no second call).
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toBe(MANIFEST_URL);
  });

  it('returns kind:unreachable on a 5xx', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('boom', { status: 503 }));
    const r = await readMirrorVersion('https://www.daikonic.dev/curated', 'cdm');
    expect(r).toEqual({ kind: 'unreachable' });
  });

  it('returns kind:unreachable when fetch throws (offline)', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network'));
    const r = await readMirrorVersion('https://www.daikonic.dev/curated', 'cdm');
    expect(r).toEqual({ kind: 'unreachable' });
  });

  it('returns kind:malformed on invalid JSON', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('not json'));
    const r = await readMirrorVersion('https://www.daikonic.dev/curated', 'cdm');
    expect(r).toEqual({ kind: 'malformed' });
  });

  it('returns kind:malformed when the manifest fails schema validation', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ schemaVersion: 1 })));
    const r = await readMirrorVersion('https://www.daikonic.dev/curated', 'cdm');
    expect(r).toEqual({ kind: 'malformed' });
  });

  it('returns kind:unreachable on an aborted signal', async () => {
    const ctl = new AbortController();
    fetchSpy.mockImplementation(async (_url, init) => {
      if ((init as RequestInit | undefined)?.signal?.aborted) {
        throw new DOMException('aborted', 'AbortError');
      }
      return new Response(JSON.stringify(VALID_MANIFEST));
    });
    ctl.abort();
    const r = await readMirrorVersion('https://www.daikonic.dev/curated', 'cdm', ctl.signal);
    expect(r).toEqual({ kind: 'unreachable' });
  });
});
