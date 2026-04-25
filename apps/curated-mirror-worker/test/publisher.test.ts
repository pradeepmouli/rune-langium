// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T025 — curated-mirror publisher contract tests.
 *
 * Asserts the publisher:
 *  - downloads each source from codeload.github.com/{owner}/{repo}/tar.gz/refs/heads/{ref}
 *  - uploads to R2 at archives/<yyyy-mm-dd>.tar.gz AND latest.tar.gz
 *  - writes a manifest.json conforming to contracts/curated-mirror-http.md
 *  - prunes the archive history to the latest 14 entries per modelId
 *
 * Uses an in-memory R2 mock + a fetch spy. Principle II compliant: no
 * network access; all bytes come from a vendored fixture stub.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { publishCuratedMirrors, type CuratedSource } from '../src/publisher.js';
import { createMockR2Bucket, type MockR2Bucket } from './setup/r2-mock.js';

const SOURCES: CuratedSource[] = [
  { id: 'cdm', owner: 'REGnosys', repo: 'rosetta-cdm', ref: 'master' },
  { id: 'fpml', owner: 'finos', repo: 'rune-fpml', ref: 'main' }
];

function makeFakeArchive(payload: string): Uint8Array {
  // Doesn't have to be a real tar.gz — the publisher is a byte-stream
  // pass-through. We only need stable SHA-256s.
  return new TextEncoder().encode(payload);
}

describe('publishCuratedMirrors (T025)', () => {
  let bucket: MockR2Bucket;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    bucket = createMockR2Bucket();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('rosetta-cdm')) {
        return new Response(makeFakeArchive('cdm-bytes'), { status: 200 });
      }
      if (u.includes('rune-fpml')) {
        return new Response(makeFakeArchive('fpml-bytes'), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });
  });

  it('downloads each source from the codeload archive endpoint', async () => {
    await publishCuratedMirrors({ sources: SOURCES, bucket, retention: 14 });
    const urls = fetchSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(urls).toContain(
      'https://codeload.github.com/REGnosys/rosetta-cdm/tar.gz/refs/heads/master'
    );
    expect(urls).toContain('https://codeload.github.com/finos/rune-fpml/tar.gz/refs/heads/main');
  });

  it('uploads each archive at archives/<date>.tar.gz AND latest.tar.gz', async () => {
    await publishCuratedMirrors({ sources: SOURCES, bucket, retention: 14 });
    const today = new Date().toISOString().slice(0, 10);
    expect(bucket.has(`curated/cdm/archives/${today}.tar.gz`)).toBe(true);
    expect(bucket.has('curated/cdm/latest.tar.gz')).toBe(true);
    expect(bucket.has(`curated/fpml/archives/${today}.tar.gz`)).toBe(true);
    expect(bucket.has('curated/fpml/latest.tar.gz')).toBe(true);
  });

  it('writes a manifest.json conforming to the documented schema', async () => {
    await publishCuratedMirrors({ sources: SOURCES, bucket, retention: 14 });
    const manifest = JSON.parse(await bucket.getText('curated/cdm/manifest.json'));
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      modelId: 'cdm',
      version: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      sizeBytes: expect.any(Number),
      generatedAt: expect.any(String),
      upstreamRef: 'master',
      archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz'
    });
    expect(Array.isArray(manifest.history)).toBe(true);
  });

  it('caps history to the configured retention', async () => {
    // Pre-seed 16 historical archives.
    for (let i = 0; i < 16; i++) {
      const day = `2026-04-${String(i + 1).padStart(2, '0')}`;
      await bucket.put(`curated/cdm/archives/${day}.tar.gz`, new Uint8Array([i]));
    }
    await publishCuratedMirrors({ sources: [SOURCES[0]!], bucket, retention: 14 });
    // After publish there should be at most 14 archives left.
    const remaining = bucket.list('curated/cdm/archives/');
    expect(Array.isArray(remaining)).toBe(true);
    expect((remaining as string[]).length).toBeLessThanOrEqual(14);
  });

  it('continues when one source fails — publishes the others', async () => {
    fetchSpy.mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (u.includes('rosetta-cdm')) return new Response('boom', { status: 500 });
      return new Response(makeFakeArchive('fpml-bytes'), { status: 200 });
    });
    const result = await publishCuratedMirrors({ sources: SOURCES, bucket, retention: 14 });
    expect(result.published).toContain('fpml');
    expect(result.failed).toContain('cdm');
    expect(bucket.has('curated/fpml/latest.tar.gz')).toBe(true);
    expect(bucket.has('curated/cdm/latest.tar.gz')).toBe(false);
  });
});
