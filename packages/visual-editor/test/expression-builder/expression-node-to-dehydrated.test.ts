// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { expressionNodeToDehydrated } from '../../src/adapters/expression-node-to-dehydrated.js';
import { renderExpression } from '@rune-langium/codegen/rosetta';

const id = 'test-id';

describe('expressionNodeToDehydrated', () => {
  it('re-wraps string refs as {$refText} (inverse of astToExpressionNode)', () => {
    const node = { $type: 'RosettaSymbolReference', id, symbol: 'quantity' } as never;
    const out = expressionNodeToDehydrated(node, { allowPlaceholders: false }) as { symbol: { $refText: string } };
    expect(out.symbol.$refText).toBe('quantity');
    expect(renderExpression(out as never)).toBe('quantity');
  });

  it('converts Placeholder to a RawDsl marker leaf in preview mode', () => {
    const node = { $type: 'LogicalOperation', id, operator: 'and', left: { $type: 'Placeholder', id }, right: { $type: 'RosettaBooleanLiteral', id, value: true } } as never;
    const out = expressionNodeToDehydrated(node, { allowPlaceholders: true });
    expect(renderExpression(out as never)).toBe('___ and True');
  });

  it('throws on Placeholder when placeholders are not allowed', () => {
    const node = { $type: 'Placeholder', id } as never;
    expect(() => expressionNodeToDehydrated(node, { allowPlaceholders: false })).toThrow(/placeholder/i);
  });

  it('converts Unsupported to a verbatim RawDsl leaf', () => {
    const node = { $type: 'Unsupported', id, rawText: 'some -> legacy -> expr' } as never;
    const out = expressionNodeToDehydrated(node, { allowPlaceholders: false });
    expect(renderExpression(out as never)).toBe('some -> legacy -> expr');
  });

  it('re-wraps a nested typeRef.symbol ref inside a constructor', () => {
    const node = {
      $type: 'RosettaConstructorExpression',
      id,
      typeRef: { $type: 'RosettaSymbolReference', id, symbol: 'Trade', explicitArguments: false },
      constructorTypeArgs: [],
      implicitEmpty: false,
      values: [{ $type: 'ConstructorKeyValuePair', key: 'quantity', value: { $type: 'RosettaIntLiteral', id, value: 1n } }]
    } as never;
    const out = expressionNodeToDehydrated(node, { allowPlaceholders: false });
    expect(renderExpression(out as never)).toBe('Trade { quantity: 1 }');
  });

  it('wraps a primitive literalGuard as a RawDsl leaf so renderSwitchCase does not throw', () => {
    const node = {
      $type: 'SwitchOperation',
      id,
      operator: 'switch',
      argument: { $type: 'RosettaSymbolReference', id, symbol: 'color' },
      cases: [
        {
          $type: 'SwitchCaseOrDefault',
          expression: { $type: 'RosettaIntLiteral', id, value: 1n },
          guard: { $type: 'SwitchCaseGuard', literalGuard: 'Red' }
        }
      ]
    } as never;
    const out = expressionNodeToDehydrated(node, { allowPlaceholders: false });
    expect(renderExpression(out as never)).toBe('color switch Red then 1');
  });
});
