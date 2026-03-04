/**
 * Tests for individual block components.
 *
 * @module
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { BinaryBlock } from '../../src/components/editors/expression-builder/blocks/BinaryBlock.js';
import { UnaryBlock } from '../../src/components/editors/expression-builder/blocks/UnaryBlock.js';
import { FeatureCallBlock } from '../../src/components/editors/expression-builder/blocks/FeatureCallBlock.js';
import { ConditionalBlock } from '../../src/components/editors/expression-builder/blocks/ConditionalBlock.js';
import { SwitchBlock } from '../../src/components/editors/expression-builder/blocks/SwitchBlock.js';
import { LambdaBlock } from '../../src/components/editors/expression-builder/blocks/LambdaBlock.js';
import { ConstructorBlock } from '../../src/components/editors/expression-builder/blocks/ConstructorBlock.js';
import { LiteralBlock } from '../../src/components/editors/expression-builder/blocks/LiteralBlock.js';
import { ReferenceBlock } from '../../src/components/editors/expression-builder/blocks/ReferenceBlock.js';
import { ListBlock } from '../../src/components/editors/expression-builder/blocks/ListBlock.js';
import { PlaceholderBlock } from '../../src/components/editors/expression-builder/blocks/PlaceholderBlock.js';
import { UnsupportedBlock } from '../../src/components/editors/expression-builder/blocks/UnsupportedBlock.js';
import type { ExpressionNode } from '../../src/schemas/expression-node-schema.js';

function mkNode(partial: Record<string, unknown>): ExpressionNode {
  return partial as unknown as ExpressionNode;
}

const renderChild = (child: ExpressionNode | undefined) => {
  if (!child) return null;
  return <span data-testid={`child-${child.id}`}>{child.$type}</span>;
};

describe('BinaryBlock', () => {
  it('renders operator between left and right', () => {
    const node = mkNode({
      $type: 'ArithmeticOperation',
      id: 'n1',
      operator: '+',
      left: { $type: 'RosettaIntLiteral', id: 'l1', value: 1 },
      right: { $type: 'RosettaIntLiteral', id: 'l2', value: 2 }
    });
    const { container } = render(<BinaryBlock node={node} renderChild={renderChild} />);
    expect(container.textContent).toContain('+');
    expect(container.querySelector('[data-testid="child-l1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="child-l2"]')).toBeTruthy();
  });

  it('renders cardMod when present', () => {
    const node = mkNode({
      $type: 'ComparisonOperation',
      id: 'n1',
      operator: '>',
      cardMod: 'all',
      right: { $type: 'Placeholder', id: 'p1' }
    });
    const { container } = render(<BinaryBlock node={node} renderChild={renderChild} />);
    expect(container.textContent).toContain('> all');
  });
});

describe('UnaryBlock', () => {
  it('renders operator after argument', () => {
    const node = mkNode({
      $type: 'DistinctOperation',
      id: 'n1',
      operator: 'distinct',
      argument: { $type: 'RosettaSymbolReference', id: 'r1', symbol: 'items' }
    });
    const { container } = render(<UnaryBlock node={node} renderChild={renderChild} />);
    expect(container.textContent).toContain('distinct');
    expect(container.querySelector('[data-testid="child-r1"]')).toBeTruthy();
  });
});

describe('FeatureCallBlock', () => {
  it('renders receiver -> feature', () => {
    const node = mkNode({
      $type: 'RosettaFeatureCall',
      id: 'fc1',
      receiver: { $type: 'RosettaSymbolReference', id: 'r1', symbol: 'trade' },
      feature: 'price'
    });
    const { container } = render(<FeatureCallBlock node={node} renderChild={renderChild} />);
    expect(container.textContent).toContain('->');
    expect(container.textContent).toContain('price');
  });

  it('renders ->> for deep feature call', () => {
    const node = mkNode({
      $type: 'RosettaDeepFeatureCall',
      id: 'fc2',
      receiver: { $type: 'RosettaSymbolReference', id: 'r1', symbol: 'trade' },
      feature: 'amount'
    });
    const { container } = render(<FeatureCallBlock node={node} renderChild={renderChild} />);
    expect(container.textContent).toContain('->>');
  });
});

describe('ConditionalBlock', () => {
  it('renders if/then/else sections', () => {
    const node = mkNode({
      $type: 'RosettaConditionalExpression',
      id: 'c1',
      if: { $type: 'RosettaBooleanLiteral', id: 'b1', value: true },
      ifthen: { $type: 'RosettaIntLiteral', id: 'i1', value: 1 },
      elsethen: { $type: 'RosettaIntLiteral', id: 'i2', value: 0 }
    });
    const { container } = render(<ConditionalBlock node={node} renderChild={renderChild} />);
    expect(container.textContent).toContain('if');
    expect(container.textContent).toContain('then');
    expect(container.textContent).toContain('else');
  });

  it('omits else when not present', () => {
    const node = mkNode({
      $type: 'RosettaConditionalExpression',
      id: 'c1',
      if: { $type: 'RosettaBooleanLiteral', id: 'b1', value: true },
      ifthen: { $type: 'RosettaIntLiteral', id: 'i1', value: 1 }
    });
    const { container } = render(<ConditionalBlock node={node} renderChild={renderChild} />);
    expect(container.textContent).not.toContain('else');
  });
});

describe('SwitchBlock', () => {
  it('renders switch with cases', () => {
    const node = mkNode({
      $type: 'SwitchOperation',
      id: 's1',
      operator: 'switch',
      argument: { $type: 'RosettaSymbolReference', id: 'r1', symbol: 'status' },
      cases: [
        {
          $type: 'SwitchCaseOrDefault',
          expression: { $type: 'RosettaStringLiteral', id: 'l1', value: 'active' },
          guard: { $type: 'SwitchCaseGuard', referenceGuard: 'Active' }
        }
      ]
    });
    const { container } = render(<SwitchBlock node={node} renderChild={renderChild} />);
    expect(container.textContent).toContain('switch');
    expect(container.textContent).toContain('Active');
  });
});

describe('LambdaBlock', () => {
  it('renders operator with parameter and body', () => {
    const node = mkNode({
      $type: 'FilterOperation',
      id: 'f1',
      operator: 'filter',
      argument: { $type: 'RosettaSymbolReference', id: 'r1', symbol: 'items' },
      function: {
        $type: 'InlineFunction',
        body: { $type: 'Placeholder', id: 'p1' },
        parameters: [{ $type: 'ClosureParameter', name: 'item' }]
      }
    });
    const { container } = render(<LambdaBlock node={node} renderChild={renderChild} />);
    expect(container.textContent).toContain('filter');
    expect(container.textContent).toContain('item');
  });
});

describe('ConstructorBlock', () => {
  it('renders type name and key-value pairs', () => {
    const node = mkNode({
      $type: 'RosettaConstructorExpression',
      id: 'ctor1',
      typeRef: { $type: 'RosettaSymbolReference', symbol: 'TradeDate', name: 'TradeDate' },
      values: [
        {
          $type: 'ConstructorKeyValuePair',
          key: 'date',
          value: { $type: 'Placeholder', id: 'p1' }
        }
      ]
    });
    const { container } = render(<ConstructorBlock node={node} renderChild={renderChild} />);
    expect(container.textContent).toContain('TradeDate');
    expect(container.textContent).toContain('date');
  });
});

describe('LiteralBlock', () => {
  it('renders boolean value', () => {
    const node = mkNode({ $type: 'RosettaBooleanLiteral', id: 'l1', value: true });
    const { container } = render(<LiteralBlock node={node} />);
    expect(container.textContent).toContain('true');
  });

  it('renders string in quotes', () => {
    const node = mkNode({ $type: 'RosettaStringLiteral', id: 'l1', value: 'hello' });
    const { container } = render(<LiteralBlock node={node} />);
    expect(container.textContent).toContain('"hello"');
  });

  it('renders number', () => {
    const node = mkNode({ $type: 'RosettaNumberLiteral', id: 'l1', value: '3.14' });
    const { container } = render(<LiteralBlock node={node} />);
    expect(container.textContent).toContain('3.14');
  });
});

describe('ReferenceBlock', () => {
  it('renders symbol name', () => {
    const node = mkNode({ $type: 'RosettaSymbolReference', id: 'r1', symbol: 'trade' });
    const { container } = render(<ReferenceBlock node={node} />);
    expect(container.textContent).toContain('trade');
  });

  it('renders implicit variable with label', () => {
    const node = mkNode({ $type: 'RosettaImplicitVariable', id: 'r1', name: 'item' });
    const { container } = render(<ReferenceBlock node={node} />);
    expect(container.textContent).toContain('item');
    expect(container.textContent).toContain('implicit');
  });
});

describe('ListBlock', () => {
  it('renders brackets with elements', () => {
    const node = mkNode({
      $type: 'ListLiteral',
      id: 'list1',
      elements: [
        { $type: 'RosettaIntLiteral', id: 'e1', value: 1 },
        { $type: 'RosettaIntLiteral', id: 'e2', value: 2 }
      ]
    });
    const { container } = render(<ListBlock node={node} renderChild={renderChild} />);
    expect(container.textContent).toContain('[');
    expect(container.textContent).toContain(']');
    expect(container.querySelector('[data-testid="child-e1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="child-e2"]')).toBeTruthy();
  });
});

describe('PlaceholderBlock', () => {
  it('renders dashed border placeholder', () => {
    const node = mkNode({ $type: 'Placeholder', id: 'p1' });
    const { container } = render(<PlaceholderBlock node={node} />);
    expect(container.querySelector('[data-block="placeholder"]')).toBeTruthy();
  });

  it('shows expected type hint', () => {
    const node = mkNode({ $type: 'Placeholder', id: 'p1', expectedType: 'numeric' });
    const { container } = render(<PlaceholderBlock node={node} />);
    expect(container.textContent).toContain('numeric');
  });

  it('fires onActivate when clicked', () => {
    const onActivate = vi.fn();
    const node = mkNode({ $type: 'Placeholder', id: 'p1' });
    const { container } = render(<PlaceholderBlock node={node} onActivate={onActivate} />);
    fireEvent.click(container.querySelector('[data-block="placeholder"]')!);
    expect(onActivate).toHaveBeenCalledWith('p1');
  });
});

describe('UnsupportedBlock', () => {
  it('renders rawText with warning', () => {
    const node = mkNode({ $type: 'Unsupported', id: 'u1', rawText: 'some -> unknown -> syntax' });
    const { container } = render(<UnsupportedBlock node={node} />);
    expect(container.querySelector('[data-block="unsupported"]')).toBeTruthy();
    expect(container.textContent).toContain('some -> unknown -> syntax');
  });
});
