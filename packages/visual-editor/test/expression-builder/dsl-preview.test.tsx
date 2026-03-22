// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for DslPreview component.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DslPreview } from '../../src/components/editors/expression-builder/DslPreview.js';
import type { ExpressionNode } from '../../src/schemas/expression-node-schema.js';

function mkNode(partial: Record<string, unknown>): ExpressionNode {
  return partial as unknown as ExpressionNode;
}

describe('DslPreview', () => {
  it('renders DSL text for a simple expression', () => {
    const tree = mkNode({
      $type: 'RosettaIntLiteral',
      id: 'l1',
      value: 42
    });
    const { container } = render(<DslPreview tree={tree} />);
    expect(container.querySelector('[data-testid="dsl-preview"]')).toBeTruthy();
    expect(container.textContent).toContain('42');
  });

  it('shows placeholder markers as ___', () => {
    const tree = mkNode({
      $type: 'ArithmeticOperation',
      id: 'n1',
      operator: '+',
      left: { $type: 'Placeholder', id: 'p1' },
      right: { $type: 'RosettaIntLiteral', id: 'l1', value: 1 }
    });
    const { container } = render(<DslPreview tree={tree} />);
    expect(container.textContent).toContain('___');
    expect(container.textContent).toContain('+');
  });

  it('does not render when collapsed', () => {
    const tree = mkNode({
      $type: 'RosettaIntLiteral',
      id: 'l1',
      value: 42
    });
    const { container } = render(<DslPreview tree={tree} collapsed />);
    expect(container.querySelector('[data-testid="dsl-preview"]')).toBeNull();
  });

  it('handles serialization errors gracefully', () => {
    // A node with no serializable content
    const tree = mkNode({
      $type: 'SomeUnknown',
      id: 'x1'
    });
    const { container } = render(<DslPreview tree={tree} />);
    // Should not crash
    expect(container.querySelector('[data-testid="dsl-preview"]')).toBeTruthy();
  });
});
