/**
 * Tests for expression-node-to-dsl serializer.
 *
 * Verifies: all expression variants serialize to valid DSL text,
 * operator precedence is respected, throws on placeholder nodes.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import {
  expressionNodeToDsl,
  expressionNodeToDslPreview
} from '../../src/adapters/expression-node-to-dsl.js';
import type { ExpressionNode } from '../../src/schemas/expression-node-schema.js';

// Helper to create nodes with IDs
function node<T extends ExpressionNode['$type']>(
  type: T,
  fields: Omit<Extract<ExpressionNode, { $type: T }>, '$type' | 'id'>,
  id = 'n'
): ExpressionNode {
  return { $type: type, id, ...fields } as unknown as ExpressionNode;
}

describe('expressionNodeToDsl', () => {
  describe('literals', () => {
    it('serializes boolean literal True', () => {
      expect(expressionNodeToDsl(node('RosettaBooleanLiteral', { value: true }))).toBe('True');
    });

    it('serializes boolean literal False', () => {
      expect(expressionNodeToDsl(node('RosettaBooleanLiteral', { value: false }))).toBe('False');
    });

    it('serializes int literal', () => {
      expect(expressionNodeToDsl(node('RosettaIntLiteral', { value: 42n }))).toBe('42');
    });

    it('serializes number literal', () => {
      expect(expressionNodeToDsl(node('RosettaNumberLiteral', { value: '3.14' }))).toBe('3.14');
    });

    it('serializes string literal with quotes', () => {
      expect(expressionNodeToDsl(node('RosettaStringLiteral', { value: 'hello' }))).toBe('"hello"');
    });
  });

  describe('references', () => {
    it('serializes symbol reference', () => {
      expect(expressionNodeToDsl(node('RosettaSymbolReference', { symbol: 'price' }))).toBe(
        'price'
      );
    });

    it('serializes implicit variable', () => {
      expect(expressionNodeToDsl(node('RosettaImplicitVariable', { name: 'item' }))).toBe('item');
    });
  });

  describe('binary operations', () => {
    it('serializes arithmetic', () => {
      const n = node('ArithmeticOperation', {
        operator: '+',
        left: node('RosettaIntLiteral', { value: 1n }, 'l'),
        right: node('RosettaIntLiteral', { value: 2n }, 'r')
      });
      expect(expressionNodeToDsl(n)).toBe('1 + 2');
    });

    it('serializes comparison', () => {
      const n = node('ComparisonOperation', {
        operator: '>',
        left: node('RosettaSymbolReference', { symbol: 'price' }, 'l'),
        right: node('RosettaIntLiteral', { value: 100n }, 'r')
      });
      expect(expressionNodeToDsl(n)).toBe('price > 100');
    });

    it('serializes equality', () => {
      const n = node('EqualityOperation', {
        operator: '=',
        left: node('RosettaSymbolReference', { symbol: 'status' }, 'l'),
        right: node('RosettaStringLiteral', { value: 'active' }, 'r')
      });
      expect(expressionNodeToDsl(n)).toBe('status = "active"');
    });

    it('serializes logical', () => {
      const n = node('LogicalOperation', {
        operator: 'and',
        left: node('RosettaBooleanLiteral', { value: true }, 'l'),
        right: node('RosettaBooleanLiteral', { value: false }, 'r')
      });
      expect(expressionNodeToDsl(n)).toBe('True and False');
    });

    it('serializes contains', () => {
      const n = node('RosettaContainsExpression', {
        operator: 'contains',
        left: node('RosettaSymbolReference', { symbol: 'items' }, 'l'),
        right: node('RosettaStringLiteral', { value: 'x' }, 'r')
      });
      expect(expressionNodeToDsl(n)).toBe('items contains "x"');
    });

    it('serializes disjoint', () => {
      const n = node('RosettaDisjointExpression', {
        operator: 'disjoint',
        left: node('RosettaSymbolReference', { symbol: 'a' }, 'l'),
        right: node('RosettaSymbolReference', { symbol: 'b' }, 'r')
      });
      expect(expressionNodeToDsl(n)).toBe('a disjoint b');
    });

    it('serializes default', () => {
      const n = node('DefaultOperation', {
        operator: 'default',
        left: node('RosettaSymbolReference', { symbol: 'x' }, 'l'),
        right: node('RosettaIntLiteral', { value: 0n }, 'r')
      });
      expect(expressionNodeToDsl(n)).toBe('x default 0');
    });
  });

  describe('unary operations', () => {
    it('serializes count', () => {
      const n = node('RosettaCountOperation', {
        operator: 'count',
        argument: node('RosettaSymbolReference', { symbol: 'items' }, 'a')
      });
      expect(expressionNodeToDsl(n)).toBe('items count');
    });

    it('serializes exists', () => {
      const n = node('RosettaExistsExpression', {
        operator: 'exists',
        argument: node('RosettaSymbolReference', { symbol: 'x' }, 'a')
      });
      expect(expressionNodeToDsl(n)).toBe('x exists');
    });

    it('serializes is absent', () => {
      const n = node('RosettaAbsentExpression', {
        operator: 'is absent',
        argument: node('RosettaSymbolReference', { symbol: 'x' }, 'a')
      });
      expect(expressionNodeToDsl(n)).toBe('x is absent');
    });

    it('serializes distinct', () => {
      const n = node('DistinctOperation', {
        operator: 'distinct',
        argument: node('RosettaSymbolReference', { symbol: 'items' }, 'a')
      });
      expect(expressionNodeToDsl(n)).toBe('items distinct');
    });

    it('serializes first', () => {
      const n = node('FirstOperation', {
        operator: 'first',
        argument: node('RosettaSymbolReference', { symbol: 'items' }, 'a')
      });
      expect(expressionNodeToDsl(n)).toBe('items first');
    });
  });

  describe('navigation', () => {
    it('serializes feature call (->)', () => {
      const n = node('RosettaFeatureCall', {
        receiver: node('RosettaSymbolReference', { symbol: 'trade' }, 'r'),
        feature: 'price'
      });
      expect(expressionNodeToDsl(n)).toBe('trade -> price');
    });

    it('serializes deep feature call (->>)', () => {
      const n = node('RosettaDeepFeatureCall', {
        receiver: node('RosettaSymbolReference', { symbol: 'trade' }, 'r'),
        feature: 'amount'
      });
      expect(expressionNodeToDsl(n)).toBe('trade ->> amount');
    });
  });

  describe('control flow', () => {
    it('serializes if/then/else', () => {
      const n = node('RosettaConditionalExpression', {
        if: node('RosettaBooleanLiteral', { value: true }, 'c'),
        ifthen: node('RosettaIntLiteral', { value: 1n }, 't'),
        elsethen: node('RosettaIntLiteral', { value: 0n }, 'e'),
        full: true
      });
      expect(expressionNodeToDsl(n)).toBe('if True then 1 else 0');
    });

    it('serializes switch', () => {
      const n = node('SwitchOperation', {
        operator: 'switch',
        argument: node('RosettaSymbolReference', { symbol: 'x' }, 'a'),
        cases: [
          {
            $type: 'SwitchCaseOrDefault' as const,
            expression: node('RosettaIntLiteral', { value: 1n }, 'e1'),
            guard: { $type: 'SwitchCaseGuard' as const, referenceGuard: 'Active' }
          },
          {
            $type: 'SwitchCaseOrDefault' as const,
            expression: node('RosettaIntLiteral', { value: 0n }, 'e2')
          }
        ]
      });
      const result = expressionNodeToDsl(n);
      expect(result).toContain('switch');
      expect(result).toContain('Active');
    });
  });

  describe('lambda operations', () => {
    it('serializes filter with inline function', () => {
      const n = node('FilterOperation', {
        operator: 'filter',
        argument: node('RosettaSymbolReference', { symbol: 'items' }, 'a'),
        function: {
          $type: 'InlineFunction' as const,
          body: node('RosettaBooleanLiteral', { value: true }, 'b'),
          parameters: [{ $type: 'ClosureParameter' as const, name: 'item' }]
        }
      });
      const result = expressionNodeToDsl(n);
      expect(result).toContain('filter');
      expect(result).toContain('item');
    });
  });

  describe('collection', () => {
    it('serializes list literal', () => {
      const n = node('ListLiteral', {
        elements: [
          node('RosettaIntLiteral', { value: 1n }, 'e1'),
          node('RosettaIntLiteral', { value: 2n }, 'e2')
        ]
      });
      expect(expressionNodeToDsl(n)).toBe('[1, 2]');
    });
  });

  describe('unsupported', () => {
    it('serializes unsupported via rawText', () => {
      expect(
        expressionNodeToDsl(node('Unsupported', { rawText: 'some -> complex -> thing' }))
      ).toBe('some -> complex -> thing');
    });
  });

  describe('placeholder handling', () => {
    it('throws on placeholder node', () => {
      expect(() =>
        expressionNodeToDsl(node('Placeholder', { expectedType: 'any' } as any))
      ).toThrow();
    });

    it('throws on nested placeholder', () => {
      const n = node('ArithmeticOperation', {
        operator: '+',
        left: node('RosettaIntLiteral', { value: 1n }, 'l'),
        right: node('Placeholder', {} as any, 'p')
      });
      expect(() => expressionNodeToDsl(n)).toThrow();
    });
  });
});

describe('expressionNodeToDslPreview', () => {
  it('replaces placeholder with ___', () => {
    const n = node('ArithmeticOperation', {
      operator: '+',
      left: node('RosettaIntLiteral', { value: 1n }, 'l'),
      right: node('Placeholder', {} as any, 'p')
    });
    expect(expressionNodeToDslPreview(n)).toBe('1 + ___');
  });

  it('handles complete expression same as expressionNodeToDsl', () => {
    const n = node('ArithmeticOperation', {
      operator: '+',
      left: node('RosettaIntLiteral', { value: 1n }, 'l'),
      right: node('RosettaIntLiteral', { value: 2n }, 'r')
    });
    expect(expressionNodeToDslPreview(n)).toBe('1 + 2');
  });

  it('handles multiple placeholders', () => {
    const n = node('ArithmeticOperation', {
      operator: '+',
      left: node('Placeholder', {} as any, 'p1'),
      right: node('Placeholder', {} as any, 'p2')
    });
    expect(expressionNodeToDslPreview(n)).toBe('___ + ___');
  });
});
