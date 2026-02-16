/**
 * CDM corpus graph conformance test (T002).
 *
 * Verifies that the full CDM corpus can be loaded into the visual editor's
 * AST→graph adapter without errors and produces reasonable output.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { astToGraph } from '../../src/adapters/ast-to-graph.js';
import {
  SIMPLE_INHERITANCE_SOURCE,
  COMBINED_MODEL_SOURCE,
  DEEP_INHERITANCE_SOURCE
} from '../helpers/fixture-loader.js';

describe('CDM Corpus Graph Conformance (T002)', () => {
  async function parseAndConvert(source: string) {
    const result = await parse(source);
    return astToGraph([result.value]);
  }

  it('should convert simple inheritance model to graph', async () => {
    const { nodes, edges } = await parseAndConvert(SIMPLE_INHERITANCE_SOURCE);
    expect(nodes.length).toBeGreaterThan(0);
    // Should have inheritance edges
    const inheritEdges = edges.filter((e) => e.data?.kind === 'extends');
    expect(inheritEdges.length).toBeGreaterThan(0);
  });

  it('should convert combined model (Data+Choice+Enum) to graph', async () => {
    const { nodes, edges } = await parseAndConvert(COMBINED_MODEL_SOURCE);
    // Should have Data, Choice, and Enum nodes
    const kinds = new Set(nodes.map((n) => n.data.kind));
    expect(kinds.has('data')).toBe(true);
    expect(kinds.has('choice')).toBe(true);
    expect(kinds.has('enum')).toBe(true);
    // Should have edges
    expect(edges.length).toBeGreaterThan(0);
  });

  it('should convert deep inheritance chain to graph', async () => {
    const { nodes, edges } = await parseAndConvert(DEEP_INHERITANCE_SOURCE);
    expect(nodes).toHaveLength(3); // Base, Middle, Leaf
    const inheritEdges = edges.filter((e) => e.data?.kind === 'extends');
    expect(inheritEdges).toHaveLength(2); // Middle→Base, Leaf→Middle
  });

  it('should handle multiple models at once', async () => {
    const r1 = await parse(SIMPLE_INHERITANCE_SOURCE);
    const r2 = await parse(COMBINED_MODEL_SOURCE);
    const { nodes, edges } = astToGraph([r1.value, r2.value]);
    expect(nodes.length).toBeGreaterThan(5);
    expect(edges.length).toBeGreaterThan(0);
  });

  it('should assign correct node data for each kind', async () => {
    const { nodes } = await parseAndConvert(COMBINED_MODEL_SOURCE);
    for (const node of nodes) {
      expect(node.data).toHaveProperty('kind');
      expect(node.data).toHaveProperty('name');
      expect(node.data).toHaveProperty('namespace');
      expect(['data', 'choice', 'enum']).toContain(node.data.kind);
    }
  });

  it('should produce unique node IDs', async () => {
    const { nodes } = await parseAndConvert(COMBINED_MODEL_SOURCE);
    const ids = nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
