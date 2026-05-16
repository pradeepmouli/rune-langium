// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Cross-file SSoT enforcement for Structure View layout constants.
 *
 * Part A: verifies that every CSS custom property in the `:root` block
 * of `styles.css` matches the numeric value in `STRUCTURE_LAYOUT_CONSTANTS`.
 *
 * Part D: scans geometry-bearing CSS classes and flags any layout-coupled
 * property that still uses a literal `Npx` value instead of `var(--rune-*)`.
 * This is the lint-scanner replacement (no stylelint dependency needed).
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

// ── Part D: geometry classes must not use literal px for layout props ─────

describe('Structure layout SSoT — geometry-bearing classes use var(--rune-*)', () => {
  /**
   * Layout-coupled CSS properties where a literal `Npx` value signals
   * drift from the SSoT.  Non-layout-coupled px values (1px borders,
   * fixed decorative dimensions like the 8px handle dot) are excluded
   * by not appearing in this list.
   */
  const GEOMETRY_PROPS = [
    'width',
    'height',
    'padding',
    'margin',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'gap',
    'row-gap',
    'column-gap',
    'min-height',
    'max-height',
    'min-width',
    'max-width'
  ];

  // Selectors that carry structure-view layout geometry (explicit list
  // avoids false positives from other rune-node-* classes like rune-node-header)
  const GEOMETRY_CLASS_PATTERN =
    /\.rune-(node-rows|node-row|node-children-slot|graph-group--base|graph-group__base-rows?|graph-group__base-row|cell)/;

  // Naive but sufficient CSS rule parser — matches `selector { body }`
  const ruleRegex = /([^{}]+)\{([^{}]+)\}/g;

  it('does not use literal pixel values for layout-coupled properties on geometry classes', () => {
    const violations: string[] = [];
    let m: RegExpExecArray | null;

    while ((m = ruleRegex.exec(css)) !== null) {
      const selector = m[1].trim();
      const body = m[2];

      if (!GEOMETRY_CLASS_PATTERN.test(selector)) continue;

      for (const prop of GEOMETRY_PROPS) {
        const declRe = new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+);`, 'g');
        let d: RegExpExecArray | null;
        while ((d = declRe.exec(body)) !== null) {
          const value = d[1].trim();
          // Allow: var(--rune-*), 0 / 0px, auto / none / inherit / initial / unset,
          // calc() containing var(--rune-*), or anything without a bare Npx literal.
          // Also allow shorthand padding/margin that has zero on the vertical axis
          // (e.g. `0 8px` = no vertical layout coupling, only horizontal inset).
          if (/\bvar\(--rune-/.test(value)) continue;
          if (/^0(px)?$/.test(value)) continue;
          if (/^(auto|none|inherit|initial|unset)$/.test(value)) continue;
          if (!/\d+px/.test(value)) continue;
          // Allow `0 Npx` / `0px Npx` shorthand — vertical is zero so no layout coupling
          if (/^0(px)?\s+\d+px$/.test(value)) continue;
          violations.push(`${selector} { ${prop}: ${value}; }`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
