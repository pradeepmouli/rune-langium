// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * UnsupportedBlock audit test (T030).
 *
 * Parses function models through ast-to-expression-node and asserts
 * zero expressions fall through to the Unsupported node type.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { astToExpressionNode } from '../../src/adapters/ast-to-expression-node.js';
import type { ExpressionNode } from '../../src/schemas/expression-node-schema.js';
import { FUNCTION_MODEL_SOURCE } from '../helpers/fixture-loader.js';

/** Recursively collect all $type values from an ExpressionNode tree. */
function collectTypes(node: ExpressionNode, types: Set<string> = new Set()): Set<string> {
  if (!node || typeof node !== 'object') return types;
  const record = node as unknown as Record<string, unknown>;
  if (record['$type']) {
    types.add(String(record['$type']));
  }
  // Walk all fields that could be child expression nodes
  for (const [key, value] of Object.entries(record)) {
    if (key === '$type' || key === 'id') continue;
    if (value && typeof value === 'object') {
      if ('$type' in (value as Record<string, unknown>)) {
        collectTypes(value as ExpressionNode, types);
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object' && '$type' in item) {
            collectTypes(item as ExpressionNode, types);
          }
        }
      }
    }
  }
  return types;
}

/** Recursively find all Unsupported nodes with their rawText. */
function findUnsupported(node: ExpressionNode, found: string[] = []): string[] {
  if (!node || typeof node !== 'object') return found;
  const record = node as unknown as Record<string, unknown>;
  if (record['$type'] === 'Unsupported') {
    found.push(String(record['rawText'] ?? '(unknown)'));
    return found;
  }
  for (const [key, value] of Object.entries(record)) {
    if (key === '$type' || key === 'id') continue;
    if (value && typeof value === 'object') {
      if ('$type' in (value as Record<string, unknown>)) {
        findUnsupported(value as ExpressionNode, found);
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object' && '$type' in item) {
            findUnsupported(item as ExpressionNode, found);
          }
        }
      }
    }
  }
  return found;
}

/** Extract all function expressions from a parsed model. */
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
        const cstNode = (expr as Record<string, unknown>)['$cstNode'] as
          | Record<string, unknown>
          | undefined;
        const sourceText = cstNode ? String(cstNode['text'] ?? '') : '';
        results.push({ name, expr, sourceText });
      }
    }
  }
  return results;
}

describe('Expression coverage audit (T030)', () => {
  it('produces zero Unsupported nodes from function fixture expressions', async () => {
    const result = await parse(FUNCTION_MODEL_SOURCE);
    expect(result.hasErrors).toBe(false);

    const model = result.value as unknown as Record<string, unknown>;
    const expressions = extractExpressions(model);
    expect(expressions.length).toBeGreaterThan(0);

    const allUnsupported: Array<{ func: string; rawText: string }> = [];

    for (const { name, expr, sourceText } of expressions) {
      const exprNode = astToExpressionNode(expr, sourceText);
      const unsupported = findUnsupported(exprNode);
      for (const rawText of unsupported) {
        allUnsupported.push({ func: name, rawText });
      }
    }

    if (allUnsupported.length > 0) {
      const summary = allUnsupported.map((u) => `  ${u.func}: "${u.rawText}"`).join('\n');
      expect.fail(`Found ${allUnsupported.length} Unsupported expression node(s):\n${summary}`);
    }
  });

  it('covers all expression $types in the fixture without unknowns', async () => {
    const result = await parse(FUNCTION_MODEL_SOURCE);
    const model = result.value as unknown as Record<string, unknown>;
    const expressions = extractExpressions(model);

    const allTypes = new Set<string>();
    for (const { expr, sourceText } of expressions) {
      const exprNode = astToExpressionNode(expr, sourceText);
      collectTypes(exprNode, allTypes);
    }

    // Should have recognized expression types
    expect(allTypes.size).toBeGreaterThan(0);
    // No Unsupported or Placeholder types
    expect(allTypes.has('Unsupported')).toBe(false);
    expect(allTypes.has('Placeholder')).toBe(false);
  });
});
