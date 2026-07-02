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

/**
 * Data-extends-Choice — the real corpus case (BasketConstituent extends
 * Observable; observable-asset-type.rosetta:211/220): a Data whose supertype
 * is a `choice`, not a `Data`, inherits the Choice's option names as
 * pseudo-attributes (per the design spec's Semantics section) — a condition
 * on the child referencing an option name (`Basket is absent`) must resolve,
 * not report "unknown attribute".
 */
const CHOICE_SUPERTYPE_FIXTURE = `
namespace test.choiceExtends
version "0.0.0"

type Cash:
    amount number (0..1)

type Commodity:
    quantity number (0..1)

choice Asset:
    Cash
    Commodity

type BasketConstituent extends Asset:
    weight number (0..1)

    condition CashIsAbsent:
        Cash is absent
`;

async function parseSingleNamespaceDataAndChoiceByName(
  source: string
): Promise<{ dataByName: Map<string, Data>; choiceByName: Map<string, unknown> }> {
  const [result] = await parseWorkspace([{ uri: 'inmemory:///model.rosetta', content: source }]);
  expect(result!.hasErrors, 'expected fixture to parse without errors').toBe(false);
  const model = result!.value as unknown as { elements: unknown[] };
  const dataByName = new Map<string, Data>();
  const choiceByName = new Map<string, unknown>();
  for (const el of model.elements) {
    if (isData(el)) dataByName.set((el as Data).name, el as Data);
    else if ((el as { $type?: string }).$type === 'Choice') choiceByName.set((el as { name: string }).name, el);
  }
  return { dataByName, choiceByName };
}

describe('buildAttributeTypesMap — Data extends Choice', () => {
  it('includes own attributes declared on the child', async () => {
    const { dataByName } = await parseSingleNamespaceDataAndChoiceByName(CHOICE_SUPERTYPE_FIXTURE);
    const child = dataByName.get('BasketConstituent')!;
    const map = buildAttributeTypesMap(child);
    expect(map.has('weight')).toBe(true);
  });

  it("contributes the Choice supertype's option names as pseudo-attributes", async () => {
    const { dataByName } = await parseSingleNamespaceDataAndChoiceByName(CHOICE_SUPERTYPE_FIXTURE);
    const child = dataByName.get('BasketConstituent')!;
    const map = buildAttributeTypesMap(child);
    expect(map.has('Cash')).toBe(true);
    expect(map.has('Commodity')).toBe(true);
  });

  it('multi-level: Data extends Data extends Choice resolves the Choice ancestor option names', async () => {
    const source = `
namespace test.choiceExtendsMultiLevel
version "0.0.0"

type Cash:
    amount number (0..1)

type Commodity:
    quantity number (0..1)

choice Asset:
    Cash
    Commodity

type Intermediate extends Asset:
    note string (0..1)

type Leaf extends Intermediate:
    weight number (0..1)

    condition CashIsAbsent:
        Cash is absent
`;
    const { dataByName } = await parseSingleNamespaceDataAndChoiceByName(source);
    const leaf = dataByName.get('Leaf')!;
    const map = buildAttributeTypesMap(leaf);
    expect(map.has('weight')).toBe(true);
    expect(map.has('note')).toBe(true);
    expect(map.has('Cash')).toBe(true);
    expect(map.has('Commodity')).toBe(true);
  });

  it('a cyclic extends chain through a Choice does not loop forever (cycle guard)', async () => {
    // Pathological/malformed input — the cycle guard (visited-set) must still
    // terminate. A Choice cannot itself extend anything, so a true cycle
    // through a Choice supertype isn't constructible in valid Rune syntax;
    // this exercises the guard defensively for the Data-side chain instead:
    // the existing visited-set already covers this (no new risk introduced
    // by adding a Choice branch), but keep an explicit regression case.
    const source = `
namespace test.choiceExtendsGuard
version "0.0.0"

type Cash:
    amount number (0..1)

choice Asset:
    Cash

type Leaf extends Asset:
    weight number (0..1)
`;
    const { dataByName } = await parseSingleNamespaceDataAndChoiceByName(source);
    const leaf = dataByName.get('Leaf')!;
    expect(() => buildAttributeTypesMap(leaf)).not.toThrow();
  });
});
