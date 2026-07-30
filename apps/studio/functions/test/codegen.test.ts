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

import { onRequestPost, __resetDocumentCacheForTests, __documentCacheKeysForTests } from '../api/codegen.js';

// The module-scope document cache (issue #432) is real singleton state that
// persists across requests within a warm isolate — including, without this
// reset, across test CASES in this same process. Several tests below reuse
// the identical curatedBundles/namespaces combination with `files: []`;
// without clearing between tests an earlier test's cached documents would
// silently satisfy a later test, bypassing that test's own
// fetchCuratedManifest/fetchCuratedNamespace mocks.
afterEach(() => __resetDocumentCacheForTests());

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
      schemaVersion: 2,
      modelId: 'cdm',
      version: V,
      sha256: 'a'.repeat(64),
      sizeBytes: 1,
      generatedAt: 'now',
      upstreamCommit: 'c',
      upstreamRef: 'r',
      archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz',
      history: [],
      namespaces: {
        'cdm.base.math': {
          deps: [],
          exports: [{ type: 'Data', name: 'Quantity' }],
          artifact: `artifacts/${V}/ns/cdm.base.math.json.gz`
        }
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

  it('reuses the hydrated documents across requests for the SAME curated selection, even across different targets (issue #432)', async () => {
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
    const manifestSpy = vi.spyOn(mod, 'fetchCuratedManifest').mockResolvedValue({
      schemaVersion: 2,
      modelId: 'cdm',
      version: V,
      sha256: 'a'.repeat(64),
      sizeBytes: 1,
      generatedAt: 'now',
      upstreamCommit: 'c',
      upstreamRef: 'r',
      archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz',
      history: [],
      namespaces: {
        'cdm.base.math': {
          deps: [],
          exports: [{ type: 'Data', name: 'Quantity' }],
          artifact: `artifacts/${V}/ns/cdm.base.math.json.gz`
        }
      }
    } as never);
    const namespaceSpy = vi.spyOn(mod, 'fetchCuratedNamespace').mockResolvedValue([curatedDoc]);

    const request = (target: string, namespaces: string[]) =>
      onRequestPost({
        request: makeRequest({
          files: [],
          target,
          curatedBundles: [{ id: 'cdm', version: 'latest' }],
          namespaces
        })
      } as never);

    const first = await request('zod', ['cdm.base.math']);
    expect(first.status).toBe(200);
    expect(manifestSpy).toHaveBeenCalledTimes(1);
    expect(namespaceSpy).toHaveBeenCalledTimes(1);

    // Same curated selection, DIFFERENT target (the studio's Download modal
    // switching TypeScript → Zod for the same namespace closure) — must NOT
    // re-fetch the manifest or the namespace artifact; the cached documents
    // still feed a correct (target-specific) generate() output.
    const second = await request('json-schema', ['cdm.base.math']);
    expect(second.status).toBe(200);
    expect(manifestSpy).toHaveBeenCalledTimes(1);
    expect(namespaceSpy).toHaveBeenCalledTimes(1);
    const secondText = await second.text();
    expect(JSON.parse(secondText).$defs).toHaveProperty('cdm.base.math.Quantity');

    // A DIFFERENT namespace closure is a different cache key — must fetch
    // again, proving this isn't a blanket "skip fetching" bypass.
    manifestSpy.mockResolvedValue({
      schemaVersion: 2,
      modelId: 'cdm',
      version: V,
      sha256: 'a'.repeat(64),
      sizeBytes: 1,
      generatedAt: 'now',
      upstreamCommit: 'c',
      upstreamRef: 'r',
      archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz',
      history: [],
      namespaces: {
        'cdm.base.other': {
          deps: [],
          exports: [{ type: 'Data', name: 'Other' }],
          artifact: `artifacts/${V}/ns/cdm.base.other.json.gz`
        }
      }
    } as never);
    const otherDoc = await buildSerializedCuratedDoc(
      'cdm/base/other.rosetta',
      'namespace cdm.base.other\n\ntype Other:\n  value string (1..1)\n'
    );
    namespaceSpy.mockResolvedValue([otherDoc]);

    const third = await request('zod', ['cdm.base.other']);
    expect(third.status).toBe(200);
    expect(manifestSpy).toHaveBeenCalledTimes(2);
    expect(namespaceSpy).toHaveBeenCalledTimes(2);
  });

  it('does not collide the document cache key for differently-shaped namespace lists that stringify the same way (issue #432 round 1)', async () => {
    // `['cdm.a,cdm.b']` (one namespace whose name happens to contain a
    // comma) and `['cdm.a', 'cdm.b']` (two separate namespaces) must NOT
    // share a cache key — a string-concatenation key (`namespaces.sort().
    // join(',')`) produces the identical "cdm.a,cdm.b" for both, letting
    // the second, differently-shaped request incorrectly reuse the
    // first's (unrelated) cached documents.
    const mod = await import('../lib/curated-fetch.js');
    const manifestSpy = vi.spyOn(mod, 'fetchCuratedManifest').mockResolvedValue({
      schemaVersion: 2,
      modelId: 'cdm',
      version: 'v1',
      sha256: 'a'.repeat(64),
      sizeBytes: 1,
      generatedAt: 'now',
      upstreamCommit: 'c',
      upstreamRef: 'r',
      archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz',
      history: [],
      // A non-empty manifest that doesn't overlap the requested namespaces
      // at all — closureNs filters down to nothing either way, but the
      // manifest itself must be non-empty or loadAllDocuments short-
      // circuits with a curated_manifest_missing error BEFORE caching ever
      // runs, which would make this test pass for the wrong reason.
      namespaces: {
        'cdm.unrelated': { deps: [], exports: [], artifact: 'artifacts/v1/ns/unrelated.json.gz' }
      }
    } as never);

    const request = (namespaces: string[]) =>
      onRequestPost({
        request: makeRequest({
          files: [],
          target: 'zod',
          curatedBundles: [{ id: 'cdm', version: 'latest' }],
          namespaces
        })
      } as never);

    await request(['cdm.a,cdm.b']);
    expect(manifestSpy).toHaveBeenCalledTimes(1);

    await request(['cdm.a', 'cdm.b']);
    expect(manifestSpy).toHaveBeenCalledTimes(2);
  });

  it('evicts a mismatched cached entry BEFORE hydrating the new one, not after (issue #432 round 2)', async () => {
    // The cache cap is 1 entry. On a miss for a NEW key, the old (different-
    // key) entry must already be gone by the time hydration of the new
    // closure starts — evicting only AFTER the new documents finish loading
    // would let both closures stay resident simultaneously for the full
    // duration of that load, which is exactly the peak-memory moment a
    // one-entry cache exists to avoid.
    const mathDoc = await buildSerializedCuratedDoc(
      'cdm/base/math.rosetta',
      'namespace cdm.base.math\n\ntype Quantity:\n  amount number (1..1)\n'
    );
    const otherDoc = await buildSerializedCuratedDoc(
      'cdm/base/other.rosetta',
      'namespace cdm.base.other\n\ntype Other:\n  value string (1..1)\n'
    );
    const fetchMod = await import('../lib/curated-fetch.js');
    const V = '2026-05-22';
    let manifestCallCount = 0;
    let cacheKeysWhenSecondManifestFetchStarted: string[] | undefined;
    vi.spyOn(fetchMod, 'fetchCuratedManifest').mockImplementation(async (_id, _version) => {
      manifestCallCount += 1;
      // Capture cache state the instant hydration of the SECOND request's
      // manifest fetch begins — before this call resolves, so it reflects
      // whatever eviction already happened by request-handling time, not
      // anything this hydration itself might do.
      if (manifestCallCount === 2) {
        cacheKeysWhenSecondManifestFetchStarted = __documentCacheKeysForTests();
      }
      return {
        schemaVersion: 2,
        modelId: 'cdm',
        version: V,
        sha256: 'a'.repeat(64),
        sizeBytes: 1,
        generatedAt: 'now',
        upstreamCommit: 'c',
        upstreamRef: 'r',
        archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz',
        history: [],
        namespaces: {
          'cdm.base.math': { deps: [], exports: [], artifact: `artifacts/${V}/ns/cdm.base.math.json.gz` },
          'cdm.base.other': { deps: [], exports: [], artifact: `artifacts/${V}/ns/cdm.base.other.json.gz` }
        }
      } as never;
    });
    vi.spyOn(fetchMod, 'fetchCuratedNamespace').mockImplementation(async (_id, _version, artifactKey) =>
      artifactKey.includes('other') ? [otherDoc] : [mathDoc]
    );

    const request = (namespaces: string[]) =>
      onRequestPost({
        request: makeRequest({
          files: [],
          target: 'zod',
          curatedBundles: [{ id: 'cdm', version: 'latest' }],
          namespaces
        })
      } as never);

    const first = await request(['cdm.base.math']);
    expect(first.status).toBe(200);
    expect(__documentCacheKeysForTests()).toHaveLength(1);
    const firstKey = __documentCacheKeysForTests()[0];

    const second = await request(['cdm.base.other']);
    expect(second.status).toBe(200);

    // By the time the SECOND request's manifest fetch ran, the first
    // request's cache entry must already be gone — not merely absent
    // AFTER the second request finishes. (The cache now registers the
    // hydration PROMISE synchronously before awaiting it, so the second
    // request's OWN key is already present at this point too — the
    // invariant under test is "the stale FIRST key is gone", not "the
    // cache is empty".)
    expect(cacheKeysWhenSecondManifestFetchStarted).not.toContain(firstKey);
    expect(__documentCacheKeysForTests()).not.toContain(firstKey);
  });

  it('prunes an expired entry even when the CURRENT request is not itself cacheable (issue #432 round 2)', async () => {
    const curatedDoc = await buildSerializedCuratedDoc(
      'cdm/base/math.rosetta',
      'namespace cdm.base.math\n\ntype Quantity:\n  amount number (1..1)\n'
    );
    const fetchMod = await import('../lib/curated-fetch.js');
    const V = '2026-05-22';
    vi.spyOn(fetchMod, 'fetchCuratedManifest').mockResolvedValue({
      schemaVersion: 2,
      modelId: 'cdm',
      version: V,
      sha256: 'a'.repeat(64),
      sizeBytes: 1,
      generatedAt: 'now',
      upstreamCommit: 'c',
      upstreamRef: 'r',
      archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz',
      history: [],
      namespaces: {
        'cdm.base.math': { deps: [], exports: [], artifact: `artifacts/${V}/ns/cdm.base.math.json.gz` }
      }
    } as never);
    vi.spyOn(fetchMod, 'fetchCuratedNamespace').mockResolvedValue([curatedDoc]);

    const dateSpy = vi.spyOn(Date, 'now');
    const t0 = 1_700_000_000_000;
    dateSpy.mockReturnValue(t0);

    const cacheableRes = await onRequestPost({
      request: makeRequest({
        files: [],
        target: 'zod',
        curatedBundles: [{ id: 'cdm', version: 'latest' }],
        namespaces: ['cdm.base.math']
      })
    } as never);
    expect(cacheableRes.status).toBe(200);
    expect(__documentCacheKeysForTests()).toHaveLength(1);

    // Six minutes later (past the 5-minute TTL) — a request that is NOT
    // itself cacheable (carries a user file, so cacheKey is undefined).
    dateSpy.mockReturnValue(t0 + 6 * 60 * 1000);
    const nonCacheableRes = await onRequestPost({
      request: makeRequest({
        files: [{ path: 'user.rune', content: ONE_NAMESPACE }],
        target: 'zod'
      })
    } as never);
    expect(nonCacheableRes.status).toBe(200);

    // The expired entry must be pruned regardless — this request never
    // touched `cacheKey`/`.set()` at all, so this only passes if pruning
    // runs unconditionally rather than being gated on THIS request being
    // cacheable.
    expect(__documentCacheKeysForTests()).toHaveLength(0);

    dateSpy.mockRestore();
  });

  it('re-enforces the one-entry cap when two concurrent requests for DIFFERENT keys both observe a miss (issue #432 round 3)', async () => {
    // The pre-hydration `documentCache.clear()` only protects a SINGLE
    // request's own miss. Two requests racing on the same warm isolate for
    // DIFFERENT curated selections each see an empty/mismatched cache and
    // each register their OWN entry — without a post-insert re-prune this
    // would leave BOTH entries resident. (Since round 7, B's actual
    // hydration work is additionally serialized behind A's — see the
    // dedicated round-7 test below — so B's `fetchCuratedManifest` call
    // itself only fires after A settles; the cap invariant this test
    // checks holds regardless of that ordering.)
    const mathDoc = await buildSerializedCuratedDoc(
      'cdm/base/math.rosetta',
      'namespace cdm.base.math\n\ntype Quantity:\n  amount number (1..1)\n'
    );
    const otherDoc = await buildSerializedCuratedDoc(
      'cdm/base/other.rosetta',
      'namespace cdm.base.other\n\ntype Other:\n  value string (1..1)\n'
    );
    const fetchMod = await import('../lib/curated-fetch.js');
    const V = '2026-05-22';

    // Each fetchCuratedManifest call gets its OWN externally-resolvable
    // deferred, in call order — lets the test control exactly when each
    // concurrent request's hydration resumes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deferreds: Array<(value: any) => void> = [];
    vi.spyOn(fetchMod, 'fetchCuratedManifest').mockImplementation(
      () => new Promise((resolve) => deferreds.push(resolve))
    );
    vi.spyOn(fetchMod, 'fetchCuratedNamespace').mockImplementation(async (_id, _version, artifactKey) =>
      artifactKey.includes('other') ? [otherDoc] : [mathDoc]
    );

    const request = (namespaces: string[]) =>
      onRequestPost({
        request: makeRequest({
          files: [],
          target: 'zod',
          curatedBundles: [{ id: 'cdm', version: 'latest' }],
          namespaces
        })
      } as never);

    // Start BOTH requests without awaiting between them.
    const responseA = request(['cdm.base.math']);
    const responseB = request(['cdm.base.other']);

    // Flush the event loop (request.json() → validation → loadAllDocuments's
    // Promise.all imports → fetchCuratedManifest) until A has reached its
    // manifest fetch and suspended on our deferred. B's registration (the
    // synchronous get/clear/set) has already run by this point too — it
    // evicted A's entry from the map and registered its own — but B's
    // ACTUAL hydration work is chained behind A's promise (round 7), so
    // only ONE `fetchCuratedManifest` call exists yet, not two.
    for (let i = 0; i < 50 && deferreds.length < 1; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(deferreds).toHaveLength(1);

    const manifest = (nsKey: string) => ({
      schemaVersion: 2,
      modelId: 'cdm',
      version: V,
      sha256: 'a'.repeat(64),
      sizeBytes: 1,
      generatedAt: 'now',
      upstreamCommit: 'c',
      upstreamRef: 'r',
      archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz',
      history: [],
      namespaces: {
        [nsKey]: { deps: [], exports: [], artifact: `artifacts/${V}/ns/${nsKey}.json.gz` }
      }
    });

    // Resolve A and let it fully finish first — this is what unblocks B's
    // chained hydration, not B's own `.set()` (that already happened when
    // B registered, evicting A's entry from the map before A ever
    // resolved).
    deferreds[0]!(manifest('cdm.base.math') as never);
    const resA = await responseA;
    expect(resA.status).toBe(200);
    // B's registration is the sole resident here — it evicted A's entry
    // from the map back when B first ran (before A resolved), so A's own
    // settle-time cleanup found its entry already gone and is a no-op.
    expect(__documentCacheKeysForTests()).toHaveLength(1);

    // B's chained hydration now starts — flush until its manifest fetch
    // fires. Its own eventual `.set()` (already done at registration) is
    // what the post-insert re-prune this test originally targeted guards.
    for (let i = 0; i < 50 && deferreds.length < 2; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(deferreds).toHaveLength(2);
    deferreds[1]!(manifest('cdm.base.other') as never);
    const resB = await responseB;
    expect(resB.status).toBe(200);
    expect(__documentCacheKeysForTests()).toHaveLength(1);
  });

  it('coalesces concurrent requests for the SAME key into a single hydration (issue #432 round 4)', async () => {
    // Two requests for the IDENTICAL curated selection racing on a cold
    // cache must not each independently fetch+hydrate the same (possibly
    // CDM-sized) closure — the second should await the first's in-flight
    // work instead.
    const mathDoc = await buildSerializedCuratedDoc(
      'cdm/base/math.rosetta',
      'namespace cdm.base.math\n\ntype Quantity:\n  amount number (1..1)\n'
    );
    const fetchMod = await import('../lib/curated-fetch.js');
    const V = '2026-05-22';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let manifestResolve: ((value: any) => void) | undefined;
    const manifestSpy = vi
      .spyOn(fetchMod, 'fetchCuratedManifest')
      .mockImplementation(() => new Promise((resolve) => (manifestResolve = resolve)));
    const namespaceSpy = vi.spyOn(fetchMod, 'fetchCuratedNamespace').mockResolvedValue([mathDoc]);

    const request = () =>
      onRequestPost({
        request: makeRequest({
          files: [],
          target: 'zod',
          curatedBundles: [{ id: 'cdm', version: 'latest' }],
          namespaces: ['cdm.base.math']
        })
      } as never);

    const responseA = request();
    const responseB = request();

    for (let i = 0; i < 50 && manifestResolve === undefined; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    // Only ONE hydration started, even with two requests in flight for the
    // same key.
    expect(manifestSpy).toHaveBeenCalledTimes(1);

    manifestResolve!({
      schemaVersion: 2,
      modelId: 'cdm',
      version: V,
      sha256: 'a'.repeat(64),
      sizeBytes: 1,
      generatedAt: 'now',
      upstreamCommit: 'c',
      upstreamRef: 'r',
      archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz',
      history: [],
      namespaces: {
        'cdm.base.math': { deps: [], exports: [], artifact: `artifacts/${V}/ns/cdm.base.math.json.gz` }
      }
    });

    const [resA, resB] = await Promise.all([responseA, responseB]);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(manifestSpy).toHaveBeenCalledTimes(1);
    expect(namespaceSpy).toHaveBeenCalledTimes(1);
  });

  it('preserves curatedBundles ORDER in the cache key — reversed bundle order is a cache MISS (issue #432 round 4)', async () => {
    // loadAllDocuments processes curatedBundles in request order, and a
    // symbol colliding across two bundles resolves via last-one-wins
    // semantics downstream — [A, B] and [B, A] can produce genuinely
    // different documents. A sorted cache key would let a reversed-order
    // request incorrectly reuse a cached result built with the opposite
    // precedence.
    const mod = await import('../lib/curated-fetch.js');
    const manifestSpy = vi.spyOn(mod, 'fetchCuratedManifest').mockResolvedValue({
      schemaVersion: 2,
      modelId: 'cdm',
      version: 'v1',
      sha256: 'a'.repeat(64),
      sizeBytes: 1,
      generatedAt: 'now',
      upstreamCommit: 'c',
      upstreamRef: 'r',
      archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz',
      history: [],
      // Non-overlapping with the requested namespace so no manifest is
      // empty (which would short-circuit before the cache is ever
      // touched) but nothing is actually fetched either.
      namespaces: { 'x.unrelated': { deps: [], exports: [], artifact: 'artifacts/v1/ns/unrelated.json.gz' } }
    } as never);

    const request = (bundles: Array<{ id: string; version: string }>) =>
      onRequestPost({
        request: makeRequest({
          files: [],
          target: 'zod',
          curatedBundles: bundles,
          namespaces: ['x.a']
        })
      } as never);

    await request([
      { id: 'cdm', version: 'latest' },
      { id: 'fpml', version: 'latest' }
    ]);
    expect(manifestSpy).toHaveBeenCalledTimes(2); // one fetch per bundle

    await request([
      { id: 'fpml', version: 'latest' },
      { id: 'cdm', version: 'latest' }
    ]);
    // Reversed order must NOT hit the cache from the first request.
    expect(manifestSpy).toHaveBeenCalledTimes(4);
  });

  it('evicts a REJECTED hydration promise so a later identical request retries instead of reusing the failure (issue #432 round 5)', async () => {
    // loadAllDocuments can REJECT (throw), not just resolve with a
    // structured curatedError — e.g. a malformed namespace artifact. A
    // rejected promise left cached would poison every identical request
    // for the rest of the TTL window even if the failure was transient.
    const mathDoc = await buildSerializedCuratedDoc(
      'cdm/base/math.rosetta',
      'namespace cdm.base.math\n\ntype Quantity:\n  amount number (1..1)\n'
    );
    const fetchMod = await import('../lib/curated-fetch.js');
    const V = '2026-05-22';
    const manifestSpy = vi
      .spyOn(fetchMod, 'fetchCuratedManifest')
      .mockRejectedValueOnce(new Error('transient network blip'))
      .mockResolvedValue({
        schemaVersion: 2,
        modelId: 'cdm',
        version: V,
        sha256: 'a'.repeat(64),
        sizeBytes: 1,
        generatedAt: 'now',
        upstreamCommit: 'c',
        upstreamRef: 'r',
        archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz',
        history: [],
        namespaces: {
          'cdm.base.math': { deps: [], exports: [], artifact: `artifacts/${V}/ns/cdm.base.math.json.gz` }
        }
      } as never);
    vi.spyOn(fetchMod, 'fetchCuratedNamespace').mockResolvedValue([mathDoc]);

    const request = () =>
      onRequestPost({
        request: makeRequest({
          files: [],
          target: 'zod',
          curatedBundles: [{ id: 'cdm', version: 'latest' }],
          namespaces: ['cdm.base.math']
        })
      } as never);

    const first = await request();
    expect(first.status).toBe(500);
    // The rejected entry must not linger — a fresh request should not
    // find a stale, poisoned cache entry.
    expect(__documentCacheKeysForTests()).toHaveLength(0);

    const second = await request();
    expect(second.status).toBe(200);
    expect(manifestSpy).toHaveBeenCalledTimes(2);
  });

  it('does not let an evicted, orphaned hydration that resolves with a curatedError delete a NEWER registration (issue #432 round 5)', async () => {
    // Three interleaved requests: K (will resolve with a structured
    // curatedError), J (different key, evicts K's registration from the
    // map), then K again (misses since K's own entry was evicted by J, so
    // it registers a FRESH entry for the same key). K's cleanup, when it
    // finally settles, must NOT delete the newer K registration that
    // replaced it in the map.
    //
    // Since round 7 additionally SERIALIZES hydration behind whatever was
    // evicted (see the dedicated round-7 test below), J's own hydration
    // work is chained behind K1's settlement, and K2's is chained behind
    // J's — so K1 is now FORCED to resolve first, not last as in this
    // test's original round-5 construction. K1's entry is nonetheless
    // already gone from the map by the time it settles (evicted back at
    // registration time, well before any deferred resolves), so the
    // identity guard is still exercised on every run, just deterministically
    // rather than adversarially timed.
    //
    // Uses the curatedError (not rejection) path deliberately — the
    // delete-on-curatedError cleanup already existed before round 5, so
    // this isolates the identity-guard fix itself: an UNGUARDED delete
    // here would already have been present pre-round-5 and would wrongly
    // evict whatever replaced K1, whereas a rejection-based scenario
    // wouldn't distinguish the two rounds at all (round 4 had no rejection
    // cleanup whatsoever).
    const mathDoc = await buildSerializedCuratedDoc(
      'cdm/base/math.rosetta',
      'namespace cdm.base.math\n\ntype Quantity:\n  amount number (1..1)\n'
    );
    const otherDoc = await buildSerializedCuratedDoc(
      'cdm/base/other.rosetta',
      'namespace cdm.base.other\n\ntype Other:\n  value string (1..1)\n'
    );
    const fetchMod = await import('../lib/curated-fetch.js');
    const V = '2026-05-22';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deferreds: Array<{ resolve: (value: any) => void }> = [];
    vi.spyOn(fetchMod, 'fetchCuratedManifest').mockImplementation(
      () => new Promise((resolve) => deferreds.push({ resolve }))
    );
    vi.spyOn(fetchMod, 'fetchCuratedNamespace').mockImplementation(async (_id, _version, artifactKey) =>
      artifactKey.includes('other') ? [otherDoc] : [mathDoc]
    );

    const request = (namespaces: string[]) =>
      onRequestPost({
        request: makeRequest({
          files: [],
          target: 'zod',
          curatedBundles: [{ id: 'cdm', version: 'latest' }],
          namespaces
        })
      } as never);

    const responseK1 = request(['cdm.base.math']); // K, first attempt
    const responseJ = request(['cdm.base.other']); // different key — evicts K1's registration
    const responseK2 = request(['cdm.base.math']); // K again — misses (K1 was evicted), registers fresh

    // All three registrations happen synchronously up front (see round-3's
    // test for why) — only K1's `fetchCuratedManifest` call has actually
    // fired yet; J's and K2's hydration work is chained behind it.
    for (let i = 0; i < 50 && deferreds.length < 1; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(deferreds).toHaveLength(1);

    const cacheKeyK = __documentCacheKeysForTests()[0]!; // only K2's entry should remain resident
    expect(__documentCacheKeysForTests()).toEqual([cacheKeyK]);

    const manifest = (nsKey: string) => ({
      schemaVersion: 2,
      modelId: 'cdm',
      version: V,
      sha256: 'a'.repeat(64),
      sizeBytes: 1,
      generatedAt: 'now',
      upstreamCommit: 'c',
      upstreamRef: 'r',
      archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz',
      history: [],
      namespaces: {
        [nsKey]: { deps: [], exports: [], artifact: `artifacts/${V}/ns/${nsKey}.json.gz` }
      }
    });

    // K1 resolves first — with a manifest that has NO namespaces at all,
    // which loadAllDocuments's Path C treats as `curated_manifest_missing`
    // and resolves with a curatedError rather than throwing.
    deferreds[0]!.resolve({
      schemaVersion: 2,
      modelId: 'cdm',
      version: V,
      sha256: 'a'.repeat(64),
      sizeBytes: 1,
      generatedAt: 'now',
      upstreamCommit: 'c',
      upstreamRef: 'r',
      archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz',
      history: [],
      namespaces: {}
    });
    expect((await responseK1).status).toBe(502);
    // K1's curatedError must NOT have evicted K2's still-valid registration
    // — K1's own entry was already gone (evicted by J at registration
    // time), so this guard fires every run now, not just adversarially.
    expect(__documentCacheKeysForTests()).toEqual([cacheKeyK]);

    // K1 settling unblocks J's chained hydration — flush for its manifest
    // fetch (deferred index 1) and resolve it.
    for (let i = 0; i < 50 && deferreds.length < 2; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(deferreds).toHaveLength(2);
    deferreds[1]!.resolve(manifest('cdm.base.other'));
    expect((await responseJ).status).toBe(200);

    // J settling unblocks K2's chained hydration — flush for its manifest
    // fetch (deferred index 2) and resolve it.
    for (let i = 0; i < 50 && deferreds.length < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(deferreds).toHaveLength(3);
    deferreds[2]!.resolve(manifest('cdm.base.math'));
    expect((await responseK2).status).toBe(200);

    // K2 (the newer, still-current registration) is the sole survivor.
    expect(__documentCacheKeysForTests()).toEqual([cacheKeyK]);
  });

  it('exempts a still-pending entry from TTL pruning, then TTLs it from its ACTUAL completion time, not registration time (issue #432 round 6)', async () => {
    // A slow hydration (>= 5 minutes) must not be evicted mid-flight just
    // because its registration timestamp has aged past the TTL — that
    // would let a later same-key request see a miss and start a redundant
    // parallel hydration, defeating round 4's coalescing. Once hydration
    // DOES settle, the TTL clock must restart from completion, not from
    // the original registration — otherwise an entry that took 4 minutes
    // to hydrate would already be within 1 minute of eviction the instant
    // it becomes usable.
    const mathDoc = await buildSerializedCuratedDoc(
      'cdm/base/math.rosetta',
      'namespace cdm.base.math\n\ntype Quantity:\n  amount number (1..1)\n'
    );
    const fetchMod = await import('../lib/curated-fetch.js');
    const V = '2026-05-22';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deferreds: Array<{ resolve: (value: any) => void }> = [];
    vi.spyOn(fetchMod, 'fetchCuratedManifest').mockImplementation(
      () => new Promise((resolve) => deferreds.push({ resolve }))
    );
    vi.spyOn(fetchMod, 'fetchCuratedNamespace').mockResolvedValue([mathDoc]);

    const dateSpy = vi.spyOn(Date, 'now');
    const t0 = 1_700_000_000_000;
    dateSpy.mockReturnValue(t0);

    const responseA = onRequestPost({
      request: makeRequest({
        files: [],
        target: 'zod',
        curatedBundles: [{ id: 'cdm', version: 'latest' }],
        namespaces: ['cdm.base.math']
      })
    } as never);

    for (let i = 0; i < 50 && deferreds.length < 1; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(deferreds).toHaveLength(1);
    expect(__documentCacheKeysForTests()).toHaveLength(1);

    const nonCacheableRequest = () =>
      onRequestPost({
        request: makeRequest({ files: [{ path: 'user.rune', content: ONE_NAMESPACE }], target: 'zod' })
      } as never);

    // Six minutes later (past the 5-minute TTL) the entry is STILL pending
    // — hydration hasn't resolved yet. A prune that ran unconditionally on
    // `cachedAt` alone would evict it here; the pending exemption must not.
    dateSpy.mockReturnValue(t0 + 6 * 60 * 1000);
    expect((await nonCacheableRequest()).status).toBe(200);
    expect(__documentCacheKeysForTests()).toHaveLength(1);

    // Hydration settles now (at t0 + 6min) — `cachedAt` should be bumped to
    // this completion time, not left at the original registration (`t0`).
    deferreds[0]!.resolve({
      schemaVersion: 2,
      modelId: 'cdm',
      version: V,
      sha256: 'a'.repeat(64),
      sizeBytes: 1,
      generatedAt: 'now',
      upstreamCommit: 'c',
      upstreamRef: 'r',
      archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz',
      history: [],
      namespaces: {
        'cdm.base.math': { deps: [], exports: [], artifact: `artifacts/${V}/ns/cdm.base.math.json.gz` }
      }
    } as never);
    expect((await responseA).status).toBe(200);

    // Four minutes after completion (t0 + 10min total) — still fresh
    // relative to completion (4min < 5min TTL). If `cachedAt` were still
    // anchored to `t0` instead of the completion time, this point (10
    // minutes after `t0`) would already be well past the TTL and the
    // entry would be wrongly evicted here.
    dateSpy.mockReturnValue(t0 + 10 * 60 * 1000);
    expect((await nonCacheableRequest()).status).toBe(200);
    expect(__documentCacheKeysForTests()).toHaveLength(1);

    // Six minutes after completion (t0 + 12min total) — now past the TTL
    // measured from the actual completion time, so pruning must evict it.
    dateSpy.mockReturnValue(t0 + 12 * 60 * 1000);
    expect((await nonCacheableRequest()).status).toBe(200);
    expect(__documentCacheKeysForTests()).toHaveLength(0);

    dateSpy.mockRestore();
  });

  it('serializes hydration for a DIFFERENT-key cache miss behind a still-pending entry (issue #432 round 7)', async () => {
    // A miss for a different key than whatever's currently pending can't
    // cancel that pending hydration — it keeps running to completion in
    // its OWN request handler regardless. Starting a second (possibly
    // CDM-sized) hydration immediately would let two closures process
    // concurrently, doubling peak memory and risking the very
    // resource-limit crash this cache exists to prevent. The replacement
    // hydration's `fetchCuratedManifest` call must not fire until the
    // evicted entry's hydration has fully settled.
    const mathDoc = await buildSerializedCuratedDoc(
      'cdm/base/math.rosetta',
      'namespace cdm.base.math\n\ntype Quantity:\n  amount number (1..1)\n'
    );
    const otherDoc = await buildSerializedCuratedDoc(
      'cdm/base/other.rosetta',
      'namespace cdm.base.other\n\ntype Other:\n  value string (1..1)\n'
    );
    const fetchMod = await import('../lib/curated-fetch.js');
    const V = '2026-05-22';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deferreds: Array<{ resolve: (value: any) => void }> = [];
    vi.spyOn(fetchMod, 'fetchCuratedManifest').mockImplementation(
      () => new Promise((resolve) => deferreds.push({ resolve }))
    );
    vi.spyOn(fetchMod, 'fetchCuratedNamespace').mockImplementation(async (_id, _version, artifactKey) =>
      artifactKey.includes('other') ? [otherDoc] : [mathDoc]
    );

    const request = (namespaces: string[]) =>
      onRequestPost({
        request: makeRequest({
          files: [],
          target: 'zod',
          curatedBundles: [{ id: 'cdm', version: 'latest' }],
          namespaces
        })
      } as never);

    const responseA = request(['cdm.base.math']);
    const responseB = request(['cdm.base.other']);

    // Flush well past the point where B's registration (a synchronous
    // get/clear/set, unaffected by the chained wait) would have run —
    // only A's `fetchCuratedManifest` call should exist.
    for (let i = 0; i < 50; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(deferreds).toHaveLength(1);
    // B's entry is nonetheless already the map's sole resident (its
    // registration ran synchronously at request time; only its hydration
    // WORK is deferred) — same eviction-at-registration behavior as
    // rounds 2-4, unaffected by this round's change.
    const cacheKeyB = __documentCacheKeysForTests()[0]!;
    expect(__documentCacheKeysForTests()).toEqual([cacheKeyB]);

    const manifest = (nsKey: string) => ({
      schemaVersion: 2,
      modelId: 'cdm',
      version: V,
      sha256: 'a'.repeat(64),
      sizeBytes: 1,
      generatedAt: 'now',
      upstreamCommit: 'c',
      upstreamRef: 'r',
      archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz',
      history: [],
      namespaces: {
        [nsKey]: { deps: [], exports: [], artifact: `artifacts/${V}/ns/${nsKey}.json.gz` }
      }
    });

    deferreds[0]!.resolve(manifest('cdm.base.math'));
    expect((await responseA).status).toBe(200);

    // Only once A settles does B's chained hydration start.
    for (let i = 0; i < 50 && deferreds.length < 2; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(deferreds).toHaveLength(2);
    deferreds[1]!.resolve(manifest('cdm.base.other'));
    expect((await responseB).status).toBe(200);
  });

  it('combines user files and curated bundles in one generation', async () => {
    const curatedDoc = await buildSerializedCuratedDoc(
      'cdm/base/math.rosetta',
      'namespace cdm.base.math\n\ntype Quantity:\n  amount number (1..1)\n'
    );
    const mod = await import('../lib/curated-fetch.js');
    const V = '2026-05-22';
    vi.spyOn(mod, 'fetchCuratedManifest').mockResolvedValue({
      schemaVersion: 2,
      modelId: 'cdm',
      version: V,
      sha256: 'a'.repeat(64),
      sizeBytes: 1,
      generatedAt: 'now',
      upstreamCommit: 'c',
      upstreamRef: 'r',
      archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz',
      history: [],
      namespaces: {
        'cdm.base.math': {
          deps: [],
          exports: [{ type: 'Data', name: 'Quantity' }],
          artifact: `artifacts/${V}/ns/cdm.base.math.json.gz`
        }
      }
    } as never);
    vi.spyOn(mod, 'fetchCuratedNamespace').mockResolvedValue([curatedDoc]);

    const res = await onRequestPost({
      request: makeRequest({
        // user file imports cdm.base.math so it becomes a closure seed
        files: [
          { path: 'user.rune', content: 'namespace user\nimport cdm.base.math\n\ntype Trade:\n  id string (1..1)\n' }
        ],
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
    schemaVersion: 2,
    modelId: 'cdm',
    version: CG_VERSION,
    sha256: 'a'.repeat(64),
    sizeBytes: 1,
    generatedAt: 'now',
    upstreamCommit: 'c',
    upstreamRef: 'r',
    archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz',
    history: [],
    namespaces: {
      'cdm.base.math': {
        deps: [],
        exports: [{ type: 'Data', name: 'Quantity' }],
        artifact: `artifacts/${CG_VERSION}/ns/cdm.base.math.json.gz`
      },
      'cdm.other': {
        deps: [],
        exports: [{ type: 'Data', name: 'Unrelated' }],
        artifact: `artifacts/${CG_VERSION}/ns/cdm.other.json.gz`
      }
    }
  };
  function cgSM(name: string, importNs: string[] = []): string {
    return JSON.stringify({
      $type: 'RosettaModel',
      name,
      imports: importNs.map((ns) => ({ importedNamespace: ns })),
      elements: []
    });
  }
  const CG_NS_DOCS: Record<
    string,
    Array<{
      uri: string;
      content: string;
      serializedModel: string;
      exports: Array<{ type: string; name: string; path: string }>;
    }>
  > = {
    'cdm.base.math': [
      {
        uri: 'cdm/base/math.rosetta',
        content: '',
        serializedModel: cgSM('cdm.base.math'),
        exports: [{ type: 'Data', name: 'Quantity', path: 'cdm.base.math.Quantity' }]
      }
    ],
    'cdm.other': [
      {
        uri: 'cdm/other/other.rosetta',
        content: '',
        serializedModel: cgSM('cdm.other'),
        exports: [{ type: 'Data', name: 'Unrelated', path: 'cdm.other.Unrelated' }]
      }
    ]
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: [{ path: 'app.rune', content: 'namespace app\nimport cdm.base.math\n' }],
          target: 'typescript',
          curatedBundles: [{ id: 'cdm', version: 'latest' }]
        })
      }),
      env: {}
    } as never);

    expect(bundleSpy).not.toHaveBeenCalled();
    const arts: string[] = (mod.fetchCuratedNamespace as ReturnType<typeof vi.spyOn>).mock.calls.map(
      (c: unknown[]) => c[2] as string
    );
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: [{ path: 'app.rune', content: 'namespace app\nimport cdm.base.math\n' }],
          target: 'typescript',
          curatedBundles: [{ id: 'cdm', version: 'latest' }]
        })
      }),
      env: {}
    } as never);
    expect(res.status).toBe(502);
    expect(bundleSpy).not.toHaveBeenCalled();
  });

  it('path C: empty seeds (no namespaces, no user imports) load ALL bundle namespaces (emit-everything contract)', async () => {
    // Codex P1: `namespaces` absent → "no filter / emit everything". With no
    // seeds the closure must be the whole bundle, not empty (which would 400
    // with "No output generated"). Contrast the scoped path-C test above, which
    // seeds via an import and excludes cdm.other.
    const mod = await import('../lib/curated-fetch.js');
    vi.spyOn(mod, 'fetchCuratedManifest').mockResolvedValue(CG_MANIFEST as never);
    vi.spyOn(mod, 'fetchCuratedNamespace').mockImplementation(async (_id, _v, artifactKey) => {
      const ns = Object.keys(CG_NS_DOCS).find((n) => artifactKey.includes(`/ns/${n}.json.gz`));
      return ns ? CG_NS_DOCS[ns] : [];
    });

    await onRequestPost({
      request: new Request('http://x/api/codegen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: [], target: 'typescript', curatedBundles: [{ id: 'cdm', version: 'latest' }] })
      }),
      env: {}
    } as never);

    const arts: string[] = (mod.fetchCuratedNamespace as ReturnType<typeof vi.spyOn>).mock.calls.map(
      (c: unknown[]) => c[2] as string
    );
    // No filter → EVERY bundle namespace is loaded (both math AND other).
    expect(arts.some((a) => a.includes('/ns/cdm.base.math.json.gz'))).toBe(true);
    expect(arts.some((a) => a.includes('/ns/cdm.other.json.gz'))).toBe(true);
  });

  // ── Path A: accept pre-loaded serialized curatedDocs (Task 2) ───────────
  // When the client sends pre-loaded docs, the server must deserialize them
  // directly and perform NO manifest/namespace fetch at all.

  it('path A: deserializes provided curatedDocs and emits them, without any fetch', async () => {
    // A REAL curated doc (with an actual Quantity type) so the generated output
    // proves the provided doc was deserialized AND fed to the generator — not
    // merely that no fetch occurred (which would pass even if curatedDocs were
    // silently dropped). cgSM produces empty-element docs and can't prove this.
    const curatedDoc = await buildSerializedCuratedDoc(
      'cdm/base/math.rosetta',
      'namespace cdm.base.math\n\ntype Quantity:\n  amount number (1..1)\n'
    );
    const mod = await import('../lib/curated-fetch.js');
    const manifestSpy = vi.spyOn(mod, 'fetchCuratedManifest');
    const nsSpy = vi.spyOn(mod, 'fetchCuratedNamespace');
    const bundleSpy = vi.spyOn(mod, 'fetchCuratedBundle');

    const res = await onRequestPost({
      request: makeRequest({
        files: [], // pure curated workspace, supplied entirely via curatedDocs
        target: 'zod',
        curatedDocs: [{ uri: curatedDoc.uri, serializedModel: curatedDoc.serializedModel }],
        namespaces: ['cdm.base.math']
      })
    } as never);

    // Path A performs NO curated fetch of any kind.
    expect(manifestSpy).not.toHaveBeenCalled();
    expect(nsSpy).not.toHaveBeenCalled();
    expect(bundleSpy).not.toHaveBeenCalled();
    // Proof the supplied doc was hydrated AND used by generation:
    expect(res.status).toBe(200);
    const zip = await JSZip.loadAsync(new Uint8Array(await res.arrayBuffer()));
    expect(Object.keys(zip.files)).toContain('cdm/base/math.zod.ts');
    const nsFile = await zip.files['cdm/base/math.zod.ts']!.async('string');
    expect(nsFile).toMatch(/QuantitySchema/);
  });

  it('curatedBundles wins over curatedDocs when both are present (fetches the manifest closure)', async () => {
    // Hardening (2026-07 codegen-400 investigation): curatedDocs reflects
    // whatever the client's workspace has ALREADY hydrated via on-demand
    // navigation, which is not guaranteed to cover the full dependency-closed
    // `namespaces` selection — trusting it unconditionally produced
    // "unknown-attribute"/"unresolved-enum-reference" diagnostics for
    // namespaces one `extends`/`import` hop away from what was actually
    // hydrated. The server now independently fetches + closes the correct
    // set from the manifest whenever bundle info is available, ignoring a
    // possibly-incomplete curatedDocs even if both are sent.
    const curatedDoc = await buildSerializedCuratedDoc(
      'cdm/base/math.rosetta',
      'namespace cdm.base.math\n\ntype Quantity:\n  amount number (1..1)\n'
    );
    const mod = await import('../lib/curated-fetch.js');
    const manifestSpy = vi.spyOn(mod, 'fetchCuratedManifest').mockResolvedValue({
      schemaVersion: 2,
      modelId: 'cdm',
      version: 'latest',
      sha256: 'a'.repeat(64),
      sizeBytes: 1,
      generatedAt: 'now',
      upstreamCommit: 'c',
      upstreamRef: 'r',
      archiveUrl: 'https://www.daikonic.dev/curated/cdm/latest.tar.gz',
      history: [],
      namespaces: {
        'cdm.base.math': {
          deps: [],
          exports: [{ type: 'Data', name: 'Quantity' }],
          artifact: 'artifacts/latest/ns/cdm.base.math.json.gz'
        }
      }
    } as never);
    const nsSpy = vi.spyOn(mod, 'fetchCuratedNamespace').mockResolvedValue([curatedDoc]);
    const bundleSpy = vi.spyOn(mod, 'fetchCuratedBundle');

    const res = await onRequestPost({
      request: makeRequest({
        files: [],
        target: 'zod',
        // Deliberately a DIFFERENT (stale) doc than the manifest fetch
        // returns, so a passing assertion below proves the fetched version
        // was actually used, not the possibly-incomplete curatedDocs.
        curatedDocs: [{ uri: 'cdm/base/math.rosetta', serializedModel: '{}' }],
        curatedBundles: [{ id: 'cdm', version: 'latest' }],
        namespaces: ['cdm.base.math']
      })
    } as never);

    expect(res.status).toBe(200);
    expect(manifestSpy).toHaveBeenCalledTimes(1);
    expect(nsSpy).toHaveBeenCalledTimes(1);
    expect(bundleSpy).not.toHaveBeenCalled();
    const zip = await JSZip.loadAsync(new Uint8Array(await res.arrayBuffer()));
    expect(Object.keys(zip.files)).toContain('cdm/base/math.zod.ts');
    const nsFile = await zip.files['cdm/base/math.zod.ts']!.async('string');
    expect(nsFile).toMatch(/QuantitySchema/);
  });

  it('path A fallback: deserializes curatedDocs when no bundle info is supplied', async () => {
    const curatedDoc = await buildSerializedCuratedDoc(
      'cdm/base/math.rosetta',
      'namespace cdm.base.math\n\ntype Quantity:\n  amount number (1..1)\n'
    );
    const mod = await import('../lib/curated-fetch.js');
    const manifestSpy = vi.spyOn(mod, 'fetchCuratedManifest');
    const nsSpy = vi.spyOn(mod, 'fetchCuratedNamespace');
    const bundleSpy = vi.spyOn(mod, 'fetchCuratedBundle');

    const res = await onRequestPost({
      request: makeRequest({
        files: [],
        target: 'zod',
        curatedDocs: [{ uri: curatedDoc.uri, serializedModel: curatedDoc.serializedModel }],
        // No curatedBundles — nothing to independently verify/fetch against.
        namespaces: ['cdm.base.math']
      })
    } as never);

    expect(res.status).toBe(200);
    expect(manifestSpy).not.toHaveBeenCalled();
    expect(nsSpy).not.toHaveBeenCalled();
    expect(bundleSpy).not.toHaveBeenCalled();
    const zip = await JSZip.loadAsync(new Uint8Array(await res.arrayBuffer()));
    expect(Object.keys(zip.files)).toContain('cdm/base/math.zod.ts');
    const nsFile = await zip.files['cdm/base/math.zod.ts']!.async('string');
    expect(nsFile).toMatch(/QuantitySchema/);
  });
});
