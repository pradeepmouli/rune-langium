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
      const ids = [result.id, (result.left as ExpressionNode).id, (result.right as ExpressionNode).id];
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

  it('converts a literalGuard uniformly (synthetic id, preserved $type/value)', () => {
    const ast = {
      $type: 'SwitchOperation',
      operator: 'switch',
      argument: { $type: 'RosettaSymbolReference', symbol: { $refText: 'code', ref: {} } },
      cases: [
        {
          $type: 'SwitchCaseOrDefault',
          expression: { $type: 'RosettaIntLiteral', value: 1n },
          guard: {
            $type: 'SwitchCaseGuard',
            literalGuard: { $type: 'RosettaIntLiteral', value: 42n }
          }
        }
      ]
    };
    const result = astToExpressionNode(ast as any, 'code switch 42 then 1');
    if (result.$type === 'SwitchOperation') {
      const literalGuard = result.cases[0].guard?.literalGuard as ExpressionNode | undefined;
      expect(literalGuard).toBeDefined();
      expect((literalGuard as unknown as { id: string }).id).toBeTruthy();
      expect(literalGuard?.$type).toBe('RosettaIntLiteral');
      expect((literalGuard as unknown as { value: bigint }).value).toBe(42n);
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

  it('handles multi-arg only-exists (populates args[])', () => {
    const ast = {
      $type: 'RosettaOnlyExistsExpression',
      operator: 'exists',
      args: [
        { $type: 'RosettaSymbolReference', symbol: { $refText: 'a', ref: {} } },
        { $type: 'RosettaSymbolReference', symbol: { $refText: 'b', ref: {} } }
      ]
    };
    const result = astToExpressionNode(ast as any, '(a, b) only exists');
    expect(result.$type).toBe('RosettaOnlyExistsExpression');
    if (result.$type === 'RosettaOnlyExistsExpression') {
      expect(result.args).toHaveLength(2);
      expect((result.args?.[0] as ExpressionNode & { symbol: string }).symbol).toBe('a');
    }
  });

  it('handles with-meta entries (populates entries[] with resolved keys)', () => {
    const ast = {
      $type: 'WithMetaOperation',
      operator: 'with-meta',
      argument: { $type: 'RosettaSymbolReference', symbol: { $refText: 'value', ref: {} } },
      entries: [
        {
          $type: 'WithMetaEntry',
          key: { $refText: 'scheme', ref: {} },
          value: { $type: 'RosettaStringLiteral', value: 'x' }
        }
      ]
    };
    const result = astToExpressionNode(ast as any, 'value with-meta { scheme: "x" }');
    expect(result.$type).toBe('WithMetaOperation');
    if (result.$type === 'WithMetaOperation') {
      expect(result.entries).toHaveLength(1);
      expect(result.entries?.[0].key).toBe('scheme');
    }
  });

  it('a nested unrecognized subtree gets its OWN $cstNode span, not the ancestor sourceText (Minor 3)', () => {
    // Whole-expression sourceText is the top-level call's text; the nested
    // unknown-$type node carries its own $cstNode.text sub-span — the
    // Unsupported leaf must use the sub-span, or a RawDsl child inlined at
    // the child's position would duplicate/corrupt the parent's text.
    const wholeExpressionText = 'a and someUnknownConstruct(x, y) and b';
    const ast = {
      $type: 'LogicalOperation',
      operator: 'and',
      left: { $type: 'RosettaSymbolReference', symbol: { $refText: 'a', ref: {} } },
      right: {
        $type: 'LogicalOperation',
        operator: 'and',
        left: {
          $type: 'SomeFutureUnknownExpressionType',
          $cstNode: { text: 'someUnknownConstruct(x, y)' }
        },
        right: { $type: 'RosettaSymbolReference', symbol: { $refText: 'b', ref: {} } }
      }
    };
    const result = astToExpressionNode(ast as any, wholeExpressionText);
    expect(result.$type).toBe('LogicalOperation');
    if (result.$type === 'LogicalOperation') {
      const inner = result.right as ExpressionNode & { left: ExpressionNode };
      expect(inner.left.$type).toBe('Unsupported');
      expect((inner.left as ExpressionNode & { rawText: string }).rawText).toBe('someUnknownConstruct(x, y)');
      expect((inner.left as ExpressionNode & { rawText: string }).rawText).not.toBe(wholeExpressionText);
    }
  });

  it('falls back to the ancestor sourceText when no $cstNode is attached (JSON-serialized AST)', () => {
    const ast = { $type: 'SomeFutureUnknownExpressionType' };
    const result = astToExpressionNode(ast as any, 'fallback text');
    expect(result.$type).toBe('Unsupported');
    expect((result as ExpressionNode & { rawText: string }).rawText).toBe('fallback text');
  });

  // Full-audit findings (B1 follow-up, Codex P2#2 extended): every AST
  // interface field cross-checked against this converter. necessity/
  // modifier/constructorTypeArgs were silently dropped, matching the
  // entries[]/args[] gap already fixed as Minor 2.
  it('handles choice necessity (was dropped — renderer would emit literal "undefined choice")', () => {
    const ast = {
      $type: 'ChoiceOperation',
      operator: 'choice',
      necessity: 'optional',
      attributes: [
        { $refText: 'a', ref: {} },
        { $refText: 'b', ref: {} }
      ]
    };
    const result = astToExpressionNode(ast as any, 'optional choice a, b');
    expect(result.$type).toBe('ChoiceOperation');
    if (result.$type === 'ChoiceOperation') {
      expect(result.necessity).toBe('optional');
    }
  });

  it('handles exists modifier (single/multiple — was dropped)', () => {
    const ast = {
      $type: 'RosettaExistsExpression',
      operator: 'exists',
      modifier: 'single',
      argument: { $type: 'RosettaSymbolReference', symbol: { $refText: 'a', ref: {} } }
    };
    const result = astToExpressionNode(ast as any, 'a single exists');
    expect(result.$type).toBe('RosettaExistsExpression');
    if (result.$type === 'RosettaExistsExpression') {
      expect(result.modifier).toBe('single');
    }
  });

  it('handles constructor generic type-call args (constructorTypeArgs — was dropped)', () => {
    const ast = {
      $type: 'RosettaConstructorExpression',
      typeRef: { $type: 'RosettaSymbolReference', symbol: { $refText: 'Trade', ref: {} } },
      constructorTypeArgs: [
        {
          $type: 'TypeCallArgument',
          parameter: { $refText: 'T', ref: {} },
          value: { $type: 'RosettaIntLiteral', value: 5n }
        }
      ],
      values: []
    };
    const result = astToExpressionNode(ast as any, 'Trade(T: 5) {}');
    expect(result.$type).toBe('RosettaConstructorExpression');
    if (result.$type === 'RosettaConstructorExpression') {
      expect(result.constructorTypeArgs).toHaveLength(1);
      expect(result.constructorTypeArgs?.[0].parameter).toBe('T');
    }
  });
});
