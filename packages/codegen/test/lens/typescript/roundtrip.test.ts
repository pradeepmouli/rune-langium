// packages/codegen/test/lens/typescript/roundtrip.test.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parseExpression } from '@rune-langium/core';
import { renderExpression } from '../../../src/emit/rosetta/render-expression.js';
import { treesEquivalent } from '../../emit/rosetta/expression-tree-equivalence.js';
import { renderTs } from '../../../src/lens/typescript/render-ts.js';
import { parseTs } from '../../../src/lens/typescript/parse-ts.js';

// Every entry must be in subset S (see ../../../src/lens/subset.ts) and
// exercises the mapping this feature's contract depends on.
const IN_SUBSET_CORPUS = [
  'value >= 0',
  'currency exists',
  'currency is absent',
  'a and (b or c)',
  'a = b',
  'a <> b',
  'trade -> quantity',
  '(a + b) * c',
  '"USD"',
  '3.5',
  'True',
  'quantity > 0 and price exists'
];

describe('lens: Rune -> TS -> Rune fixed point (contract points 1+2)', () => {
  for (const rune of IN_SUBSET_CORPUS) {
    it(`round-trips: ${rune}`, async () => {
      const p1 = parseExpression(rune);
      expect(p1.hasErrors, `must parse: ${rune}`).toBe(false);

      const ts = renderTs(p1.value);
      expect(ts, `must be in S: ${rune}`).not.toBeNull();

      const back = await parseTs(ts!);
      expect(back.ok, `TS must parse back: ${ts}`).toBe(true);
      if (!back.ok) return;

      const rune2 = renderExpression(back.node);
      const p2 = parseExpression(rune2);
      expect(p2.hasErrors, `re-rendered Rune must reparse: ${rune2}`).toBe(false);
      expect(
        treesEquivalent(p1.value, p2.value),
        `round-tripped tree must be structurally equivalent: ${rune} -> ${ts} -> ${rune2}`
      ).toBe(true);
    });
  }
});

describe('lens: TS -> Rune -> TS fixed point (write-back direction)', () => {
  const TS_CORPUS = [
    'value >= 0',
    'currency != null',
    'currency == null',
    'a && (b || c)',
    'trade?.quantity',
    'a && b && c',
    'a || b || c',
    'a + b - c',
    'a - (b - c)',
    'a * b + c',
    '(a + b) * c'
  ];
  for (const ts of TS_CORPUS) {
    it(`round-trips: ${ts}`, async () => {
      const parsed = await parseTs(ts);
      expect(parsed.ok, `must parse: ${ts}`).toBe(true);
      if (!parsed.ok) return;

      const ts2 = renderTs(parsed.node);
      expect(ts2, `must render back: ${ts}`).not.toBeNull();
      expect(ts2).toBe(ts);
    });
  }
});

describe('lens: refusal corpus (contract point 3 — never a degraded node)', () => {
  const REFUSALS: Array<{ ts: string; kind: 'syntax-error' | 'out-of-subset' }> = [
    { ts: 'value >=', kind: 'syntax-error' },
    { ts: 'value = 3', kind: 'out-of-subset' },
    { ts: 'value.toFixed(2)', kind: 'out-of-subset' },
    { ts: 'trade.quantity', kind: 'out-of-subset' },
    { ts: 'for (;;) {}', kind: 'syntax-error' }
  ];
  for (const { ts, kind } of REFUSALS) {
    it(`refuses (${kind}): ${ts}`, async () => {
      const r = await parseTs(ts);
      expect(r.ok, `must be refused: ${ts}`).toBe(false);
      if (!r.ok) expect(r.reason.kind).toBe(kind);
    });
  }
});
