// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
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

  it('returns 400 when files array is missing or empty', async () => {
    const res1 = await onRequestPost({ request: makeRequest({ files: [] }) } as never);
    expect(res1.status).toBe(400);
    const res2 = await onRequestPost({ request: makeRequest({}) } as never);
    expect(res2.status).toBe(400);
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
