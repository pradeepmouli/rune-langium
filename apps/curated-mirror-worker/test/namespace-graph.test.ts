// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { computeNamespaceGraph } from '../src/namespace-graph.js';

/**
 * Helper: create a minimal serialized RosettaModel JSON string with the given
 * namespace, imports, and optional extra JSON content that may contain $refs.
 */
function makeModelJson(opts: {
  name: string | { segments: string[] };
  imports?: string[];
  extra?: string; // raw JSON fragment merged into the top-level object
}): string {
  const namePart = typeof opts.name === 'string' ? JSON.stringify(opts.name) : JSON.stringify(opts.name);
  const importsPart = opts.imports ? JSON.stringify(opts.imports.map((ns) => ({ importedNamespace: ns }))) : '[]';
  const extraPart = opts.extra ? `,${opts.extra}` : '';
  return `{"$type":"RosettaModel","name":${namePart},"imports":${importsPart}${extraPart}}`;
}

// ── Test 1: import edge ──────────────────────────────────────────────────────

describe('computeNamespaceGraph — import edge', () => {
  it('adds an import dep from a to b', () => {
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

    expect(graph['a']?.deps).toContain('b');
    expect(graph['b']?.deps).toEqual([]);
  });
});

// ── Test 2: $ref-without-import edge (the critical #308 case) ────────────────

describe('computeNamespaceGraph — $ref-without-import edge', () => {
  it('adds dep from a to b when a has a $ref to b but no import', () => {
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

    expect(graph['a']?.deps).toContain('b');
    expect(graph['b']?.deps).toEqual([]);
  });
});

// ── Test 3: exports union + path dropped ─────────────────────────────────────

describe('computeNamespaceGraph — exports union + path dropped', () => {
  it('unions exports from two docs in the same namespace, dropping path', () => {
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
    expect(nsEntry).toBeDefined();
    expect(nsEntry!.exports).toHaveLength(2);

    // Must have both, path must NOT be present
    const fooExport = nsEntry!.exports.find((e) => e.name === 'Foo');
    const barExport = nsEntry!.exports.find((e) => e.name === 'Bar');
    expect(fooExport).toBeDefined();
    expect(barExport).toBeDefined();
    expect(fooExport).toEqual({ type: 'Data', name: 'Foo' });
    expect(barExport).toEqual({ type: 'Enum', name: 'Bar' });
    expect(fooExport).not.toHaveProperty('path');
    expect(barExport).not.toHaveProperty('path');
  });
});

// ── Test 4: self-dep excluded ─────────────────────────────────────────────────

describe('computeNamespaceGraph — self-dep excluded', () => {
  it('does NOT include a namespace in its own deps when it $refs another doc in the same namespace', () => {
    // Both docs have namespace 'ns'. A has a $ref pointing to B.
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

    // Self-dep must be excluded
    expect(graph['ns']?.deps).not.toContain('ns');
    expect(graph['ns']?.deps).toEqual([]);
  });
});

// ── Test 5: wildcard import preserved ────────────────────────────────────────

describe('computeNamespaceGraph — wildcard import preserved', () => {
  it('preserves wildcard import strings literally in deps', () => {
    const docs = [
      {
        path: 'x/x.rosetta',
        modelJson: makeModelJson({ name: 'x', imports: ['cdm.base.*'] }),
        exports: []
      }
    ];

    const graph = computeNamespaceGraph(docs, 'cdm');

    expect(graph['x']?.deps).toContain('cdm.base.*');
  });
});
