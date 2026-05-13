// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi } from 'vitest';
import { onRequestPost } from '../api/parse.js';

function makeRequest(body: unknown): Request {
  return new Request('http://example.com/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

const SIMPLE_RUNE = 'namespace x\ntype T:\n  a string (1..1)\n';

describe('POST /api/parse', () => {
  it('returns 400 for malformed JSON', async () => {
    const req = new Request('http://example.com/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json'
    });
    const res = await onRequestPost({ request: req } as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when files is not an array', async () => {
    const res = await onRequestPost({ request: makeRequest({}) } as never);
    expect(res.status).toBe(400);
  });

  it('returns 200 with empty hydrationState when files [] + no curatedBundles', async () => {
    // The studio calls /api/parse on every debounced edit, including before
    // any user file exists in a freshly-opened workspace. Returning 400 here
    // forces the client to special-case empty input; 200-with-empty-state
    // keeps the parse pipeline uniform.
    const res = await onRequestPost({ request: makeRequest({ files: [] }) } as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; hydrationState: { documents: unknown[] } };
    expect(body.ok).toBe(true);
    expect(body.hydrationState.documents).toEqual([]);
  });

  it('returns 200 with ParseResponse shape on success', async () => {
    const res = await onRequestPost({
      request: makeRequest({ files: [{ name: 'x.rune', content: SIMPLE_RUNE }] })
    } as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      models: unknown[];
      // parsedModels is intentionally absent from the server response —
      // Langium ASTs have circular $container refs and cannot be JSON-serialized.
      // Task 0.5 rebuilds any model list client-side from hydrationState.documents.
      parsedModels?: undefined;
      deferredExports: unknown[];
      errors: Record<string, string[]>;
      hydrationState: {
        documents: Array<{
          uri: string;
          content: string;
          serializedModel: string;
          exports: Array<{ type: string; name: string; path: string }>;
        }>;
      };
    };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.models)).toBe(true);
    expect(body.parsedModels).toBeUndefined();
    expect(body.hydrationState).toBeDefined();
    expect(Array.isArray(body.hydrationState.documents)).toBe(true);
    expect(body.hydrationState.documents.length).toBeGreaterThan(0);
  });

  it('embeds exports inside each hydration document', async () => {
    const res = await onRequestPost({
      request: makeRequest({ files: [{ name: 'x.rune', content: SIMPLE_RUNE }] })
    } as never);
    const body = (await res.json()) as {
      hydrationState: { documents: Array<{ exports: Array<{ name: string; path: string }> }> };
    };
    const allExports = body.hydrationState.documents.flatMap((d) => d.exports);
    expect(allExports.some((e) => e.name === 'T')).toBe(true);
    expect(allExports.some((e) => e.path === 'x.T')).toBe(true);
  });

  it('returns errors field per filePath for parse failures', async () => {
    // 'namespace x\ntype Broken:' has a type declaration with no body.
    // Whether this produces a parser error depends on the Rune grammar; if the
    // empty-body case is accepted, fabricate a definitely-broken source instead.
    const broken = 'namespace x\ntype broken because (totally invalid syntax<<<';
    const res = await onRequestPost({
      request: makeRequest({ files: [{ name: 'broken.rune', content: broken }] })
    } as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { errors: Record<string, string[]> };
    expect(body.errors['broken.rune']).toBeDefined();
    expect(body.errors['broken.rune'].length).toBeGreaterThan(0);
  });
});

describe('POST /api/parse — curatedBundles', () => {
  it('accepts an empty curatedBundles array', async () => {
    const res = await onRequestPost({
      request: makeRequest({
        files: [{ name: 'x.rune', content: SIMPLE_RUNE }],
        curatedBundles: []
      })
    } as never);
    expect(res.status).toBe(200);
  });

  it('returns 502 with structured error when a curated bundle is unavailable', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('not found', { status: 404 }));
    try {
      const res = await onRequestPost({
        request: makeRequest({
          files: [{ name: 'x.rune', content: SIMPLE_RUNE }],
          curatedBundles: [{ id: 'cdm', version: 'latest' }]
        })
      } as never);
      expect(res.status).toBe(502);
      const body = (await res.json()) as { ok: boolean; error: string; bundleId?: string };
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/curated_bundle_unavailable/);
      expect(body.bundleId).toBe('cdm');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('merges curated bundle documents into hydrationState on success', async () => {
    // Spy on fetchCuratedBundle to return a synthetic doc set. The mock
    // returns bare-path URIs (matching the real curated-fetch contract); the
    // browser worker keys deferredModelJson off these via URI.parse().
    const curatedFetchModule = await import('../lib/curated-fetch.js');
    const spy = vi.spyOn(curatedFetchModule, 'fetchCuratedBundle').mockResolvedValue([
      {
        uri: 'cdm/base/math.rosetta',
        content: '', // archive may not include source; ok to be empty
        serializedModel: JSON.stringify({
          $type: 'RosettaModel',
          name: 'cdm.base.math',
          elements: [{ $type: 'Data', name: 'Quantity' }]
        }),
        exports: [{ type: 'Data', name: 'Quantity', path: 'cdm.base.math.Quantity' }]
      }
    ]);
    try {
      const res = await onRequestPost({
        request: makeRequest({
          files: [{ name: 'x.rune', content: SIMPLE_RUNE }],
          curatedBundles: [{ id: 'cdm', version: 'latest' }]
        })
      } as never);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        hydrationState: { documents: Array<{ uri: string; exports: Array<{ name: string }> }> };
      };
      // Should contain BOTH the user file and the corpus document, both as
      // bare paths so the browser worker's URI.parse(filePath).toString()
      // lookup matches what /api/parse and curated-fetch register under.
      const uris = body.hydrationState.documents.map((d) => d.uri);
      expect(uris).toContain('x.rune');
      expect(uris).toContain('cdm/base/math.rosetta');
      const corpusDoc = body.hydrationState.documents.find((d) => d.uri === 'cdm/base/math.rosetta');
      expect(corpusDoc?.exports.some((e) => e.name === 'Quantity')).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
