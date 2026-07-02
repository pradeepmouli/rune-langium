// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * parse-expression — Parse DSL text or serialized AST into ExpressionNode.
 *
 * Backed by core's synchronous `parseExpression` (bare `ExpressionWithAsKey`
 * rule parse — no wrapper document, no linking; refs carry `$refText` only,
 * which `astToExpressionNode` already consumes).
 */

import { parseExpression as parseExpressionCore } from '@rune-langium/core';
import type { ExpressionNode } from '../schemas/expression-node-schema.js';
import { astToExpressionNode } from './ast-to-expression-node.js';

export function parseExpression(value: string): ExpressionNode {
  if (!value) {
    return { $type: 'Placeholder', id: 'root-placeholder' } as unknown as ExpressionNode;
  }

  // JSON-serialized AST (from a previous round-trip) — convert directly.
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && '$type' in parsed) {
      return astToExpressionNode(parsed, value);
    }
  } catch {
    // Not JSON — fall through to DSL parsing.
  }

  const { value: ast, hasErrors } = parseExpressionCore(value);
  if (hasErrors) {
    return { $type: 'Unsupported', id: 'parse-error', rawText: value } as unknown as ExpressionNode;
  }
  return astToExpressionNode(ast, value);
}
