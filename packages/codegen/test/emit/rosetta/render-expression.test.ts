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

  it('REGRESSION: tier-7 is non-associative — a same-tier LEFT child always wraps', () => {
    // Grammar `BinaryOperationRule` is `(...)?`, not `(...)*` — contains/
    // disjoint/default/join apply at most once, so a same-tier left child
    // can only exist via explicit parens and must always reparen.
    const containsInDefault = bin('DefaultOperation', 'default', bin('RosettaContainsExpression', 'contains', sym('a'), sym('b')), sym('c'));
    expect(renderExpression(containsInDefault)).toBe('(a contains b) default c');
    const joinInContains = { $type: 'RosettaContainsExpression', operator: 'contains', left: { $type: 'JoinOperation', operator: 'join', left: sym('a'), right: str(',') }, right: sym('c') } as never;
    expect(renderExpression(joinInContains)).toBe('(a join ",") contains c');
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

describe('renderExpression — keyword-escaped qualified references', () => {
  it('re-escapes a whole-name keyword collision', () => {
    const fc = { $type: 'RosettaFeatureCall', receiver: sym('trade'), feature: { $refText: 'type' } } as never;
    expect(renderExpression(fc)).toBe('trade -> ^type');
  });

  it('re-escapes only the colliding segment of a dotted QualifiedName ref', () => {
    expect(renderExpression({ $type: 'ToEnumOperation', operator: 'to-enum', argument: sym('code'), enumeration: { $refText: 'foo.type' } } as never)).toBe('code to-enum foo.^type');
  });

  it('leaves a plain dotted ref unescaped', () => {
    expect(renderExpression({ $type: 'ToEnumOperation', operator: 'to-enum', argument: sym('code'), enumeration: { $refText: 'foo.bar' } } as never)).toBe('code to-enum foo.bar');
  });

  it('leaves a ValidID-whitelisted word bare, whole-name or as a dotted segment', () => {
    const fc = { $type: 'RosettaFeatureCall', receiver: sym('trade'), feature: { $refText: 'value' } } as never;
    expect(renderExpression(fc)).toBe('trade -> value');
    expect(renderExpression({ $type: 'ToEnumOperation', operator: 'to-enum', argument: sym('code'), enumeration: { $refText: 'foo.value' } } as never)).toBe('code to-enum foo.value');
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

describe('RawDsl-as-child guard', () => {
  const raw = (text: string) => ({ $type: 'RawDsl', text }) as never;
  it('root RawDsl stays verbatim', () => {
    expect(renderExpression(raw('a or b'))).toBe('a or b');
  });
  it('atomic RawDsl child stays bare (placeholder, identifier, qualified, number, string)', () => {
    expect(renderExpression(bin('LogicalOperation', 'and', raw('___'), bool(true)))).toBe('___ and True');
    expect(renderExpression(bin('LogicalOperation', 'and', raw('foo.bar'), bool(true)))).toBe('foo.bar and True');
    expect(renderExpression(bin('LogicalOperation', 'and', raw('foo.^type'), bool(true)))).toBe('foo.^type and True');
    expect(renderExpression(bin('ArithmeticOperation', '+', raw('42'), int(1)))).toBe('42 + 1');
    expect(renderExpression(bin('ArithmeticOperation', '+', raw('1.5'), int(1)))).toBe('1.5 + 1');
    expect(renderExpression(bin('ArithmeticOperation', '+', raw('1.5e3'), int(1)))).toBe('1.5e3 + 1');
    expect(renderExpression(bin('LogicalOperation', 'and', raw(`'sq'`), bool(true)))).toBe(`'sq' and True`);
  });
  it('non-atomic RawDsl child gets wrapped', () => {
    expect(renderExpression(bin('LogicalOperation', 'and', raw('a or b'), bool(true)))).toBe('(a or b) and True');
    expect(renderExpression(bin('ArithmeticOperation', '+', sym('x'), raw('y count')))).toBe('x + (y count)');
  });
  it('near-atoms that are NOT single grammar tokens get wrapped (mirror terminals)', () => {
    // INT is digits-only; BigDecimal requires a dot — 1e3/42n are multi-token.
    expect(renderExpression(bin('ArithmeticOperation', '+', raw('1e3'), int(1)))).toBe('(1e3) + 1');
    expect(renderExpression(bin('ArithmeticOperation', '+', raw('42n'), int(1)))).toBe('(42n) + 1');
    // Malformed qualified names: trailing/double dots fail the ID-segment composition.
    expect(renderExpression(bin('LogicalOperation', 'and', raw('x.'), bool(true)))).toBe('(x.) and True');
    expect(renderExpression(bin('LogicalOperation', 'and', raw('x..y'), bool(true)))).toBe('(x..y) and True');
    // Whitespace and empty text always wrap.
    expect(renderExpression(bin('LogicalOperation', 'and', raw('a '), bool(true)))).toBe('(a ) and True');
    expect(renderExpression(bin('LogicalOperation', 'and', raw(''), bool(true)))).toBe('() and True');
  });
});

describe('renderExpression — postfix & functional', () => {
  const sym2 = sym; // alias for readability below
  it('renders simple postfix chains', () => {
    expect(renderExpression({ $type: 'RosettaCountOperation', operator: 'count', argument: sym2('items') } as never)).toBe('items count');
    expect(renderExpression({ $type: 'RosettaOnlyElement', operator: 'only-element', argument: sym2('items') } as never)).toBe('items only-element');
    expect(renderExpression({ $type: 'SumOperation', operator: 'sum', argument: undefined } as never)).toBe('sum');
  });

  it('renders exists/absent/only-exists forms', () => {
    expect(renderExpression({ $type: 'RosettaExistsExpression', operator: 'exists', argument: sym2('a'), modifier: 'single' } as never)).toBe('a single exists');
    expect(renderExpression({ $type: 'RosettaAbsentExpression', operator: 'absent', argument: sym2('a') } as never)).toBe('a is absent');
    expect(renderExpression({ $type: 'RosettaOnlyExistsExpression', operator: 'exists', argument: sym2('a'), args: [] } as never)).toBe('a only exists');
    expect(renderExpression({ $type: 'RosettaOnlyExistsExpression', args: [sym2('a'), sym2('b')], argument: undefined } as never)).toBe('(a, b) only exists');
  });

  it('parenthesizes a binary argument of a postfix op', () => {
    expect(renderExpression({ $type: 'RosettaExistsExpression', operator: 'exists', argument: bin('LogicalOperation', 'or', sym2('a'), sym2('b')) } as never)).toBe('(a or b) exists');
  });

  it('renders to-enum with its enumeration ref', () => {
    expect(renderExpression({ $type: 'ToEnumOperation', operator: 'to-enum', argument: sym2('code'), enumeration: { $refText: 'ns.Color' } } as never)).toBe('code to-enum ns.Color');
  });

  it('renders functional ops with params BEFORE the bracket (grammar fix)', () => {
    const fn = { body: bin('ArithmeticOperation', '+', sym2('a'), sym2('b')), parameters: [{ name: 'a' }, { name: 'b' }] };
    expect(renderExpression({ $type: 'ReduceOperation', operator: 'reduce', argument: sym2('items'), function: fn } as never)).toBe('items reduce a, b [a + b]');
    const noParams = { body: bin('ComparisonOperation', '>', { $type: 'RosettaImplicitVariable', name: 'item' }, int(0)), parameters: [] };
    expect(renderExpression({ $type: 'FilterOperation', operator: 'filter', argument: sym2('items'), function: noParams } as never)).toBe('items filter [item > 0]');
  });

  it('renders then with a BARE body (no brackets — grammar fix)', () => {
    const fn = { body: { $type: 'FilterOperation', operator: 'filter', argument: undefined, function: { body: bool(true), parameters: [] } }, parameters: [] };
    expect(renderExpression({ $type: 'ThenOperation', operator: 'then', argument: sym2('items'), function: fn } as never)).toBe('items then filter [True]');
  });

  it('renders choice / switch / with-meta / as-key', () => {
    expect(renderExpression({ $type: 'ChoiceOperation', operator: 'choice', necessity: 'optional', argument: undefined, attributes: [{ $refText: 'a' }, { $refText: 'b' }] } as never)).toBe('optional choice a, b');
    const cases = [
      { $type: 'SwitchCaseOrDefault', guard: { $type: 'SwitchCaseGuard', referenceGuard: { $refText: 'Red' } }, expression: int(1) },
      { $type: 'SwitchCaseOrDefault', guard: undefined, expression: int(0) }
    ];
    expect(renderExpression({ $type: 'SwitchOperation', operator: 'switch', argument: sym2('color'), cases } as never)).toBe('color switch\n    Red then 1,\n    default 0');
    expect(renderExpression({ $type: 'WithMetaOperation', operator: 'with-meta', argument: sym2('a'), entries: [{ key: { $refText: 'scheme' }, value: str('x') }] } as never)).toBe('a with-meta { scheme: "x" }');
    expect(renderExpression({ $type: 'WithMetaOperation', operator: 'with-meta', argument: sym2('a'), entries: [] } as never)).toBe('a with-meta');
    expect(renderExpression({ $type: 'AsKeyOperation', operator: 'as-key', argument: sym2('ref') } as never)).toBe('ref as-key');
  });

  it('renders a body-root switch with >=2 cases multi-line', () => {
    const cases = [
      { $type: 'SwitchCaseOrDefault', guard: { $type: 'SwitchCaseGuard', referenceGuard: { $refText: 'Red' } }, expression: int(1) },
      { $type: 'SwitchCaseOrDefault', guard: undefined, expression: int(0) }
    ];
    expect(renderExpression({ $type: 'SwitchOperation', operator: 'switch', argument: sym2('color'), cases } as never))
      .toBe('color switch\n    Red then 1,\n    default 0');
  });

  it('keeps a NESTED switch single-line (parenthesized)', () => {
    const cases = [
      { $type: 'SwitchCaseOrDefault', guard: { $type: 'SwitchCaseGuard', referenceGuard: { $refText: 'Red' } }, expression: int(1) },
      { $type: 'SwitchCaseOrDefault', guard: undefined, expression: int(0) }
    ];
    const sw = { $type: 'SwitchOperation', operator: 'switch', argument: sym2('color'), cases } as never;
    expect(renderExpression(bin('ArithmeticOperation', '+', sym2('x'), sw)))
      .toBe('x + (color switch Red then 1, default 0)');
  });

  it('keeps a single-case root switch single-line', () => {
    const cases = [{ $type: 'SwitchCaseOrDefault', guard: undefined, expression: int(0) }];
    expect(renderExpression({ $type: 'SwitchOperation', operator: 'switch', argument: sym2('color'), cases } as never))
      .toBe('color switch default 0');
  });

  it('REGRESSION: switch and choice always parenthesize as a bare-comma-list element (prec 0)', () => {
    // SwitchOperation's own case list and ChoiceOperation's own attribute
    // list are BOTH bare comma-separated lists — shape-identical to the
    // outer comma list they might sit inside (call rawArgs, ListLiteral
    // elements, etc). Unparenthesized, a trailing outer-list element gets
    // silently absorbed into the switch/choice's own list instead of
    // staying separate (confirmed via AST-shape comparison, not just a
    // reparse-error check). Both get precedence 0, same as
    // RosettaConditionalExpression, so the ordinary r() mechanism wraps
    // them — even as the list's SOLE element, where wrapping is safe
    // (round-trips to an identical tree) even though not strictly required.
    const cases = [{ $type: 'SwitchCaseOrDefault', guard: { $type: 'SwitchCaseGuard', referenceGuard: { $refText: 'A' } }, expression: int(1) }, { $type: 'SwitchCaseOrDefault', guard: undefined, expression: int(0) }];
    const sw = { $type: 'SwitchOperation', operator: 'switch', argument: sym2('x'), cases } as never;
    const choice = { $type: 'ChoiceOperation', operator: 'choice', necessity: 'optional', argument: undefined, attributes: [{ $refText: 'a' }, { $refText: 'b' }] } as never;

    expect(renderExpression({ $type: 'RosettaSymbolReference', symbol: { $refText: 'Foo' }, explicitArguments: true, rawArgs: [sw] } as never)).toBe('Foo((x switch A then 1, default 0))');
    expect(renderExpression({ $type: 'RosettaSymbolReference', symbol: { $refText: 'Foo' }, explicitArguments: true, rawArgs: [sw, sym2('y')] } as never)).toBe('Foo((x switch A then 1, default 0), y)');
    expect(renderExpression({ $type: 'RosettaSymbolReference', symbol: { $refText: 'Foo' }, explicitArguments: true, rawArgs: [choice, sym2('y')] } as never)).toBe('Foo((optional choice a, b), y)');
    expect(renderExpression({ $type: 'ListLiteral', elements: [sw, sym2('y')] } as never)).toBe('[(x switch A then 1, default 0), y]');

    // Nested (not itself the list element): a switch buried inside a binary
    // operand must still wrap, since r()'s ordinary precedence recursion
    // parenthesizes the switch at ITS OWN render site regardless of depth.
    const nested = bin('ArithmeticOperation', '+', sw, sym2('y'));
    expect(renderExpression({ $type: 'RosettaSymbolReference', symbol: { $refText: 'Foo' }, explicitArguments: true, rawArgs: [nested, sym2('z')] } as never)).toBe('Foo((x switch A then 1, default 0) + y, z)');
  });

  it('renders conditionals, always parenthesized as a child', () => {
    const cond = { $type: 'RosettaConditionalExpression', if: sym2('flag'), ifthen: int(1), full: true, elsethen: int(0) } as never;
    expect(renderExpression(cond)).toBe('if flag then 1 else 0');
    expect(renderExpression(bin('ArithmeticOperation', '+', sym2('x'), cond))).toBe('x + (if flag then 1 else 0)');
  });

  it('renders constructors', () => {
    const typeRef = sym2('Trade');
    expect(renderExpression({ $type: 'RosettaConstructorExpression', typeRef, constructorTypeArgs: [], implicitEmpty: false, values: [{ key: { $refText: 'quantity' }, value: int(1) }] } as never)).toBe('Trade { quantity: 1 }');
    expect(renderExpression({ $type: 'RosettaConstructorExpression', typeRef: sym2('Trade'), constructorTypeArgs: [], implicitEmpty: true, values: [{ key: { $refText: 'q' }, value: int(1) }] } as never)).toBe('Trade { q: 1, ... }');
    expect(renderExpression({ $type: 'RosettaConstructorExpression', typeRef: sym2('Trade'), constructorTypeArgs: [{ parameter: { $refText: 'T' }, value: int(5) }], implicitEmpty: false, values: [] } as never)).toBe('Trade(T: 5) {}');
  });
});
