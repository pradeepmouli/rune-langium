// SPDX-License-Identifier: MIT
// The `rune` oxlint JS plugin (alpha API) — the className-side counterpart to the
// `rune/*` stylelint rules, which only scan `.css` and so are blind to Tailwind
// utilities authored in `.tsx`. As styling moves into `className` (the
// component-override convention), that blind spot is where raw colors and sizes
// regress back in. One plugin exports every `rune/*` rule; each package's
// `.oxlintrc.json` enables the subset it wants (definitions here, activation there).

// ── rune/no-palette-utility ─────────────────────────────────────────
// Bans hardcoded Tailwind palette utilities (`text-slate-500`, `bg-blue-500`, …)
// in string + template literals. Author-time replacement for the former
// file-regex unit test `no-hardcoded-colours.test.ts`.
const PALETTE =
  /\b(text|bg|border|ring|fill|stroke|from|via|to|placeholder|caret|accent|outline|divide|shadow|decoration)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]+\b/;

function checkPalette(context, node, str) {
  if (typeof str !== 'string') return;
  const m = str.match(PALETTE);
  if (m) {
    context.report({
      message: `Hardcoded Tailwind palette utility "${m[0]}" bypasses the token layer — use a design-system primitive or a var(--color-*) token.`,
      node,
    });
  }
}

const noPaletteUtility = {
  create(context) {
    return {
      Literal(node) {
        checkPalette(context, node, node.value);
      },
      TemplateElement(node) {
        checkPalette(context, node, node.value?.cooked ?? node.value?.raw);
      },
    };
  },
};

// ── rune/no-raw-arbitrary-value ─────────────────────────────────────
// Bans raw, untokenized values inside Tailwind *arbitrary* utilities
// (`text-[11px]`, `bg-[#fff]`). Scoped to the two FULLY tokenized dimensions, so
// a literal is always avoidable drift:
//   • font-size — the `--text-*` scale (text-3xs/2xs/xs/sm/md/base/lg/xl/…)
//   • color     — the `--color-*` palette (hex has no place in an arbitrary)
// Deliberately NOT flagged (legitimate bespoke layout, not token violations):
//   • non-text length arbitraries — `w-[480px]`, `max-w-[22rem]`, `min-w-[8rem]`,
//     `tracking-[0.12em]`, `ring-[3px]` (one-off sizing has no token to snap to)
//   • token references — `text-[length:var(--text-2xs)]`, `bg-[var(--chiclet-bg)]`,
//     and the v4 shorthand `text-(--text-2xs)` (these ARE the desired form)

// `<prefix>-[<inner>]` — capture the utility prefix and the bracketed payload.
const ARBITRARY = /\b([a-z][a-z-]*)-\[([^\]]+)\]/g;
// A bare length payload (font-size): `11px`, `10.5px`, `0.5rem`, `-1px`, `1em`.
const RAW_LENGTH = /^-?\d*\.?\d+(px|rem|em)$/;
// A hex color anywhere in the payload: `#fff`, `#0a0a0a`, `#00000080`.
const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/;

function checkArbitrary(context, node, str) {
  if (typeof str !== 'string' || !str.includes('[')) return;
  ARBITRARY.lastIndex = 0;
  let m;
  while ((m = ARBITRARY.exec(str))) {
    const [whole, prefix, inner] = m;
    // Any var()/custom-property reference is the tokenized form we WANT.
    if (inner.includes('var(') || inner.includes('--')) continue;
    if (HEX_COLOR.test(inner)) {
      context.report({
        message: `Raw hex color "${whole}" bypasses the token layer — use a var(--color-*) token (or a semantic utility) instead of a hardcoded color.`,
        node,
      });
      continue;
    }
    // Raw font-size: a bare length under `text-` (excludes `text-[length:…]` /
    // `text-[color:…]`, which carry a `:` and so don't match RAW_LENGTH).
    if (prefix === 'text' && RAW_LENGTH.test(inner)) {
      context.report({
        message: `Raw font-size "${whole}" bypasses the type scale — use a --text-* utility (text-3xs/2xs/xs/sm/md/base/lg/xl) instead of an arbitrary length.`,
        node,
      });
    }
  }
}

const noRawArbitraryValue = {
  create(context) {
    return {
      Literal(node) {
        checkArbitrary(context, node, node.value);
      },
      TemplateElement(node) {
        checkArbitrary(context, node, node.value?.cooked ?? node.value?.raw);
      },
    };
  },
};

export default {
  meta: { name: 'rune' },
  rules: {
    'no-palette-utility': noPaletteUtility,
    'no-raw-arbitrary-value': noRawArbitraryValue,
  },
};
