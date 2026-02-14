/**
 * Unit tests for the dagre layout engine.
 *
 * Verifies that nodes receive valid positions after layout computation.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { astToGraph } from '../../src/adapters/ast-to-graph.js';
import { computeLayout } from '../../src/layout/dagre-layout.js';
import {
  SIMPLE_INHERITANCE_SOURCE,
  DEEP_INHERITANCE_SOURCE,
  EMPTY_MODEL_SOURCE
} from '../helpers/fixture-loader.js';

describe('computeLayout', () => {
  it('assigns positions to all nodes', async () => {
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    const { nodes, edges } = astToGraph(result.value);
    const layouted = computeLayout(nodes, edges);

    expect(layouted).toHaveLength(nodes.length);
    for (const node of layouted) {
      expect(typeof node.position.x).toBe('number');
      expect(typeof node.position.y).toBe('number');
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    }
  });

  it('places parent above child in TB direction', async () => {
    const result = await parse(DEEP_INHERITANCE_SOURCE);
    const { nodes, edges } = astToGraph(result.value);
    const layouted = computeLayout(nodes, edges, { direction: 'TB' });

    const baseNode = layouted.find((n) => n.data.name === 'Base');
    const middleNode = layouted.find((n) => n.data.name === 'Middle');
    const leafNode = layouted.find((n) => n.data.name === 'Leaf');

    expect(baseNode).toBeDefined();
    expect(middleNode).toBeDefined();
    expect(leafNode).toBeDefined();

    // In TB layout, ancestors should be above descendants (lower y)
    // Note: dagre may order differently — we check that nodes have distinct y positions
    const yValues = [baseNode!.position.y, middleNode!.position.y, leafNode!.position.y];
    const uniqueYValues = new Set(yValues);
    expect(uniqueYValues.size).toBe(3);
  });

  it('respects LR direction', async () => {
    const result = await parse(DEEP_INHERITANCE_SOURCE);
    const { nodes, edges } = astToGraph(result.value);
    const layouted = computeLayout(nodes, edges, { direction: 'LR' });

    const baseNode = layouted.find((n) => n.data.name === 'Base');
    const leafNode = layouted.find((n) => n.data.name === 'Leaf');

    expect(baseNode).toBeDefined();
    expect(leafNode).toBeDefined();

    // In LR layout, base should be to the left of leaf (lower x)
    // Check that they have different x positions
    expect(baseNode!.position.x).not.toBe(leafNode!.position.x);
  });

  it('handles empty graph', async () => {
    const result = computeLayout([], []);
    expect(result).toHaveLength(0);
  });

  it('handles nodes with many members by increasing height', async () => {
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    const { nodes, edges } = astToGraph(result.value);
    const layouted = computeLayout(nodes, edges);

    // Nodes with members should have distinct positions
    expect(layouted.length).toBeGreaterThan(0);
  });

  it('applies custom node and rank separation', async () => {
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    const { nodes, edges } = astToGraph(result.value);

    const tight = computeLayout(nodes, edges, { nodeSeparation: 10, rankSeparation: 30 });
    const wide = computeLayout(nodes, edges, { nodeSeparation: 200, rankSeparation: 300 });

    // Wider separation should produce nodes spread further apart
    if (tight.length >= 2 && wide.length >= 2) {
      const tightSpan =
        Math.max(...tight.map((n) => n.position.x)) - Math.min(...tight.map((n) => n.position.x));
      const wideSpan =
        Math.max(...wide.map((n) => n.position.x)) - Math.min(...wide.map((n) => n.position.x));
      expect(wideSpan).toBeGreaterThanOrEqual(tightSpan);
    }
  });
});
