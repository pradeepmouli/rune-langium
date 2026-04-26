// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * No-hardcoded-colours CI guard (T077, R12).
 *
 * Spec: `specs/013-z2f-editor-migration/research.md` § R12
 *
 * Per R12, every editor component under
 * `packages/visual-editor/src/components/editors/` MUST style itself
 * through `@rune-langium/design-system` primitives or `var(--color-*)`
 * tokens emitted by `@rune-langium/design-tokens`. Hardcoded Tailwind
 * palette utilities (`text-slate-900`, `bg-blue-500`, …) bypass the
 * token layer and break light/dark theming, contrast levels, and brand
 * customisation.
 *
 * This test walks every `.ts`/`.tsx` source file under the editors
 * directory and asserts that the R12 regex returns zero matches.
 * Documentation comments that mention forbidden token shapes for
 * narrative purposes are intentionally absent — keep them paraphrased
 * (e.g. "Tailwind palette utilities") so the regex doesn't trip on
 * itself.
 *
 * Test shape A (Vitest) was chosen over Shape B (oxlint custom rule)
 * per the T077 task brief: simpler, lives next to other tests, and
 * runs on every CI invocation.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * The R12 regex documented in research.md. Matches Tailwind utility
 * classes that bind a property to a fixed palette + numeric scale,
 * e.g. `text-slate-500`, `bg-blue-500/20`, `border-red-500`.
 */
const R12_REGEX =
  /\b(text|bg|border|ring|fill|stroke|from|via|to|placeholder|caret|accent|outline|divide|shadow|decoration)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]+\b/;

/** Editors directory, scoped per R12 — unrelated UI is unaffected. */
const EDITORS_DIR = join(import.meta.dirname, '..', '..', 'src', 'components', 'editors');

interface Match {
  file: string;
  line: number;
  text: string;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (st.isFile() && /\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function findMatches(): Match[] {
  const matches: Match[] = [];
  for (const file of walk(EDITORS_DIR)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      if (R12_REGEX.test(line)) {
        matches.push({
          file: relative(join(import.meta.dirname, '..', '..'), file),
          line: i + 1,
          text: line.trim()
        });
      }
    }
  }
  return matches;
}

describe('R12 — design-tokens compliance (T077)', () => {
  it('packages/visual-editor/src/components/editors/ contains no hardcoded Tailwind palette utilities', () => {
    const matches = findMatches();
    if (matches.length > 0) {
      const report = matches.map((m) => `  ${m.file}:${m.line}\n    ${m.text}`).join('\n');
      throw new Error(
        `R12 violation: ${matches.length} hardcoded Tailwind colour utility match(es) ` +
          `found in editor sources.\n\n` +
          `Replace each match with a design-system primitive (e.g. <Badge variant="…">) ` +
          `or a token-backed utility (e.g. \`bg-destructive\`, \`text-muted-foreground\`, ` +
          `\`border-border\`) per research.md § R12.\n\n` +
          `Matches:\n${report}`
      );
    }
    expect(matches).toEqual([]);
  });
});
