// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for ast-to-expression-node adapter.
 *
 * Verifies: id assignment, $type passthrough, reference resolution,
 * recursive descent, unsupported wrapping.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { astToExpressionNode } from '../../src/adapters/ast-to-expression-node.js';
import type { ExpressionNode } from '../../src/schemas/expression-node-schema.js';

describe('astToExpressionNode', () => {
  it('assigns unique ids to all nodes', () => {
    const ast = {
      $type: 'ArithmeticOperation',
      operator: '+',
      left: { $type: 'RosettaIntLiteral', value: 1n },
      right: { $type: 'RosettaIntLiteral', value: 2n }
    };
    const result = astToExpressionNode(ast as any, '1 + 2');
    expect(result.id).toBeTruthy();

    // Children should also have ids
    if (result.$type === 'ArithmeticOperation') {
      expect((result.left as ExpressionNode).id).toBeTruthy();
      expect((result.right as ExpressionNode).id).toBeTruthy();
      // All ids unique
      const ids = [
        result.id,
        (result.left as ExpressionNode).id,
        (result.right as ExpressionNode).id
      ];
      expect(new Set(ids).size).toBe(3);
    }
  });

  it('preserves $type discriminator', () => {
    const ast = { $type: 'RosettaBooleanLiteral', value: true };
    const result = astToExpressionNode(ast as any, 'True');
    expect(result.$type).toBe('RosettaBooleanLiteral');
  });

  it('resolves Reference<T> to plain $refText string', () => {
    const ast = {
      $type: 'RosettaSymbolReference',
      symbol: { $refText: 'price', ref: { some: 'object' } }
    };
    const result = astToExpressionNode(ast as any, 'price');
    if (result.$type === 'RosettaSymbolReference') {
      expect(result.symbol).toBe('price');
    }
  });

  it('converts feature call references', () => {
    const ast = {
      $type: 'RosettaFeatureCall',
      receiver: {
        $type: 'RosettaSymbolReference',
        symbol: { $refText: 'trade', ref: {} }
      },
      feature: { $refText: 'price', ref: {} }
    };
    const result = astToExpressionNode(ast as any, 'trade -> price');
    if (result.$type === 'RosettaFeatureCall') {
      expect(result.feature).toBe('price');
    }
  });

  it('handles conditional expression', () => {
    const ast = {
      $type: 'RosettaConditionalExpression',
      if: { $type: 'RosettaBooleanLiteral', value: true },
      ifthen: { $type: 'RosettaIntLiteral', value: 1n },
      elsethen: { $type: 'RosettaIntLiteral', value: 0n }
    };
    const result = astToExpressionNode(ast as any, 'if True then 1 else 0');
    expect(result.$type).toBe('RosettaConditionalExpression');
    if (result.$type === 'RosettaConditionalExpression') {
      expect(result.if).toBeDefined();
      expect(result.ifthen).toBeDefined();
      expect(result.elsethen).toBeDefined();
    }
  });

  it('handles switch with resolved case guards', () => {
    const ast = {
      $type: 'SwitchOperation',
      operator: 'switch',
      argument: { $type: 'RosettaSymbolReference', symbol: { $refText: 'status', ref: {} } },
      cases: [
        {
          $type: 'SwitchCaseOrDefault',
          expression: { $type: 'RosettaIntLiteral', value: 1n },
          guard: {
            $type: 'SwitchCaseGuard',
            referenceGuard: { $refText: 'Active', ref: {} }
          }
        }
      ]
    };
    const result = astToExpressionNode(ast as any, 'status switch Active then 1');
    if (result.$type === 'SwitchOperation') {
      expect(result.cases[0].guard?.referenceGuard).toBe('Active');
    }
  });

  it('handles lambda operations (filter)', () => {
    const ast = {
      $type: 'FilterOperation',
      operator: 'filter',
      argument: { $type: 'RosettaSymbolReference', symbol: { $refText: 'items', ref: {} } },
      function: {
        $type: 'InlineFunction',
        body: { $type: 'RosettaBooleanLiteral', value: true },
        parameters: [{ $type: 'ClosureParameter', name: 'item' }]
      }
    };
    const result = astToExpressionNode(ast as any, 'items filter [item True]');
    expect(result.$type).toBe('FilterOperation');
  });

  it('handles unary operations with optional argument', () => {
    const ast = {
      $type: 'RosettaCountOperation',
      operator: 'count',
      argument: { $type: 'RosettaSymbolReference', symbol: { $refText: 'items', ref: {} } }
    };
    const result = astToExpressionNode(ast as any, 'items count');
    expect(result.$type).toBe('RosettaCountOperation');
  });

  it('handles constructor with key-value pairs', () => {
    const ast = {
      $type: 'RosettaConstructorExpression',
      typeRef: { $type: 'RosettaSymbolReference', symbol: { $refText: 'TradeDate', ref: {} } },
      values: [
        {
          $type: 'ConstructorKeyValuePair',
          key: { $refText: 'date', ref: {} },
          value: { $type: 'RosettaStringLiteral', value: '2024-01-01' }
        }
      ]
    };
    const result = astToExpressionNode(ast as any, 'TradeDate { date: "2024-01-01" }');
    if (result.$type === 'RosettaConstructorExpression') {
      expect(result.values?.[0].key).toBe('date');
    }
  });

  it('handles list literals', () => {
    const ast = {
      $type: 'ListLiteral',
      elements: [
        { $type: 'RosettaIntLiteral', value: 1n },
        { $type: 'RosettaIntLiteral', value: 2n }
      ]
    };
    const result = astToExpressionNode(ast as any, '[1, 2]');
    if (result.$type === 'ListLiteral') {
      expect(result.elements).toHaveLength(2);
    }
  });

  it('handles string and number literals', () => {
    const strAst = { $type: 'RosettaStringLiteral', value: 'hello' };
    const numAst = { $type: 'RosettaNumberLiteral', value: '3.14' };
    expect(astToExpressionNode(strAst as any, '"hello"').$type).toBe('RosettaStringLiteral');
    expect(astToExpressionNode(numAst as any, '3.14').$type).toBe('RosettaNumberLiteral');
  });
});
