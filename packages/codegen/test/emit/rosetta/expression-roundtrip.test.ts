// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parseExpression } from '@rune-langium/core';
import { renderExpression } from '../../../src/emit/rosetta/render-expression.js';
import { treesEquivalent } from './expression-tree-equivalence.js';

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
  // Body-root switch with >=2 cases renders multi-line (P2 pretty-print); the
  // fixed-point property still holds — reparse of the multi-line form must
  // re-render identically (r2 === r1), not revert to single-line.
  'color switch\n    Red then 1,\n    default 0',
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
  // Dotted QualifiedName ref (ToEnumOperation.enumeration) — Langium's
  // convertID strips `^` per-segment, so escapeId must escape each `.`-
  // separated segment independently, not the whole dotted string.
  'code to-enum foo.^type',
  // A switch (or choice) inside a bare comma-separated list (function-call
  // rawArgs, constructor values, with-meta entries, ListLiteral elements,
  // RosettaOnlyExistsExpression's multi-arg args) must render
  // parenthesized — SwitchOperation's own case list and ChoiceOperation's
  // own attribute list are BOTH bare comma-separated lists
  // shape-identical to the outer list, so an unparenthesized element in
  // any of those positions silently absorbs the outer list's next
  // element into its own list instead of reparsing as an error (verified
  // via direct AST-shape comparison, not just a reparse-error check).
  // Enforced via SwitchOperation/ChoiceOperation both having precedence 0
  // (same "always parenthesize as a child" treatment as
  // RosettaConditionalExpression), so the ordinary `r()` precedence
  // mechanism wraps them at any nesting depth — no dedicated comma
  // scanner needed. Source here is already correctly parenthesized (the
  // bare, unparenthesized form is ambiguous Rune DSL even before
  // rendering, not just a renderer round-trip case). Note: constructor
  // `constructorTypeArgs` values are grammar-restricted to a bare
  // identifier or literal (TypeCallArgumentExpression), so a switch/choice
  // can never legally appear there — no case needed for that position.
  'Foo((x switch a then 1, default 0), y)',
  // A switch nested inside a larger expression (not itself the list
  // element) must still wrap, since its case-comma reaches depth 0 of
  // the outer list once rendered.
  'Foo((x switch a then 1, default 0) + y, z)',
  'Foo((optional choice dateAdjustments, dateAdjustmentsReference), y)',
  'Trade { q: (x switch a then 1, default 0), y: z }',
  'a with-meta { scheme: (x switch a then 1, default 0), other: y }',
  '[(x switch a then 1, default 0), y]',
  '((x switch a then 1, default 0), y) only exists'
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
      // r2 === r1 only proves the TEXT is stable under reparse — it does not
      // prove the reparsed tree still means the same thing (see
      // expression-tree-equivalence.ts's doc: this caught a real bug where a
      // candidate fix passed the text check while silently reparsing an
      // ArithmeticOperation into a SwitchOperation).
      expect(
        treesEquivalent(p1.value, p2.value),
        `reparsed tree must be structurally equivalent to the original: ${src}`
      ).toBe(true);
    });
  }
});
