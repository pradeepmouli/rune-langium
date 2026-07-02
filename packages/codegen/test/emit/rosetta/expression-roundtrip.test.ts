// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parseExpression } from '@rune-langium/core';
import { renderExpression } from '../../../src/emit/rosetta/render-expression.js';

// parse → render → reparse (no errors) → re-render (byte-identical fixed point).
const CORPUS = [
  'quantity > 0',
  'quantity > 0 and price exists',
  'a or (b or c)',
  '(a + b) * c',
  'a all = True',
  'trade -> quantity ->> amount',
  '(a or b) exists',
  'items count',
  'observable single exists',
  'settlement is absent',
  '(a, b) only exists',
  'code to-enum Color',
  'items filter [item > 0]',
  'items reduce a, b [a + b]',
  'items then filter [item > 0] then only-element',
  'if flag then 1 else 0',
  'x + (if flag then 1 else 0)',
  'color switch Red then 1, default 0',
  'optional choice dateAdjustments, dateAdjustmentsReference',
  'Trade { quantity: 1, price: 2.5 }',
  'Trade { quantity: 1, ... }',
  '[1, 2, 3]',
  'empty',
  'a default 0',
  'a join ","',
  'reference as-key',
  'value with-meta { scheme: "urn:x" }',
  'Max(a, b)',
  'item to-string',
  // Tier 7 (contains/disjoint/default/join) is non-associative — a same-tier
  // LEFT child only exists via explicit parens and must always reparen.
  '(a contains b) default c',
  '(a join ",") contains c',
  // P1 corpus sweep findings (real-corpus fixed-point sweep over .resources/):
  // a name colliding with a reserved keyword (`type`, `value`, `source`, ...)
  // must round-trip through its `^`-escaped form, or the reference is lost.
  'trade -> ^type -> value',
  // A switch inside a bare comma-separated list (function-call rawArgs,
  // constructor values, with-meta entries, ListLiteral elements) must
  // render parenthesized — the switch's own comma-separated case list is
  // otherwise ambiguous with the outer list's element separator whenever
  // the switch isn't the list's last element. Source here is already
  // correctly parenthesized (the bare, unparenthesized form is invalid
  // Rune DSL, not just a renderer round-trip case). Note: constructor
  // `constructorTypeArgs` values are grammar-restricted to a bare
  // identifier or literal (TypeCallArgumentExpression), so a switch can
  // never legally appear there — no case needed for that position.
  'Foo((x switch a then 1, default 0), y)',
  'Trade { q: (x switch a then 1, default 0), y: z }',
  'a with-meta { scheme: (x switch a then 1, default 0), other: y }',
  '[(x switch a then 1, default 0), y]'
];

describe('expression round-trip (parse → render → reparse → fixed point)', () => {
  for (const src of CORPUS) {
    it(`round-trips: ${src}`, () => {
      const p1 = parseExpression(src);
      expect(p1.hasErrors, `original must parse: ${src}`).toBe(false);
      const r1 = renderExpression(p1.value);
      const p2 = parseExpression(r1);
      expect(p2.hasErrors, `rendered must reparse: ${r1}`).toBe(false);
      const r2 = renderExpression(p2.value);
      expect(r2, 'render must be a fixed point').toBe(r1);
    });
  }
});
