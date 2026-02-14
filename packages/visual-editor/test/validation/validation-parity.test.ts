/**
 * Validation parity coverage for S-01/S-02/S-04 (T004).
 *
 * Verifies that the visual editor's edit-time validator catches the same
 * violations that the core validator does — specifically:
 * - S-01: Duplicate type names within a namespace
 * - S-02: Circular inheritance chains
 * - S-04: Invalid cardinality constraints
 */

import { describe, it, expect } from 'vitest';
import {
  detectCircularInheritance,
  detectDuplicateName,
  validateCardinality,
  validateGraph
} from '../../src/validation/edit-validator.js';
import type { TypeGraphNode, TypeGraphEdge } from '../../src/types.js';

function makeNode(
  id: string,
  name: string,
  namespace: string,
  kind: 'data' | 'choice' | 'enum' = 'data'
): TypeGraphNode {
  return {
    id,
    type: kind === 'data' ? 'DataNode' : kind === 'choice' ? 'ChoiceNode' : 'EnumNode',
    position: { x: 0, y: 0 },
    data: {
      kind,
      name,
      namespace,
      members: [],
      errors: [],
      hasExternalRefs: false
    }
  };
}

function makeInheritanceEdge(source: string, target: string): TypeGraphEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    type: 'InheritanceEdge',
    data: { kind: 'extends' }
  };
}

describe('Validation Parity — S-01: Duplicate Names', () => {
  it('should detect duplicate type names in same namespace', () => {
    const nodes: TypeGraphNode[] = [
      makeNode('ns::Foo', 'Foo', 'ns'),
      makeNode('ns::Bar', 'Bar', 'ns')
    ];
    // 'Foo' already exists in 'ns'
    expect(detectDuplicateName('Foo', 'ns', nodes)).toBe(true);
  });

  it('should allow same name in different namespaces', () => {
    const nodes: TypeGraphNode[] = [
      makeNode('ns1::Foo', 'Foo', 'ns1'),
      makeNode('ns2::Bar', 'Bar', 'ns2')
    ];
    // 'Foo' does not exist in 'ns2'
    expect(detectDuplicateName('Foo', 'ns2', nodes)).toBe(false);
  });

  it('should exclude the node being renamed', () => {
    const nodes: TypeGraphNode[] = [
      makeNode('ns::Foo', 'Foo', 'ns'),
      makeNode('ns::Bar', 'Bar', 'ns')
    ];
    // Renaming 'Foo' to 'Foo' should not be a duplicate
    expect(detectDuplicateName('Foo', 'ns', nodes, 'ns::Foo')).toBe(false);
  });

  it('should be found by validateGraph', () => {
    const nodes: TypeGraphNode[] = [
      makeNode('ns::Foo', 'Foo', 'ns'),
      makeNode('ns::Foo_2', 'Foo', 'ns') // duplicate name
    ];
    const errors = validateGraph(nodes, []);
    const dupErrors = errors.filter((e) => e.ruleId === 'S-01');
    expect(dupErrors.length).toBeGreaterThan(0);
  });
});

describe('Validation Parity — S-02: Circular Inheritance', () => {
  it('should detect direct circular inheritance', () => {
    const edges: TypeGraphEdge[] = [makeInheritanceEdge('A', 'B'), makeInheritanceEdge('B', 'A')];
    // A extends B, setting B extends A would be circular
    expect(detectCircularInheritance('B', 'A', edges)).toBe(true);
  });

  it('should detect indirect circular inheritance', () => {
    const edges: TypeGraphEdge[] = [makeInheritanceEdge('A', 'B'), makeInheritanceEdge('B', 'C')];
    // A→B→C; setting C extends A would be circular
    expect(detectCircularInheritance('C', 'A', edges)).toBe(true);
  });

  it('should allow valid inheritance', () => {
    const edges: TypeGraphEdge[] = [makeInheritanceEdge('A', 'B')];
    // C extends A is not circular
    expect(detectCircularInheritance('C', 'A', edges)).toBe(false);
  });

  it('should be found by validateGraph', () => {
    const nodes: TypeGraphNode[] = [makeNode('ns::A', 'A', 'ns'), makeNode('ns::B', 'B', 'ns')];
    const edges: TypeGraphEdge[] = [
      makeInheritanceEdge('ns::A', 'ns::B'),
      makeInheritanceEdge('ns::B', 'ns::A')
    ];
    const errors = validateGraph(nodes, edges);
    const circErrors = errors.filter((e) => e.ruleId === 'S-02');
    expect(circErrors.length).toBeGreaterThan(0);
  });
});

describe('Validation Parity — S-04: Invalid Cardinality', () => {
  it('should accept zero upper bound (0..0 is valid)', () => {
    // 0..0 is technically valid in Rune DSL grammar
    expect(validateCardinality('0..0')).toBeNull();
  });

  it('should reject lower > upper', () => {
    expect(validateCardinality('3..1')).not.toBeNull();
  });

  it('should reject negative bounds', () => {
    expect(validateCardinality('-1..1')).not.toBeNull();
  });

  it('should accept valid cardinalities', () => {
    expect(validateCardinality('0..1')).toBeNull();
    expect(validateCardinality('1..1')).toBeNull();
    expect(validateCardinality('0..*')).toBeNull();
    expect(validateCardinality('1..*')).toBeNull();
  });

  it('should reject non-numeric values', () => {
    expect(validateCardinality('abc')).not.toBeNull();
  });

  it('should reject upper bound less than lower when not unbounded', () => {
    expect(validateCardinality('5..3')).not.toBeNull();
  });
});
