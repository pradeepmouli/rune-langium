// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * parse-expression — Parse DSL text or serialized AST into ExpressionNode.
 *
 * Provides both a synchronous entry point (for initial render) and an
 * async entry point that uses the Rune core parser.
 *
 * The sync `parseExpression()` handles:
 *   1. Empty string → Placeholder node
 *   2. JSON-serialized AST (has `$type`) → astToExpressionNode
 *   3. Raw DSL text → Unsupported node (caller should use `parseExpressionAsync` for full parsing)
 *
 * The async `parseExpressionAsync()` wraps expression text in a minimal
 * function body and uses the core `parse()` API, then extracts the
 * expression AST and converts it via `astToExpressionNode`.
 *
 * @module
 */

import type { ExpressionNode } from '../schemas/expression-node-schema.js';
import { astToExpressionNode } from './ast-to-expression-node.js';

/**
 * Synchronously parse a value string into an ExpressionNode.
 *
 * Handles empty values, JSON-serialized AST objects, and raw DSL text.
 * For raw DSL text, returns an Unsupported node — use `parseExpressionAsync`
 * for full parser-backed conversion.
 */
export function parseExpression(value: string): ExpressionNode {
  if (!value) {
    return { $type: 'Placeholder', id: 'root-placeholder' } as unknown as ExpressionNode;
  }

  // Try JSON-serialized AST (e.g., from previous handlePaletteSelect round-trip)
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && '$type' in parsed) {
      return astToExpressionNode(parsed, value);
    }
  } catch {
    // Not JSON — fall through to raw DSL text handling
  }

  // Raw DSL text — return as Unsupported until async parsing is wired
  return {
    $type: 'Unsupported',
    id: 'parse-error',
    rawText: value
  } as unknown as ExpressionNode;
}

/**
 * Asynchronously parse DSL expression text using the Rune core parser.
 *
 * Wraps the expression in a minimal function body:
 *   `func Foo: output result string (1..1) set result: <expression>`
 *
 * Then extracts the expression AST from the parsed model and converts
 * it to an ExpressionNode via `astToExpressionNode`.
 *
 * Returns null if parsing fails or the expression cannot be extracted.
 */
export async function parseExpressionAsync(expressionText: string): Promise<ExpressionNode | null> {
  if (!expressionText.trim()) return null;

  try {
    // Dynamic import to avoid bundling the core parser in the main chunk
    const { parse } = await import('@rune-langium/core');

    // Wrap expression in a minimal function body
    const wrapper = `func ParseWrapper:\n  output result string (1..1)\n  set result:\n    ${expressionText}`;

    const result = await parse(wrapper);
    if (result.hasErrors) return null;

    // Navigate: RosettaModel → elements[0] (RosettaFunction) → operations[0] → expression
    const model = result.value as unknown as Record<string, unknown>;
    const elements = model['elements'] as Record<string, unknown>[] | undefined;
    if (!elements || elements.length === 0) return null;

    const func = elements[0]!;
    const operations = func['operations'] as Record<string, unknown>[] | undefined;
    if (!operations || operations.length === 0) return null;

    const expression = operations[0]!['expression'];
    if (!expression) return null;

    return astToExpressionNode(expression, expressionText);
  } catch {
    return null;
  }
}
