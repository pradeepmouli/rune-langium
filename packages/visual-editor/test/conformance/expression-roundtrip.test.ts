// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * CDM corpus expression round-trip test (T029).
 *
 * Parses function models, extracts expressions, converts each to ExpressionNode
 * via ast-to-expression-node, serializes back via expression-node-to-dsl,
 * and verifies the output is semantically valid.
 */

import { describe, it, expect } from 'vitest';
import { parse, parseExpression } from '@rune-langium/core';
import { astToExpressionNode } from '../../src/adapters/ast-to-expression-node.js';
import { expressionNodeToDsl } from '../../src/adapters/expression-node-to-dsl.js';
import { FUNCTION_MODEL_SOURCE } from '../helpers/fixture-loader.js';

/** Extract all function expression AST nodes from a parsed model. */
function extractExpressions(
  model: Record<string, unknown>
): Array<{ name: string; expr: unknown; sourceText: string }> {
  const elements = (model['elements'] ?? []) as Record<string, unknown>[];
  const results: Array<{ name: string; expr: unknown; sourceText: string }> = [];

  for (const el of elements) {
    if (el['$type'] !== 'RosettaFunction') continue;
    const name = (el['name'] as string) ?? 'unknown';
    const operations = (el['operations'] ?? []) as Record<string, unknown>[];
    for (const op of operations) {
      const expr = op['expression'];
      if (expr) {
        // Extract source text from CST node if available
        const cstNode = (expr as Record<string, unknown>)['$cstNode'] as Record<string, unknown> | undefined;
        const sourceText = cstNode ? String(cstNode['text'] ?? '') : '';
        results.push({ name, expr, sourceText });
      }
    }
  }
  return results;
}

describe('Expression round-trip (T029)', () => {
  it('converts function expressions to ExpressionNode and back to DSL', async () => {
    const result = await parse(FUNCTION_MODEL_SOURCE);
    expect(result.hasErrors).toBe(false);

    const model = result.value as unknown as Record<string, unknown>;
    const expressions = extractExpressions(model);

    expect(expressions.length).toBeGreaterThan(0);

    for (const { name: _name, expr, sourceText } of expressions) {
      // AST → ExpressionNode
      const exprNode = astToExpressionNode(expr, sourceText);
      expect(exprNode).toBeDefined();
      expect(exprNode.$type).toBeDefined();

      // ExpressionNode → DSL text
      const dslText = expressionNodeToDsl(exprNode);
      expect(dslText).toBeTruthy();
      expect(dslText).not.toBe('___'); // Not a placeholder
    }
  });

  it('round-trips arithmetic expression (a + b)', async () => {
    const result = await parse(FUNCTION_MODEL_SOURCE);
    const model = result.value as unknown as Record<string, unknown>;
    const expressions = extractExpressions(model);

    const addExpr = expressions.find((e) => e.name === 'Add');
    expect(addExpr).toBeDefined();

    const exprNode = astToExpressionNode(addExpr!.expr, addExpr!.sourceText);
    expect(exprNode.$type).toBe('ArithmeticOperation');

    const dsl = expressionNodeToDsl(exprNode);
    expect(dsl).toContain('+');
  });

  it('round-trips conditional expression (if/then/else)', async () => {
    const result = await parse(FUNCTION_MODEL_SOURCE);
    const model = result.value as unknown as Record<string, unknown>;
    const expressions = extractExpressions(model);

    const condExpr = expressions.find((e) => e.name === 'Conditional');
    expect(condExpr).toBeDefined();

    const exprNode = astToExpressionNode(condExpr!.expr, condExpr!.sourceText);
    expect(exprNode.$type).toBe('RosettaConditionalExpression');

    const dsl = expressionNodeToDsl(exprNode);
    expect(dsl).toContain('if');
    expect(dsl).toContain('then');
    expect(dsl).toContain('else');
  });

  // Acceptance criteria for the reverse-converter gap fix (B1 Minor 2):
  // ast-to-expression-node.ts now populates WithMetaOperation.entries and
  // RosettaOnlyExistsExpression.args from the AST, so a real parse of these
  // forms carries them through the full pipeline: core parseExpression ->
  // astToExpressionNode -> expressionNodeToDehydrated (inside
  // expressionNodeToDsl) -> renderExpression.
  describe('reverse-converter gap fix (Minor 2)', () => {
    it('round-trips multi-arg only-exists: (a, b) only exists', () => {
      const src = '(a, b) only exists';
      const p = parseExpression(src);
      expect(p.hasErrors).toBe(false);

      const exprNode = astToExpressionNode(p.value, src);
      expect(exprNode.$type).toBe('RosettaOnlyExistsExpression');

      const dsl = expressionNodeToDsl(exprNode);
      expect(dsl).toBe('(a, b) only exists');
    });

    it('round-trips with-meta entries: value with-meta { scheme: "x" }', () => {
      const src = 'value with-meta { scheme: "x" }';
      const p = parseExpression(src);
      expect(p.hasErrors).toBe(false);

      const exprNode = astToExpressionNode(p.value, src);
      expect(exprNode.$type).toBe('WithMetaOperation');

      const dsl = expressionNodeToDsl(exprNode);
      expect(dsl).toBe('value with-meta { scheme: "x" }');
    });
  });

  // Full-audit findings beyond Minor 2's named fields (B1 follow-up, Codex
  // P2#2 extended): necessity/modifier/constructorTypeArgs were also
  // silently dropped by ast-to-expression-node.ts.
  describe('reverse-converter gap fix — full audit findings', () => {
    it('round-trips choice necessity: optional choice a, b', () => {
      const src = 'optional choice a, b';
      const p = parseExpression(src);
      expect(p.hasErrors).toBe(false);

      const exprNode = astToExpressionNode(p.value, src);
      expect(exprNode.$type).toBe('ChoiceOperation');

      const dsl = expressionNodeToDsl(exprNode);
      expect(dsl).toBe('optional choice a, b');
    });

    it('round-trips exists modifier: a single exists', () => {
      const src = 'a single exists';
      const p = parseExpression(src);
      expect(p.hasErrors).toBe(false);

      const exprNode = astToExpressionNode(p.value, src);
      expect(exprNode.$type).toBe('RosettaExistsExpression');

      const dsl = expressionNodeToDsl(exprNode);
      expect(dsl).toBe('a single exists');
    });

    it('round-trips constructor generic type-call args: Trade(T: 5) { q: 1 }', () => {
      const src = 'Trade(T: 5) { q: 1 }';
      const p = parseExpression(src);
      expect(p.hasErrors).toBe(false);

      const exprNode = astToExpressionNode(p.value, src);
      expect(exprNode.$type).toBe('RosettaConstructorExpression');

      const dsl = expressionNodeToDsl(exprNode);
      expect(dsl).toBe('Trade(T: 5) { q: 1 }');
    });
  });
});
