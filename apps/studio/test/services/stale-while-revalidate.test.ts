// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T035 — stale-while-revalidate freshness check (FR-005a / FR-005b).
 *
 * The client-side check MUST:
 *  - return immediately with no archive download
 *  - report whether a newer manifest exists at the mirror
 *  - never throw on transient network errors (returns null instead)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readMirrorVersion } from '../../src/services/curated-loader.js';

const MANIFEST_URL = 'https://www.daikonic.dev/curated/cdm/manifest.json';

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => fetchSpy.mockRestore());

describe('readMirrorVersion (T035, FR-005b)', () => {
  it('returns the manifest version on success', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ schemaVersion: 1, modelId: 'cdm', version: '2026-04-25' }))
    );
    const v = await readMirrorVersion('https://www.daikonic.dev/curated', 'cdm');
    expect(v).toBe('2026-04-25');
    // Sanity: it does NOT fetch the archive (no second call).
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toBe(MANIFEST_URL);
  });

  it('returns null on a 5xx', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('boom', { status: 503 }));
    const v = await readMirrorVersion('https://www.daikonic.dev/curated', 'cdm');
    expect(v).toBeNull();
  });

  it('returns null when fetch throws (offline)', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network'));
    const v = await readMirrorVersion('https://www.daikonic.dev/curated', 'cdm');
    expect(v).toBeNull();
  });

  it('returns null on malformed JSON', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('not json'));
    const v = await readMirrorVersion('https://www.daikonic.dev/curated', 'cdm');
    expect(v).toBeNull();
  });

  it('returns null when version field is missing', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ schemaVersion: 1 })));
    const v = await readMirrorVersion('https://www.daikonic.dev/curated', 'cdm');
    expect(v).toBeNull();
  });

  it('respects an aborted signal', async () => {
    const ctl = new AbortController();
    fetchSpy.mockImplementation(async (_url, init) => {
      if ((init as RequestInit | undefined)?.signal?.aborted) {
        throw new DOMException('aborted', 'AbortError');
      }
      return new Response(JSON.stringify({ version: '2026-04-25' }));
    });
    ctl.abort();
    const v = await readMirrorVersion('https://www.daikonic.dev/curated', 'cdm', ctl.signal);
    expect(v).toBeNull();
  });
});
