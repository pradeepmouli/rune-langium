// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for the parse-expression adapter.
 *
 * Verifies: empty-string → Placeholder, JSON-serialized AST → astToExpressionNode,
 * raw DSL text → real tree (core-backed), unparseable text → Unsupported.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { parseExpression } from '../../src/adapters/parse-expression.js';

describe('parseExpression', () => {
  it('returns a Placeholder node for empty string', () => {
    const node = parseExpression('');
    expect(node.$type).toBe('Placeholder');
  });

  it('converts a JSON-serialized AST directly via astToExpressionNode', () => {
    const ast = { $type: 'RosettaBooleanLiteral', value: true };
    const node = parseExpression(JSON.stringify(ast));
    expect(node.$type).toBe('RosettaBooleanLiteral');
  });

  it('parses raw DSL text into a real tree (no longer Unsupported)', () => {
    const node = parseExpression('quantity > 0 and price exists');
    expect(node.$type).toBe('LogicalOperation');
  });

  it('returns Unsupported for unparseable text', () => {
    const node = parseExpression('quantity > and');
    expect(node.$type).toBe('Unsupported');
  });
});
