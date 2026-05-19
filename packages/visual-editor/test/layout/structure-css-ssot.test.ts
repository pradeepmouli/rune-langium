// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Cross-file SSoT enforcement for Structure View layout constants.
 *
 * Part A: verifies that every CSS custom property in the `:root` block
 * of `styles.css` matches the numeric value in `STRUCTURE_LAYOUT_CONSTANTS`.
 *
 * Note: the companion check that geometry-bearing CSS classes do not use
 * literal pixel values for layout-coupled properties is now owned by the
 * stylelint rule `rune/no-literal-layout-px` (stylelint-plugins/). That
 * check runs via `pnpm run lint:css` and integrates with editor extensions.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STRUCTURE_LAYOUT_CONSTANTS } from '../../src/layout/structure-layout.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = join(__dirname, '../../src/styles.css');
const css = readFileSync(cssPath, 'utf-8');

// ── Part A: parity between TS constants and CSS custom properties ─────────

describe('Structure layout SSoT — CSS custom props match TS constants', () => {
  const cases: Array<[keyof typeof STRUCTURE_LAYOUT_CONSTANTS, string]> = [
    ['ROW_HEIGHT', '--rune-row-height'],
    ['HEADER_HEIGHT', '--rune-header-height'],
    ['COL_WIDTH', '--rune-col-width'],
    ['COL_GAP', '--rune-col-gap'],
    ['ROW_GAP', '--rune-row-gap'],
    ['BASE_PADDING', '--rune-base-padding']
  ];

  for (const [tsKey, cssVar] of cases) {
    it(`${cssVar} matches STRUCTURE_LAYOUT_CONSTANTS.${tsKey}`, () => {
      const expectedPx = `${STRUCTURE_LAYOUT_CONSTANTS[tsKey]}px`;
      // Match: `--rune-row-height: 28px;`  (allow optional whitespace)
      const re = new RegExp(`${cssVar}\\s*:\\s*([^;]+);`);
      const match = css.match(re);
      expect(match, `expected to find "${cssVar}:" in styles.css`).not.toBeNull();
      const value = match![1].trim();
      expect(value).toBe(expectedPx);
    });
  }
});

// ── Part C: layout-coupled gaps reference the right SSoT variable ────────
//
// Part A catches *value* drift (e.g. someone changes --rune-base-padding to
// 5px while BASE_PADDING stays 4). It does NOT catch *variable choice* drift:
// a CSS rule whose declared property is layout-coupled but reads the WRONG
// --rune-* var. That happened with .rune-graph-group__base-rows once already
// — it used --rune-row-gap (8px) for the gap before the inner data child even
// though structure-layout.ts's sizeBase reserves exactly BASE_PADDING (4px)
// for that gap. Result: the inner DataNode rendered 4px below the dashed
// base container border.
//
// Add one entry per layout-coupled gap. Each entry asserts that the property
// on the listed selector resolves to the named --rune-* var (no literal).
describe('Structure layout SSoT — layout-coupled gaps use the correct variable', () => {
  const cases: Array<{ selector: string; property: string; expectedVar: string; rationale: string }> = [
    {
      selector: '.rune-graph-group__base-rows',
      property: 'margin-bottom',
      expectedVar: '--rune-base-padding',
      rationale:
        'sizeBase in structure-layout.ts adds BASE_PADDING (not ROW_GAP) between the last base row and the inner derived child. CSS must mirror that.'
    }
  ];

  for (const { selector, property, expectedVar, rationale } of cases) {
    it(`${selector} { ${property}: var(${expectedVar}) } — ${rationale}`, () => {
      // Match the rule block for the selector. We accept the selector being
      // part of a comma-separated list, but anchor on word boundaries to avoid
      // matching e.g. `.rune-graph-group__base-rows-foo`.
      const blockRe = new RegExp(
        `(?:^|[\\s,])${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}(?:[\\s,][^{]*)?\\{([^}]*)\\}`,
        'm'
      );
      const blockMatch = css.match(blockRe);
      expect(blockMatch, `expected to find a rule block for "${selector}"`).not.toBeNull();
      // Strip /* ... */ comments (CSS comments can span multiple lines and
      // contain '*' chars, which trips up a single-pass property regex).
      const body = blockMatch![1].replace(/\/\*[\s\S]*?\*\//g, '');
      // Find the property line: `property: value;` (last one wins in CSS, so use the last match).
      const propRe = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+);`, 'g');
      let last: RegExpExecArray | null = null;
      let m: RegExpExecArray | null;
      while ((m = propRe.exec(body)) !== null) last = m;
      expect(last, `expected "${selector}" to declare "${property}"`).not.toBeNull();
      const value = last![1].trim();
      expect(value).toMatch(new RegExp(`var\\(${expectedVar}\\b`));
    });
  }
});

// ── Part B: every --rune-* custom property is referenced at least once ───────

describe('Structure layout SSoT — every --rune-* var is referenced (not just declared)', () => {
  it('every --rune-* custom property declared at :root is used via var() in the same stylesheet', () => {
    // Collect all custom-property names declared anywhere in the stylesheet.
    const declRe = /(--rune-[a-z-]+)\s*:/g;
    const declared = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(css)) !== null) declared.add(m[1]);

    const unused: string[] = [];
    for (const v of declared) {
      const refRe = new RegExp(`var\\(${v}\\b`);
      if (!refRe.test(css)) unused.push(v);
    }
    expect(unused, `These --rune-* vars are declared but never referenced via var(): ${unused.join(', ')}`).toEqual([]);
  });
});
