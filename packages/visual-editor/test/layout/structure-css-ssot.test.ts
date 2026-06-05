// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Cross-file SSoT enforcement for Structure View layout constants.
 *
 * Part A: the geometry `--rune-*` vars are now EMITTED from
 * `STRUCTURE_LAYOUT_CONSTANTS` as `STRUCTURE_LAYOUT_CSS_VARS` (applied inline on
 * the structure-pane roots), not hand-declared in CSS. We verify the emitted map
 * matches the constants AND that the geometry vars are no longer declared in
 * `styles.css` (so there is exactly one source).
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
import { STRUCTURE_LAYOUT_CONSTANTS, STRUCTURE_LAYOUT_CSS_VARS } from '../../src/layout/structure-layout.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = join(__dirname, '../../src/styles.css');
const css = readFileSync(cssPath, 'utf-8');

// ── Part A: emitted CSS vars derive from the TS constants (one source) ────

describe('Structure layout SSoT — emitted CSS vars derive from TS constants', () => {
  const cases: Array<[keyof typeof STRUCTURE_LAYOUT_CONSTANTS, string]> = [
    ['ROW_HEIGHT', '--rune-row-height'],
    ['DATA_ROW_HEIGHT', '--rune-data-row-height'],
    ['HEADER_HEIGHT', '--rune-header-height'],
    ['COL_WIDTH', '--rune-col-width'],
    ['COL_GAP', '--rune-col-gap'],
    ['ROW_GAP', '--rune-row-gap'],
    ['BASE_PADDING', '--rune-base-padding'],
    ['NODE_PADDING', '--rune-node-padding']
  ];

  for (const [tsKey, cssVar] of cases) {
    it(`${cssVar} is emitted as STRUCTURE_LAYOUT_CONSTANTS.${tsKey}px`, () => {
      expect(STRUCTURE_LAYOUT_CSS_VARS[cssVar as keyof typeof STRUCTURE_LAYOUT_CSS_VARS]).toBe(
        `${STRUCTURE_LAYOUT_CONSTANTS[tsKey]}px`
      );
    });

    it(`${cssVar} is NOT hand-declared in styles.css (JS is the single source)`, () => {
      // A declaration is `--rune-foo:`; a usage is `var(--rune-foo)`. Only the
      // declaration form has the trailing colon, so this won't match usages.
      expect(
        css.includes(`${cssVar}:`),
        `${cssVar} should be emitted from STRUCTURE_LAYOUT_CSS_VARS, not declared in styles.css`
      ).toBe(false);
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
    },
    // sizeData/sizeChoice reserve NODE_PADDING on the sides + bottom of the
    // wrapper (width += 2*NODE_PADDING, height += NODE_PADDING). The CSS that
    // mirrors this is `padding: 0 var(--rune-node-padding) var(--rune-node-padding)`
    // on the body — top stays 0 so the header reads flush with the chrome's
    // top border. If someone changes the var here (or drops the `padding`
    // declaration entirely) the rows column shifts away from where the
    // layout's rowOffsets expect it, and right-column children land in the
    // wrong place.
    {
      selector: '.rune-node-data--structure .rune-node-body--two-col',
      property: 'padding',
      expectedVar: '--rune-node-padding',
      rationale:
        'sizeData reserves NODE_PADDING on body sides + bottom; the body padding shorthand must reference --rune-node-padding so visual and layout stay coordinated.'
    },
    {
      selector: '.rune-node-choice--structure .rune-node-body--two-col',
      property: 'padding',
      expectedVar: '--rune-node-padding',
      rationale: 'sizeChoice mirrors sizeData — same NODE_PADDING body inset, same coordination requirement.'
    }
    // Header left-padding (8px) is intentionally NOT tied to NODE_PADDING.
    // It's a purely visual concern — needs to clear the 3px accent stripe
    // (`.rune-node::before`) with breathing room — with no row-offset
    // coupling. A first iteration linked it to --rune-node-padding (4px),
    // which placed the title 1px past the stripe and read as crowded.
    // Decoupling lets the body inset and header inset evolve independently
    // for their distinct concerns.
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
