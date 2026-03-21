// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Unit tests for the namespace tree builder utility.
 */

import { describe, it, expect } from 'vitest';
import {
  buildNamespaceTree,
  filterNamespaceTree,
  flattenNamespaceTree
} from '../../src/utils/namespace-tree.js';
import type { TypeGraphNode } from '../../src/types.js';

const KIND_TO_AST_TYPE: Record<string, string> = {
  data: 'Data',
  choice: 'Choice',
  enum: 'RosettaEnumeration',
  func: 'RosettaFunction'
};

function makeNode(ns: string, name: string, kind: string = 'data'): TypeGraphNode {
  return {
    id: `${ns}::${name}`,
    type: kind,
    position: { x: 0, y: 0 },
    data: {
      $type: KIND_TO_AST_TYPE[kind] ?? 'Data',
      name,
      namespace: ns,
      hasExternalRefs: false,
      errors: []
    } as any
  };
}

describe('buildNamespaceTree', () => {
  it('returns empty array for no nodes', () => {
    expect(buildNamespaceTree([])).toEqual([]);
  });

  it('groups nodes by namespace', () => {
    const nodes = [makeNode('ns.a', 'TypeA'), makeNode('ns.a', 'TypeB'), makeNode('ns.b', 'TypeC')];
    const tree = buildNamespaceTree(nodes);
    expect(tree).toHaveLength(2);
    expect(tree[0]!.namespace).toBe('ns.a');
    expect(tree[0]!.types).toHaveLength(2);
    expect(tree[1]!.namespace).toBe('ns.b');
    expect(tree[1]!.types).toHaveLength(1);
  });

  it('sorts namespaces alphabetically', () => {
    const nodes = [makeNode('z.ns', 'TypeZ'), makeNode('a.ns', 'TypeA'), makeNode('m.ns', 'TypeM')];
    const tree = buildNamespaceTree(nodes);
    expect(tree.map((e) => e.namespace)).toEqual(['a.ns', 'm.ns', 'z.ns']);
  });

  it('sorts types within a namespace alphabetically', () => {
    const nodes = [makeNode('ns', 'Zebra'), makeNode('ns', 'Apple'), makeNode('ns', 'Mango')];
    const tree = buildNamespaceTree(nodes);
    expect(tree[0]!.types.map((t) => t.name)).toEqual(['Apple', 'Mango', 'Zebra']);
  });

  it('counts types by kind', () => {
    const nodes = [
      makeNode('ns', 'D1', 'data'),
      makeNode('ns', 'D2', 'data'),
      makeNode('ns', 'C1', 'choice'),
      makeNode('ns', 'E1', 'enum')
    ];
    const tree = buildNamespaceTree(nodes);
    expect(tree[0]!.totalCount).toBe(4);
    expect(tree[0]!.dataCount).toBe(2);
    expect(tree[0]!.choiceCount).toBe(1);
    expect(tree[0]!.enumCount).toBe(1);
  });

  it('preserves node IDs in type entries', () => {
    const nodes = [makeNode('com.example', 'MyType')];
    const tree = buildNamespaceTree(nodes);
    expect(tree[0]!.types[0]!.nodeId).toBe('com.example::MyType');
  });
});

describe('filterNamespaceTree', () => {
  const nodes = [
    makeNode('com.rosetta.model', 'Trade'),
    makeNode('com.rosetta.model', 'Event'),
    makeNode('com.rosetta.lib', 'Date'),
    makeNode('cdm.product', 'Asset')
  ];
  const tree = buildNamespaceTree(nodes);

  it('returns full tree for empty query', () => {
    expect(filterNamespaceTree(tree, '')).toEqual(tree);
    expect(filterNamespaceTree(tree, '  ')).toEqual(tree);
  });

  it('matches namespace name and includes all types', () => {
    const result = filterNamespaceTree(tree, 'rosetta.model');
    expect(result).toHaveLength(1);
    expect(result[0]!.namespace).toBe('com.rosetta.model');
    expect(result[0]!.types).toHaveLength(2);
  });

  it('matches type name within non-matching namespace', () => {
    const result = filterNamespaceTree(tree, 'Asset');
    expect(result).toHaveLength(1);
    expect(result[0]!.namespace).toBe('cdm.product');
    expect(result[0]!.types).toHaveLength(1);
    expect(result[0]!.types[0]!.name).toBe('Asset');
  });

  it('matches case-insensitively', () => {
    const result = filterNamespaceTree(tree, 'trade');
    expect(result).toHaveLength(1);
    expect(result[0]!.types[0]!.name).toBe('Trade');
  });

  it('returns empty array for no matches', () => {
    const result = filterNamespaceTree(tree, 'nonexistent');
    expect(result).toHaveLength(0);
  });

  it('updates counts for partially matching namespaces', () => {
    const result = filterNamespaceTree(tree, 'Trade');
    expect(result[0]!.totalCount).toBe(1);
  });

  it('handles regex special characters without crashing', () => {
    // Test bracket metacharacters
    expect(() => filterNamespaceTree(tree, '[')).not.toThrow();
    expect(() => filterNamespaceTree(tree, ']')).not.toThrow();
    expect(() => filterNamespaceTree(tree, '[special')).not.toThrow();

    // Test backslash
    expect(() => filterNamespaceTree(tree, '\\')).not.toThrow();

    // Test other metacharacters
    expect(() => filterNamespaceTree(tree, '.*')).not.toThrow();
    expect(() => filterNamespaceTree(tree, '(test)')).not.toThrow();
    expect(() => filterNamespaceTree(tree, 'foo|bar')).not.toThrow();
    expect(() => filterNamespaceTree(tree, 'test$')).not.toThrow();
    expect(() => filterNamespaceTree(tree, '^start')).not.toThrow();
  });

  it('treats regex metacharacters as literal strings', () => {
    // Add nodes with special characters in their names
    const specialNodes = [
      makeNode('ns', 'Type[A]'),
      makeNode('ns', 'Type(B)'),
      makeNode('ns', 'Type.C')
    ];
    const specialTree = buildNamespaceTree(specialNodes);

    // Searching for literal brackets should match Type[A]
    const result1 = filterNamespaceTree(specialTree, '[');
    expect(result1).toHaveLength(1);
    expect(result1[0]!.types[0]!.name).toBe('Type[A]');

    // Searching for literal dot should match Type.C
    const result2 = filterNamespaceTree(specialTree, '.');
    expect(result2).toHaveLength(1);
    expect(result2[0]!.types[0]!.name).toBe('Type.C');
  });
});

describe('flattenNamespaceTree', () => {
  const nodes = [
    makeNode('ns.a', 'TypeA', 'data'),
    makeNode('ns.a', 'TypeB', 'choice'),
    makeNode('ns.b', 'TypeC', 'enum'),
    makeNode('ns.c', 'TypeD', 'func')
  ];
  const tree = buildNamespaceTree(nodes);

  it('returns only namespace headers when all collapsed', () => {
    const rows = flattenNamespaceTree(tree, new Set(), new Set());
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.kind === 'namespace')).toBe(true);
    expect(rows.map((r) => (r as { namespace: string }).namespace)).toEqual([
      'ns.a',
      'ns.b',
      'ns.c'
    ]);
    expect(rows.every((r) => r.kind === 'namespace' && !r.expanded)).toBe(true);
  });

  it('includes type rows for expanded namespaces', () => {
    const rows = flattenNamespaceTree(tree, new Set(['ns.a']), new Set());
    // ns.a header + 2 types + ns.b header + ns.c header = 5
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ kind: 'namespace', namespace: 'ns.a', expanded: true });
    expect(rows[1]).toMatchObject({
      kind: 'type',
      name: 'TypeA',
      typeKind: 'data',
      namespace: 'ns.a'
    });
    expect(rows[2]).toMatchObject({
      kind: 'type',
      name: 'TypeB',
      typeKind: 'choice',
      namespace: 'ns.a'
    });
    expect(rows[3]).toMatchObject({ kind: 'namespace', namespace: 'ns.b', expanded: false });
    expect(rows[4]).toMatchObject({ kind: 'namespace', namespace: 'ns.c', expanded: false });
  });

  it('includes all types when all namespaces expanded', () => {
    const expanded = new Set(['ns.a', 'ns.b', 'ns.c']);
    const rows = flattenNamespaceTree(tree, expanded, new Set());
    // 3 headers + 4 types = 7
    expect(rows).toHaveLength(7);
    const typeRows = rows.filter((r) => r.kind === 'type');
    expect(typeRows).toHaveLength(4);
  });

  it('marks hidden nodes correctly', () => {
    const hidden = new Set(['ns.a::TypeA']);
    const rows = flattenNamespaceTree(tree, new Set(['ns.a']), hidden);
    const typeARow = rows.find((r) => r.kind === 'type' && r.name === 'TypeA');
    const typeBRow = rows.find((r) => r.kind === 'type' && r.name === 'TypeB');
    expect(typeARow).toMatchObject({ hidden: true });
    expect(typeBRow).toMatchObject({ hidden: false });
  });

  it('applies search filter before flattening', () => {
    const expanded = new Set(['ns.a', 'ns.b', 'ns.c']);
    const rows = flattenNamespaceTree(tree, expanded, new Set(), 'TypeA');
    // Only ns.a matches (has TypeA), expanded → header + 1 type
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: 'namespace', namespace: 'ns.a' });
    expect(rows[1]).toMatchObject({ kind: 'type', name: 'TypeA' });
  });

  it('returns empty array for empty tree', () => {
    const rows = flattenNamespaceTree([], new Set(), new Set());
    expect(rows).toHaveLength(0);
  });

  it('includes namespace typeCount from tree entry', () => {
    const rows = flattenNamespaceTree(tree, new Set(), new Set());
    const nsA = rows.find((r) => r.kind === 'namespace' && r.namespace === 'ns.a');
    expect(nsA).toMatchObject({ typeCount: 2 });
  });
});
