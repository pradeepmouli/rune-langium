// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { readSerializedModelMeta } from '../lib/serialized-model-meta.js';
import { computeCuratedClosure } from '../lib/curated-closure.js';

function doc(namespace: string, imports: string[]): { namespace: string; serializedModel: string } {
  return {
    namespace,
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

describe('computeCuratedClosure', () => {
  const docs = [
    doc('cdm.trade', ['cdm.base.datetime']),
    doc('cdm.base.datetime', ['cdm.base.math']),
    doc('cdm.base.math', []),
    doc('cdm.unrelated', [])
  ];
  it('closes transitively from the seed; excludes unreferenced namespaces', () => {
    const closure = computeCuratedClosure(['cdm.trade'], docs);
    expect([...closure].sort()).toEqual(['cdm.base.datetime', 'cdm.base.math', 'cdm.trade']);
    expect(closure.has('cdm.unrelated')).toBe(false);
  });
  it('expands a wildcard import to all namespaces under the prefix', () => {
    const wdocs = [doc('app', ['cdm.base.*']), doc('cdm.base.datetime', []), doc('cdm.base.math', []), doc('other', [])];
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
    const cyc = [doc('a', ['b']), doc('b', ['a'])];
    expect([...computeCuratedClosure(['a'], cyc)].sort()).toEqual(['a', 'b']);
  });
  it('ignores seeds that are not curated namespaces', () => {
    expect(computeCuratedClosure(['user.ns'], docs).size).toBe(0);
  });
  it('empty seeds → empty closure', () => {
    expect(computeCuratedClosure([], docs).size).toBe(0);
  });
});
