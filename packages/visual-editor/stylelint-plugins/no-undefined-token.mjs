// @ts-check
// SPDX-License-Identifier: MIT
// Custom stylelint rule: every `var(--name)` reference must resolve to a
// definition in the token layer (the `importFrom` files), in the linted file
// itself, or to a known runtime-injected name. Replaces the path-coupled
// `no-undefined-vars.test.ts` unit test — a lint rule operates on stylelint's
// globbed files, so a stylesheet rename or a token moving between files can't
// break it, and there's no hand-maintained "required token" list to drift.
//
// Options (secondary):
//   importFrom:     string[]  CSS files (relative to cwd) whose `--x:` defs are
//                             treated as defined. Missing files are ignored, so
//                             a wrong path surfaces loudly as "everything
//                             undefined" rather than silently passing.
//   ignore:         string[]  bare names (no `--`) always treated as defined
//                             (e.g. consumer inline-style vars like `kind-color`).
//   ignorePrefixes: string[]  name prefixes for framework/runtime-injected vars
//                             never present in a static CSS file (e.g. `rune-`,
//                             `xy-`, `radix-`).

import stylelint from 'stylelint';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ruleName = 'rune/no-undefined-token';

const messages = stylelint.utils.ruleMessages(ruleName, {
  undefined: (name) =>
    `\`var(--${name})\` is not defined in the token layer, this file, or the runtime allow-list. ` +
    `Define it in the design-system tokens.css/theme.css, or add it to this rule's \`ignore\`/\`ignorePrefixes\`.`
});

const meta = {
  url: 'https://github.com/pradeepmouli/rune-langium/blob/master/packages/visual-editor/stylelint-plugins/no-undefined-token.mjs'
};

const VAR_DEF = /(?:^|[\s;{])--([a-zA-Z0-9_-]+)\s*:/g;
const VAR_REF = /var\(\s*--([a-zA-Z0-9_-]+)/g;

const defCache = new Map();
function defsFromFile(abs) {
  if (defCache.has(abs)) return defCache.get(abs);
  const set = new Set();
  try {
    const text = readFileSync(abs, 'utf8');
    for (const m of text.matchAll(VAR_DEF)) set.add(m[1]);
  } catch {
    // Missing file → empty set → references surface as undefined (loud).
  }
  defCache.set(abs, set);
  return set;
}

const rule = (primary, secondary) => (root, result) => {
  const validOptions = stylelint.utils.validateOptions(result, ruleName, {
    actual: primary,
    possible: [true]
  });
  if (!validOptions) return;

  const opts = secondary || {};
  const importFrom = Array.isArray(opts.importFrom) ? opts.importFrom : [];
  const ignore = Array.isArray(opts.ignore) ? opts.ignore : [];
  const ignorePrefixes = (Array.isArray(opts.ignorePrefixes) ? opts.ignorePrefixes : []).map(
    (p) => new RegExp('^' + p)
  );

  // defined = importFrom defs ∪ this file's own defs ∪ ignore list
  const defined = new Set(ignore);
  for (const f of importFrom) {
    for (const name of defsFromFile(resolve(process.cwd(), f))) defined.add(name);
  }
  root.walkDecls((decl) => {
    if (decl.prop.startsWith('--')) defined.add(decl.prop.slice(2));
  });

  root.walkDecls((decl) => {
    let m;
    VAR_REF.lastIndex = 0;
    while ((m = VAR_REF.exec(decl.value)) !== null) {
      const name = m[1];
      if (defined.has(name)) continue;
      if (ignorePrefixes.some((re) => re.test(name))) continue;
      stylelint.utils.report({ message: messages.undefined(name), node: decl, result, ruleName });
    }
  });
};

rule.ruleName = ruleName;
rule.messages = messages;
rule.meta = meta;

export default stylelint.createPlugin(ruleName, rule);
