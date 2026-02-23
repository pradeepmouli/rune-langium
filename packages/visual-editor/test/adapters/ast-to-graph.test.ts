/**
 * Unit tests for the AST → graph adapter.
 *
 * Verifies correct mapping of Data, Choice, and Enum AST types
 * to ReactFlow nodes and edges.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { astToGraph } from '../../src/adapters/ast-to-graph.js';
import {
  SIMPLE_INHERITANCE_SOURCE,
  CHOICE_MODEL_SOURCE,
  ENUM_MODEL_SOURCE,
  COMBINED_MODEL_SOURCE,
  DEEP_INHERITANCE_SOURCE,
  EMPTY_MODEL_SOURCE
} from '../helpers/fixture-loader.js';

describe('astToGraph', () => {
  describe('Data types', () => {
    it('creates nodes for Data types', async () => {
      const result = await parse(SIMPLE_INHERITANCE_SOURCE);
      const { nodes } = astToGraph(result.value);

      const dataNodes = nodes.filter((n) => n.data.kind === 'data');
      expect(dataNodes.length).toBeGreaterThanOrEqual(2);

      const tradeNode = dataNodes.find((n) => n.data.name === 'Trade');
      expect(tradeNode).toBeDefined();
      expect(tradeNode!.type).toBe('data');
      expect(tradeNode!.data.namespace).toBe('test.model');
    });

    it('maps attributes as members with type and cardinality', async () => {
      const result = await parse(SIMPLE_INHERITANCE_SOURCE);
      const { nodes } = astToGraph(result.value);

      const tradeNode = nodes.find((n) => n.data.name === 'Trade');
      expect(tradeNode).toBeDefined();

      const tradeDateMember = tradeNode!.data.members.find((m) => m.name === 'tradeDate');
      expect(tradeDateMember).toBeDefined();
      expect(tradeDateMember!.typeName).toBe('date');
      expect(tradeDateMember!.cardinality).toBe('(1..1)');
    });

    it('creates extends edges for Data inheritance', async () => {
      const result = await parse(SIMPLE_INHERITANCE_SOURCE);
      const { edges } = astToGraph(result.value);

      const extendsEdges = edges.filter((e) => e.data?.kind === 'extends');
      expect(extendsEdges.length).toBeGreaterThanOrEqual(1);

      // Trade extends Event
      const tradeExtendsEdge = extendsEdges.find(
        (e) => e.id.includes('Trade') && e.id.includes('Event')
      );
      expect(tradeExtendsEdge).toBeDefined();
    });

    it('creates attribute-ref edges for type references', async () => {
      const result = await parse(SIMPLE_INHERITANCE_SOURCE);
      const { edges } = astToGraph(result.value);

      const refEdges = edges.filter((e) => e.data?.kind === 'attribute-ref');
      // Trade.product -> Product should create a ref edge
      const productRefEdge = refEdges.find((e) => e.data?.label === 'product');
      expect(productRefEdge).toBeDefined();
    });
  });

  describe('Choice types', () => {
    it('creates nodes for Choice types', async () => {
      const result = await parse(CHOICE_MODEL_SOURCE);
      const { nodes } = astToGraph(result.value);

      const choiceNodes = nodes.filter((n) => n.data.kind === 'choice');
      expect(choiceNodes.length).toBe(1);

      const paymentChoice = choiceNodes[0];
      expect(paymentChoice!.data.name).toBe('PaymentType');
      expect(paymentChoice!.type).toBe('choice');
    });

    it('creates choice-option edges', async () => {
      const result = await parse(CHOICE_MODEL_SOURCE);
      const { edges } = astToGraph(result.value);

      const optionEdges = edges.filter((e) => e.data?.kind === 'choice-option');
      expect(optionEdges.length).toBe(2);
    });
  });

  describe('Enum types', () => {
    it('creates nodes for Enumeration types', async () => {
      const result = await parse(ENUM_MODEL_SOURCE);
      const { nodes } = astToGraph(result.value);

      const enumNodes = nodes.filter((n) => n.data.kind === 'enum');
      expect(enumNodes.length).toBe(1);

      const currencyEnum = enumNodes[0];
      expect(currencyEnum!.data.name).toBe('CurrencyEnum');
      expect(currencyEnum!.type).toBe('enum');
    });

    it('maps enum values as members', async () => {
      const result = await parse(ENUM_MODEL_SOURCE);
      const { nodes } = astToGraph(result.value);

      const currencyEnum = nodes.find((n) => n.data.name === 'CurrencyEnum');
      expect(currencyEnum).toBeDefined();
      expect(currencyEnum!.data.members).toHaveLength(3);

      const memberNames = currencyEnum!.data.members.map((m) => m.name);
      expect(memberNames).toContain('USD');
      expect(memberNames).toContain('EUR');
      expect(memberNames).toContain('GBP');
    });
  });

  describe('Combined model', () => {
    it('creates nodes for all type kinds', async () => {
      const result = await parse(COMBINED_MODEL_SOURCE);
      const { nodes } = astToGraph(result.value);

      const dataNodes = nodes.filter((n) => n.data.kind === 'data');
      const choiceNodes = nodes.filter((n) => n.data.kind === 'choice');
      const enumNodes = nodes.filter((n) => n.data.kind === 'enum');

      expect(dataNodes.length).toBe(2); // Trade, Product
      expect(choiceNodes.length).toBe(1); // PaymentType
      expect(enumNodes.length).toBe(1); // CurrencyEnum
    });

    it('creates edges across type kinds', async () => {
      const result = await parse(COMBINED_MODEL_SOURCE);
      const { edges } = astToGraph(result.value);

      // Trade.currency -> CurrencyEnum should be an attribute-ref edge
      const currencyEdge = edges.find(
        (e) => e.data?.kind === 'attribute-ref' && e.data.label === 'currency'
      );
      expect(currencyEdge).toBeDefined();

      // PaymentType -> Trade and PaymentType -> Product are choice-option edges
      const optionEdges = edges.filter((e) => e.data?.kind === 'choice-option');
      expect(optionEdges.length).toBe(2);
    });
  });

  describe('Deep inheritance', () => {
    it('creates chain of extends edges', async () => {
      const result = await parse(DEEP_INHERITANCE_SOURCE);
      const { edges } = astToGraph(result.value);

      const extendsEdges = edges.filter((e) => e.data?.kind === 'extends');
      expect(extendsEdges.length).toBe(2); // Middle->Base, Leaf->Middle
    });
  });

  describe('Empty model', () => {
    it('returns empty nodes and edges', async () => {
      const result = await parse(EMPTY_MODEL_SOURCE);
      const { nodes, edges } = astToGraph(result.value);

      expect(nodes).toHaveLength(0);
      expect(edges).toHaveLength(0);
    });
  });

  describe('Filters', () => {
    it('filters by type kind', async () => {
      const result = await parse(COMBINED_MODEL_SOURCE);
      const { nodes } = astToGraph(result.value, {
        filters: { kinds: ['data'] }
      });

      expect(nodes.every((n) => n.data.kind === 'data')).toBe(true);
    });

    it('filters by name pattern', async () => {
      const result = await parse(COMBINED_MODEL_SOURCE);
      const { nodes } = astToGraph(result.value, {
        filters: { namePattern: 'Trade' }
      });

      expect(nodes.length).toBe(1);
      expect(nodes[0]!.data.name).toBe('Trade');
    });

    it('hides orphan nodes when hideOrphans is true', async () => {
      const result = await parse(COMBINED_MODEL_SOURCE);
      const { nodes: allNodes } = astToGraph(result.value);
      const { nodes: filteredNodes } = astToGraph(result.value, {
        filters: { hideOrphans: true }
      });

      expect(filteredNodes.length).toBeLessThanOrEqual(allNodes.length);
    });
  });

  describe('Multiple models', () => {
    it('merges nodes from multiple models', async () => {
      const result1 = await parse(SIMPLE_INHERITANCE_SOURCE);
      const result2 = await parse(ENUM_MODEL_SOURCE);
      const { nodes } = astToGraph([result1.value, result2.value]);

      const dataNodes = nodes.filter((n) => n.data.kind === 'data');
      const enumNodes = nodes.filter((n) => n.data.kind === 'enum');

      expect(dataNodes.length).toBeGreaterThanOrEqual(2);
      expect(enumNodes.length).toBe(1);
    });
  });

  describe('TypeAlias types', () => {
    it('creates a typeAlias node and a type-alias-ref edge to the target type', async () => {
      const source = `
        namespace test.aliases
        version "1.0.0"

        basicType string

        typeAlias ShortText: string
      `;
      const result = await parse(source);
      const { nodes, edges } = astToGraph(result.value);

      const aliasNode = nodes.find((n) => n.data.kind === 'typeAlias');
      expect(aliasNode).toBeDefined();
      expect(aliasNode!.data.name).toBe('ShortText');
      expect(aliasNode!.type).toBe('typeAlias');

      const aliasEdge = edges.find((e) => e.data?.kind === 'type-alias-ref');
      expect(aliasEdge).toBeDefined();
      expect(aliasEdge!.type).toBe('type-alias-ref');
      expect(aliasEdge!.source).toBe(aliasNode!.id);
      // Edge id should consistently use --type-alias-ref-- segment
      expect(aliasEdge!.id).toContain('--type-alias-ref--');
    });
  });

  describe('isReadOnly from document URI', () => {
    it('marks nodes as isReadOnly when model has a system:// URI', async () => {
      const result = await parse(
        `
        namespace com.rosetta.model
        version "1.0.0"

        basicType string
        basicType number
        basicType boolean
        basicType date
        basicType dateTime
        `,
        'system://com.rosetta.model/basictypes.rosetta'
      );
      const { nodes } = astToGraph(result.value);

      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes.every((n) => n.data.isReadOnly === true)).toBe(true);
    });

    it('marks nodes as NOT isReadOnly when model has a regular URI', async () => {
      const result = await parse(SIMPLE_INHERITANCE_SOURCE, 'file:///workspace/model.rosetta');
      const { nodes } = astToGraph(result.value);

      const dataNodes = nodes.filter((n) => n.data.kind === 'data');
      expect(dataNodes.length).toBeGreaterThan(0);
      expect(dataNodes.every((n) => n.data.isReadOnly === false)).toBe(true);
    });
  });
});
