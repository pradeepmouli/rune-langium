// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Phase 3 (Python lens) — real-corpus classification sweep.
 *
 * Mirrors `../typescript/function-body-corpus-sweep.test.ts` exactly,
 * including its dedup-by-(holder type, text) extraction logic — Phase 2's
 * own PR review caught a bug where deduping by text alone silently dropped
 * a snippet's holder-type classification when the same text appeared under
 * two different holder types, corrupting the per-holder-type coverage
 * numbers. This file reuses that corrected logic verbatim, swapped to
 * `renderPy`/`parsePy`.
 *
 * Phase 2's own history is why this sweep exists in the SAME task as the
 * hand-curated fixed-point suite: Phase 1 shipped without a real-corpus
 * sweep, and when Phase 2's Task 1 finally ran one, it found 9 real
 * correctness bugs in already-merged code. Subset `S` (render-py.ts /
 * parse-py.ts) is unchanged from Phase 1/2 — this sweep answers whether the
 * SAME subset, now projected through Python instead of TypeScript, still
 * round-trips every real `Condition`/`Operation`/`ShortcutDeclaration` body
 * found in `.resources/`.
 *
 * Every corpus expression is classified into exactly one bucket:
 *   - IN_S_ROUNDTRIPS: renderPy succeeds AND parsePy on that Python text
 *     succeeds AND reparses to a structurally-equivalent Rune expression
 *     (the "already works" bucket — the expected common case).
 *   - READ_ONLY: renderPy returns null (outside S) — expected, not a bug.
 *   - UNEXPECTED_REFUSAL: renderPy succeeds (claims in-S) but parsePy
 *     refuses the resulting Python text, OR the round-tripped Rune
 *     expression is not structurally equivalent to the original — this IS
 *     a bug class (an in-S claim that doesn't actually round-trip) and
 *     fails the test regardless of holder type.
 *
 * The test asserts zero UNEXPECTED_REFUSAL findings (a real correctness
 * bar) and logs the IN_S_ROUNDTRIPS / READ_ONLY split BY HOLDER TYPE
 * (Condition vs Operation vs ShortcutDeclaration).
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';
import type { AstNode } from 'langium';
import { parse, parseExpression } from '@rune-langium/core';
import { treesEquivalent } from '../../emit/rosetta/expression-tree-equivalence.js';
import { renderPy } from '../../../src/lens/python/render-py.js';
import { parsePy } from '../../../src/lens/python/parse-py.js';

const RESOURCES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../.resources');
const RESOURCES_EXIST = existsSync(RESOURCES_DIR);

function collectRosettaFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectRosettaFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.rosetta')) {
      out.push(full);
    }
  }
  return out;
}

type HolderKind = 'Condition' | 'Operation' | 'ShortcutDeclaration';

interface ExpressionHolder extends AstNode {
  expression?: unknown;
}

function hasExpressionField(node: AstNode): node is ExpressionHolder {
  return node.$type === 'Condition' || node.$type === 'Operation' || node.$type === 'ShortcutDeclaration';
}

interface CorpusSnippet {
  text: string;
  holder: HolderKind;
}

async function extractCorpusSnippets(): Promise<{
  snippets: CorpusSnippet[];
  fileCount: number;
}> {
  const { AstUtils } = await import('langium');
  const files = collectRosettaFiles(RESOURCES_DIR);
  // Dedup by (holder type, text), NOT text alone — the same expression text
  // can legitimately appear under two different holder types across the
  // corpus (e.g. the same bare comparison used in both a Condition and an
  // Operation). Deduping on text alone would silently drop the second
  // occurrence's holder-type classification, corrupting the per-holder-type
  // coverage numbers this sweep exists to produce. Each (holder, text) pair
  // is still deduped within itself, since the sweep's purpose is per-holder-
  // type coverage, not "how many distinct pieces of literal text exist
  // across all holders combined".
  const seen = new Set<string>();
  const snippets: CorpusSnippet[] = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const result = await parse(content, pathToFileURL(file).toString());
    if (result.hasErrors) continue;

    for (const node of AstUtils.streamAllContents(result.value as unknown as { $type: string } & object)) {
      if (!hasExpressionField(node)) continue;
      const expr = node.expression as { $cstNode?: { text?: string } } | undefined;
      const text = expr?.$cstNode?.text?.trim();
      if (!text) continue;
      const holder = node.$type as HolderKind;
      const key = `${holder} ${text}`;
      if (!seen.has(key)) {
        seen.add(key);
        snippets.push({ text, holder });
      }
    }
  }

  return { snippets, fileCount: files.length };
}

describe.skipIf(!RESOURCES_EXIST)('python-lens corpus sweep (Phase 3, Task 4)', () => {
  it('classifies every real Condition/Operation/ShortcutDeclaration body against the unchanged subset S for Python', async () => {
    const { snippets, fileCount } = await extractCorpusSnippets();
    expect(fileCount).toBeGreaterThan(100);
    expect(snippets.length).toBeGreaterThan(0);

    const counts: Record<HolderKind, { inS: number; readOnly: number }> = {
      Condition: { inS: 0, readOnly: 0 },
      Operation: { inS: 0, readOnly: 0 },
      ShortcutDeclaration: { inS: 0, readOnly: 0 }
    };
    const unexpectedRefusals: Array<{ snippet: string; holder: HolderKind; reason: string }> = [];

    for (const { text: snippet, holder } of snippets) {
      const p1 = parseExpression(snippet);
      if (p1.hasErrors) continue; // not this sweep's concern — same as function-body-corpus-sweep.test.ts

      const py = renderPy(p1.value);
      if (py === null) {
        counts[holder].readOnly++;
        continue;
      }

      const back = await parsePy(py);
      if (!back.ok) {
        unexpectedRefusals.push({
          snippet,
          holder,
          reason: `renderPy succeeded but parsePy refused: ${back.reason.message}`
        });
        continue;
      }

      if (!treesEquivalent(p1.value, back.node)) {
        unexpectedRefusals.push({ snippet, holder, reason: 'round-tripped tree not structurally equivalent' });
        continue;
      }

      counts[holder].inS++;
    }

    // eslint-disable-next-line no-console
    console.log(
      '[python-corpus-sweep] by holder type (in-S round-trips / read-only):\n' +
        `  Condition:            ${counts.Condition.inS} / ${counts.Condition.readOnly}\n` +
        `  Operation:            ${counts.Operation.inS} / ${counts.Operation.readOnly}\n` +
        `  ShortcutDeclaration:  ${counts.ShortcutDeclaration.inS} / ${counts.ShortcutDeclaration.readOnly}`
    );

    if (unexpectedRefusals.length > 0) {
      const lines = [
        `${unexpectedRefusals.length} unexpected refusal(s) — an in-S claim that didn't actually round-trip:`
      ];
      for (const f of unexpectedRefusals.slice(0, 20)) {
        lines.push(`  [${f.holder}] ${JSON.stringify(f.snippet)}\n  reason: ${f.reason}`);
      }
      expect.fail(lines.join('\n'));
    }
  }, 120_000);
});
