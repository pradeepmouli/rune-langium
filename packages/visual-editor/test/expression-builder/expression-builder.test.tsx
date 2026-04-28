// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for ExpressionBuilder root component — mode toggle, rendering.
 *
 * @module
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ExpressionBuilder } from '../../src/components/editors/expression-builder/ExpressionBuilder.js';
import * as astToExpressionNodeModule from '../../src/adapters/ast-to-expression-node.js';
import type { FunctionScope } from '../../src/store/expression-store.js';

const testScope: FunctionScope = {
  inputs: [{ name: 'trade', typeName: 'Trade', cardinality: '1..1' }],
  output: { name: 'result', typeName: 'number' },
  aliases: []
};

describe('ExpressionBuilder', () => {
  it('renders with builder mode by default', () => {
    const { container } = render(
      <ExpressionBuilder value="" onChange={vi.fn()} scope={testScope} />
    );
    expect(container.querySelector('[data-testid="expression-builder"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="tab-builder"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="tab-text"]')).toBeTruthy();
  });

  it('shows BlockRenderer in builder mode', () => {
    const { container } = render(
      <ExpressionBuilder value="" onChange={vi.fn()} scope={testScope} />
    );
    // Should show placeholder block in builder mode
    expect(container.querySelector('[data-block="placeholder"]')).toBeTruthy();
  });

  it('switches to text mode on tab click', () => {
    const { container } = render(
      <ExpressionBuilder value="" onChange={vi.fn()} scope={testScope} />
    );
    const textTab = container.querySelector('[data-testid="tab-text"]')!;
    fireEvent.click(textTab);
    expect(container.querySelector('[data-testid="text-editor"]')).toBeTruthy();
    expect(container.querySelector('[data-block="placeholder"]')).toBeNull();
  });

  it('switches back to builder mode', () => {
    const { container } = render(
      <ExpressionBuilder value="" onChange={vi.fn()} scope={testScope} />
    );
    // Switch to text
    fireEvent.click(container.querySelector('[data-testid="tab-text"]')!);
    expect(container.querySelector('[data-testid="text-editor"]')).toBeTruthy();

    // Switch back to builder
    fireEvent.click(container.querySelector('[data-testid="tab-builder"]')!);
    expect(container.querySelector('[data-block="placeholder"]')).toBeTruthy();
  });

  it('starts in text mode when defaultMode is text', () => {
    const { container } = render(
      <ExpressionBuilder value="" onChange={vi.fn()} scope={testScope} defaultMode="text" />
    );
    expect(container.querySelector('[data-testid="text-editor"]')).toBeTruthy();
  });

  it('shows scope inputs', () => {
    const { container } = render(
      <ExpressionBuilder value="" onChange={vi.fn()} scope={testScope} />
    );
    expect(container.textContent).toContain('trade');
    expect(container.textContent).toContain('Trade');
  });

  it('shows scope output', () => {
    const { container } = render(
      <ExpressionBuilder value="" onChange={vi.fn()} scope={testScope} />
    );
    expect(container.textContent).toContain('result');
    expect(container.textContent).toContain('number');
  });

  it('shows error message', () => {
    const { container } = render(
      <ExpressionBuilder value="" onChange={vi.fn()} scope={testScope} error="Parse error" />
    );
    expect(container.textContent).toContain('Parse error');
  });

  it('shows DSL preview in builder mode', () => {
    const { container } = render(
      <ExpressionBuilder value="" onChange={vi.fn()} scope={testScope} />
    );
    expect(container.querySelector('[data-testid="dsl-preview"]')).toBeTruthy();
  });

  it('calls onChange on text blur', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ExpressionBuilder value="" onChange={onChange} scope={testScope} defaultMode="text" />
    );
    const textarea = container.querySelector('[data-testid="text-editor"]') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'trade -> price + 1' } });
    fireEvent.blur(textarea);
    expect(onChange).toHaveBeenCalledWith('trade -> price + 1');
  });

  it('converts expression AST only once per mounted editor instance', () => {
    const astSpy = vi.spyOn(astToExpressionNodeModule, 'astToExpressionNode');
    const expressionAst = { $type: 'RosettaIntLiteral', value: 1 };
    const { rerender } = render(
      <ExpressionBuilder
        value="1"
        onChange={vi.fn()}
        scope={testScope}
        expressionAst={expressionAst}
      />
    );

    rerender(
      <ExpressionBuilder
        value="1"
        onChange={vi.fn()}
        scope={{ ...testScope, aliases: [] }}
        expressionAst={expressionAst}
      />
    );

    expect(astSpy).toHaveBeenCalledTimes(1);
    astSpy.mockRestore();
  });
});
