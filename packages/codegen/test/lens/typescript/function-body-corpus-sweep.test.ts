// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Phase 2 (function-body lens) — real-corpus classification sweep.
 *
 * Phase 1's subset `S` (render-ts.ts / parse-ts.ts) was designed and tested
 * against `Condition` bodies only. This sweep answers a factual question
 * before Phase 2 writes a single line of new lens code: does the SAME,
 * UNCHANGED subset S already cover real `Operation`/`ShortcutDeclaration`
 * (func-body) expressions found in `.resources/`, or is there a real gap?
 *
 * Every corpus expression is classified into exactly one bucket:
 *   - IN_S_ROUNDTRIPS: renderTs succeeds AND parseTs on that TS text
 *     succeeds AND reparses to a structurally-equivalent Rune expression
 *     (this is the "already works" bucket — the expected common case).
 *   - READ_ONLY: renderTs returns null (outside S) — expected, not a bug.
 *   - UNEXPECTED_REFUSAL: renderTs succeeds (claims in-S) but parseTs
 *     refuses the resulting TS text, OR the round-tripped Rune expression
 *     is not structurally equivalent to the original — this IS a bug
 *     class (an in-S claim that doesn't actually round-trip) and fails
 *     the test regardless of holder type.
 *
 * The test asserts zero UNEXPECTED_REFUSAL findings (a real correctness
 * bar) and logs the IN_S_ROUNDTRIPS / READ_ONLY split BY HOLDER TYPE
 * (Condition vs Operation vs ShortcutDeclaration) so Phase 2's Task 2 has
 * real numbers to decide whether subset S needs widening for functions.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';
import type { AstNode } from 'langium';
import { parse, parseExpression } from '@rune-langium/core';
import { treesEquivalent } from '../../emit/rosetta/expression-tree-equivalence.js';
import { renderTs } from '../../../src/lens/typescript/render-ts.js';
import { parseTs } from '../../../src/lens/typescript/parse-ts.js';

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

async function extractCorpusSnippets(): Promise<{
  snippets: Map<string, HolderKind>;
  fileCount: number;
}> {
  const { AstUtils } = await import('langium');
  const files = collectRosettaFiles(RESOURCES_DIR);
  const snippets = new Map<string, HolderKind>();

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const result = await parse(content, pathToFileURL(file).toString());
    if (result.hasErrors) continue;

    for (const node of AstUtils.streamAllContents(result.value as unknown as { $type: string } & object)) {
      if (!hasExpressionField(node)) continue;
      const expr = node.expression as { $cstNode?: { text?: string } } | undefined;
      const text = expr?.$cstNode?.text;
      if (text && text.trim() && !snippets.has(text.trim())) {
        snippets.set(text.trim(), node.$type as HolderKind);
      }
    }
  }

  return { snippets, fileCount: files.length };
}

describe.skipIf(!RESOURCES_EXIST)('function-body TS-lens corpus sweep (Phase 2, Task 1)', () => {
  it('classifies every real Condition/Operation/ShortcutDeclaration body against the unchanged subset S', async () => {
    const { snippets, fileCount } = await extractCorpusSnippets();
    expect(fileCount).toBeGreaterThan(100);
    expect(snippets.size).toBeGreaterThan(0);

    const counts: Record<HolderKind, { inS: number; readOnly: number }> = {
      Condition: { inS: 0, readOnly: 0 },
      Operation: { inS: 0, readOnly: 0 },
      ShortcutDeclaration: { inS: 0, readOnly: 0 }
    };
    const unexpectedRefusals: Array<{ snippet: string; holder: HolderKind; reason: string }> = [];

    for (const [snippet, holder] of snippets) {
      const p1 = parseExpression(snippet);
      if (p1.hasErrors) continue; // not this sweep's concern — same as expression-corpus-sweep.test.ts

      const ts = renderTs(p1.value);
      if (ts === null) {
        counts[holder].readOnly++;
        continue;
      }

      const back = await parseTs(ts);
      if (!back.ok) {
        unexpectedRefusals.push({
          snippet,
          holder,
          reason: `renderTs succeeded but parseTs refused: ${back.reason.message}`
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
      '[function-body-corpus-sweep] by holder type (in-S round-trips / read-only):\n' +
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
