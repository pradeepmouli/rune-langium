// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

// Keep in sync with apps/curated-mirror-worker/src/namespace-graph.ts (worker/seed copy).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeNamespaceGraph, nsArtifactSlug } from './namespace-graph.mjs';

/**
 * Helper: create a minimal serialized RosettaModel JSON string with the given
 * namespace, imports, and optional extra JSON content that may contain $refs.
 */
function makeModelJson(opts) {
  const namePart = JSON.stringify(opts.name);
  const importsPart = opts.imports
    ? JSON.stringify(opts.imports.map((ns) => ({ importedNamespace: ns })))
    : '[]';
  const extraPart = opts.extra ? `,${opts.extra}` : '';
  return `{"$type":"RosettaModel","name":${namePart},"imports":${importsPart}${extraPart}}`;
}

// ── Test 1: import edge ──────────────────────────────────────────────────────

test('import edge: adds a dep from a to b', () => {
  const docs = [
    {
      path: 'a/a.rosetta',
      modelJson: makeModelJson({ name: 'a', imports: ['b'] }),
      exports: []
    },
    {
      path: 'b/b.rosetta',
      modelJson: makeModelJson({ name: 'b' }),
      exports: []
    }
  ];

  const graph = computeNamespaceGraph(docs, 'cdm');

  assert.ok(graph['a']?.deps.includes('b'), 'a.deps should include b');
  assert.deepEqual(graph['b']?.deps, [], 'b.deps should be empty');
});

// ── Test 2: $ref-without-import edge (the critical case) ─────────────────────

test('$ref-without-import edge: adds dep from a to b when a has a $ref to b but no import', () => {
  // modelId='cdm', B's path='bdir/b.rosetta' → uri key = 'cdm/bdir/b.rosetta'
  // A's $ref = file:///%5Bcdm%5D/bdir/b.rosetta#/elements@0
  const bPath = 'bdir/b.rosetta';
  const bRefUri = 'file:///%5Bcdm%5D/bdir/b.rosetta#/elements@0';

  const docA = {
    path: 'adir/a.rosetta',
    modelJson: makeModelJson({
      name: 'a',
      // NO imports — this is the critical case
      extra: `"elements":[{"$type":"Data","name":"X","$ref":${JSON.stringify(bRefUri)}}]`
    }),
    exports: []
  };

  const docB = {
    path: bPath,
    modelJson: makeModelJson({ name: 'b' }),
    exports: []
  };

  const graph = computeNamespaceGraph([docA, docB], 'cdm');

  assert.ok(graph['a']?.deps.includes('b'), 'a.deps should include b via $ref');
  assert.deepEqual(graph['b']?.deps, [], 'b.deps should be empty');
});

// ── Test 3: wildcard import preserved ────────────────────────────────────────

test('wildcard import: preserves wildcard import strings literally in deps', () => {
  const docs = [
    {
      path: 'x/x.rosetta',
      modelJson: makeModelJson({ name: 'x', imports: ['cdm.base.*'] }),
      exports: []
    }
  ];

  const graph = computeNamespaceGraph(docs, 'cdm');

  assert.ok(graph['x']?.deps.includes('cdm.base.*'), 'x.deps should include cdm.base.*');
});

// ── Test 4: self-dep excluded ─────────────────────────────────────────────────

test('self-dep excluded: does NOT include namespace in its own deps', () => {
  // Both docs have namespace 'ns'. A has a $ref pointing to B (same namespace).
  const bPath = 'ns/b.rosetta';
  const bRefUri = 'file:///%5Bcdm%5D/ns/b.rosetta#/elements@0';

  const docA = {
    path: 'ns/a.rosetta',
    modelJson: makeModelJson({
      name: 'ns',
      extra: `"elements":[{"$ref":${JSON.stringify(bRefUri)}}]`
    }),
    exports: []
  };

  const docB = {
    path: bPath,
    modelJson: makeModelJson({ name: 'ns' }),
    exports: []
  };

  const graph = computeNamespaceGraph([docA, docB], 'cdm');

  assert.ok(!graph['ns']?.deps.includes('ns'), 'ns.deps should NOT include self');
  assert.deepEqual(graph['ns']?.deps, [], 'ns.deps should be empty');
});

// ── Test 5: exports union + path dropped ─────────────────────────────────────

test('exports union: unions exports from two docs in same namespace, dropping path', () => {
  const docs = [
    {
      path: 'ns/file1.rosetta',
      modelJson: makeModelJson({ name: 'myns' }),
      exports: [{ type: 'Data', name: 'Foo', path: '/elements@0' }]
    },
    {
      path: 'ns/file2.rosetta',
      modelJson: makeModelJson({ name: 'myns' }),
      exports: [{ type: 'Enum', name: 'Bar', path: '/elements@1' }]
    }
  ];

  const graph = computeNamespaceGraph(docs, 'cdm');

  const nsEntry = graph['myns'];
  assert.ok(nsEntry, 'myns entry should exist');
  assert.equal(nsEntry.exports.length, 2, 'should have 2 exports');

  const fooExport = nsEntry.exports.find((e) => e.name === 'Foo');
  const barExport = nsEntry.exports.find((e) => e.name === 'Bar');
  assert.ok(fooExport, 'Foo export should exist');
  assert.ok(barExport, 'Bar export should exist');
  assert.deepEqual(fooExport, { type: 'Data', name: 'Foo' }, 'Foo export should have no path');
  assert.deepEqual(barExport, { type: 'Enum', name: 'Bar' }, 'Bar export should have no path');
  assert.ok(!('path' in fooExport), 'Foo export should not have path property');
  assert.ok(!('path' in barExport), 'Bar export should not have path property');
});

test('nsArtifactSlug: leaves a clean dotted namespace unchanged (readable)', () => {
  assert.equal(nsArtifactSlug('cdm.base.datetime'), 'cdm.base.datetime');
});

test('nsArtifactSlug: trailing-dot namespace gets a cleaned base + hash suffix, no ".."', () => {
  const slug = nsArtifactSlug('fpml.consolidated.');
  assert.match(slug, /^fpml\.consolidated\.[0-9a-f]{8}$/);
  assert.ok(!slug.includes('..'), 'slug must not contain ".."');
});

test('nsArtifactSlug: stays injective for X vs X. (the real fpml case)', () => {
  // rune-fpml has BOTH 'fpml.consolidated' and 'fpml.consolidated.' — distinct blobs.
  assert.notEqual(nsArtifactSlug('fpml.consolidated'), nsArtifactSlug('fpml.consolidated.'));
  assert.equal(nsArtifactSlug('fpml.consolidated'), 'fpml.consolidated');
});

test('nsArtifactSlug: is deterministic for the same input', () => {
  assert.equal(nsArtifactSlug('a..b'), nsArtifactSlug('a..b'));
  assert.ok(!nsArtifactSlug('a..b').includes('..'));
});
