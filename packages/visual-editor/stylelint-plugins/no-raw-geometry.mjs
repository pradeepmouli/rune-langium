// @ts-check
// SPDX-License-Identifier: MIT
// Custom stylelint rule: forbid raw px on corner-radius and spacing
// (padding / margin / gap), forcing the design-system token ladders so the
// values can't drift back into the ad-hoc state they were just normalised out
// of (see docs/superpowers/plans/2026-06-03-radius-spacing-scrub.md).
//
//   border-radius      → must use var(--radius-xs|sm|md|lg|xl|full)
//   padding/margin/gap → must use var(--space-N); raw literals <= 3px are
//                        allowed for genuine hairline insets (no ladder rung
//                        that small), and 0 is always allowed.
//
// Custom-property DEFINITIONS (props starting with `--`, e.g. the
// `--rune-chip-padding-x` ornament tokens) are skipped — they ARE the token
// SSoT. var()/calc()/min()/max()/clamp() wrappers are stripped before the
// check, so token-driven values pass.

import stylelint from 'stylelint';

const ruleName = 'rune/no-raw-geometry';

const messages = stylelint.utils.ruleMessages(ruleName, {
  radius: (prop, value) =>
    `"${prop}: ${value}" must use a radius token — var(--radius-xs|sm|md|lg|xl|full), not a raw px value.`,
  space: (prop, value) =>
    `"${prop}: ${value}" must use a spacing token — var(--space-N), not a raw px value (literals ≤3px are allowed for hairline insets).`,
});

const meta = {
  url: 'https://github.com/pradeepmouli/rune-langium/blob/master/packages/visual-editor/stylelint-plugins/no-raw-geometry.mjs',
};

const RADIUS_PROP = /^border(?:-[a-z]+)*-radius$/;
const SPACE_PROPS = new Set([
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'gap', 'row-gap', 'column-gap',
]);

// Strip var()/calc()/min()/max()/clamp() groups (innermost-out) so only px
// literals that sit OUTSIDE a token reference remain to be inspected.
function bareLiterals(value) {
  let v = value;
  let prev;
  do {
    prev = v;
    v = v.replace(/\b(?:var|calc|min|max|clamp)\([^()]*\)/g, ' ');
  } while (v !== prev);
  return v;
}

function pxValues(text) {
  return (text.match(/\d*\.?\d+px/g) || []).map(parseFloat);
}

const rule = (primary) => (root, result) => {
  const validOptions = stylelint.utils.validateOptions(result, ruleName, {
    actual: primary,
    possible: [true],
  });
  if (!validOptions) return;

  root.walkDecls((decl) => {
    const prop = decl.prop.toLowerCase();
    if (prop.startsWith('--')) return; // token definitions are the SSoT
    const bare = bareLiterals(decl.value);

    if (RADIUS_PROP.test(prop)) {
      if (pxValues(bare).some((n) => n > 0)) {
        stylelint.utils.report({ message: messages.radius(decl.prop, decl.value), node: decl, result, ruleName });
      }
    } else if (SPACE_PROPS.has(prop)) {
      if (pxValues(bare).some((n) => n >= 4)) {
        stylelint.utils.report({ message: messages.space(decl.prop, decl.value), node: decl, result, ruleName });
      }
    }
  });
};

rule.ruleName = ruleName;
rule.messages = messages;
rule.meta = meta;

export default stylelint.createPlugin(ruleName, rule);
