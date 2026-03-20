// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for ExpressionNode schemas — validate schema shapes,
 * discriminated union parsing, placeholder/unsupported variants.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import {
  ExpressionNodeSchema,
  type ExpressionNode
} from '../../src/schemas/expression-node-schema.js';

describe('ExpressionNodeSchema', () => {
  describe('discriminated union', () => {
    it('parses ArithmeticOperation', () => {
      const node = {
        $type: 'ArithmeticOperation',
        id: 'n1',
        operator: '+',
        left: { $type: 'Placeholder', id: 'p1' },
        right: { $type: 'Placeholder', id: 'p2' }
      };
      const result = ExpressionNodeSchema.safeParse(node);
      expect(result.success).toBe(true);
    });

    it('parses ComparisonOperation', () => {
      const node = {
        $type: 'ComparisonOperation',
        id: 'n1',
        operator: '>',
        right: { $type: 'Placeholder', id: 'p1' }
      };
      const result = ExpressionNodeSchema.safeParse(node);
      expect(result.success).toBe(true);
    });

    it('parses LogicalOperation', () => {
      const node = {
        $type: 'LogicalOperation',
        id: 'n1',
        operator: 'and',
        left: { $type: 'RosettaBooleanLiteral', id: 'l1', value: true },
        right: { $type: 'RosettaBooleanLiteral', id: 'l2', value: false }
      };
      const result = ExpressionNodeSchema.safeParse(node);
      expect(result.success).toBe(true);
    });

    it('parses EqualityOperation', () => {
      const node = {
        $type: 'EqualityOperation',
        id: 'n1',
        operator: '=',
        right: { $type: 'Placeholder', id: 'p1' }
      };
      const result = ExpressionNodeSchema.safeParse(node);
      expect(result.success).toBe(true);
    });
  });

  describe('unary operations', () => {
    it('parses DistinctOperation', () => {
      const node = {
        $type: 'DistinctOperation',
        id: 'n1',
        operator: 'distinct',
        argument: { $type: 'RosettaSymbolReference', id: 'r1', symbol: 'items' }
      };
      const result = ExpressionNodeSchema.safeParse(node);
      expect(result.success).toBe(true);
    });

    it('parses RosettaCountOperation', () => {
      const node = {
        $type: 'RosettaCountOperation',
        id: 'n1',
        operator: 'count'
      };
      const result = ExpressionNodeSchema.safeParse(node);
      expect(result.success).toBe(true);
    });

    it('parses ToStringOperation', () => {
      const node = {
        $type: 'ToStringOperation',
        id: 'n1',
        operator: 'to-string',
        argument: { $type: 'RosettaIntLiteral', id: 'l1', value: 42n }
      };
      const result = ExpressionNodeSchema.safeParse(node);
      expect(result.success).toBe(true);
    });
  });

  describe('navigation', () => {
    it('parses RosettaFeatureCall with resolved reference', () => {
      const node = {
        $type: 'RosettaFeatureCall',
        id: 'n1',
        receiver: { $type: 'RosettaSymbolReference', id: 'r1', symbol: 'trade' },
        feature: 'price'
      };
      const result = ExpressionNodeSchema.safeParse(node);
      expect(result.success).toBe(true);
    });

    it('parses RosettaDeepFeatureCall', () => {
      const node = {
        $type: 'RosettaDeepFeatureCall',
        id: 'n1',
        receiver: { $type: 'RosettaSymbolReference', id: 'r1', symbol: 'trade' },
        feature: 'amount'
      };
      const result = ExpressionNodeSchema.safeParse(node);
      expect(result.success).toBe(true);
    });
  });

  describe('lambda operations', () => {
    it('parses FilterOperation with inline function', () => {
      const node = {
        $type: 'FilterOperation',
        id: 'n1',
        operator: 'filter',
        argument: { $type: 'RosettaSymbolReference', id: 'r1', symbol: 'items' },
        function: {
          $type: 'InlineFunction',
          body: { $type: 'Placeholder', id: 'p1' },
          parameters: [{ $type: 'ClosureParameter', name: 'item' }]
        }
      };
      const result = ExpressionNodeSchema.safeParse(node);
      expect(result.success).toBe(true);
    });

    it('parses ReduceOperation', () => {
      const node = {
        $type: 'ReduceOperation',
        id: 'n1',
        operator: 'reduce',
        argument: { $type: 'Placeholder', id: 'p1' },
        function: {
          $type: 'InlineFunction',
          body: { $type: 'Placeholder', id: 'p2' }
        }
      };
      const result = ExpressionNodeSchema.safeParse(node);
      expect(result.success).toBe(true);
    });
  });

  describe('control flow', () => {
    it('parses RosettaConditionalExpression', () => {
      const node = {
        $type: 'RosettaConditionalExpression',
        id: 'n1',
        if: { $type: 'RosettaBooleanLiteral', id: 'l1', value: true },
        ifthen: { $type: 'RosettaIntLiteral', id: 'l2', value: 1n },
        elsethen: { $type: 'RosettaIntLiteral', id: 'l3', value: 0n }
      };
      const result = ExpressionNodeSchema.safeParse(node);
      expect(result.success).toBe(true);
    });

    it('parses SwitchOperation with cases', () => {
      const node = {
        $type: 'SwitchOperation',
        id: 'n1',
        operator: 'switch',
        argument: { $type: 'RosettaSymbolReference', id: 'r1', symbol: 'status' },
        cases: [
          {
            $type: 'SwitchCaseOrDefault',
            expression: { $type: 'RosettaStringLiteral', id: 'l1', value: 'active' },
            guard: {
              $type: 'SwitchCaseGuard',
              referenceGuard: 'Active'
            }
          }
        ]
      };
      const result = ExpressionNodeSchema.safeParse(node);
      expect(result.success).toBe(true);
    });
  });

  describe('constructor', () => {
    it('parses RosettaConstructorExpression', () => {
      const node = {
        $type: 'RosettaConstructorExpression',
        id: 'n1',
        typeRef: { $type: 'RosettaSymbolReference', symbol: 'TradeDate' },
        values: [
          {
            $type: 'ConstructorKeyValuePair',
            key: 'date',
            value: { $type: 'Placeholder', id: 'p1' }
          }
        ]
      };
      const result = ExpressionNodeSchema.safeParse(node);
      expect(result.success).toBe(true);
    });
  });

  describe('literals', () => {
    it('parses RosettaBooleanLiteral', () => {
      const result = ExpressionNodeSchema.safeParse({
        $type: 'RosettaBooleanLiteral',
        id: 'l1',
        value: true
      });
      expect(result.success).toBe(true);
    });

    it('parses RosettaIntLiteral', () => {
      const result = ExpressionNodeSchema.safeParse({
        $type: 'RosettaIntLiteral',
        id: 'l1',
        value: 42n
      });
      expect(result.success).toBe(true);
    });

    it('parses RosettaNumberLiteral', () => {
      const result = ExpressionNodeSchema.safeParse({
        $type: 'RosettaNumberLiteral',
        id: 'l1',
        value: '3.14'
      });
      expect(result.success).toBe(true);
    });

    it('parses RosettaStringLiteral', () => {
      const result = ExpressionNodeSchema.safeParse({
        $type: 'RosettaStringLiteral',
        id: 'l1',
        value: 'hello'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('references', () => {
    it('parses RosettaSymbolReference with resolved symbol', () => {
      const result = ExpressionNodeSchema.safeParse({
        $type: 'RosettaSymbolReference',
        id: 'r1',
        symbol: 'trade'
      });
      expect(result.success).toBe(true);
    });

    it('parses RosettaImplicitVariable', () => {
      const result = ExpressionNodeSchema.safeParse({
        $type: 'RosettaImplicitVariable',
        id: 'r1',
        name: 'item'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('collection', () => {
    it('parses ListLiteral', () => {
      const result = ExpressionNodeSchema.safeParse({
        $type: 'ListLiteral',
        id: 'l1',
        elements: [
          { $type: 'RosettaIntLiteral', id: 'e1', value: 1n },
          { $type: 'RosettaIntLiteral', id: 'e2', value: 2n }
        ]
      });
      expect(result.success).toBe(true);
    });
  });

  describe('UI-only variants', () => {
    it('parses Placeholder', () => {
      const result = ExpressionNodeSchema.safeParse({
        $type: 'Placeholder',
        id: 'p1',
        expectedType: 'numeric'
      });
      expect(result.success).toBe(true);
    });

    it('parses Placeholder without expectedType', () => {
      const result = ExpressionNodeSchema.safeParse({
        $type: 'Placeholder',
        id: 'p1'
      });
      expect(result.success).toBe(true);
    });

    it('parses Unsupported', () => {
      const result = ExpressionNodeSchema.safeParse({
        $type: 'Unsupported',
        id: 'u1',
        rawText: 'some -> unknown -> syntax'
      });
      expect(result.success).toBe(true);
    });

    it('rejects Placeholder without id', () => {
      const result = ExpressionNodeSchema.safeParse({
        $type: 'Placeholder'
      });
      expect(result.success).toBe(false);
    });

    it('rejects Unsupported without rawText', () => {
      const result = ExpressionNodeSchema.safeParse({
        $type: 'Unsupported',
        id: 'u1'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('nested expressions', () => {
    it('handles deeply nested expression tree', () => {
      const node: ExpressionNode = {
        $type: 'ArithmeticOperation',
        id: 'n1',
        operator: '+',
        left: {
          $type: 'ArithmeticOperation',
          id: 'n2',
          operator: '*',
          left: { $type: 'RosettaIntLiteral', id: 'l1', value: 2n },
          right: { $type: 'RosettaSymbolReference', id: 'r1', symbol: 'price' }
        },
        right: { $type: 'RosettaIntLiteral', id: 'l2', value: 10n }
      };
      const result = ExpressionNodeSchema.safeParse(node);
      expect(result.success).toBe(true);
    });
  });

  describe('rejects invalid', () => {
    it('rejects unknown $type', () => {
      const result = ExpressionNodeSchema.safeParse({
        $type: 'UnknownType',
        id: 'x'
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing $type', () => {
      const result = ExpressionNodeSchema.safeParse({ id: 'x' });
      expect(result.success).toBe(false);
    });
  });
});
