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
import { gzip } from 'pako';
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

function buildHeader(name: string, typeflag: string, size = 0): Uint8Array {
  const block = new Uint8Array(512);
  const encoder = new TextEncoder();
  block.set(encoder.encode(name).subarray(0, Math.min(name.length, 100)), 0);
  block.set(encoder.encode('0000644\0'), 100);
  block.set(encoder.encode('0000000\0'), 108);
  block.set(encoder.encode('0000000\0'), 116);
  block.set(encoder.encode(size.toString(8).padStart(11, '0') + '\0'), 124);
  block.set(encoder.encode('00000000000\0'), 136);
  for (let i = 148; i < 156; i++) block[i] = 0x20;
  block[156] = typeflag.charCodeAt(0);
  block.set(encoder.encode('ustar\0'), 257);
  block.set(encoder.encode('00'), 263);
  return block;
}

function packTar(...entries: Array<{ path: string; content: string }>): Uint8Array {
  const encoder = new TextEncoder();
  const blocks: Uint8Array[] = [];
  for (const entry of entries) {
    const data = encoder.encode(entry.content);
    blocks.push(buildHeader(entry.path, '0', data.length));
    const padded = new Uint8Array(Math.ceil(data.length / 512) * 512);
    padded.set(data, 0);
    blocks.push(padded);
  }
  blocks.push(new Uint8Array(512), new Uint8Array(512));
  const merged = new Uint8Array(blocks.reduce((sum, block) => sum + block.length, 0));
  let offset = 0;
  for (const block of blocks) {
    merged.set(block, offset);
    offset += block.length;
  }
  return gzip(merged);
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
    // After publish there should be exactly 14 archives left (today + 13 most recent).
    const remaining = bucket.keys('curated/cdm/archives/');
    expect(remaining.length).toBe(14);
    // Verify the kept set is the chronological tail, not a random selection.
    const kept = remaining
      .map((k) => k.replace('curated/cdm/archives/', '').replace('.tar.gz', ''))
      .sort();
    expect(kept[0]).toBe('2026-04-04'); // 13 most-recent of seeded `01..16` is `04..16`
    expect(kept).toContain(new Date().toISOString().slice(0, 10));
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

  it('publishes a serialized workspace artifact when the archive contains .rosetta files', async () => {
    fetchSpy.mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (!u.includes('rosetta-cdm')) return new Response('not found', { status: 404 });
      return new Response(
        packTar(
          {
            path: 'rosetta-cdm-master/types.rosetta',
            content: `namespace demo

type Person:
  name string (1..1)
`
          },
          {
            path: 'rosetta-cdm-master/trade.rosetta',
            content: `namespace demo

type Trade:
  party Person (1..1)
`
          }
        ),
        { status: 200 }
      );
    });

    await publishCuratedMirrors({ sources: [SOURCES[0]!], bucket, retention: 14 });

    expect(bucket.has('curated/cdm/latest.serialized.json.gz')).toBe(true);
    expect(
      bucket.has(
        `curated/cdm/artifacts/${new Date().toISOString().slice(0, 10)}.serialized.json.gz`
      )
    ).toBe(true);
    const manifest = JSON.parse(await bucket.getText('curated/cdm/manifest.json'));
    expect(manifest.artifacts?.serializedWorkspace).toMatchObject({
      schemaVersion: 1,
      kind: 'langium-json-serializer',
      url: 'https://www.daikonic.dev/curated/cdm/latest.serialized.json.gz',
      documentCount: 2,
      langiumVersion: '4.2.2'
    });
  });
});
