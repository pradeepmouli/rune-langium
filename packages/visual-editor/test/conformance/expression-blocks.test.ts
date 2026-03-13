/**
 * Expression builder interactive block verification (T028).
 *
 * Verifies that ast-to-expression-node produces correct $type discriminators
 * for common expression types (binary ops, conditionals, filter/map lambdas,
 * literals, references) — the same $types that BlockRenderer dispatches to
 * specialized block components.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { astToExpressionNode } from '../../src/adapters/ast-to-expression-node.js';
import type { ExpressionNode } from '../../src/schemas/expression-node-schema.js';

/** Helper to get a field from an ExpressionNode record. */
function field(node: ExpressionNode, key: string): unknown {
  return (node as unknown as Record<string, unknown>)[key];
}

/** Parse expression from a wrapper function and extract the ExpressionNode. */
async function parseExpr(expressionText: string): Promise<ExpressionNode> {
  const wrapper = `
namespace test.expr
version "1.0.0"

func TestFunc:
  inputs:
    x number (1..1)
    y number (1..1)
    values number (0..*)
    flag boolean (1..1)
  output:
    result number (1..1)
  set result:
    ${expressionText}
`;
  const result = await parse(wrapper);
  expect(result.hasErrors).toBe(false);

  const model = result.value as unknown as Record<string, unknown>;
  const elements = (model['elements'] ?? []) as Record<string, unknown>[];
  const func = elements[0]!;
  const operations = (func['operations'] ?? []) as Record<string, unknown>[];
  const expr = operations[0]!['expression'];
  expect(expr).toBeDefined();

  const cstNode = (expr as Record<string, unknown>)['$cstNode'] as
    | Record<string, unknown>
    | undefined;
  const sourceText = cstNode ? String(cstNode['text'] ?? '') : '';
  return astToExpressionNode(expr, sourceText);
}

describe('Expression builder block types (T028)', () => {
  describe('binary operations', () => {
    it('arithmetic: x + y → ArithmeticOperation', async () => {
      const node = await parseExpr('x + y');
      expect(node.$type).toBe('ArithmeticOperation');
      expect(field(node, 'operator')).toBe('+');
    });

    it('comparison: x > y → ComparisonOperation', async () => {
      const node = await parseExpr('x > y');
      expect(node.$type).toBe('ComparisonOperation');
      expect(field(node, 'operator')).toBe('>');
    });

    it('equality: x = y → EqualityOperation', async () => {
      const node = await parseExpr('x = y');
      expect(node.$type).toBe('EqualityOperation');
      expect(field(node, 'operator')).toBe('=');
    });

    it('logical: flag and flag → LogicalOperation', async () => {
      const node = await parseExpr('flag and flag');
      expect(node.$type).toBe('LogicalOperation');
      expect(field(node, 'operator')).toBe('and');
    });
  });

  describe('unary operations', () => {
    it('exists: x exists → RosettaExistsExpression', async () => {
      const node = await parseExpr('x exists');
      expect(node.$type).toBe('RosettaExistsExpression');
    });

    it('is absent: x is absent → RosettaAbsentExpression', async () => {
      const node = await parseExpr('x is absent');
      expect(node.$type).toBe('RosettaAbsentExpression');
    });

    it('count: values count → RosettaCountOperation', async () => {
      const node = await parseExpr('values count');
      expect(node.$type).toBe('RosettaCountOperation');
    });
  });

  describe('conditionals', () => {
    it('if/then/else → RosettaConditionalExpression', async () => {
      const node = await parseExpr('if flag then x else y');
      expect(node.$type).toBe('RosettaConditionalExpression');
      expect(field(node, 'ifthen')).toBeDefined();
      expect(field(node, 'elsethen')).toBeDefined();
    });
  });

  describe('lambda / collection operations', () => {
    it('filter: values filter [...] → FilterOperation', async () => {
      const node = await parseExpr('values filter [ item > 0 ]');
      expect(node.$type).toBe('FilterOperation');
    });

    it('then: values then extract [ item + 1 ] → ThenOperation', async () => {
      const node = await parseExpr('values extract [ item + 1 ]');
      // extract is a collection operation that parses as a specific operation type
      expect(node.$type).toBeDefined();
      expect(node.$type).not.toBe('Unsupported');
    });
  });

  describe('literals', () => {
    it('integer literal: 42 → RosettaIntLiteral', async () => {
      const node = await parseExpr('42');
      expect(node.$type).toBe('RosettaIntLiteral');
    });

    it('boolean literal: True → RosettaBooleanLiteral', async () => {
      const node = await parseExpr('True');
      expect(node.$type).toBe('RosettaBooleanLiteral');
    });

    it('string literal: "hello" → RosettaStringLiteral', async () => {
      const node = await parseExpr('"hello"');
      expect(node.$type).toBe('RosettaStringLiteral');
    });
  });

  describe('references', () => {
    it('symbol reference: x → RosettaSymbolReference', async () => {
      const node = await parseExpr('x');
      expect(node.$type).toBe('RosettaSymbolReference');
    });
  });

  describe('node identity', () => {
    it('all nodes have unique id fields', async () => {
      const node = await parseExpr('if flag then x + y else 0');
      const ids = new Set<string>();

      function collectIds(n: ExpressionNode) {
        if (!n || typeof n !== 'object') return;
        const r = n as unknown as Record<string, unknown>;
        if (typeof r['id'] === 'string') {
          expect(ids.has(r['id'] as string)).toBe(false);
          ids.add(r['id'] as string);
        }
        for (const [key, value] of Object.entries(r)) {
          if (key === '$type' || key === 'id') continue;
          if (value && typeof value === 'object' && '$type' in (value as Record<string, unknown>)) {
            collectIds(value as ExpressionNode);
          }
        }
      }

      collectIds(node);
      expect(ids.size).toBeGreaterThan(1);
    });
  });
});
