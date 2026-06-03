// SPDX-License-Identifier: MIT
// oxlint JS plugin (alpha API) — bans hardcoded Tailwind palette utilities
// (text-slate-500, bg-blue-500, …) in string + template literals. Author-time
// replacement for the file-regex unit test `no-hardcoded-colours.test.ts`.
const PALETTE =
  /\b(text|bg|border|ring|fill|stroke|from|via|to|placeholder|caret|accent|outline|divide|shadow|decoration)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]+\b/;

function check(context, node, str) {
  if (typeof str !== 'string') return;
  const m = str.match(PALETTE);
  if (m) {
    context.report({
      message: `Hardcoded Tailwind palette utility "${m[0]}" bypasses the token layer — use a design-system primitive or a var(--color-*) token.`,
      node,
    });
  }
}

const rule = {
  create(context) {
    return {
      Literal(node) {
        check(context, node, node.value);
      },
      TemplateElement(node) {
        check(context, node, node.value?.cooked ?? node.value?.raw);
      },
    };
  },
};

export default { meta: { name: 'rune' }, rules: { 'no-palette-utility': rule } };
