// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * P5 hand-curated corpus: parse → render (via the real renderNode dispatch)
 * → reparse → fixed point + tree-equivalence, for one representative snippet
 * per RosettaSynonymBody alternative plus rich value/class/enum-synonym forms.
 *
 * CI-safe (no `.resources/` dependency) — mirrors expression-roundtrip.test.ts's
 * shape but drives renderNode (not renderExpression directly), since a
 * synonym's render surface spans `RosettaSynonym`/`RosettaClassSynonym`/
 * `RosettaEnumSynonym`, not a single expression tree.
 */

import { describe, it, expect } from 'vitest';
import { renderNode, type RenderChild } from '../../../src/emit/rosetta/rosetta-render-core.js';
import { treesEquivalent } from './expression-tree-equivalence.js';
import { parseSynonymRule, type SynonymRuleName } from './parse-synonym-rule.js';

const regen: RenderChild = (c) => renderNode(c, regen) ?? '';

interface Case {
  rule: SynonymRuleName;
  src: string;
}

// One representative per RosettaSynonymBody alternative + rich forms, verified
// grammar-valid via the parse-first discipline (bare-rule parse probe run
// before authoring these expectations).
const CORPUS: Case[] = [
  // value form: rich surface (tag, path, maps) + trailing meta.
  { rule: 'RosettaSynonym', src: '[synonym FpML value "tradeDate" tag 2 path "trade" maps 2 meta "id"]' },
  { rule: 'RosettaSynonym', src: '[synonym FpML value "n" componentID 4]' },
  // value form + mapping (set-when / and-chain / default-to mixed).
  { rule: 'RosettaSynonym', src: '[synonym FpML value "t" set when path = "a.b" and "c" exists]' },
  { rule: 'RosettaSynonym', src: '[synonym FpML value "t" set when path = "a", default to "Y"]' },
  // hint alternative.
  { rule: 'RosettaSynonym', src: '[synonym FpML hint "h1", "h2"]' },
  // merge alternative (with and without exclude path).
  { rule: 'RosettaSynonym', src: '[synonym FpML merge "m" when path <> "x"]' },
  { rule: 'RosettaSynonym', src: '[synonym FpML merge "m"]' },
  // bare set-to mapping alternative (multiple instances comma-joined).
  { rule: 'RosettaSynonym', src: '[synonym FpML set to Foo.Bar -> V]' },
  { rule: 'RosettaSynonym', src: '[synonym FpML set to "X" when path = "a", set to "Y" when path = "b"]' },
  // bare meta alternative.
  { rule: 'RosettaSynonym', src: '[synonym FpML meta "id1", "id2"]' },
  // each mapping-test form (rosettaPath recursive attrRef, condition-func).
  { rule: 'RosettaSynonym', src: '[synonym FpML value "t" set when rosettaPath = Data.Type -> attr -> nested]' },
  { rule: 'RosettaSynonym', src: '[synonym FpML value "t" set when condition-func SomeFunc condition-path "p"]' },
  { rule: 'RosettaSynonym', src: '[synonym FpML value "t" set when "c" is absent]' },
  { rule: 'RosettaSynonym', src: '[synonym FpML value "t" set when "c" <> Foo.Bar -> V]' },
  // suffix combos.
  { rule: 'RosettaSynonym', src: '[synonym FpML value "n" dateFormat "yyyy-MM-dd" pattern "a" "b" removeHtml mapper "someMapper"]' },
  // class synonym.
  { rule: 'RosettaClassSynonym', src: '[synonym FpML value "n" tag 2 meta "m"]' },
  // metaValue is a RosettaMetaSynonymValue — grammar allows maps (unlike the value form).
  { rule: 'RosettaClassSynonym', src: '[synonym FpML value "n" meta "m" path "p" maps 2]' },
  { rule: 'RosettaClassSynonym', src: '[synonym FpML]' },
  // enum synonym with all suffixes.
  { rule: 'RosettaEnumSynonym', src: '[synonym FIX value "s" definition "d" pattern "a" "b" removeHtml]' },
  // P5 corpus-sweep finding: RosettaExternalEnumSynonym (`infers RosettaEnumSynonym`
  // — same $type, no `synonym` keyword, no sources, used inside
  // RosettaExternalEnumValue's `externalEnumSynonyms`) was mis-rendered as
  // `[synonym  value "s"]` (blank source) via the internal-form branch;
  // 354/532 unique corpus RosettaEnumSynonym-typed nodes were this shape
  // (currency-code enum externals in mapping-createiq-synonym.rosetta).
  { rule: 'RosettaExternalEnumSynonym', src: '[value "partyA"]' },
  { rule: 'RosettaExternalEnumSynonym', src: '[value "United Arab Emirates Dirham" definition "d" pattern "a" "b"]' }
];

describe('synonym round-trip (parse → renderNode → reparse → fixed point)', () => {
  for (const { rule, src } of CORPUS) {
    it(`round-trips (${rule}): ${src}`, () => {
      const p1 = parseSynonymRule(src, rule);
      expect(p1.hasErrors, `original must parse: ${src}`).toBe(false);

      const r1 = renderNode(p1.value as never, regen);
      expect(r1, `renderNode must not fall back to CST for a designed-supported snippet: ${src}`).not.toBeNull();

      const p2 = parseSynonymRule(r1 as string, rule);
      expect(p2.hasErrors, `rendered must reparse: ${r1}`).toBe(false);

      const r2 = renderNode(p2.value as never, regen);
      expect(r2, 'render must be a fixed point').toBe(r1);

      expect(
        treesEquivalent(p1.value, p2.value),
        `reparsed tree must be structurally equivalent to the original: ${src}`
      ).toBe(true);
    });
  }
});
