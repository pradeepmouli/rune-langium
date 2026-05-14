// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Unit tests for `/api/codegen` (018 Phase 0 Tasks 0.10/0.11).
 *
 * Exercise the request/response contract from spec §7.6:
 *   - 400 envelopes for malformed input, missing target, unimplemented
 *     target, empty files array, parse errors.
 *   - 200 single-file response when generation produces one output.
 *   - 200 zip response when generation produces multiple outputs.
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { onRequestPost } from '../api/codegen.js';

function makeRequest(body: unknown): Request {
  return new Request('http://example.com/api/codegen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

const ONE_NAMESPACE = 'namespace x\ntype T:\n  a string (1..1)\n';
const TWO_NAMESPACES = [
  { path: 'x.rune', content: 'namespace x\ntype T:\n  a string (1..1)\n' },
  { path: 'y.rune', content: 'namespace y\ntype U:\n  b number (1..1)\n' }
];

async function asJson(res: Response): Promise<{ ok?: boolean; error?: string; diagnostics?: unknown[] }> {
  return (await res.json()) as { ok?: boolean; error?: string; diagnostics?: unknown[] };
}

describe('POST /api/codegen', () => {
  it('returns 400 for malformed JSON', async () => {
    const res = await onRequestPost({ request: makeRequest('{not json') } as never);
    expect(res.status).toBe(400);
    const body = await asJson(res);
    expect(body.error).toMatch(/Malformed JSON/i);
  });

  it('returns 400 when body is not the expected shape', async () => {
    const res = await onRequestPost({ request: makeRequest({}) } as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when target is not implemented in this build', async () => {
    const res = await onRequestPost({
      request: makeRequest({ files: [{ path: 'x.rune', content: ONE_NAMESPACE }], target: 'sql' })
    } as never);
    expect(res.status).toBe(400);
    const body = await asJson(res);
    expect(body.error).toMatch(/'sql' is not implemented/);
  });

  it('returns 400 when files array is empty', async () => {
    const res = await onRequestPost({
      request: makeRequest({ files: [], target: 'zod' })
    } as never);
    expect(res.status).toBe(400);
    const body = await asJson(res);
    expect(body.error).toMatch(/non-empty/);
  });

  it('returns 400 with parser diagnostics when a file fails to parse', async () => {
    const res = await onRequestPost({
      request: makeRequest({
        files: [{ path: 'broken.rune', content: 'this is not valid rune syntax @@@' }],
        target: 'zod'
      })
    } as never);
    expect(res.status).toBe(400);
    const body = await asJson(res);
    expect(body.diagnostics?.length).toBeGreaterThan(0);
  });

  it('returns 200 with a single text artifact when one namespace is parsed', async () => {
    const res = await onRequestPost({
      request: makeRequest({
        files: [{ path: 'x.rune', content: ONE_NAMESPACE }],
        target: 'zod'
      })
    } as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/text\/plain/);
    expect(res.headers.get('Content-Disposition')).toMatch(/attachment; filename="x\.zod\.ts"/);
    const text = await res.text();
    expect(text).toMatch(/import \{ z \} from 'zod'/);
  });

  it('returns 200 with a zip when multiple namespaces are parsed', async () => {
    const res = await onRequestPost({
      request: makeRequest({ files: TWO_NAMESPACES, target: 'zod' })
    } as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    expect(res.headers.get('Content-Disposition')).toMatch(/zod-output\.zip/);
    const buf = new Uint8Array(await res.arrayBuffer());
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual(['x.zod.ts', 'y.zod.ts']);
    const xText = await zip.files['x.zod.ts']!.async('string');
    expect(xText).toMatch(/import \{ z \} from 'zod'/);
  });

  it('uses the target-specific extension in single-namespace filename', async () => {
    const res = await onRequestPost({
      request: makeRequest({
        files: [{ path: 'x.rune', content: ONE_NAMESPACE }],
        target: 'json-schema'
      })
    } as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toMatch(/x\.schema\.json/);
  });
});
