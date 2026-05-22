// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Integration test: closure-scoped curated linking + passthrough.
 *
 * Regression lock for the prod 503 fix (GitHub issue #301): /api/parse was
 * deserializing+linking ALL curated docs (O(n) in corpus size). For CDM the
 * full corpus saturated CF's per-request CPU budget, returning 1102/503.
 * computeCuratedClosure now gates the expensive deserialize+link pass to the
 * user's import closure; the remaining curated docs are still forwarded in
 * hydrationState (passthrough) and deferredExports so the browser worker can
 * hydrate them on-demand.
 *
 * What this file proves:
 *   A. Closure-scoped linking: only the transitive closure of the user's
 *      curated imports appears in dependencyGraph; the unrelated namespace
 *      (cdm.other) is absent even though it was fetched and forwarded.
 *   B. Passthrough: ALL curated docs — including cdm.other — still appear in
 *      hydrationState.documents and deferredExports regardless of closure scope.
 *   C. No-import baseline: a user file with no curated imports produces an
 *      empty dependencyGraph for curated namespaces, but passthrough still works.
 */

import { describe, it, expect, vi } from 'vitest';
import { onRequestPost } from '../api/parse.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): Request {
  return new Request('http://example.com/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

/**
 * Serialized RosettaModel string — the shape `fetchCuratedBundle` returns and
 * what `readSerializedModelMeta` / `computeCuratedClosure` / the Langium
 * deserializer all consume.  `imports` holds `importedNamespace` strings
 * matching what Langium emits; `elements` is empty (closure only reads name +
 * imports from the JSON without a full deserialize).
 */
function makeSM(name: string, importNs: string[] = []): string {
  return JSON.stringify({
    $type: 'RosettaModel',
    name,
    imports: importNs.map((ns) => ({ importedNamespace: ns })),
    elements: []
  });
}

// ---------------------------------------------------------------------------
// Curated corpus fixture
//
// Four namespaces; topology:
//   cdm.trade ─→ cdm.base.datetime ─→ cdm.base.math
//   cdm.other    (no imports; unrelated; MUST be excluded from closure)
//
// A user file that `import cdm.trade` causes the closure walk to pull in:
//   cdm.trade, cdm.base.datetime, cdm.base.math
// but NOT cdm.other.  All four docs are still forwarded via passthrough.
// ---------------------------------------------------------------------------

const CURATED_DOCS = [
  {
    uri: 'cdm/trade/trade.rosetta',
    content: '',
    serializedModel: makeSM('cdm.trade', ['cdm.base.datetime']),
    exports: [{ type: 'Data', name: 'Trade', path: 'cdm.trade.Trade' }]
  },
  {
    uri: 'cdm/base/datetime.rosetta',
    content: '',
    serializedModel: makeSM('cdm.base.datetime', ['cdm.base.math']),
    exports: [{ type: 'Data', name: 'DateTime', path: 'cdm.base.datetime.DateTime' }]
  },
  {
    uri: 'cdm/base/math.rosetta',
    content: '',
    serializedModel: makeSM('cdm.base.math'),
    exports: [{ type: 'Data', name: 'Quantity', path: 'cdm.base.math.Quantity' }]
  },
  {
    uri: 'cdm/other/other.rosetta',
    content: '',
    serializedModel: makeSM('cdm.other'),
    exports: [{ type: 'Data', name: 'Unrelated', path: 'cdm.other.Unrelated' }]
  }
];

// ---------------------------------------------------------------------------
// Response type helpers
// ---------------------------------------------------------------------------

type ParseResponse = {
  ok: boolean;
  deferredExports: Array<{ filePath: string; namespace: string; exports: Array<{ name: string }> }>;
  hydrationState: {
    documents: Array<{
      uri: string;
      serializedModel: string;
      exports: Array<{ name: string }>;
    }>;
  };
  dependencyGraph: Record<string, string[]>;
  errors: Record<string, string[]>;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/parse — closure-scoped linking + passthrough (T4 regression lock)', () => {
  it('A: closure-scoped linking + full passthrough — curated repro no longer 503s', async () => {
    // This is the curated repro that previously caused 1102/503 in prod:
    // a user file imports a curated namespace that has transitive deps.
    // Before the fix, ALL curated docs were deserialized+linked (O(n) CPU).
    // After the fix only the closure (3/4 docs) is linked; cdm.other is skipped.
    const curatedFetchModule = await import('../lib/curated-fetch.js');
    const spy = vi.spyOn(curatedFetchModule, 'fetchCuratedBundle').mockResolvedValue(CURATED_DOCS);
    try {
      // User file imports cdm.trade → closure = {cdm.trade, cdm.base.datetime, cdm.base.math}
      const userContent = 'namespace app\nimport cdm.trade\n';
      const res = await onRequestPost({
        request: makeRequest({
          files: [{ name: 'app.rune', content: userContent }],
          curatedBundles: [{ id: 'cdm', version: 'latest' }]
        })
      } as never);

      // ── Primary assertion: curated repro returns 200, NOT 503 ─────────────
      expect(res.status).toBe(200);
      const body = (await res.json()) as ParseResponse;
      expect(body.ok).toBe(true);

      // ── Passthrough: ALL four curated docs are in hydrationState ─────────
      // (browser worker needs them for on-demand linkDocument)
      const hydratedUris = body.hydrationState.documents.map((d) => d.uri);
      expect(hydratedUris).toContain('cdm/trade/trade.rosetta');
      expect(hydratedUris).toContain('cdm/base/datetime.rosetta');
      expect(hydratedUris).toContain('cdm/base/math.rosetta');
      expect(hydratedUris).toContain('cdm/other/other.rosetta'); // passthrough preserved

      // ── Passthrough: ALL four namespaces in deferredExports ─────────────
      // (namespace explorer reads deferredExports to list available namespaces)
      const deferredNs = body.deferredExports.map((d) => d.namespace);
      expect(deferredNs).toContain('cdm.trade');
      expect(deferredNs).toContain('cdm.base.datetime');
      expect(deferredNs).toContain('cdm.base.math');
      expect(deferredNs).toContain('cdm.other'); // passthrough preserved

      // ── Closure-scoped: dependencyGraph has closure namespaces ───────────
      // These three were deserialized+linked (inside the closure):
      expect(body.dependencyGraph).toHaveProperty('cdm.trade');
      expect(body.dependencyGraph).toHaveProperty('cdm.base.datetime');
      expect(body.dependencyGraph).toHaveProperty('cdm.base.math');

      // ── Closure-scoped: cdm.other is ABSENT from dependencyGraph ────────
      // Proves only the closure was deserialized+linked — the proxy for
      // "CPU bounded" since CPU cannot be directly asserted in unit tests.
      expect(body.dependencyGraph).not.toHaveProperty('cdm.other');

      // ── User namespace still present in dependencyGraph ──────────────────
      expect(body.dependencyGraph).toHaveProperty('app');
    } finally {
      spy.mockRestore();
    }
  });

  it('B: no curated imports → no curated docs linked; passthrough still intact', async () => {
    // A user file that imports nothing curated should produce an empty
    // closure — no curated namespaces appear in dependencyGraph — but all
    // four curated docs are still forwarded via hydrationState + deferredExports.
    const curatedFetchModule = await import('../lib/curated-fetch.js');
    const spy = vi.spyOn(curatedFetchModule, 'fetchCuratedBundle').mockResolvedValue(CURATED_DOCS);
    try {
      // User file has NO curated imports → closure = {}
      const userContent = 'namespace isolated\ntype LocalType:\n  value string (1..1)\n';
      const res = await onRequestPost({
        request: makeRequest({
          files: [{ name: 'isolated.rune', content: userContent }],
          curatedBundles: [{ id: 'cdm', version: 'latest' }]
        })
      } as never);

      expect(res.status).toBe(200);
      const body = (await res.json()) as ParseResponse;
      expect(body.ok).toBe(true);

      // ── No curated namespaces in dependencyGraph (closure was empty) ─────
      expect(body.dependencyGraph).not.toHaveProperty('cdm.trade');
      expect(body.dependencyGraph).not.toHaveProperty('cdm.base.datetime');
      expect(body.dependencyGraph).not.toHaveProperty('cdm.base.math');
      expect(body.dependencyGraph).not.toHaveProperty('cdm.other');

      // ── User namespace still present (self-closure) ───────────────────────
      expect(body.dependencyGraph).toHaveProperty('isolated');

      // ── Passthrough: ALL four curated docs in hydrationState ─────────────
      const hydratedUris = body.hydrationState.documents.map((d) => d.uri);
      expect(hydratedUris).toContain('cdm/trade/trade.rosetta');
      expect(hydratedUris).toContain('cdm/base/datetime.rosetta');
      expect(hydratedUris).toContain('cdm/base/math.rosetta');
      expect(hydratedUris).toContain('cdm/other/other.rosetta');

      // ── Passthrough: ALL four namespaces in deferredExports ─────────────
      const deferredNs = body.deferredExports.map((d) => d.namespace);
      expect(deferredNs).toContain('cdm.trade');
      expect(deferredNs).toContain('cdm.base.datetime');
      expect(deferredNs).toContain('cdm.base.math');
      expect(deferredNs).toContain('cdm.other');
    } finally {
      spy.mockRestore();
    }
  });
});
