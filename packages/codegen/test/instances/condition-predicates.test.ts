// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { parseWorkspace, isData, type Data } from '@rune-langium/core';
import { getActiveConditionPredicates } from '../../src/instances/condition-predicates.js';

async function parseSingleNamespaceDataByName(source: string): Promise<Map<string, Data>> {
  const [result] = await parseWorkspace([{ uri: 'inmemory:///model.rosetta', content: source }]);
  expect(result!.hasErrors, 'expected fixture to parse without errors').toBe(false);
  const model = result!.value as unknown as { elements: unknown[] };
  const map = new Map<string, Data>();
  for (const el of model.elements) {
    if (isData(el)) map.set(el.name, el);
  }
  return map;
}

const FIXTURE = `
namespace test.conditions
version "0.0.0"

type Trade:
  quantity number (1..1)

  condition PositiveQuantity:
    quantity > 0
`;

describe('getActiveConditionPredicates', () => {
  it('returns one predicate per active condition, executable against a data object', async () => {
    const dataByName = await parseSingleNamespaceDataByName(FIXTURE);
    const data = dataByName.get('Trade')!;
    const predicates = getActiveConditionPredicates(data);
    expect(predicates).toHaveLength(1);
    expect(predicates[0]?.name).toBe('PositiveQuantity');

    const check = new Function('data', `return (${predicates[0]!.predicate});`);
    expect(check({ quantity: 5 })).toBe(true);
    expect(check({ quantity: -1 })).toBe(false);
  });

  it('returns an empty array for a type with no conditions', async () => {
    const dataByName = await parseSingleNamespaceDataByName(`
namespace test.conditions
version "0.0.0"

type Plain:
  name string (1..1)
`);
    const data = dataByName.get('Plain')!;
    expect(getActiveConditionPredicates(data)).toEqual([]);
  });
});
