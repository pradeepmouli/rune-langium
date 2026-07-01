// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { renderExpression, UnsupportedExpressionError } from '../../../src/emit/rosetta/render-expression.js';

// Terse AST-shaped literal builders (mirror parser output shapes).
const int = (v: number) => ({ $type: 'RosettaIntLiteral', value: BigInt(v) }) as never;
const num = (v: string) => ({ $type: 'RosettaNumberLiteral', value: v }) as never;
const str = (v: string) => ({ $type: 'RosettaStringLiteral', value: v }) as never;
const bool = (v: boolean) => ({ $type: 'RosettaBooleanLiteral', value: v }) as never;
const sym = (name: string) => ({ $type: 'RosettaSymbolReference', symbol: { $refText: name }, explicitArguments: false, rawArgs: [] }) as never;
const bin = ($type: string, operator: string, left: unknown, right: unknown) => ({ $type, operator, left, right }) as never;

describe('renderExpression — literals & references', () => {
  it('renders literals', () => {
    expect(renderExpression(bool(true))).toBe('True');
    expect(renderExpression(bool(false))).toBe('False');
    expect(renderExpression(int(42))).toBe('42');
    expect(renderExpression(num('3.14'))).toBe('3.14');
    expect(renderExpression(str('a "quoted" s'))).toBe('"a \\"quoted\\" s"');
  });

  it('renders symbol references, calls, super, item, empty, lists', () => {
    expect(renderExpression(sym('quantity'))).toBe('quantity');
    expect(renderExpression({ $type: 'RosettaSymbolReference', symbol: { $refText: 'Max' }, explicitArguments: true, rawArgs: [int(1), int(2)] } as never)).toBe('Max(1, 2)');
    expect(renderExpression({ $type: 'RosettaSuperCall', name: 'super', explicitArguments: false, rawArgs: [] } as never)).toBe('super');
    expect(renderExpression({ $type: 'RosettaImplicitVariable', name: 'item' } as never)).toBe('item');
    expect(renderExpression({ $type: 'ListLiteral', elements: [] } as never)).toBe('empty');
    expect(renderExpression({ $type: 'ListLiteral', elements: [int(1), int(2)] } as never)).toBe('[1, 2]');
  });
});

describe('renderExpression — binary precedence', () => {
  it('renders a flat left-assoc chain without parens', () => {
    const chain = bin('LogicalOperation', 'or', bin('LogicalOperation', 'or', sym('a'), sym('b')), sym('c'));
    expect(renderExpression(chain)).toBe('a or b or c');
  });

  it('REGRESSION: preserves explicit right-side grouping — a or (b or c)', () => {
    const grouped = bin('LogicalOperation', 'or', sym('a'), bin('LogicalOperation', 'or', sym('b'), sym('c')));
    expect(renderExpression(grouped)).toBe('a or (b or c)');
  });

  it('wraps a looser child on either side', () => {
    const orInAnd = bin('LogicalOperation', 'and', bin('LogicalOperation', 'or', sym('a'), sym('b')), sym('c'));
    expect(renderExpression(orInAnd)).toBe('(a or b) and c');
    const addInMul = bin('ArithmeticOperation', '*', bin('ArithmeticOperation', '+', sym('a'), sym('b')), sym('c'));
    expect(renderExpression(addInMul)).toBe('(a + b) * c');
  });

  it('equality and comparison share ONE tier (grammar EqualityOperationRule)', () => {
    // (a > b) = c — left child same tier ⇒ no parens (left-assoc chain);
    // a = (b > c) — right child same tier ⇒ parens required.
    const leftChain = bin('EqualityOperation', '=', bin('ComparisonOperation', '>', sym('a'), sym('b')), sym('c'));
    expect(renderExpression(leftChain)).toBe('a > b = c');
    const rightGroup = bin('EqualityOperation', '=', sym('a'), bin('ComparisonOperation', '>', sym('b'), sym('c')));
    expect(renderExpression(rightGroup)).toBe('a = (b > c)');
  });

  it('renders cardMod and left-less (standalone) equality forms', () => {
    expect(renderExpression({ $type: 'EqualityOperation', operator: '=', cardMod: 'all', left: sym('a'), right: bool(true) } as never)).toBe('a all = True');
    expect(renderExpression({ $type: 'EqualityOperation', operator: '=', left: undefined, right: bool(true) } as never)).toBe('= True');
  });

  it('renders tier-7 set ops and join', () => {
    expect(renderExpression(bin('RosettaContainsExpression', 'contains', sym('a'), sym('b')))).toBe('a contains b');
    expect(renderExpression(bin('DefaultOperation', 'default', sym('a'), int(0)))).toBe('a default 0');
    expect(renderExpression({ $type: 'JoinOperation', operator: 'join', left: sym('a'), right: str(',') } as never)).toBe('a join ","');
    expect(renderExpression({ $type: 'JoinOperation', operator: 'join', left: sym('a'), right: undefined } as never)).toBe('a join');
  });
});

describe('renderExpression — navigation', () => {
  it('renders feature calls and deep feature calls', () => {
    const fc = { $type: 'RosettaFeatureCall', receiver: sym('trade'), feature: { $refText: 'quantity' } } as never;
    expect(renderExpression(fc)).toBe('trade -> quantity');
    const deep = { $type: 'RosettaDeepFeatureCall', receiver: fc, feature: { $refText: 'amount' } } as never;
    expect(renderExpression(deep)).toBe('trade -> quantity ->> amount');
  });

  it('parenthesizes a binary receiver of a postfix chain', () => {
    const fc = { $type: 'RosettaFeatureCall', receiver: bin('LogicalOperation', 'or', sym('a'), sym('b')), feature: { $refText: 'x' } } as never;
    expect(renderExpression(fc)).toBe('(a or b) -> x');
  });
});

describe('renderExpression — RawDsl leaf and unknown types', () => {
  it('renders a RawDsl leaf verbatim', () => {
    expect(renderExpression({ $type: 'RawDsl', text: '___' } as never)).toBe('___');
  });
  it('throws UnsupportedExpressionError on unknown $type', () => {
    expect(() => renderExpression({ $type: 'SomethingNew' } as never)).toThrow(UnsupportedExpressionError);
  });
});
