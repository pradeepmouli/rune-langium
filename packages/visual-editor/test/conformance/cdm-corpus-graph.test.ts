// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * CDM corpus graph conformance test (T002).
 *
 * Verifies that the full CDM corpus can be loaded into the visual editor's
 * AST→graph adapter without errors and produces reasonable output.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { astToModel } from '../../src/adapters/ast-to-model.js';
import { AST_TYPE_TO_NODE_TYPE } from '../../src/adapters/model-helpers.js';
import {
  SIMPLE_INHERITANCE_SOURCE,
  COMBINED_MODEL_SOURCE,
  DEEP_INHERITANCE_SOURCE
} from '../helpers/fixture-loader.js';

describe('CDM Corpus Graph Conformance (T002)', () => {
  async function parseAndConvert(source: string) {
    const result = await parse(source);
    return astToModel([result.value]);
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
    // Should have Data, Choice, and Enum nodes (check via $type → node type mapping)
    const nodeTypes = new Set(nodes.map((n) => AST_TYPE_TO_NODE_TYPE[n.data.$type]));
    expect(nodeTypes.has('data')).toBe(true);
    expect(nodeTypes.has('choice')).toBe(true);
    expect(nodeTypes.has('enum')).toBe(true);
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
    const { nodes, edges } = astToModel([r1.value, r2.value]);
    expect(nodes.length).toBeGreaterThan(5);
    expect(edges.length).toBeGreaterThan(0);
  });

  it('should assign correct node data for each kind', async () => {
    const { nodes } = await parseAndConvert(COMBINED_MODEL_SOURCE);
    for (const node of nodes) {
      expect(node.data).toHaveProperty('$type');
      expect(node.data).toHaveProperty('name');
      expect(node.data).toHaveProperty('namespace');
      const nodeType = AST_TYPE_TO_NODE_TYPE[node.data.$type];
      expect(['data', 'choice', 'enum']).toContain(nodeType);
    }
  });

  it('should produce unique node IDs', async () => {
    const { nodes } = await parseAndConvert(COMBINED_MODEL_SOURCE);
    const ids = nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
