// SPDX-License-Identifier: FSL-1.1-ALv2
// Stylelint configuration for Rune Studio.
//
// Extends stylelint-config-standard with:
//   1. Tailwind CSS v4 false-positive suppressions (at-rules, import notation, etc.)
//   2. rune/no-raw-color — requires design tokens instead of raw color literals.
//
// @type {import('stylelint').Config}

/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard'],
  plugins: [
    '../../packages/visual-editor/stylelint-plugins/no-raw-color.mjs',
  ],
  rules: {
    // ── rune custom rules ──────────────────────────────────────────────────
    // Require design tokens for color values; raw literals only allowed in
    // custom-property definitions (token files) or as var() fallbacks.
    // box-shadow and text-shadow are excluded because depth-cue alpha layers
    // (glass UI shadows) use raw oklch(0 0 0 / alpha) — no token maps 1-to-1
    // onto alpha-only shadow coordinates.
    'rune/no-raw-color': [true, {
      ignoreProperties: ['box-shadow', 'text-shadow'],
    }],

    // ── Tailwind CSS v4 at-rule suppressions ───────────────────────────────
    // stylelint-config-standard flags unknown @-rules; Tailwind v4 uses
    // @theme, @source, @apply, @layer, @variant, @custom-variant, @utility.
    'at-rule-no-unknown': [true, {
      ignoreAtRules: [
        'theme',
        'source',
        'apply',
        'layer',
        'variant',
        'custom-variant',
        'tailwind',
        'utility',
        'plugin',
      ],
    }],

    // Tailwind v4 uses `@import 'tailwindcss'` (bare specifier, no "url(…)")
    'import-notation': null,

    // ── Vendor prefix ──────────────────────────────────────────────────────
    // -webkit-backdrop-filter is required for Safari glass effects.
    // The ignoreProperties list matches the prefixed property name.
    'property-no-vendor-prefix': [true, {
      ignoreProperties: ['-webkit-backdrop-filter'],
    }],

    // ── Selector / specificity ─────────────────────────────────────────────
    'selector-class-pattern': null,          // allow BEM-style double-dash modifiers
    'no-descending-specificity': null,       // existing repo has deliberate overrides
    'declaration-block-no-redundant-longhand-properties': null,

    // ── Color notation ─────────────────────────────────────────────────────
    // Existing CSS and daikonic.css use oklch(L C H / A) bare-number notation;
    // disable pedantic format rules so we don't need a mass rewrite.
    'alpha-value-notation': null,
    'color-function-alias-notation': null,
    'color-function-notation': null,
    'hue-degree-notation': null,
    'lightness-notation': null,
    'color-hex-length': null,

    // ── Misc style ─────────────────────────────────────────────────────────
    'length-zero-no-unit': null,             // `0px` intentional in some shorthands
    'value-keyword-case': null,              // currentColor mixed-case from upstream libs
    'shorthand-property-no-redundant-values': null,

    // ── Media feature notation ─────────────────────────────────────────────
    // Existing media queries use legacy `(min-width: X)` notation; modernising
    // to `(width >= X)` requires a broader rewrite pass.
    'media-feature-range-notation': null,

    // ── Blank-line / comment formatting ───────────────────────────────────
    'comment-empty-line-before': null,
    'rule-empty-line-before': null,
    'declaration-empty-line-before': null,
    // daikonic.css groups custom properties with blank lines for readability.
    'custom-property-empty-line-before': null,
  },
  ignoreFiles: ['dist/**', 'node_modules/**'],
};
