// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T027 — curated-mirror read-side HTTP contract tests.
 * Validates the routes documented in contracts/curated-mirror-http.md
 * against the in-memory R2 mock from T026.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleCuratedRead } from '../src/http.js';
import { createMockR2Bucket, type MockR2Bucket } from './setup/r2-mock.js';
import type { Env } from '../src/index.js';

let bucket: MockR2Bucket;
let env: Env;

beforeEach(async () => {
  bucket = createMockR2Bucket();
  env = {
    rune_curated_mirror: bucket as unknown as R2Bucket,
    CURATED_SOURCES: '[]',
    RETENTION: { ARCHIVES_PER_MODEL: '14' }
  };
});

async function get(path: string, headers?: HeadersInit): Promise<Response> {
  const req = new Request(`https://www.daikonic.dev${path}`, {
    method: 'GET',
    headers
  });
  return handleCuratedRead(req, env);
}

async function head(path: string): Promise<Response> {
  return handleCuratedRead(new Request(`https://www.daikonic.dev${path}`, { method: 'HEAD' }), env);
}

describe('handleCuratedRead — manifest.json (T027)', () => {
  it('returns 200 with the manifest body and Cache-Control', async () => {
    await bucket.put(
      'curated/cdm/manifest.json',
      JSON.stringify({ schemaVersion: 1, modelId: 'cdm' })
    );
    const res = await get('/curated/cdm/manifest.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toMatch(/max-age=300/);
    expect(res.headers.get('Content-Type')).toMatch(/application\/json/);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://www.daikonic.dev');
    expect(res.headers.get('ETag')).toBeTruthy();
    const body = await res.json();
    expect((body as { modelId: string }).modelId).toBe('cdm');
  });

  it('returns 404 for an unknown modelId', async () => {
    const res = await get('/curated/notreal/manifest.json');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('unknown_model_id');
  });

  it('returns 404 when modelId is known but the manifest is not in R2', async () => {
    const res = await get('/curated/cdm/manifest.json');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('archive_not_found');
  });
});

describe('handleCuratedRead — latest.tar.gz', () => {
  it('streams bytes with Content-Length and immutable cache headers', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    await bucket.put('curated/cdm/latest.tar.gz', bytes);
    const res = await get('/curated/cdm/latest.tar.gz');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toMatch(/immutable/);
    expect(res.headers.get('Content-Type')).toMatch(/application\/gzip/);
    const body = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(body)).toEqual([1, 2, 3, 4, 5]);
  });

  it('HEAD does not return a body but keeps Content-Type', async () => {
    await bucket.put('curated/cdm/latest.tar.gz', new Uint8Array(8));
    const res = await head('/curated/cdm/latest.tar.gz');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/application\/gzip/);
    const body = await res.arrayBuffer();
    expect(body.byteLength).toBe(0);
  });
});

describe('handleCuratedRead — historical archives + method enforcement', () => {
  it('serves an archive at the date-stamped path', async () => {
    await bucket.put('curated/fpml/archives/2026-04-24.tar.gz', new Uint8Array([9]));
    const res = await get('/curated/fpml/archives/2026-04-24.tar.gz');
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())[0]).toBe(9);
  });

  it('rejects POST with 405', async () => {
    const res = await handleCuratedRead(
      new Request('https://www.daikonic.dev/curated/cdm/manifest.json', { method: 'POST' }),
      env
    );
    expect(res.status).toBe(405);
  });

  it('returns 404 for paths outside /curated/<model>/...', async () => {
    const res = await get('/curated/');
    expect(res.status).toBe(404);
  });
});
