// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import {
  findCyclicTypes,
  buildTypeReferenceGraph,
  type TypeReferenceGraph
} from '../src/cycle-detector.js';

/**
 * Helpers for constructing TypeReferenceGraph objects for unit testing
 * without needing real LangiumDocument instances.
 */
function makeGraph(nodes: string[], edges: Record<string, string[]>): TypeReferenceGraph {
  const edgeMap = new Map<string, string[]>();
  for (const [node, targets] of Object.entries(edges)) {
    edgeMap.set(node, targets);
  }
  // Ensure all nodes have edge entries
  for (const node of nodes) {
    if (!edgeMap.has(node)) {
      edgeMap.set(node, []);
    }
  }
  return { nodes, edges: edgeMap };
}

describe('findCyclicTypes', () => {
  it('returns an empty Set for a non-cyclic graph (linear chain)', () => {
    // A → B → C (no cycles)
    const graph = makeGraph(['A', 'B', 'C'], {
      A: ['B'],
      B: ['C'],
      C: []
    });
    const result = findCyclicTypes(graph);
    expect(result.size).toBe(0);
  });

  it('returns {A} for a direct self-loop (A → A)', () => {
    const graph = makeGraph(['A', 'B'], {
      A: ['A'], // self-loop
      B: []
    });
    const result = findCyclicTypes(graph);
    expect(result.has('A')).toBe(true);
    expect(result.has('B')).toBe(false);
    expect(result.size).toBe(1);
  });

  it('returns {A, B} for a mutual cycle (A → B → A)', () => {
    const graph = makeGraph(['A', 'B', 'C'], {
      A: ['B'],
      B: ['A'], // mutual cycle
      C: ['A'] // C points to the cycle but is not in it
    });
    const result = findCyclicTypes(graph);
    expect(result.has('A')).toBe(true);
    expect(result.has('B')).toBe(true);
    expect(result.has('C')).toBe(false);
    expect(result.size).toBe(2);
  });

  it('handles a three-node cycle (A → B → C → A)', () => {
    const graph = makeGraph(['A', 'B', 'C'], {
      A: ['B'],
      B: ['C'],
      C: ['A']
    });
    const result = findCyclicTypes(graph);
    expect(result.has('A')).toBe(true);
    expect(result.has('B')).toBe(true);
    expect(result.has('C')).toBe(true);
    expect(result.size).toBe(3);
  });

  it('returns empty Set for an empty graph', () => {
    const graph = makeGraph([], {});
    const result = findCyclicTypes(graph);
    expect(result.size).toBe(0);
  });

  it('handles a single isolated node with no edges', () => {
    const graph = makeGraph(['A'], { A: [] });
    const result = findCyclicTypes(graph);
    expect(result.size).toBe(0);
  });

  it('identifies multiple separate cycles', () => {
    // Cycle 1: A ↔ B; Cycle 2: C → C (self); D is isolated
    const graph = makeGraph(['A', 'B', 'C', 'D'], {
      A: ['B'],
      B: ['A'],
      C: ['C'],
      D: []
    });
    const result = findCyclicTypes(graph);
    expect(result.has('A')).toBe(true);
    expect(result.has('B')).toBe(true);
    expect(result.has('C')).toBe(true);
    expect(result.has('D')).toBe(false);
    expect(result.size).toBe(3);
  });
});

describe('buildTypeReferenceGraph', () => {
  it('returns an empty graph for empty document list', () => {
    const graph = buildTypeReferenceGraph([]);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges.size).toBe(0);
  });
});
