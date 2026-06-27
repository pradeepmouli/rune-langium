// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { readSerializedModelMeta } from '../lib/serialized-model-meta.js';
import { closeNamespacesFromManifest, expandWildcard, buildDependencyGraph } from '../lib/curated-closure.js';

function doc(namespace: string, imports: string[], uri?: string): { uri: string; serializedModel: string } {
  return {
    uri: uri ?? `cdm/${namespace.replace(/\./g, '/')}.rosetta`,
    serializedModel: JSON.stringify({
      $type: 'RosettaModel',
      name: namespace,
      imports: imports.map((n) => ({ $type: 'Import', importedNamespace: n })),
      elements: []
    })
  };
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

describe('expandWildcard', () => {
  const allNs = new Set(['cdm.base.math', 'cdm.base.datetime', 'cdm.trade', 'app']);

  it('expands a wildcard to matching namespaces (exact prefix + dotted children)', () => {
    expect(expandWildcard('cdm.base.*', allNs).sort()).toEqual(['cdm.base.datetime', 'cdm.base.math']);
  });

  it('returns a bare name iff present', () => {
    expect(expandWildcard('cdm.trade', allNs)).toEqual(['cdm.trade']);
    expect(expandWildcard('cdm.unknown', allNs)).toEqual([]);
  });

  it('matches the wildcard prefix itself when present', () => {
    const ns = new Set(['cdm.base', 'cdm.base.math']);
    expect(expandWildcard('cdm.base.*', ns).sort()).toEqual(['cdm.base', 'cdm.base.math']);
  });
});

describe('buildDependencyGraph', () => {
  // Topology: cdm.trade → cdm.base.datetime → cdm.base.math ; cdm.other isolated.
  const curatedDeps = new Map<string, Set<string>>([
    ['cdm.trade', new Set(['cdm.base.datetime'])],
    ['cdm.base.datetime', new Set(['cdm.base.math'])],
    ['cdm.base.math', new Set()],
  ]);
  const closure = new Set(['cdm.trade', 'cdm.base.datetime', 'cdm.base.math']);

  it('transitively closes curated edges, every namespace is a key, values sorted + include self', () => {
    const g = buildDependencyGraph([], curatedDeps, closure);
    expect(g['cdm.trade']).toEqual(['cdm.base.datetime', 'cdm.base.math', 'cdm.trade']);
    expect(g['cdm.base.datetime']).toEqual(['cdm.base.math', 'cdm.base.datetime'].sort());
    expect(g['cdm.base.math']).toEqual(['cdm.base.math']);
    expect(Object.keys(g).sort()).toEqual(['cdm.base.datetime', 'cdm.base.math', 'cdm.trade']);
  });

  it('adds user→curated edges from imports (wildcard-expanded) and keys the user namespace', () => {
    const all = new Set([...closure, 'app']);
    const g = buildDependencyGraph([{ namespace: 'app', imports: ['cdm.trade'] }], curatedDeps, all);
    // app imports cdm.trade → app's closure pulls the whole transitive chain.
    expect(g['app']).toEqual(['app', 'cdm.base.datetime', 'cdm.base.math', 'cdm.trade']);
  });

  it('ignores import targets outside allNamespaces and self-imports', () => {
    const all = new Set([...closure, 'app']);
    const g = buildDependencyGraph(
      [{ namespace: 'app', imports: ['cdm.unknown', 'app', 'cdm.base.*'] }],
      curatedDeps,
      all
    );
    // cdm.unknown dropped (absent); 'app' self-edge dropped; cdm.base.* expands.
    expect(g['app']).toEqual(['app', 'cdm.base.datetime', 'cdm.base.math']);
  });

  it('merges resolved user→user edges (qualified refs with no import declaration)', () => {
    // Two user namespaces: `app` references a type in `lib` via a fully-qualified
    // name (resolved by global scope) but declares NO import for it. Import-only
    // edges would miss app→lib; the resolved-deps map restores it.
    const all = new Set(['app', 'lib']);
    const userResolved = new Map<string, Set<string>>([['app', new Set(['lib'])]]);
    const g = buildDependencyGraph(
      [
        { namespace: 'app', imports: [] }, // no import declaration
        { namespace: 'lib', imports: [] }
      ],
      new Map(),
      all,
      userResolved
    );
    expect(g['app']).toEqual(['app', 'lib']);
    expect(g['lib']).toEqual(['lib']);
  });

  it('drops resolved edges to unknown namespaces and self-edges', () => {
    const all = new Set(['app']);
    const userResolved = new Map<string, Set<string>>([['app', new Set(['app', 'gone'])]]);
    const g = buildDependencyGraph([{ namespace: 'app', imports: [] }], new Map(), all, userResolved);
    expect(g['app']).toEqual(['app']); // self-edge + unknown 'gone' both dropped
  });

  it('does NOT over-pull a user namespace imported-but-unreferenced (Codex P2)', () => {
    // `app` imports user namespace `lib` but references nothing in it (empty
    // userResolvedDeps). Import edges target curated namespaces only, so app→lib
    // is NOT added — `lib` must not be forced into app's read-only cascade.
    const all = new Set(['app', 'lib']);
    const g = buildDependencyGraph(
      [
        { namespace: 'app', imports: ['lib'] },
        { namespace: 'lib', imports: [] }
      ],
      new Map(),
      all,
      new Map() // app references nothing in lib
    );
    expect(g['app']).toEqual(['app']); // lib NOT pulled (unused import)
    // But a curated import IS still pulled:
    const all2 = new Set(['app', 'cdm.base.math']);
    const g2 = buildDependencyGraph(
      [{ namespace: 'app', imports: ['cdm.base.math'] }],
      new Map([['cdm.base.math', new Set<string>()]]),
      all2,
      new Map()
    );
    expect(g2['app']).toEqual(['app', 'cdm.base.math']);
  });
});
