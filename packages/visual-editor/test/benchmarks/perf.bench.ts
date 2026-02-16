/**
 * Performance benchmarks for layout + render at scale (T005).
 *
 * Uses Vitest bench to measure:
 * - AST→graph conversion time
 * - dagre layout computation time
 * - Combined pipeline time at ~500 nodes
 */

import { describe, bench } from 'vitest';
import { parse } from '@rune-langium/core';
import { astToGraph } from '../../src/adapters/ast-to-graph.js';
import { computeLayout } from '../../src/layout/dagre-layout.js';
import type { TypeGraphNode, TypeGraphEdge } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Generate a large synthetic model (~500 types)
// ---------------------------------------------------------------------------

function generateLargeModel(count: number): string {
  const lines: string[] = ['namespace benchmarks\nversion "1.0.0"'];

  for (let i = 0; i < count; i++) {
    const parentClause = i > 0 ? ` extends Type${i - 1}` : '';
    lines.push(`
type Type${i}${parentClause}:
  attr${i} string (1..1)
  ref${i} Type${Math.max(0, i - 1)} (0..1)`);
  }

  return lines.join('\n');
}

const LARGE_MODEL_500 = generateLargeModel(500);
const MEDIUM_MODEL_100 = generateLargeModel(100);

describe('Performance Benchmarks (T005)', () => {
  let models500: unknown[];
  let models100: unknown[];
  let graph500: { nodes: TypeGraphNode[]; edges: TypeGraphEdge[] };
  let graph100: { nodes: TypeGraphNode[]; edges: TypeGraphEdge[] };

  // Pre-parse models for benchmark reuse
  bench(
    'setup: parse 500-type model',
    async () => {
      const result = await parse(LARGE_MODEL_500);
      models500 = [result.value];
    },
    { iterations: 1, warmupIterations: 0 }
  );

  bench(
    'setup: parse 100-type model',
    async () => {
      const result = await parse(MEDIUM_MODEL_100);
      models100 = [result.value];
    },
    { iterations: 1, warmupIterations: 0 }
  );

  bench('ast-to-graph: 500 nodes', () => {
    graph500 = astToGraph(models500 ?? []);
  });

  bench('ast-to-graph: 100 nodes', () => {
    graph100 = astToGraph(models100 ?? []);
  });

  bench('dagre layout: 500 nodes', () => {
    if (graph500) {
      computeLayout(graph500.nodes, graph500.edges, { direction: 'TB' });
    }
  });

  bench('dagre layout: 100 nodes', () => {
    if (graph100) {
      computeLayout(graph100.nodes, graph100.edges, { direction: 'TB' });
    }
  });

  bench('full pipeline: 100 nodes (parse + graph + layout)', async () => {
    const result = await parse(MEDIUM_MODEL_100);
    const { nodes, edges } = astToGraph([result.value]);
    computeLayout(nodes, edges, { direction: 'TB' });
  });
});
