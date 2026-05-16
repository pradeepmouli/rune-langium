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
