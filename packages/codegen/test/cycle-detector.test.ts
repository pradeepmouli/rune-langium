// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { createRuneDslServices, isRosettaModel } from '@rune-langium/core';
import { URI } from 'langium';
import { findCyclicTypes, buildTypeReferenceGraph, type TypeReferenceGraph } from '../src/cycle-detector.js';

async function parseSource(source: string, uri = 'inmemory:///model.rosetta') {
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(source, URI.parse(uri));
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
  const model = doc.parseResult?.value;
  if (!model || !isRosettaModel(model)) throw new Error('expected a RosettaModel');
  expect(doc.parseResult.parserErrors).toEqual([]);
  return doc;
}

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

  /**
   * PR #469 final-review finding (2026-08-04): the attribute/option/extends
   * edge-building all read `.typeCall?.type?.ref` directly — a
   * RosettaTypeAlias is neither Data nor Choice, so an alias-typed
   * attribute or Choice option contributed NO edge at all, silently
   * dropping the dependency that determines topo-sort order AND
   * cycle detection. Now routed through the shared resolver
   * (resolveGraphEdgeTarget), which chases the alias chain to its
   * terminal Data/Choice — matching every emitter's own value-emission
   * resolution.
   */
  it("adds an edge for an attribute typed via a RosettaTypeAlias, to the alias's terminal Data target", async () => {
    const doc = await parseSource(
      `
namespace test.aliasEdge
version "0.0.0"

type B:
    x string (0..1)

typeAlias BAlias: B

type A:
    b BAlias (0..1)
`,
      'inmemory:///aliasEdge.rosetta'
    );
    const graph = buildTypeReferenceGraph([doc]);
    expect(graph.edges.get('A')).toEqual(['B']);
  });

  it("adds an edge for a Choice option typed via a RosettaTypeAlias, to the alias's terminal Data target", async () => {
    const doc = await parseSource(
      `
namespace test.aliasChoiceEdge
version "0.0.0"

type B:
    x string (0..1)

typeAlias BAlias: B

choice Wrapper:
    BAlias
`,
      'inmemory:///aliasChoiceEdge.rosetta'
    );
    const graph = buildTypeReferenceGraph([doc]);
    expect(graph.edges.get('Wrapper')).toEqual(['B']);
  });

  it('detects a mutual cycle mediated entirely through RosettaTypeAlias hops on both sides', async () => {
    const doc = await parseSource(
      `
namespace test.aliasMediatedCycle
version "0.0.0"

type A:
    b BAlias (0..1)

typeAlias BAlias: B

type B:
    a AAlias (0..1)

typeAlias AAlias: A
`,
      'inmemory:///aliasMediatedCycle.rosetta'
    );
    const graph = buildTypeReferenceGraph([doc]);
    const cyclic = findCyclicTypes(graph);
    expect(Array.from(cyclic).sort()).toEqual(['A', 'B']);
  });
});
