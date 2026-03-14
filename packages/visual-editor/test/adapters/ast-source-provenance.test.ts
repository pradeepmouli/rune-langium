/**
 * Tests for AST source provenance on graph nodes.
 *
 * Verifies that astToModel populates the AST fields on GraphNode<T>,
 * preserving full Langium AST type information across
 * the AST → model → serialized-AST pipeline.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import type { Attribute } from '@rune-langium/core';
import { astToModel } from '../../src/adapters/ast-to-model.js';
import { modelsToAst } from '../../src/adapters/model-to-ast.js';
import type { GraphNode } from '../../src/types.js';
import type { Data, Choice, RosettaEnumeration } from '@rune-langium/core';
import {
  SIMPLE_INHERITANCE_SOURCE,
  CHOICE_MODEL_SOURCE,
  ENUM_MODEL_SOURCE,
  COMBINED_MODEL_SOURCE
} from '../helpers/fixture-loader.js';

// ---------------------------------------------------------------------------
// astToModel source provenance
// ---------------------------------------------------------------------------

describe('AST source provenance on graph nodes', () => {
  it('Data nodes carry the Data AST fields', async () => {
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    const { nodes } = astToModel(result.value);

    const tradeNode = nodes.find((n) => n.data.name === 'Trade');
    expect(tradeNode).toBeDefined();

    const data = tradeNode!.data as GraphNode<Data>;
    expect(data.$type).toBe('Data');
    expect(data.name).toBe('Trade');
    // Rich info preserved: superType reference is accessible
    expect(data.superType?.$refText).toBe('Event');
  });

  it('Choice nodes carry the Choice AST fields', async () => {
    const result = await parse(CHOICE_MODEL_SOURCE);
    const { nodes } = astToModel(result.value);

    const choiceNode = nodes.find((n) => n.data.name === 'PaymentType');
    expect(choiceNode).toBeDefined();

    const data = choiceNode!.data as GraphNode<Choice>;
    expect(data.$type).toBe('Choice');
    expect(data.name).toBe('PaymentType');
  });

  it('Enum nodes carry the RosettaEnumeration AST fields', async () => {
    const result = await parse(ENUM_MODEL_SOURCE);
    const { nodes } = astToModel(result.value);

    const enumNode = nodes.find((n) => n.data.name === 'CurrencyEnum');
    expect(enumNode).toBeDefined();

    const data = enumNode!.data as GraphNode<RosettaEnumeration>;
    expect(data.$type).toBe('RosettaEnumeration');
    expect(data.name).toBe('CurrencyEnum');
    // Rich info: enumValues are accessible
    expect(data.enumValues.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Member source provenance
// ---------------------------------------------------------------------------

describe('AST source provenance on graph members', () => {
  it('Data attribute members carry Attribute AST fields', async () => {
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    const { nodes } = astToModel(result.value);

    const tradeNode = nodes.find((n) => n.data.name === 'Trade');
    const data = tradeNode!.data as GraphNode<Data>;
    const tradeDateAttr = data.attributes.find((a) => a.name === 'tradeDate');

    expect(tradeDateAttr).toBeDefined();
    expect((tradeDateAttr as unknown as Attribute).$type).toBe('Attribute');
    expect(tradeDateAttr!.name).toBe('tradeDate');
    // Rich info: cardinality object is accessible
    expect(tradeDateAttr!.card).toBeDefined();
    expect(tradeDateAttr!.card.inf).toBe(1);
  });

  it('Choice member carries ChoiceOption AST fields', async () => {
    const result = await parse(CHOICE_MODEL_SOURCE);
    const { nodes } = astToModel(result.value);

    const choiceNode = nodes.find((n) => n.data.name === 'PaymentType');
    const data = choiceNode!.data as GraphNode<Choice>;
    expect(data.attributes.length).toBe(2);

    const firstOption = data.attributes[0]!;
    expect((firstOption as unknown as { $type: string }).$type).toBe('ChoiceOption');
  });

  it('Enum member carries RosettaEnumValue AST fields', async () => {
    const result = await parse(ENUM_MODEL_SOURCE);
    const { nodes } = astToModel(result.value);

    const enumNode = nodes.find((n) => n.data.name === 'CurrencyEnum');
    const data = enumNode!.data as GraphNode<RosettaEnumeration>;
    const usdValue = data.enumValues.find((v) => v.name === 'USD');

    expect(usdValue).toBeDefined();
    expect((usdValue as unknown as { $type: string }).$type).toBe('RosettaEnumValue');
  });
});

// ---------------------------------------------------------------------------
// Rich metadata access
// ---------------------------------------------------------------------------

describe('Rich metadata accessible through AST fields', () => {
  it('Data.conditions is accessible', async () => {
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    const { nodes } = astToModel(result.value);

    const eventNode = nodes.find((n) => n.data.name === 'Event');
    const data = eventNode!.data as GraphNode<Data>;
    // conditions array is accessible (even if empty for this fixture)
    expect(Array.isArray(data.conditions)).toBe(true);
  });

  it('Data.annotations is accessible', async () => {
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    const { nodes } = astToModel(result.value);

    const eventNode = nodes.find((n) => n.data.name === 'Event');
    const data = eventNode!.data as GraphNode<Data>;
    expect(Array.isArray(data.annotations)).toBe(true);
  });

  it('Attribute.typeCall is accessible via attribute', async () => {
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    const { nodes } = astToModel(result.value);

    const tradeNode = nodes.find((n) => n.data.name === 'Trade');
    const data = tradeNode!.data as GraphNode<Data>;
    const productAttr = data.attributes.find((a) => a.name === 'product');

    expect(productAttr!.typeCall).toBeDefined();
    expect(productAttr!.typeCall.type?.$refText).toBe('Product');
  });
});

// ---------------------------------------------------------------------------
// Source round-trip through modelsToAst
// ---------------------------------------------------------------------------

describe('Source round-trip via modelsToAst', () => {
  it('Model element carries Data fields from graph node', async () => {
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    const { nodes, edges } = astToModel(result.value);
    const models = modelsToAst(nodes, edges);

    const model = models.find((m) => m.name === 'test.model');
    expect(model).toBeDefined();

    const tradeElement = model!.elements.find((e) => (e as { name?: string }).name === 'Trade') as
      | Record<string, unknown>
      | undefined;
    expect(tradeElement).toBeDefined();
    expect(tradeElement!.$type).toBe('Data');
    expect(tradeElement!.name).toBe('Trade');
  });

  it('Model element carries attributes', async () => {
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    const { nodes, edges } = astToModel(result.value);
    const models = modelsToAst(nodes, edges);

    const model = models.find((m) => m.name === 'test.model');
    const tradeElement = model!.elements.find((e) => (e as { name?: string }).name === 'Trade') as
      | Record<string, unknown>
      | undefined;

    if (tradeElement!.$type === 'Data') {
      const attributes = tradeElement!.attributes as Array<{ name: string; $type?: string }>;
      const tradeDateAttr = attributes.find((a) => a.name === 'tradeDate');
      expect(tradeDateAttr).toBeDefined();
      expect(tradeDateAttr!.$type).toBe('Attribute');
    }
  });

  it('Model element carries RosettaEnumeration fields', async () => {
    const result = await parse(COMBINED_MODEL_SOURCE);
    const { nodes, edges } = astToModel(result.value);
    const models = modelsToAst(nodes, edges);

    const model = models[0]!;
    const enumElement = model.elements.find(
      (e) => (e as { $type?: string }).$type === 'RosettaEnumeration'
    ) as Record<string, unknown> | undefined;
    expect(enumElement).toBeDefined();
    expect(enumElement!.$type).toBe('RosettaEnumeration');
  });

  it('Model element carries enum values', async () => {
    const result = await parse(ENUM_MODEL_SOURCE);
    const { nodes, edges } = astToModel(result.value);
    const models = modelsToAst(nodes, edges);

    const model = models[0]!;
    const enumElement = model.elements.find(
      (e) => (e as { $type?: string }).$type === 'RosettaEnumeration'
    ) as Record<string, unknown> | undefined;

    if (enumElement!.$type === 'RosettaEnumeration') {
      const enumValues = enumElement!.enumValues as Array<{ name: string; $type?: string }>;
      expect(enumValues.length).toBe(3);
      for (const val of enumValues) {
        expect(val.$type).toBe('RosettaEnumValue');
      }
    }
  });
});
