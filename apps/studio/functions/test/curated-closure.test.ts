// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { readSerializedModelMeta } from '../lib/serialized-model-meta.js';
import { computeCuratedClosure, refUriToCuratedKey, closeNamespacesFromManifest } from '../lib/curated-closure.js';

/**
 * Build a ClosureDoc fixture.
 *
 * @param namespace   RosettaModel namespace (e.g. `cdm.trade`)
 * @param imports     imported namespace strings (may be wildcard)
 * @param uri         doc URI in curated-fetch form: `${bundleId}/${doc.path}`
 * @param crossDocRefs optional list of cross-doc `$ref` URI strings to embed
 *                    in a synthetic `elements` entry so the closure walker can
 *                    discover them
 */
function doc(
  namespace: string,
  imports: string[],
  uri?: string,
  crossDocRefs?: string[]
): { uri: string; serializedModel: string } {
  // Build a minimal elements array that contains $ref objects for each
  // cross-doc ref so extractCrossDocRefNamespaces can find them.
  const elements = (crossDocRefs ?? []).map((ref) => ({ $type: 'Attribute', typeCall: { $ref: ref } }));
  return {
    uri: uri ?? `cdm/${namespace.replace(/\./g, '/')}.rosetta`,
    serializedModel: JSON.stringify({
      $type: 'RosettaModel',
      name: namespace,
      imports: imports.map((n) => ({ $type: 'Import', importedNamespace: n })),
      elements
    })
  };
}

/**
 * Encode a curated-fetch URI (`${bundleId}/${doc.path}`) back into the
 * `file:///%5B<bundleId>%5D/<path>` form that Langium emits for cross-doc
 * `$ref` URIs, optionally appending a `#/elements@0` fragment.
 * Used only in tests to construct realistic `$ref` values.
 */
function toRefUri(bundleId: string, docPath: string, fragment = '/elements@0'): string {
  const encodedBundle = bundleId.replace('[', '%5B').replace(']', '%5D');
  return `file:///%5B${encodedBundle}%5D/${docPath}#${fragment}`;
}

describe('readSerializedModelMeta', () => {
  it('reads namespace (string name) + imports', () => {
    const meta = readSerializedModelMeta(doc('cdm.base.datetime', ['cdm.base.math']).serializedModel);
    expect(meta).toEqual({ namespace: 'cdm.base.datetime', imports: ['cdm.base.math'] });
  });
  it('joins a segmented name and tolerates missing imports', () => {
    const raw = JSON.stringify({ $type: 'RosettaModel', name: { segments: ['cdm', 'base'] } });
    expect(readSerializedModelMeta(raw)).toEqual({ namespace: 'cdm.base', imports: [] });
  });
  it('returns null on malformed JSON (never throws)', () => {
    expect(readSerializedModelMeta('{ not json')).toBeNull();
  });
});

describe('refUriToCuratedKey', () => {
  it('decodes a percent-encoded $ref URI to bundleId/path', () => {
    const ref =
      'file:///%5Bcdm%5D/common-domain-model-master/rosetta-source/src/main/rosetta/base-datetime-daycount-enum.rosetta#/elements@0';
    expect(refUriToCuratedKey(ref)).toBe(
      'cdm/common-domain-model-master/rosetta-source/src/main/rosetta/base-datetime-daycount-enum.rosetta'
    );
  });
  it('returns null for local (fragment-only) refs', () => {
    expect(refUriToCuratedKey('#/elements@0')).toBeNull();
  });
  it('returns null for refs with an unrecognised scheme', () => {
    expect(refUriToCuratedKey('http://example.com/foo#bar')).toBeNull();
  });
  it('strips the fragment correctly', () => {
    const ref = 'file:///%5Bfpml%5D/some/path.rosetta#/elements@5/attributes@2';
    expect(refUriToCuratedKey(ref)).toBe('fpml/some/path.rosetta');
  });
});

describe('computeCuratedClosure — import-based (existing behaviour)', () => {
  const docs = [
    doc('cdm.trade', ['cdm.base.datetime'], 'cdm/trade/trade.rosetta'),
    doc('cdm.base.datetime', ['cdm.base.math'], 'cdm/base/datetime.rosetta'),
    doc('cdm.base.math', [], 'cdm/base/math.rosetta'),
    doc('cdm.unrelated', [], 'cdm/other/other.rosetta')
  ];
  it('closes transitively from the seed; excludes unreferenced namespaces', () => {
    const closure = computeCuratedClosure(['cdm.trade'], docs);
    expect([...closure].sort()).toEqual(['cdm.base.datetime', 'cdm.base.math', 'cdm.trade']);
    expect(closure.has('cdm.unrelated')).toBe(false);
  });
  it('expands a wildcard import to all namespaces under the prefix', () => {
    const wdocs = [
      doc('app', ['cdm.base.*'], 'cdm/app.rosetta'),
      doc('cdm.base.datetime', [], 'cdm/base/datetime.rosetta'),
      doc('cdm.base.math', [], 'cdm/base/math.rosetta'),
      doc('other', [], 'cdm/other.rosetta')
    ];
    const closure = computeCuratedClosure(['app'], wdocs);
    expect(closure.has('cdm.base.datetime')).toBe(true);
    expect(closure.has('cdm.base.math')).toBe(true);
    expect(closure.has('other')).toBe(false);
  });
  it('expands a wildcard SEED (user `import cdm.base.*`) to matching curated namespaces', () => {
    // Regression: a wildcard seed must be expanded, not dropped. Seeds go
    // through the same expand() as imports, so the user's wildcard import
    // pulls cdm.base.datetime + cdm.base.math (which transitively closes too).
    const closure = computeCuratedClosure(['cdm.base.*'], docs);
    expect(closure.has('cdm.base.datetime')).toBe(true);
    expect(closure.has('cdm.base.math')).toBe(true);
    expect(closure.has('cdm.trade')).toBe(false);
    expect(closure.has('cdm.unrelated')).toBe(false);
  });
  it('is cycle-safe', () => {
    const cyc = [doc('a', ['b'], 'cdm/a.rosetta'), doc('b', ['a'], 'cdm/b.rosetta')];
    expect([...computeCuratedClosure(['a'], cyc)].sort()).toEqual(['a', 'b']);
  });
  it('ignores seeds that are not curated namespaces', () => {
    expect(computeCuratedClosure(['user.ns'], docs).size).toBe(0);
  });
  it('empty seeds → empty closure', () => {
    expect(computeCuratedClosure([], docs).size).toBe(0);
  });
});

describe('computeCuratedClosure — cross-doc $ref completeness (the new fix)', () => {
  /**
   * Scenario mirrors the real CDM pattern: `cdm.event.position` imports
   * `cdm.event.common.*` but its serialized AST also contains a `$ref` to
   * `cdm.observable.asset` — which has NO corresponding import declaration.
   *
   * Before this fix, seeding on `cdm.event.position` would NOT pull in
   * `cdm.observable.asset`, leaving those cross-doc $refs unresolved after
   * the lazy-link pass.  After the fix the closure follows both import edges
   * AND $ref edges, so `cdm.observable.asset` IS included.
   */
  it('includes a namespace referenced ONLY via cross-doc $ref (no import for it)', () => {
    // cdm.observable.asset doc — no imports, no $refs
    const observableAssetDoc = doc('cdm.observable.asset', [], 'cdm/observable/asset.rosetta');

    // cdm.event.position doc — imports cdm.event.common.* only, but has a
    // $ref that points at cdm.observable.asset (no explicit import for it).
    const refUri = toRefUri('cdm', 'observable/asset.rosetta');
    const eventPositionDoc = doc(
      'cdm.event.position',
      ['cdm.event.common.*'], // NO import for cdm.observable.asset!
      'cdm/event/position.rosetta',
      [refUri] // but $ref targets cdm.observable.asset
    );

    // cdm.event.common namespace
    const eventCommonDoc = doc('cdm.event.common', [], 'cdm/event/common.rosetta');

    // Unrelated namespace — must NOT appear in closure
    const unrelatedDoc = doc('cdm.unrelated', [], 'cdm/other/other.rosetta');

    const allDocs = [eventPositionDoc, eventCommonDoc, observableAssetDoc, unrelatedDoc];

    const closure = computeCuratedClosure(['cdm.event.position'], allDocs);

    // Must include the directly seeded namespace
    expect(closure.has('cdm.event.position')).toBe(true);
    // Must include the import-edge target (via wildcard)
    expect(closure.has('cdm.event.common')).toBe(true);
    // KEY ASSERTION: must include the $ref-only target (no import for it)
    expect(closure.has('cdm.observable.asset')).toBe(true);
    // Unrelated must NOT be included
    expect(closure.has('cdm.unrelated')).toBe(false);
  });

  it('handles $ref edges transitively (A→B via $ref, B→C via import)', () => {
    // A has a $ref to B but does not import it.
    // B imports C.
    // Seeding on A should pull in A, B, and C.
    const cDoc = doc('cdm.c', [], 'cdm/c.rosetta');
    const bDoc = doc('cdm.b', ['cdm.c'], 'cdm/b.rosetta');
    const refUri = toRefUri('cdm', 'b.rosetta');
    const aDoc = doc('cdm.a', [], 'cdm/a.rosetta', [refUri]);

    const closure = computeCuratedClosure(['cdm.a'], [aDoc, bDoc, cDoc]);
    expect([...closure].sort()).toEqual(['cdm.a', 'cdm.b', 'cdm.c']);
  });

  it('does not pull in $ref targets from out-of-closure docs', () => {
    // cdm.trade imports cdm.base.datetime (no $refs).
    // cdm.unrelated has a $ref to cdm.secret — but cdm.unrelated is not in
    // the seed closure, so cdm.secret must NOT appear.
    const secretDoc = doc('cdm.secret', [], 'cdm/secret.rosetta');
    const refUri = toRefUri('cdm', 'secret.rosetta');
    const unrelatedDoc = doc('cdm.unrelated', [], 'cdm/unrelated.rosetta', [refUri]);
    const tradeDoc = doc('cdm.trade', ['cdm.base.datetime'], 'cdm/trade.rosetta');
    const dtDoc = doc('cdm.base.datetime', [], 'cdm/base/datetime.rosetta');

    const closure = computeCuratedClosure(['cdm.trade'], [tradeDoc, dtDoc, unrelatedDoc, secretDoc]);
    expect(closure.has('cdm.trade')).toBe(true);
    expect(closure.has('cdm.base.datetime')).toBe(true);
    expect(closure.has('cdm.unrelated')).toBe(false);
    expect(closure.has('cdm.secret')).toBe(false);
  });

  it('is cycle-safe when $ref edges create cycles', () => {
    // A $refs B, B $refs A
    const refToA = toRefUri('cdm', 'a.rosetta');
    const refToB = toRefUri('cdm', 'b.rosetta');
    const aDoc = doc('cdm.a', [], 'cdm/a.rosetta', [refToB]);
    const bDoc = doc('cdm.b', [], 'cdm/b.rosetta', [refToA]);

    const closure = computeCuratedClosure(['cdm.a'], [aDoc, bDoc]);
    expect([...closure].sort()).toEqual(['cdm.a', 'cdm.b']);
  });
});

describe('closeNamespacesFromManifest', () => {
  const G = (m: Record<string, string[]>): Record<string, { deps: string[] }> =>
    Object.fromEntries(Object.entries(m).map(([ns, deps]) => [ns, { deps }]));

  it('walks transitive deps from the seed (BFS over the manifest graph)', () => {
    const ns = G({
      'cdm.trade': ['cdm.base.datetime'],
      'cdm.base.datetime': ['cdm.base.math'],
      'cdm.base.math': [],
      'cdm.other': []
    });
    const closure = closeNamespacesFromManifest(['cdm.trade'], ns);
    expect([...closure].sort()).toEqual(['cdm.base.datetime', 'cdm.base.math', 'cdm.trade']);
    expect(closure.has('cdm.other')).toBe(false);
  });

  it('is cycle-safe', () => {
    const ns = G({ 'cdm.a': ['cdm.b'], 'cdm.b': ['cdm.a'] });
    const closure = closeNamespacesFromManifest(['cdm.a'], ns);
    expect([...closure].sort()).toEqual(['cdm.a', 'cdm.b']);
  });

  it('expands wildcard seeds against the manifest namespaces', () => {
    const ns = G({
      'cdm.base.datetime': [],
      'cdm.base.math': [],
      'cdm.trade': []
    });
    const closure = closeNamespacesFromManifest(['cdm.base.*'], ns);
    expect([...closure].sort()).toEqual(['cdm.base.datetime', 'cdm.base.math']);
  });

  it('expands wildcard deps recorded in a namespace entry', () => {
    const ns = G({
      'cdm.trade': ['cdm.base.*'],
      'cdm.base.datetime': [],
      'cdm.base.math': []
    });
    const closure = closeNamespacesFromManifest(['cdm.trade'], ns);
    expect([...closure].sort()).toEqual(['cdm.base.datetime', 'cdm.base.math', 'cdm.trade']);
  });

  it('drops seeds and deps that are not manifest namespaces', () => {
    const ns = G({ 'cdm.trade': ['cdm.missing'] });
    const closure = closeNamespacesFromManifest(['cdm.trade', 'cdm.absent'], ns);
    expect([...closure].sort()).toEqual(['cdm.trade']);
  });
});
