// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * P1: real-corpus fixed-point sweep for the structural expression renderer.
 *
 * Walks every `.rosetta` file under `.resources/` (CDM, rune-dsl, rune-fpml,
 * and any other corpus directory present), extracts every expression BODY
 * (`Condition.expression`, `Operation.expression`, `ShortcutDeclaration.expression`)
 * from documents that parse cleanly, and re-verifies the same fixed-point
 * property as the hand-curated corpus in expression-roundtrip.test.ts:
 *
 *   parseExpression(snippet) → no errors
 *   → r1 = renderExpression(p1.value)
 *   → parseExpression(r1) → no errors
 *   → r2 = renderExpression(p2.value)
 *   → r2 === r1 (fixed point; NOT byte-identical to the original snippet —
 *     normalization, e.g. `and\n  x` → `and x`, is expected and fine).
 *   → treesEquivalent(p1.value, p2.value) (tree-shape check — r2 === r1 only
 *     proves the TEXT is stable under reparse, not that the reparsed tree
 *     still MEANS the same thing; a nested-switch/choice comma-ambiguity bug
 *     passed the text check while silently corrupting the tree shape, see
 *     expression-tree-equivalence.ts).
 *
 * Per CLAUDE.md: tests that depend on `.resources/` are guarded with
 * `describe.skipIf(!RESOURCES_EXIST)` so CI environments without the corpus
 * skip cleanly.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';
import { parse, parseExpression } from '@rune-langium/core';
import { renderExpression } from '../../../src/emit/rosetta/render-expression.js';
import { treesEquivalent } from './expression-tree-equivalence.js';

// fileURLToPath (not `new URL(...).pathname`) — on Windows, .pathname keeps
// a leading `/` before the drive letter (`/C:/...`), which is not a valid
// filesystem path; fileURLToPath normalizes it correctly on every platform.
const RESOURCES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../.resources');
const RESOURCES_EXIST = existsSync(RESOURCES_DIR);

/** Recursively collect every `.rosetta` file path under `dir`. */
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

/** A node shaped like Condition | Operation | ShortcutDeclaration. */
interface ExpressionHolder {
  $type: string;
  expression?: unknown;
}

function hasExpressionField(node: unknown): node is ExpressionHolder {
  const $type = (node as { $type?: string } | undefined)?.$type;
  return $type === 'Condition' || $type === 'Operation' || $type === 'ShortcutDeclaration';
}

/**
 * Parse every `.rosetta` file, walk each successfully-parsed document's AST,
 * and collect the CST text of every `Condition`/`Operation`/`ShortcutDeclaration`
 * expression body. Files that fail to parse are skipped (not the sweep's
 * concern) but counted.
 */
async function extractCorpusSnippets(): Promise<{ snippets: Set<string>; fileCount: number; skippedCount: number }> {
  // Lazy import — AstUtils.streamAllContents is only needed here, not by the
  // hand-curated round-trip suite.
  const { AstUtils } = await import('langium');

  const files = collectRosettaFiles(RESOURCES_DIR);
  const snippets = new Set<string>();
  let skippedCount = 0;

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    // pathToFileURL (not a naive '/' -> '_' replace) — `file` is an absolute
    // filesystem path that can contain other URI-unsafe characters (spaces,
    // `#`, `?`, a Windows drive letter/backslashes); pathToFileURL encodes it
    // into a well-formed, collision-free, cross-platform URI string. `parse`
    // only uses this as a document-identity key, not for real disk access
    // (file content is read separately above), so any unique well-formed URI
    // works — it does not need to resolve back to `file` on disk.
    const result = await parse(content, pathToFileURL(file).toString());
    if (result.hasErrors) {
      skippedCount++;
      continue;
    }
    for (const node of AstUtils.streamAllContents(result.value as unknown as { $type: string } & object)) {
      if (!hasExpressionField(node)) continue;
      const expr = node.expression as { $cstNode?: { text?: string } } | undefined;
      const text = expr?.$cstNode?.text;
      if (text && text.trim()) snippets.add(text.trim());
    }
  }

  return { snippets, fileCount: files.length, skippedCount };
}

describe.skipIf(!RESOURCES_EXIST)('expression corpus sweep (P1: real-corpus fixed-point)', () => {
  it('sweeps every Condition/Operation/ShortcutDeclaration expression body in .resources/ for the fixed-point property', async () => {
    const start = Date.now();
    const { snippets, fileCount, skippedCount } = await extractCorpusSnippets();
    const extractMs = Date.now() - start;

    expect(fileCount).toBeGreaterThan(100);
    expect(snippets.size).toBeGreaterThan(0);

    const parseExpressionFindings: Array<{ snippet: string; errors: unknown }> = [];
    const reparseFindings: Array<{ snippet: string; r1: string; errors: unknown }> = [];
    const fixedPointFindings: Array<{ snippet: string; r1: string; r2: string }> = [];
    const treeShapeFindings: Array<{ snippet: string; r1: string }> = [];
    let checked = 0;

    for (const snippet of snippets) {
      const p1 = parseExpression(snippet);
      if (p1.hasErrors) {
        // The snippet parsed fine in-document but not as a bare
        // ExpressionWithAsKey rule — a real parseExpression finding, not a
        // renderer bug. Collect and continue; don't fail silently.
        parseExpressionFindings.push({ snippet, errors: p1.parserErrors });
        continue;
      }
      checked++;

      let r1: string;
      try {
        r1 = renderExpression(p1.value);
      } catch (err) {
        reparseFindings.push({ snippet, r1: '<render threw>', errors: String(err) });
        continue;
      }

      const p2 = parseExpression(r1);
      if (p2.hasErrors) {
        reparseFindings.push({ snippet, r1, errors: p2.parserErrors });
        continue;
      }

      const r2 = renderExpression(p2.value);
      if (r2 !== r1) {
        fixedPointFindings.push({ snippet, r1, r2 });
        continue;
      }

      if (!treesEquivalent(p1.value, p2.value)) {
        treeShapeFindings.push({ snippet, r1 });
      }
    }

    const totalMs = Date.now() - start;
    // eslint-disable-next-line no-console
    console.log(
      `[expression-corpus-sweep] swept ${snippets.size} unique expressions from ${fileCount} files ` +
        `(${skippedCount} files skipped — parse errors) — ${checked} snippets checked for the fixed-point ` +
        `and tree-shape properties in ${totalMs}ms (extraction: ${extractMs}ms)`
    );

    if (
      parseExpressionFindings.length > 0 ||
      reparseFindings.length > 0 ||
      fixedPointFindings.length > 0 ||
      treeShapeFindings.length > 0
    ) {
      const lines: string[] = [];
      if (parseExpressionFindings.length > 0) {
        lines.push(
          `\n${parseExpressionFindings.length} parseExpression finding(s) (parsed in-document, not as a bare rule):`
        );
        for (const f of parseExpressionFindings.slice(0, 20)) {
          lines.push(`  snippet: ${JSON.stringify(f.snippet)}\n  errors: ${JSON.stringify(f.errors)}`);
        }
      }
      if (reparseFindings.length > 0) {
        lines.push(`\n${reparseFindings.length} reparse finding(s) (rendered text failed to reparse):`);
        for (const f of reparseFindings.slice(0, 20)) {
          lines.push(
            `  snippet: ${JSON.stringify(f.snippet)}\n  r1: ${JSON.stringify(f.r1)}\n  errors: ${JSON.stringify(f.errors)}`
          );
        }
      }
      if (fixedPointFindings.length > 0) {
        lines.push(`\n${fixedPointFindings.length} fixed-point finding(s) (r2 !== r1):`);
        for (const f of fixedPointFindings.slice(0, 20)) {
          lines.push(
            `  snippet: ${JSON.stringify(f.snippet)}\n  r1: ${JSON.stringify(f.r1)}\n  r2: ${JSON.stringify(f.r2)}`
          );
        }
      }
      if (treeShapeFindings.length > 0) {
        lines.push(
          `\n${treeShapeFindings.length} tree-shape finding(s) (r1 is a fixed point but reparses to a DIFFERENT tree shape — silent semantic corruption):`
        );
        for (const f of treeShapeFindings.slice(0, 20)) {
          lines.push(`  snippet: ${JSON.stringify(f.snippet)}\n  r1: ${JSON.stringify(f.r1)}`);
        }
      }
      expect.fail(lines.join('\n'));
    }
  }, 120_000);
});
