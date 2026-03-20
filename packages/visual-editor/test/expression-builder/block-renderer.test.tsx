// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for BlockRenderer — recursive expression tree rendering.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BlockRenderer } from '../../src/components/editors/expression-builder/BlockRenderer.js';
import type { ExpressionNode } from '../../src/schemas/expression-node-schema.js';

function mkNode(partial: Record<string, unknown>): ExpressionNode {
  return partial as unknown as ExpressionNode;
}

describe('BlockRenderer', () => {
  it('renders a binary block with operator and children', () => {
    const node = mkNode({
      $type: 'ArithmeticOperation',
      id: 'n1',
      operator: '+',
      left: { $type: 'RosettaIntLiteral', id: 'l1', value: 2 },
      right: { $type: 'RosettaIntLiteral', id: 'l2', value: 3 }
    });
    const { container } = render(<BlockRenderer node={node} />);
    expect(container.querySelector('[data-block="binary"]')).toBeTruthy();
    expect(container.textContent).toContain('+');
    expect(container.textContent).toContain('2');
    expect(container.textContent).toContain('3');
  });

  it('renders a unary block with operator label', () => {
    const node = mkNode({
      $type: 'RosettaCountOperation',
      id: 'n1',
      operator: 'count',
      argument: { $type: 'RosettaSymbolReference', id: 'r1', symbol: 'items' }
    });
    const { container } = render(<BlockRenderer node={node} />);
    expect(container.querySelector('[data-block="unary"]')).toBeTruthy();
    expect(container.textContent).toContain('count');
    expect(container.textContent).toContain('items');
  });

  it('renders a literal block with value display', () => {
    const node = mkNode({
      $type: 'RosettaStringLiteral',
      id: 'l1',
      value: 'hello'
    });
    const { container } = render(<BlockRenderer node={node} />);
    expect(container.querySelector('[data-block="literal"]')).toBeTruthy();
    expect(container.textContent).toContain('"hello"');
  });

  it('renders a reference block with symbol name', () => {
    const node = mkNode({
      $type: 'RosettaSymbolReference',
      id: 'r1',
      symbol: 'trade'
    });
    const { container } = render(<BlockRenderer node={node} />);
    expect(container.querySelector('[data-block="reference"]')).toBeTruthy();
    expect(container.textContent).toContain('trade');
  });

  it('renders a placeholder with dashed border', () => {
    const node = mkNode({
      $type: 'Placeholder',
      id: 'p1'
    });
    const { container } = render(<BlockRenderer node={node} />);
    expect(container.querySelector('[data-block="placeholder"]')).toBeTruthy();
  });

  it('renders unsupported with rawText', () => {
    const node = mkNode({
      $type: 'Unsupported',
      id: 'u1',
      rawText: 'some -> unknown -> syntax'
    });
    const { container } = render(<BlockRenderer node={node} />);
    expect(container.querySelector('[data-block="unsupported"]')).toBeTruthy();
    expect(container.textContent).toContain('some -> unknown -> syntax');
  });

  it('renders nested expression tree with correct depth', () => {
    const node = mkNode({
      $type: 'ArithmeticOperation',
      id: 'n1',
      operator: '+',
      left: {
        $type: 'ArithmeticOperation',
        id: 'n2',
        operator: '*',
        left: { $type: 'RosettaIntLiteral', id: 'l1', value: 2 },
        right: { $type: 'RosettaSymbolReference', id: 'r1', symbol: 'price' }
      },
      right: { $type: 'RosettaIntLiteral', id: 'l2', value: 10 }
    });
    const { container } = render(<BlockRenderer node={node} />);
    const blocks = container.querySelectorAll('[data-node-id]');
    expect(blocks.length).toBeGreaterThanOrEqual(5);

    const outerBlock = container.querySelector('[data-node-id="n1"]');
    expect(outerBlock?.getAttribute('data-depth')).toBe('0');
  });

  it('sets data-node-id attribute on each block', () => {
    const node = mkNode({
      $type: 'RosettaSymbolReference',
      id: 'test-id',
      symbol: 'x'
    });
    const { container } = render(<BlockRenderer node={node} />);
    expect(container.querySelector('[data-node-id="test-id"]')).toBeTruthy();
  });

  it('highlights selected node with ring', () => {
    const node = mkNode({
      $type: 'RosettaSymbolReference',
      id: 'sel1',
      symbol: 'x'
    });
    const { container } = render(<BlockRenderer node={node} selectedNodeId="sel1" />);
    const el = container.querySelector('[data-node-id="sel1"]');
    expect(el?.getAttribute('aria-selected')).toBe('true');
  });

  it('renders feature call with arrow', () => {
    const node = mkNode({
      $type: 'RosettaFeatureCall',
      id: 'fc1',
      receiver: { $type: 'RosettaSymbolReference', id: 'r1', symbol: 'trade' },
      feature: 'price'
    });
    const { container } = render(<BlockRenderer node={node} />);
    expect(container.querySelector('[data-block="feature-call"]')).toBeTruthy();
    expect(container.textContent).toContain('->');
    expect(container.textContent).toContain('price');
  });

  it('renders conditional block with if/then/else', () => {
    const node = mkNode({
      $type: 'RosettaConditionalExpression',
      id: 'c1',
      if: { $type: 'RosettaBooleanLiteral', id: 'b1', value: true },
      ifthen: { $type: 'RosettaIntLiteral', id: 'i1', value: 1 },
      elsethen: { $type: 'RosettaIntLiteral', id: 'i2', value: 0 }
    });
    const { container } = render(<BlockRenderer node={node} />);
    expect(container.querySelector('[data-block="conditional"]')).toBeTruthy();
    expect(container.textContent).toContain('if');
    expect(container.textContent).toContain('then');
    expect(container.textContent).toContain('else');
  });
});
