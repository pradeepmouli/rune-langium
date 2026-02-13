/**
 * Unit tests for the namespace tree builder utility.
 */

import { describe, it, expect } from 'vitest';
import { buildNamespaceTree, filterNamespaceTree } from '../../src/utils/namespace-tree.js';
import type { TypeGraphNode, TypeNodeData } from '../../src/types.js';

function makeNode(ns: string, name: string, kind: TypeNodeData['kind'] = 'data'): TypeGraphNode {
  return {
    id: `${ns}::${name}`,
    type: kind,
    position: { x: 0, y: 0 },
    data: {
      kind,
      name,
      namespace: ns,
      members: [],
      hasExternalRefs: false,
      errors: []
    }
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
