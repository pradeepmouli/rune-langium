// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { renderNode, type RenderChild } from '../../../src/emit/rosetta/rosetta-render-core.js';
const regen: RenderChild = (c) => renderNode(c, regen) ?? '';

const attr = (name: string, type: string, inf: number, sup: number) => ({
  $type: 'Attribute', name, override: false,
  typeCall: { type: { $refText: type } },
  card: { $type: 'RosettaCardinality', inf, sup, unbounded: false },
  annotations: [], references: [], synonyms: [], labels: [], ruleReferences: [], typeCallArgs: []
});

describe('renderNode — RosettaFunction', () => {
  it('renders a function with inputs, output, and a set operation', () => {
    const fn = {
      $type: 'RosettaFunction', name: 'Compute', definition: undefined,
      annotations: [], references: [], conditions: [], postConditions: [], shortcuts: [],
      inputs: [attr('a', 'number', 1, 1)],
      output: attr('result', 'number', 1, 1),
      operations: [{ $type: 'Operation', add: false, assignRoot: { $refText: 'result' }, path: undefined, definition: undefined, expression: { $cstText: 'a' } }]
    } as never;
    expect(renderNode(fn, regen)).toBe(
      'func Compute:\n' +
      '  inputs:\n' +
      '    a number (1..1)\n' +
      '  output:\n' +
      '    result number (1..1)\n' +
      '\n' +
      '  set result:\n' +
      '      a'
    );
  });

  it('renders an add operation with a path and an alias shortcut', () => {
    const op = { $type: 'Operation', add: true, assignRoot: { $refText: 'out' }, path: { feature: { $refText: 'items' }, next: undefined }, definition: undefined, expression: { $cstText: 'x' } } as never;
    expect(renderNode(op, regen)).toBe('add out -> items:\n    x');
    const sc = { $type: 'ShortcutDeclaration', name: 'helper', definition: undefined, expression: { $cstText: 'a + b' } } as never;
    expect(renderNode(sc, regen)).toBe('alias helper:\n    a + b');
  });
});
