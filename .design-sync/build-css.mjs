// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

// design-sync CSS step: compile .design-sync/tailwind.css (Tailwind v4 CLI staged
// in .ds-sync/) into packages/design-system/dist/ds-sync.css (= cfg.cssEntry).
// visual-editor/src/styles.css imports the DS theme via a bare-specifier
// `@import url('@rune-langium/design-system/theme.css')` (resolved by Vite in
// Studio). Tailwind preserves url() imports verbatim, and the theme is already
// inlined by tailwind.css, so drop that one line rather than ship a dangling import.
// Usage: node .design-sync/build-css.mjs [extra output path...]
import { execFileSync } from 'node:child_process';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';

const OUT = 'packages/design-system/dist/ds-sync.css';
const tmp = `${OUT}.${process.pid}.tmp`;
execFileSync('.ds-sync/node_modules/.bin/tailwindcss', ['-i', '.design-sync/tailwind.css', '-o', tmp], {
  stdio: 'ignore'
});
const css = readFileSync(tmp, 'utf8').replace(
  /@import url\(['"]@rune-langium\/design-system\/theme\.css['"]\);\n?/g,
  ''
);
writeFileSync(tmp, css);
for (const extra of process.argv.slice(2)) {
  const t = `${extra}.${process.pid}.tmp`;
  writeFileSync(t, css);
  renameSync(t, extra); // atomic swap — safe while parallel agents capture
}
renameSync(tmp, OUT);
console.log(
  `css: ${OUT} (${css.length} bytes)${process.argv.length > 2 ? ` + ${process.argv.slice(2).join(', ')}` : ''}`
);
