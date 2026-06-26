// @ts-check
// SPDX-License-Identifier: MIT
// Custom stylelint rule: forbid raw color literals in non-token declarations.
//
// Flags hex (#rgb / #rrggbb / #rrggbbaa), rgb(), rgba(), hsl(), hsla(),
// oklch(), and oklab() with literal coordinates when used as the value of a
// NON-custom-property declaration.
//
// Allowed (never flagged):
//   - Declarations whose *property* starts with `--`  (token definitions)
//   - Literals that appear only inside a var(--x, <fallback>) construct
//   - Relative color syntax: oklch(from var(--token) l c h / alpha)
//   - CSS keywords: transparent, currentColor, currentcolor, inherit,
//     initial, unset, none
//   - Values produced by color-mix() that reference var() — not a literal
//
// Configurable secondary options:
//   { ignoreProperties: ['box-shadow', 'text-shadow'] }
//     — skip these properties (useful for depth-cue rgba shadows that lack tokens)

import stylelint from 'stylelint';

const ruleName = 'rune/no-raw-color';

const messages = stylelint.utils.ruleMessages(ruleName, {
  rawColor: (value, prop) =>
    `Unexpected raw color "${value}" in "${prop}" — use a design token ` +
    `(var(--color-*) / semantic token). Define raw values only in token files ` +
    `(custom properties) or as a var() fallback.`
});

const meta = {
  url: 'https://github.com/pradeepmouli/rune-langium/blob/master/packages/visual-editor/stylelint-plugins/no-raw-color.mjs'
};

// ─── Regex helpers ────────────────────────────────────────────────────────────

// Matches hex color literals: #rgb, #rrggbb, #rrggbbaa (3, 4, 6, or 8 hex digits)
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;

// Matches color function calls with literal coordinates (not just whitespace/keywords).
// We check for the presence of a digit inside the parens to distinguish
// `oklch(from var(--x) l c h / 0.06)` (no raw digits for L/C/H) from
// `oklch(0.75 0.01 280)` (literal digits).
// This regex only matches the function *name* start — we then strip
// safe regions and test what's left.
const COLOR_FN_RE = /\b(rgb|rgba|hsl|hsla|oklch|oklab)\s*\(/i;

// Keywords that are always safe
const SAFE_KEYWORDS = new Set([
  'transparent',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
  'none',
  'revert',
  'revert-layer'
]);

// ─── Value sanitisation ────────────────────────────────────────────────────────

/**
 * Remove all `var(--name, fallback)` occurrences from a CSS value string,
 * replacing the entire var() call (including any nested var() in the fallback)
 * with the placeholder `VAR`. This prevents fallback color literals from
 * being flagged.
 *
 * We do a simple paren-depth walk rather than a regex so nested parens in
 * fallbacks (e.g. `var(--border, rgba(255,255,255,0.06))`) are handled.
 */
function stripVarCalls(value) {
  let result = '';
  let i = 0;
  while (i < value.length) {
    // Look for 'var('
    const varIdx = value.indexOf('var(', i);
    if (varIdx === -1) {
      result += value.slice(i);
      break;
    }
    result += value.slice(i, varIdx);
    // Walk to the matching closing paren
    let depth = 0;
    let j = varIdx;
    while (j < value.length) {
      if (value[j] === '(') depth++;
      else if (value[j] === ')') {
        depth--;
        if (depth === 0) {
          j++; // include the closing paren
          break;
        }
      }
      j++;
    }
    result += 'VAR';
    i = j;
  }
  return result;
}

/**
 * Remove `oklch(from VAR l c h / alpha)` relative-color syntax.
 * After `stripVarCalls`, the var ref has become `VAR`, so the pattern is:
 *   oklch(from VAR l c h …)
 * We strip the entire function call to avoid false-positives on the alpha
 * component (which may be a decimal literal but is not a "standalone color").
 */
function stripRelativeColorFns(value) {
  // Match color-function(from VAR ...) patterns
  return value.replace(/\b(?:oklch|oklab|color|lch|lab|srgb|hsl|hwb)\s*\(\s*from\s+VAR[^)]*\)/gi, 'RELCOLOR');
}

/**
 * Returns true if the sanitised value contains a raw color literal.
 * Must be called on the *sanitised* value (after stripping var() and relative colors).
 */
function containsRawColorLiteral(sanitised) {
  // Hex literal
  if (HEX_RE.test(sanitised)) return true;

  // Color function with literal coordinates — we test that there is at least
  // one digit argument inside the parens (distinguishes keyword-only forms
  // like `hsl(none none none)` from `hsl(210, 50%, 80%)`).
  if (COLOR_FN_RE.test(sanitised)) {
    // Extract function content and check for digit
    const fnMatch = sanitised.match(/\b(?:rgb|rgba|hsl|hsla|oklch|oklab)\s*\(([^)]*)\)/i);
    if (fnMatch && /\d/.test(fnMatch[1])) return true;
  }

  return false;
}

// ─── Rule implementation ───────────────────────────────────────────────────────

const rule = (primary, secondaryOptions) => (root, result) => {
  const validOptions = stylelint.utils.validateOptions(
    result,
    ruleName,
    {
      actual: primary,
      possible: [true]
    },
    {
      actual: secondaryOptions,
      possible: {
        ignoreProperties: [String]
      },
      optional: true
    }
  );
  if (!validOptions) return;

  const ignoreProps = new Set(
    ((secondaryOptions && secondaryOptions.ignoreProperties) || []).map((p) => p.toLowerCase())
  );

  root.walkDecls((decl) => {
    const prop = decl.prop;

    // Allow custom-property definitions (token files define raw values there)
    if (prop.startsWith('--')) return;

    // Allow explicitly ignored properties
    if (ignoreProps.has(prop.toLowerCase())) return;

    const rawValue = decl.value;

    // Fast-exit: no color-like character at all
    if (!/#|rgb|rgba|hsl|hsla|oklch|oklab/i.test(rawValue)) return;

    // Strip var() calls (including their fallback literals)
    const afterVarStrip = stripVarCalls(rawValue);

    // Strip relative color syntax (oklch(from VAR …))
    const sanitised = stripRelativeColorFns(afterVarStrip);

    if (!containsRawColorLiteral(sanitised)) return;

    // Extract the offending literal for a human-readable message
    const hexMatch = sanitised.match(HEX_RE);
    const fnMatch = sanitised.match(/\b(?:rgb|rgba|hsl|hsla|oklch|oklab)\s*\([^)]*\d[^)]*\)/i);
    const offendingLiteral = hexMatch ? hexMatch[0] : fnMatch ? fnMatch[0] : rawValue;

    stylelint.utils.report({
      message: messages.rawColor(offendingLiteral, prop),
      node: decl,
      result,
      ruleName
    });
  });
};

rule.ruleName = ruleName;
rule.messages = messages;
rule.meta = meta;

export default stylelint.createPlugin(ruleName, rule);
