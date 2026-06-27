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

import { describe, it, expect, vi, afterEach } from 'vitest';
import JSZip from 'jszip';

afterEach(() => vi.restoreAllMocks());

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
      request: makeRequest({ files: [{ path: 'x.rune', content: ONE_NAMESPACE }], target: 'markdown' })
    } as never);
    expect(res.status).toBe(400);
    const body = await asJson(res);
    expect(body.error).toMatch(/'markdown' is not implemented/);
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

  // 019 Phase 0.5.5: Pages Function default flips to `layout: 'barrel'`
  // for Zod / TypeScript and `layout: 'single-file'` for JSON Schema
  // when the request body omits an explicit choice. The behavior
  // tested below describes the post-default-injection contract.

  it("Zod default ('barrel') for one namespace returns a zip with per-namespace + index + runtime sidecar", async () => {
    const res = await onRequestPost({
      request: makeRequest({
        files: [{ path: 'x.rune', content: ONE_NAMESPACE }],
        target: 'zod'
      })
    } as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    const buf = new Uint8Array(await res.arrayBuffer());
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual(['index.zod.ts', 'runtime.zod.ts', 'x.zod.ts']);
    // Per-namespace file now imports helpers from the sidecar, not inlines them.
    const perNs = await zip.files['x.zod.ts']!.async('string');
    expect(perNs).toMatch(/from '\.\/runtime\.zod\.js'/);
  });

  it("Zod default ('barrel') for two namespaces returns a zip with both + index + runtime", async () => {
    const res = await onRequestPost({
      request: makeRequest({ files: TWO_NAMESPACES, target: 'zod' })
    } as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    const buf = new Uint8Array(await res.arrayBuffer());
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual(['index.zod.ts', 'runtime.zod.ts', 'x.zod.ts', 'y.zod.ts']);
  });

  it("explicit `layout: 'per-namespace'` override is respected — returns just the per-namespace files", async () => {
    const res = await onRequestPost({
      request: makeRequest({
        files: TWO_NAMESPACES,
        target: 'zod',
        options: { zod: { layout: 'per-namespace' } }
      })
    } as never);
    expect(res.status).toBe(200);
    const buf = new Uint8Array(await res.arrayBuffer());
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files).sort();
    // No index/runtime sidecars — caller asked for per-namespace explicitly.
    expect(names).toEqual(['x.zod.ts', 'y.zod.ts']);
  });

  it('namespaces filter (§5.3) emits only the allowlisted namespace', async () => {
    const res = await onRequestPost({
      request: makeRequest({
        files: TWO_NAMESPACES,
        target: 'zod',
        options: { zod: { layout: 'per-namespace' } },
        namespaces: ['x']
      })
    } as never);
    expect(res.status).toBe(200);
    // Only x survives → single artifact (not a zip).
    expect(res.headers.get('Content-Disposition')).toMatch(/x\.zod\.ts/);
    const text = await res.text();
    expect(text).toContain('export const');
  });

  it('namespaces filter keeps both when both are allowlisted', async () => {
    const res = await onRequestPost({
      request: makeRequest({
        files: TWO_NAMESPACES,
        target: 'zod',
        options: { zod: { layout: 'per-namespace' } },
        namespaces: ['x', 'y']
      })
    } as never);
    expect(res.status).toBe(200);
    const buf = new Uint8Array(await res.arrayBuffer());
    const zip = await JSZip.loadAsync(buf);
    expect(Object.keys(zip.files).sort()).toEqual(['x.zod.ts', 'y.zod.ts']);
  });

  it('rejects a non-array namespaces field with 400', async () => {
    const res = await onRequestPost({
      request: makeRequest({
        files: TWO_NAMESPACES,
        target: 'zod',
        namespaces: 'x' as unknown as string[]
      })
    } as never);
    expect(res.status).toBe(400);
  });

  it("JSON Schema default ('single-file') returns one bundled model.schema.json", async () => {
    const res = await onRequestPost({
      request: makeRequest({
        files: TWO_NAMESPACES,
        target: 'json-schema'
      })
    } as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toMatch(/model\.schema\.json/);
    const text = await res.text();
    const parsed = JSON.parse(text) as { $defs: Record<string, unknown> };
    // Both namespaces folded into a single $defs map.
    expect(parsed.$defs).toHaveProperty('x.T');
    expect(parsed.$defs).toHaveProperty('y.U');
  });

  it("explicit `layout: 'per-namespace'` for JSON Schema returns separate files", async () => {
    const res = await onRequestPost({
      request: makeRequest({
        files: TWO_NAMESPACES,
        target: 'json-schema',
        options: { 'json-schema': { layout: 'per-namespace' } }
      })
    } as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    const buf = new Uint8Array(await res.arrayBuffer());
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual(['x.schema.json', 'y.schema.json']);
  });
});

// 019 Task #88 — curated-bundle hydration through /api/codegen.
// Mock `fetchCuratedBundle` to return pre-serialized Langium models
// built in-test from real Rune source. This exercises the
// deserialize-and-codegen path without depending on the live curated
// mirror.
describe('POST /api/codegen — curated bundles (019 Task #88)', () => {
  async function buildSerializedCuratedDoc(
    uri: string,
    source: string
  ): Promise<{
    uri: string;
    content: string;
    serializedModel: string;
    exports: Array<{ type: string; name: string; path: string }>;
  }> {
    const { createRuneDslServices } = await import('@rune-langium/core');
    const { URI } = await import('langium');
    const { RuneDsl } = createRuneDslServices();
    const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(source, URI.parse(`inmemory:///${uri}`));
    await RuneDsl.shared.workspace.DocumentBuilder.build([doc], { validation: false });
    const serializedModel = RuneDsl.serializer.JsonSerializer.serialize(doc.parseResult.value, {
      refText: true,
      textRegions: true
    });
    return { uri, content: '', serializedModel, exports: [] };
  }

  it('hydrates curated bundles and generates output alongside user files', async () => {
    const curatedDoc = await buildSerializedCuratedDoc(
      'cdm/base/math.rosetta',
      `namespace cdm.base.math

type Quantity:
  amount number (1..1)
  currency string (0..1)
`
    );
    const mod = await import('../lib/curated-fetch.js');
    const V = '2026-05-22';
    vi.spyOn(mod, 'fetchCuratedManifest').mockResolvedValue({
      schemaVersion: 2, modelId: 'cdm', version: V,
      sha256: 'a'.repeat(64), sizeBytes: 1, generatedAt: 'now', upstreamCommit: 'c', upstreamRef: 'r',
      archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz', history: [],
      namespaces: {
        'cdm.base.math': { deps: [], exports: [{ type: 'Data', name: 'Quantity' }], artifact: `artifacts/${V}/ns/cdm.base.math.json.gz` }
      }
    } as never);
    vi.spyOn(mod, 'fetchCuratedNamespace').mockResolvedValue([curatedDoc]);

    const res = await onRequestPost({
      request: makeRequest({
        files: [], // pure curated workspace — no user-authored files
        target: 'zod',
        curatedBundles: [{ id: 'cdm', version: 'latest' }],
        namespaces: ['cdm.base.math']
      })
    } as never);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    const buf = new Uint8Array(await res.arrayBuffer());
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files).sort();
    // Zod default for /api/codegen is 'barrel' → per-ns + index + runtime.
    expect(names).toContain('cdm/base/math.zod.ts');
    expect(names).toContain('index.zod.ts');
    expect(names).toContain('runtime.zod.ts');
    const namespaceFile = await zip.files['cdm/base/math.zod.ts']!.async('string');
    expect(namespaceFile).toMatch(/QuantitySchema/);
  });

  it('combines user files and curated bundles in one generation', async () => {
    const curatedDoc = await buildSerializedCuratedDoc(
      'cdm/base/math.rosetta',
      'namespace cdm.base.math\n\ntype Quantity:\n  amount number (1..1)\n'
    );
    const mod = await import('../lib/curated-fetch.js');
    const V = '2026-05-22';
    vi.spyOn(mod, 'fetchCuratedManifest').mockResolvedValue({
      schemaVersion: 2, modelId: 'cdm', version: V,
      sha256: 'a'.repeat(64), sizeBytes: 1, generatedAt: 'now', upstreamCommit: 'c', upstreamRef: 'r',
      archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz', history: [],
      namespaces: {
        'cdm.base.math': { deps: [], exports: [{ type: 'Data', name: 'Quantity' }], artifact: `artifacts/${V}/ns/cdm.base.math.json.gz` }
      }
    } as never);
    vi.spyOn(mod, 'fetchCuratedNamespace').mockResolvedValue([curatedDoc]);

    const res = await onRequestPost({
      request: makeRequest({
        // user file imports cdm.base.math so it becomes a closure seed
        files: [{ path: 'user.rune', content: 'namespace user\nimport cdm.base.math\n\ntype Trade:\n  id string (1..1)\n' }],
        target: 'json-schema',
        options: { 'json-schema': { layout: 'single-file' } },
        curatedBundles: [{ id: 'cdm', version: 'latest' }]
      })
    } as never);

    expect(res.status).toBe(200);
    const text = await res.text();
    const parsed = JSON.parse(text) as { $defs: Record<string, unknown> };
    // Both the user namespace AND the curated namespace appear under $defs.
    expect(parsed.$defs).toHaveProperty('user.Trade');
    expect(parsed.$defs).toHaveProperty('cdm.base.math.Quantity');
  });

  it('returns 400 when both files and curatedBundles are empty', async () => {
    const res = await onRequestPost({
      request: makeRequest({ files: [], target: 'zod', curatedBundles: [] })
    } as never);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/files \/ curatedBundles/);
  });

  // Copilot review on PR #168 — malformed curatedBundles used to pass
  // the validator (which only checked files / target) and crash later
  // in `fetchCuratedBundle(undefined, undefined)`. Now the validator
  // rejects with a structured 400.
  it('returns 400 when `curatedBundles` is malformed', async () => {
    const res = await onRequestPost({
      request: makeRequest({
        files: [],
        target: 'zod',
        curatedBundles: 'cdm' // not an array
      })
    } as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when a curatedBundles entry is missing `version`', async () => {
    const res = await onRequestPost({
      request: makeRequest({
        files: [],
        target: 'zod',
        curatedBundles: [{ id: 'cdm' /* missing version */ }]
      })
    } as never);
    expect(res.status).toBe(400);
  });

  it('returns 502 with curated_bundle_unavailable when fetch fails', async () => {
    const { CuratedBundleUnavailableError } = await import('../lib/curated-fetch.js');
    const mod = await import('../lib/curated-fetch.js');
    vi.spyOn(mod, 'fetchCuratedManifest').mockRejectedValue(new CuratedBundleUnavailableError('cdm', 'latest', 404));

    const res = await onRequestPost({
      request: makeRequest({
        files: [],
        target: 'zod',
        curatedBundles: [{ id: 'cdm', version: 'latest' }]
      })
    } as never);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error?: string; bundleId?: string };
    expect(body.error).toBe('curated_bundle_unavailable');
    expect(body.bundleId).toBe('cdm');
  });

  // ── Path C: closure-scoped curated load (Task 1 of the OOM fix) ─────────
  // These tests lock the new manifest-based fetch path introduced to replace
  // the whole-bundle `fetchCuratedBundle` call that caused the 128 MB OOM.

  const CG_VERSION = '2026-05-22';
  const CG_MANIFEST = {
    schemaVersion: 2, modelId: 'cdm', version: CG_VERSION,
    sha256: 'a'.repeat(64), sizeBytes: 1, generatedAt: 'now', upstreamCommit: 'c', upstreamRef: 'r',
    archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz', history: [],
    namespaces: {
      'cdm.base.math': { deps: [], exports: [{ type: 'Data', name: 'Quantity' }], artifact: `artifacts/${CG_VERSION}/ns/cdm.base.math.json.gz` },
      'cdm.other': { deps: [], exports: [{ type: 'Data', name: 'Unrelated' }], artifact: `artifacts/${CG_VERSION}/ns/cdm.other.json.gz` }
    }
  };
  function cgSM(name: string, importNs: string[] = []): string {
    return JSON.stringify({ $type: 'RosettaModel', name, imports: importNs.map((ns) => ({ importedNamespace: ns })), elements: [] });
  }
  const CG_NS_DOCS: Record<string, Array<{ uri: string; content: string; serializedModel: string; exports: Array<{ type: string; name: string; path: string }> }>> = {
    'cdm.base.math': [{ uri: 'cdm/base/math.rosetta', content: '', serializedModel: cgSM('cdm.base.math'), exports: [{ type: 'Data', name: 'Quantity', path: 'cdm.base.math.Quantity' }] }],
    'cdm.other': [{ uri: 'cdm/other/other.rosetta', content: '', serializedModel: cgSM('cdm.other'), exports: [{ type: 'Data', name: 'Unrelated', path: 'cdm.other.Unrelated' }] }]
  };

  it('path C: closure-scoped curated load — whole-bundle never fetched, unrelated ns skipped', async () => {
    const mod = await import('../lib/curated-fetch.js');
    vi.spyOn(mod, 'fetchCuratedManifest').mockResolvedValue(CG_MANIFEST as never);
    vi.spyOn(mod, 'fetchCuratedNamespace').mockImplementation(async (_id, _v, artifactKey) => {
      const ns = Object.keys(CG_NS_DOCS).find((n) => artifactKey.includes(`/ns/${n}.json.gz`));
      return ns ? CG_NS_DOCS[ns] : [];
    });
    const bundleSpy = vi.spyOn(mod, 'fetchCuratedBundle');

    const res = await onRequestPost({
      request: new Request('http://x/api/codegen', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: [{ path: 'app.rune', content: 'namespace app\nimport cdm.base.math\n' }],
          target: 'typescript',
          curatedBundles: [{ id: 'cdm', version: 'latest' }]
        })
      }),
      env: {}
    } as never);

    expect(bundleSpy).not.toHaveBeenCalled();
    const arts: string[] = (mod.fetchCuratedNamespace as ReturnType<typeof vi.spyOn>).mock.calls.map((c: unknown[]) => c[2] as string);
    expect(arts.some((a: string) => a.includes('/ns/cdm.base.math.json.gz'))).toBe(true);
    expect(arts.some((a: string) => a.includes('/ns/cdm.other.json.gz'))).toBe(false); // unrelated → not loaded
    expect(res.status).not.toBe(503);
  });

  it('path C: missing manifest namespaces → 502 (no whole-bundle fallback)', async () => {
    const mod = await import('../lib/curated-fetch.js');
    vi.spyOn(mod, 'fetchCuratedManifest').mockResolvedValue({ ...CG_MANIFEST, namespaces: {} } as never);
    const bundleSpy = vi.spyOn(mod, 'fetchCuratedBundle');
    const res = await onRequestPost({
      request: new Request('http://x/api/codegen', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: [{ path: 'app.rune', content: 'namespace app\nimport cdm.base.math\n' }], target: 'typescript', curatedBundles: [{ id: 'cdm', version: 'latest' }] })
      }), env: {}
    } as never);
    expect(res.status).toBe(502);
    expect(bundleSpy).not.toHaveBeenCalled();
  });

  // ── Path A: accept pre-loaded serialized curatedDocs (Task 2) ───────────
  // When the client sends pre-loaded docs, the server must deserialize them
  // directly and perform NO manifest/namespace fetch at all.

  it('path A: deserializes provided curatedDocs without any fetch', async () => {
    const mod = await import('../lib/curated-fetch.js');
    const manifestSpy = vi.spyOn(mod, 'fetchCuratedManifest');
    const nsSpy = vi.spyOn(mod, 'fetchCuratedNamespace');
    const bundleSpy = vi.spyOn(mod, 'fetchCuratedBundle');

    const res = await onRequestPost({
      request: new Request('http://x/api/codegen', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: [{ path: 'app.rune', content: 'namespace app\nimport cdm.base.math\n' }],
          target: 'typescript',
          curatedDocs: [{ uri: 'cdm/base/math.rosetta', serializedModel: cgSM('cdm.base.math') }]
        })
      }), env: {}
    } as never);

    expect(res.status).not.toBe(503);
    expect(manifestSpy).not.toHaveBeenCalled();
    expect(nsSpy).not.toHaveBeenCalled();
    expect(bundleSpy).not.toHaveBeenCalled();
  });
});
