// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Condition serialization round-trip test (T023, T025).
 *
 * Verifies that conditions on Data and Function types survive the
 * AST → GraphNode → model-to-ast round-trip without data loss.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { astToModel } from '../../src/adapters/ast-to-model.js';
import { modelsToAst } from '../../src/adapters/model-to-ast.js';
import { conditionsToDisplay } from '../../src/adapters/model-helpers.js';

const CONDITION_MODEL_SOURCE = `
namespace test.conditions
version "1.0.0"

type Trade:
  tradeDate date (1..1)
  quantity number (1..1)

  condition PositiveQuantity:
    quantity > 0

func Allocate:
  inputs:
    trade Trade (1..1)
    amount number (1..1)
  output:
    result Trade (1..1)

  condition AmountPositive:
    amount > 0

  set result:
    trade
`;

describe('Condition round-trip (T023, T025)', () => {
  it('preserves conditions through AST → graph → model round-trip', async () => {
    const result = await parse(CONDITION_MODEL_SOURCE);
    expect(result.hasErrors).toBe(false);

    // AST → graph nodes/edges
    const { nodes, edges } = astToModel([result.value]);
    expect(nodes.length).toBeGreaterThan(0);

    // Find the Trade node with conditions
    const tradeNode = nodes.find((n) => n.data.name === 'Trade');
    expect(tradeNode).toBeDefined();

    // Verify conditions are present on the graph node
    const tradeData = tradeNode!.data as Record<string, unknown>;
    const tradeConditions = tradeData['conditions'] as unknown[] | undefined;
    expect(tradeConditions).toBeDefined();
    expect(tradeConditions!.length).toBeGreaterThan(0);

    // Find the Allocate function with conditions
    const allocateNode = nodes.find((n) => n.data.name === 'Allocate');
    expect(allocateNode).toBeDefined();
    const allocateData = allocateNode!.data as Record<string, unknown>;
    const allocateConditions = allocateData['conditions'] as unknown[] | undefined;
    expect(allocateConditions).toBeDefined();
    expect(allocateConditions!.length).toBeGreaterThan(0);

    // Round-trip back to model output
    const outputModels = modelsToAst(nodes, edges);
    expect(outputModels.length).toBeGreaterThan(0);

    // Find Trade element in output
    const outputTrade = outputModels[0]!.elements.find(
      (el) => (el as Record<string, unknown>)['name'] === 'Trade'
    ) as Record<string, unknown>;
    expect(outputTrade).toBeDefined();
    expect(outputTrade['conditions']).toBeDefined();
    expect((outputTrade['conditions'] as unknown[]).length).toBeGreaterThan(0);

    // Find Allocate element in output
    const outputAllocate = outputModels[0]!.elements.find(
      (el) => (el as Record<string, unknown>)['name'] === 'Allocate'
    ) as Record<string, unknown>;
    expect(outputAllocate).toBeDefined();
    expect(outputAllocate['conditions']).toBeDefined();
    expect((outputAllocate['conditions'] as unknown[]).length).toBeGreaterThan(0);
  });

  it('conditionsToDisplay extracts condition names and expressions', async () => {
    const result = await parse(CONDITION_MODEL_SOURCE);
    const { nodes } = astToModel([result.value]);

    const tradeNode = nodes.find((n) => n.data.name === 'Trade');
    const tradeData = tradeNode!.data as Record<string, unknown>;
    const displays = conditionsToDisplay(tradeData['conditions'] as any);
    expect(displays.length).toBeGreaterThan(0);
    expect(displays[0]!.name).toBe('PositiveQuantity');
  });
});
