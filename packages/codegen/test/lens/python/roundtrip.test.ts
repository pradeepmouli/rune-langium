// packages/codegen/test/lens/python/roundtrip.test.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parseExpression } from '@rune-langium/core';
import { renderExpression } from '../../../src/emit/rosetta/render-expression.js';
import { treesEquivalent } from '../../emit/rosetta/expression-tree-equivalence.js';
import { renderPy } from '../../../src/lens/python/render-py.js';
import { parsePy } from '../../../src/lens/python/parse-py.js';

// Every entry must be in subset S (see ../../../src/lens/subset.ts) and
// exercises the mapping this feature's contract depends on.
const IN_SUBSET_CORPUS = [
  'value >= 0',
  'currency exists',
  'currency is absent',
  'trade -> quantity',
  'trade -> quantity -> amount',
  '(a + b) * c',
  '"USD"',
  '3.5',
  'True',
  'quantity > 0 and price exists',
  'value = 0',
  'value <> 0'
];

describe('lens/python: Rune -> Python -> Rune fixed point', () => {
  for (const rune of IN_SUBSET_CORPUS) {
    it(`round-trips: ${rune}`, async () => {
      const p1 = parseExpression(rune);
      expect(p1.hasErrors, `must parse: ${rune}`).toBe(false);

      const py = renderPy(p1.value);
      expect(py, `must be in S: ${rune}`).not.toBeNull();

      const back = await parsePy(py!);
      expect(back.ok, `Python must parse back: ${py}`).toBe(true);
      if (!back.ok) return;

      const rune2 = renderExpression(back.node);
      const p2 = parseExpression(rune2);
      expect(p2.hasErrors, `re-rendered Rune must reparse: ${rune2}`).toBe(false);
      expect(
        treesEquivalent(p1.value, p2.value),
        `round-tripped tree must be structurally equivalent: ${rune} -> ${py} -> ${rune2}`
      ).toBe(true);
    });
  }
});

describe('lens/python: Python -> Rune -> Python fixed point (write-back direction)', () => {
  const PY_CORPUS = [
    'value >= 0',
    'currency is not None',
    'currency is None',
    'a and (b or c)',
    'getattr(trade, "quantity", None)',
    'getattr(getattr(trade, "quantity", None), "amount", None)',
    '(a < b) == c',
    '(a < b) is not None',
    '(currency is not None) == flag'
  ];
  for (const py of PY_CORPUS) {
    it(`round-trips: ${py}`, async () => {
      const parsed = await parsePy(py);
      expect(parsed.ok, `must parse: ${py}`).toBe(true);
      if (!parsed.ok) return;

      const py2 = renderPy(parsed.node);
      expect(py2, `must render back: ${py}`).not.toBeNull();
      expect(py2).toBe(py);
    });
  }
});

describe('lens/python: refusal corpus', () => {
  const REFUSALS: Array<{ py: string; kind: 'syntax-error' | 'out-of-subset' }> = [
    { py: 'value >=', kind: 'syntax-error' },
    { py: 'value.toFixed(2)', kind: 'out-of-subset' },
    { py: 'a ** 2', kind: 'out-of-subset' },
    { py: 'a // b', kind: 'out-of-subset' },
    { py: 'not x', kind: 'out-of-subset' },
    { py: 'trade.quantity', kind: 'out-of-subset' },
    { py: 'getattr(trade, "quantity")', kind: 'out-of-subset' },
    { py: 'a < b < c', kind: 'out-of-subset' }
  ];
  for (const { py, kind } of REFUSALS) {
    it(`refuses (${kind}): ${py}`, async () => {
      const r = await parsePy(py);
      expect(r.ok, `must be refused: ${py}`).toBe(false);
      if (!r.ok) expect(r.reason.kind).toBe(kind);
    });
  }
});
