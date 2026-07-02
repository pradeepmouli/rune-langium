// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * buildAttributeTypesMap — walks the FULL `extends` chain (not just the
 * direct parent). Found via the transpiler-emitter-parity corpus gate:
 * `QuantitySchedule extends MeasureSchedule extends MeasureBase`, with
 * `unit` declared on the grandparent `MeasureBase`, was reported as an
 * "unknown attribute" by `condition UnitOfAmountExists: unit exists` —
 * a real pre-existing gap (attributes 2+ levels up an extends chain were
 * silently invisible to exists/absent condition validation), not something
 * introduced by the W1/W2 work.
 */

import { describe, it, expect } from 'vitest';
import { parseWorkspace, isData, type Data } from '@rune-langium/core';
import { buildAttributeTypesMap } from '../../src/emit/base-namespace-emitter.js';

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

const THREE_LEVEL_FIXTURE = `
namespace test.inherit
version "0.0.0"

type GrandParent:
    unit string (0..1)

type Parent extends GrandParent:
    middle string (0..1)

type Child extends Parent:
    own string (0..1)

    condition UnitExists:
        unit exists
`;

describe('buildAttributeTypesMap', () => {
  it('includes own attributes', async () => {
    const dataByName = await parseSingleNamespaceDataByName(THREE_LEVEL_FIXTURE);
    const child = dataByName.get('Child')!;
    const map = buildAttributeTypesMap(child);
    expect(map.has('own')).toBe(true);
  });

  it('includes direct-parent attributes (pre-existing behavior)', async () => {
    const dataByName = await parseSingleNamespaceDataByName(THREE_LEVEL_FIXTURE);
    const child = dataByName.get('Child')!;
    const map = buildAttributeTypesMap(child);
    expect(map.has('middle')).toBe(true);
  });

  it('includes grandparent (2-level-up) attributes', async () => {
    const dataByName = await parseSingleNamespaceDataByName(THREE_LEVEL_FIXTURE);
    const child = dataByName.get('Child')!;
    const map = buildAttributeTypesMap(child);
    expect(map.has('unit')).toBe(true);
  });

  it('a child-declared attribute shadows a same-named ancestor attribute (nearest wins)', async () => {
    const source = `
namespace test.shadow
version "0.0.0"

type Base:
    value string (0..1)

type Derived extends Base:
    value number (0..1)
`;
    const dataByName = await parseSingleNamespaceDataByName(source);
    const derived = dataByName.get('Derived')!;
    const map = buildAttributeTypesMap(derived);
    // typeCall.type.$refText is the raw type reference text — 'number' from
    // Derived's own declaration, not 'string' from Base.
    expect(map.get('value')).toBe('number');
  });
});
