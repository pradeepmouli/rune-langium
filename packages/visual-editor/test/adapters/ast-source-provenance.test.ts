/**
 * Tests for AST source provenance on graph nodes and members.
 *
 * Verifies that astToGraph populates the `source` field on TypeNodeData
 * and MemberDisplay, preserving full Langium AST type information across
 * the AST → graph → synthetic-AST pipeline.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import type { Data, Choice, RosettaEnumeration, Attribute } from '@rune-langium/core';
import { astToGraph } from '../../src/adapters/ast-to-graph.js';
import { graphToModels } from '../../src/adapters/graph-to-ast.js';
import type { TypeNodeData } from '../../src/types.js';
import {
  SIMPLE_INHERITANCE_SOURCE,
  CHOICE_MODEL_SOURCE,
  ENUM_MODEL_SOURCE,
  COMBINED_MODEL_SOURCE
} from '../helpers/fixture-loader.js';

// ---------------------------------------------------------------------------
// astToGraph source provenance
// ---------------------------------------------------------------------------

describe('AST source provenance on graph nodes', () => {
  it('Data nodes carry the source Data AST node', async () => {
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    const { nodes } = astToGraph(result.value);

    const tradeNode = nodes.find((n) => n.data.name === 'Trade');
    expect(tradeNode).toBeDefined();

    const data = tradeNode!.data as TypeNodeData<'data'>;
    expect(data.source).toBeDefined();
    expect(data.source!.$type).toBe('Data');
    expect(data.source!.name).toBe('Trade');
    // Rich info preserved: superType reference is accessible
    expect(data.source!.superType?.$refText).toBe('Event');
  });

  it('Choice nodes carry the source Choice AST node', async () => {
    const result = await parse(CHOICE_MODEL_SOURCE);
    const { nodes } = astToGraph(result.value);

    const choiceNode = nodes.find((n) => n.data.name === 'PaymentType');
    expect(choiceNode).toBeDefined();

    const data = choiceNode!.data as TypeNodeData<'choice'>;
    expect(data.source).toBeDefined();
    expect(data.source!.$type).toBe('Choice');
    expect(data.source!.name).toBe('PaymentType');
  });

  it('Enum nodes carry the source RosettaEnumeration AST node', async () => {
    const result = await parse(ENUM_MODEL_SOURCE);
    const { nodes } = astToGraph(result.value);

    const enumNode = nodes.find((n) => n.data.name === 'CurrencyEnum');
    expect(enumNode).toBeDefined();

    const data = enumNode!.data as TypeNodeData<'enum'>;
    expect(data.source).toBeDefined();
    expect(data.source!.$type).toBe('RosettaEnumeration');
    expect(data.source!.name).toBe('CurrencyEnum');
    // Rich info: enumValues are accessible from source
    expect(data.source!.enumValues.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Member source provenance
// ---------------------------------------------------------------------------

describe('AST source provenance on graph members', () => {
  it('Data attribute members carry source Attribute AST nodes', async () => {
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    const { nodes } = astToGraph(result.value);

    const tradeNode = nodes.find((n) => n.data.name === 'Trade');
    const tradeDateMember = tradeNode!.data.members.find((m) => m.name === 'tradeDate');

    expect(tradeDateMember).toBeDefined();
    expect(tradeDateMember!.source).toBeDefined();

    const attr = tradeDateMember!.source as Attribute;
    expect(attr.$type).toBe('Attribute');
    expect(attr.name).toBe('tradeDate');
    // Rich info: cardinality object is accessible
    expect(attr.card).toBeDefined();
    expect(attr.card.inf).toBe(1);
  });

  it('Choice member carries source ChoiceOption AST node', async () => {
    const result = await parse(CHOICE_MODEL_SOURCE);
    const { nodes } = astToGraph(result.value);

    const choiceNode = nodes.find((n) => n.data.name === 'PaymentType');
    expect(choiceNode!.data.members.length).toBe(2);

    const firstOption = choiceNode!.data.members[0]!;
    expect(firstOption.source).toBeDefined();
    expect((firstOption.source as { $type: string }).$type).toBe('ChoiceOption');
  });

  it('Enum member carries source RosettaEnumValue AST node', async () => {
    const result = await parse(ENUM_MODEL_SOURCE);
    const { nodes } = astToGraph(result.value);

    const enumNode = nodes.find((n) => n.data.name === 'CurrencyEnum');
    const usdMember = enumNode!.data.members.find((m) => m.name === 'USD');

    expect(usdMember).toBeDefined();
    expect(usdMember!.source).toBeDefined();
    expect((usdMember!.source as { $type: string }).$type).toBe('RosettaEnumValue');
  });
});

// ---------------------------------------------------------------------------
// Rich metadata access via source
// ---------------------------------------------------------------------------

describe('Rich metadata accessible through source references', () => {
  it('Data.conditions is accessible via source', async () => {
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    const { nodes } = astToGraph(result.value);

    const eventNode = nodes.find((n) => n.data.name === 'Event');
    const data = eventNode!.data as TypeNodeData<'data'>;
    expect(data.source).toBeDefined();
    // conditions array is accessible (even if empty for this fixture)
    expect(Array.isArray(data.source!.conditions)).toBe(true);
  });

  it('Data.annotations is accessible via source', async () => {
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    const { nodes } = astToGraph(result.value);

    const eventNode = nodes.find((n) => n.data.name === 'Event');
    const data = eventNode!.data as TypeNodeData<'data'>;
    expect(Array.isArray(data.source!.annotations)).toBe(true);
  });

  it('Attribute.typeCall is accessible via member source', async () => {
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    const { nodes } = astToGraph(result.value);

    const tradeNode = nodes.find((n) => n.data.name === 'Trade');
    const productMember = tradeNode!.data.members.find((m) => m.name === 'product');
    const attr = productMember!.source as Attribute;

    expect(attr.typeCall).toBeDefined();
    expect(attr.typeCall.type?.$refText).toBe('Product');
  });
});

// ---------------------------------------------------------------------------
// Source round-trip through graphToModels
// ---------------------------------------------------------------------------

describe('Source round-trip via graphToModels', () => {
  it('SyntheticData carries source from graph node', async () => {
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    const { nodes, edges } = astToGraph(result.value);
    const models = graphToModels(nodes, edges);

    const model = models.find((m) => m.name === 'test.model');
    expect(model).toBeDefined();

    const tradeElement = model!.elements.find((e) => e.name === 'Trade');
    expect(tradeElement).toBeDefined();
    expect(tradeElement!.$type).toBe('Data');

    if (tradeElement!.$type === 'Data') {
      expect(tradeElement!.source).toBeDefined();
      expect(tradeElement!.source!.$type).toBe('Data');
      expect(tradeElement!.source!.name).toBe('Trade');
    }
  });

  it('SyntheticAttribute carries source Attribute', async () => {
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    const { nodes, edges } = astToGraph(result.value);
    const models = graphToModels(nodes, edges);

    const model = models.find((m) => m.name === 'test.model');
    const tradeElement = model!.elements.find((e) => e.name === 'Trade');

    if (tradeElement!.$type === 'Data') {
      const tradeDateAttr = tradeElement!.attributes.find((a) => a.name === 'tradeDate');
      expect(tradeDateAttr).toBeDefined();
      expect(tradeDateAttr!.source).toBeDefined();
      expect(tradeDateAttr!.source!.$type).toBe('Attribute');
    }
  });

  it('SyntheticEnum carries source RosettaEnumeration', async () => {
    const result = await parse(COMBINED_MODEL_SOURCE);
    const { nodes, edges } = astToGraph(result.value);
    const models = graphToModels(nodes, edges);

    const model = models[0]!;
    const enumElement = model.elements.find((e) => e.$type === 'RosettaEnumeration');
    expect(enumElement).toBeDefined();

    if (enumElement!.$type === 'RosettaEnumeration') {
      expect(enumElement!.source).toBeDefined();
      expect(enumElement!.source!.$type).toBe('RosettaEnumeration');
    }
  });

  it('SyntheticEnumValue carries definition from source', async () => {
    // The enum values in our fixture don't have definitions,
    // but verify the round-trip pathway works
    const result = await parse(ENUM_MODEL_SOURCE);
    const { nodes, edges } = astToGraph(result.value);
    const models = graphToModels(nodes, edges);

    const model = models[0]!;
    const enumElement = model.elements.find((e) => e.$type === 'RosettaEnumeration');

    if (enumElement!.$type === 'RosettaEnumeration') {
      expect(enumElement!.enumValues.length).toBe(3);
      // source is preserved on each enum value
      for (const val of enumElement!.enumValues) {
        expect(val.source).toBeDefined();
        expect(val.source!.$type).toBe('RosettaEnumValue');
      }
    }
  });
});
