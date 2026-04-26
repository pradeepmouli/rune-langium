// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T062 (014/Phase-8 / FR-025) — every `var(--…)` reference in
 * `apps/studio/src/styles.css` MUST resolve to a definition emitted
 * either by `@rune-langium/design-tokens/dist/tokens.css` or by the
 * design-system's `theme.css`. This guard fails CI the moment a new
 * undefined name is introduced — closing the audit's recurring "the
 * padding collapsed because `--space-4` was never defined" class of
 * regression.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolution order:
//   1. The Studio's own styles.css — references we want to validate.
//   2. The design-tokens emitted dist/tokens.css — the canonical source.
//   3. The design-system's theme.css — Studio-specific aliases (e.g.
//      `--text-secondary`, the shadcn `--background` / `--foreground`
//      surface palette, the `--color-warning` / `--color-info` semantic
//      colours, the per-domain (data/choice/enum/func) palette, etc.)
const STUDIO_STYLES = resolve(__dirname, '../../src/styles.css');
const TOKENS_CSS = resolve(__dirname, '../../../../packages/design-tokens/dist/tokens.css');
const DS_THEME_CSS = resolve(__dirname, '../../../../packages/design-system/src/theme.css');

/** Captures `--name` from `var(--name…)` (ignores fallback values). */
const VAR_REF_RE = /var\(\s*--([a-zA-Z0-9_-]+)\b/g;

/** Captures `--name:` definitions at any indentation. */
const VAR_DEF_RE = /^\s*--([a-zA-Z0-9_-]+)\s*:/gm;

/**
 * A handful of names are always defined by the runtime / Tailwind layer
 * rather than by either CSS file (e.g. shadcn's `@theme inline` bridge
 * produces `--color-*` aliases at build time). Listing them here keeps
 * the guard from flagging false positives without weakening the rule.
 */
const ALLOWED_RUNTIME_DEFINED = new Set<string>([
  // Tailwind v4 + shadcn `@theme` produces these at build time; the
  // grep over theme.css matches them via the `@theme inline { --color-* }`
  // block, but the parser expects them at column 0 (`:root` scope) — so
  // we whitelist defensively. (If a typo like `--color-data-bgg` slips
  // in, it'd still fail because no rule would define the typo'd name.)
]);

function readDefinedNames(): Set<string> {
  const tokens = readFileSync(TOKENS_CSS, 'utf8');
  const theme = readFileSync(DS_THEME_CSS, 'utf8');
  const defined = new Set<string>(ALLOWED_RUNTIME_DEFINED);
  for (const m of tokens.matchAll(VAR_DEF_RE)) defined.add(m[1]);
  for (const m of theme.matchAll(VAR_DEF_RE)) defined.add(m[1]);
  return defined;
}

function readReferencedNames(): Set<string> {
  const styles = readFileSync(STUDIO_STYLES, 'utf8');
  const referenced = new Set<string>();
  for (const m of styles.matchAll(VAR_REF_RE)) referenced.add(m[1]);
  return referenced;
}

describe('Studio CSS uses only defined custom properties (T062 / FR-025)', () => {
  it('every var(--…) reference in styles.css resolves in tokens.css OR theme.css', () => {
    const referenced = readReferencedNames();
    const defined = readDefinedNames();

    const undefined: string[] = [];
    for (const name of referenced) {
      if (!defined.has(name)) undefined.push(name);
    }

    if (undefined.length > 0) {
      // Fail with the offending names listed so CI output points at the fix.
      throw new Error(
        `Undefined var(--…) refs in apps/studio/src/styles.css:\n  ${undefined.sort().join(', ')}\n\n` +
          'Each name MUST be defined in either packages/design-tokens/src/tokens.json (preferred) ' +
          'or packages/design-system/src/theme.css (Studio-specific alias). ' +
          'See specs/014-studio-prod-ready/spec.md FR-025.'
      );
    }
    expect(undefined).toEqual([]);
  });

  it('reads the canonical token + theme files (sanity check)', () => {
    // Defensive — if the relative paths drift, the test would silently
    // pass against an empty `defined` set (which would make every ref
    // appear undefined, FAILing loud above; this assertion catches the
    // "wrong file path" regression earlier with a clearer message).
    const defined = readDefinedNames();
    expect(defined.has('foreground')).toBe(true); // theme.css :root
    expect(defined.has('space-4')).toBe(true); // tokens.css emitted
    expect(defined.has('font-display')).toBe(true); // tokens.css emitted (T049)
  });
});
