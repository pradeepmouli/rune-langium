// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * P5: real-corpus fixed-point sweep for the structural synonym-body renderer.
 *
 * Walks every `.rosetta` file under `.resources/` (CDM, rune-dsl, rune-fpml,
 * and any other corpus directory present), extracts every
 * `RosettaSynonym`/`RosettaClassSynonym`/`RosettaEnumSynonym` node's CST text
 * from documents that parse cleanly, and verifies the same fixed-point +
 * tree-equivalence property as expression-corpus-sweep.test.ts:
 *
 *   parseSynonymRule(snippet, rule) -> no errors
 *   -> r1 = renderNode(p1.value, regen)  (must not fall back to CST -- null
 *      means the renderer failed to cover a shape the real corpus produces)
 *   -> parseSynonymRule(r1, rule) -> no errors
 *   -> r2 = renderNode(p2.value, regen)
 *   -> r2 === r1 (fixed point)
 *   -> treesEquivalent(p1.value, p2.value) (tree-shape check, not just text)
 *
 * The FpML ingest namespaces are dense with rich mapping synonyms -- this is
 * expected to sweep a LARGE unique-synonym count. Per CLAUDE.md, tests that
 * depend on `.resources/` are guarded with `describe.skipIf(!RESOURCES_EXIST)`.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { renderNode, type RenderChild } from '../../../src/emit/rosetta/rosetta-render-core.js';
import { treesEquivalent } from './expression-tree-equivalence.js';
import { parseSynonymRule, type SynonymRuleName } from './parse-synonym-rule.js';

const regen: RenderChild = (c) => renderNode(c, regen) ?? '';

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

interface SynonymSnippet {
  rule: SynonymRuleName;
  text: string;
}

/**
 * `RosettaExternalEnumSynonym` (the external-block sibling grammar rule --
 * `'[' 'value' synonymValue=STRING ('definition' ...)? ('pattern' ...)? ']'`,
 * no `synonym` keyword, no sources) `infers RosettaEnumSynonym`: it produces
 * the SAME `$type` as the normal `[synonym src, ... value "s" ...]` form, so
 * `$type` alone cannot pick the right bare-rule name to reparse a
 * `RosettaEnumSynonym`-typed node's CST text. The `$container` distinguishes
 * them at the grammar level: `RosettaEnumValue.enumSynonyms` (internal form)
 * vs. `RosettaExternalEnumValue.externalEnumSynonyms` (external form).
 */
function synonymRuleFor(node: { $type?: string; $container?: { $type?: string } }): SynonymRuleName | undefined {
  const $type = node.$type;
  if ($type === 'RosettaEnumSynonym') {
    return node.$container?.$type === 'RosettaExternalEnumValue' ? 'RosettaExternalEnumSynonym' : 'RosettaEnumSynonym';
  }
  if ($type === 'RosettaSynonym' || $type === 'RosettaClassSynonym') return $type;
  return undefined;
}

/**
 * Parse every `.rosetta` file, walk each successfully-parsed document's AST,
 * and collect the CST text of every `RosettaSynonym`/`RosettaClassSynonym`/
 * `RosettaEnumSynonym` node (keyed by the correct bare-rule name -- see
 * `synonymRuleFor`). Dedupe by "rule text" since the same literal text could
 * in principle recur under a different rule (defensive; synonym bodies are
 * lexically distinguishable in practice).
 */
async function extractCorpusSynonyms(): Promise<{
  snippets: Map<string, SynonymSnippet>;
  fileCount: number;
  skippedCount: number;
}> {
  const { AstUtils } = await import('langium');

  const files = collectRosettaFiles(RESOURCES_DIR);
  const snippets = new Map<string, SynonymSnippet>();
  let skippedCount = 0;

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const result = await parse(content, pathToFileURL(file).toString());
    if (result.hasErrors) {
      skippedCount++;
      continue;
    }
    for (const node of AstUtils.streamAllContents(result.value as unknown as { $type: string } & object)) {
      const rule = synonymRuleFor(node as { $type?: string; $container?: { $type?: string } });
      if (!rule) continue;
      const text = (node as { $cstNode?: { text?: string } }).$cstNode?.text;
      if (!text || !text.trim()) continue;
      const trimmed = text.trim();
      const key = rule + ' ' + trimmed;
      if (!snippets.has(key)) snippets.set(key, { rule, text: trimmed });
    }
  }

  return { snippets, fileCount: files.length, skippedCount };
}

describe.skipIf(!RESOURCES_EXIST)('synonym corpus sweep (P5: real-corpus fixed-point)', () => {
  it('sweeps every RosettaSynonym/RosettaClassSynonym/RosettaEnumSynonym in .resources/ for the fixed-point property', async () => {
    const start = Date.now();
    const { snippets, fileCount, skippedCount } = await extractCorpusSynonyms();
    const extractMs = Date.now() - start;

    expect(fileCount).toBeGreaterThan(100);
    expect(snippets.size).toBeGreaterThan(0);

    const cstFallbackFindings: Array<{ rule: string; snippet: string }> = [];
    const parseFindings: Array<{ rule: string; snippet: string; errors: unknown }> = [];
    const reparseFindings: Array<{ rule: string; snippet: string; r1: string; errors: unknown }> = [];
    const fixedPointFindings: Array<{ rule: string; snippet: string; r1: string; r2: string }> = [];
    const treeShapeFindings: Array<{ rule: string; snippet: string; r1: string }> = [];
    let checked = 0;

    for (const { rule, text: snippet } of snippets.values()) {
      const p1 = parseSynonymRule(snippet, rule);
      if (p1.hasErrors) {
        // Parsed fine in-document but not as the bare rule -- a real
        // parseSynonymRule finding, not a renderer bug. Collect & continue.
        parseFindings.push({ rule, snippet, errors: p1.parserErrors });
        continue;
      }
      checked++;

      const r1 = renderNode(p1.value as never, regen);
      if (r1 === null) {
        // The renderer fell back to CST for a real-corpus shape -- a P5
        // coverage gap (the whole point of this sweep).
        cstFallbackFindings.push({ rule, snippet });
        continue;
      }

      const p2 = parseSynonymRule(r1, rule);
      if (p2.hasErrors) {
        reparseFindings.push({ rule, snippet, r1, errors: p2.parserErrors });
        continue;
      }

      const r2 = renderNode(p2.value as never, regen);
      if (r2 !== r1) {
        fixedPointFindings.push({ rule, snippet, r1, r2: r2 ?? '<null>' });
        continue;
      }

      if (!treesEquivalent(p1.value, p2.value)) {
        treeShapeFindings.push({ rule, snippet, r1 });
      }
    }

    const totalMs = Date.now() - start;
    // eslint-disable-next-line no-console
    console.log(
      '[synonym-corpus-sweep] swept ' +
        snippets.size +
        ' unique synonyms from ' +
        fileCount +
        ' files ' +
        '(' +
        skippedCount +
        ' files skipped - parse errors) - ' +
        checked +
        ' snippets checked for the fixed-point ' +
        'and tree-shape properties in ' +
        totalMs +
        'ms (extraction: ' +
        extractMs +
        'ms)'
    );

    if (
      cstFallbackFindings.length > 0 ||
      parseFindings.length > 0 ||
      reparseFindings.length > 0 ||
      fixedPointFindings.length > 0 ||
      treeShapeFindings.length > 0
    ) {
      const lines: string[] = [];
      if (cstFallbackFindings.length > 0) {
        lines.push(
          '\n' +
            cstFallbackFindings.length +
            ' CST-fallback finding(s) (renderNode returned null for a real-corpus shape):'
        );
        for (const f of cstFallbackFindings.slice(0, 20)) {
          lines.push('  rule: ' + f.rule + '\n  snippet: ' + JSON.stringify(f.snippet));
        }
      }
      if (parseFindings.length > 0) {
        lines.push('\n' + parseFindings.length + ' parse finding(s) (parsed in-document, not as a bare rule):');
        for (const f of parseFindings.slice(0, 20)) {
          lines.push(
            '  rule: ' +
              f.rule +
              '\n  snippet: ' +
              JSON.stringify(f.snippet) +
              '\n  errors: ' +
              JSON.stringify(f.errors)
          );
        }
      }
      if (reparseFindings.length > 0) {
        lines.push('\n' + reparseFindings.length + ' reparse finding(s) (rendered text failed to reparse):');
        for (const f of reparseFindings.slice(0, 20)) {
          lines.push(
            '  rule: ' +
              f.rule +
              '\n  snippet: ' +
              JSON.stringify(f.snippet) +
              '\n  r1: ' +
              JSON.stringify(f.r1) +
              '\n  errors: ' +
              JSON.stringify(f.errors)
          );
        }
      }
      if (fixedPointFindings.length > 0) {
        lines.push('\n' + fixedPointFindings.length + ' fixed-point finding(s) (r2 !== r1):');
        for (const f of fixedPointFindings.slice(0, 20)) {
          lines.push(
            '  rule: ' +
              f.rule +
              '\n  snippet: ' +
              JSON.stringify(f.snippet) +
              '\n  r1: ' +
              JSON.stringify(f.r1) +
              '\n  r2: ' +
              JSON.stringify(f.r2)
          );
        }
      }
      if (treeShapeFindings.length > 0) {
        lines.push(
          '\n' +
            treeShapeFindings.length +
            ' tree-shape finding(s) (r1 is a fixed point but reparses to a DIFFERENT tree shape):'
        );
        for (const f of treeShapeFindings.slice(0, 20)) {
          lines.push(
            '  rule: ' + f.rule + '\n  snippet: ' + JSON.stringify(f.snippet) + '\n  r1: ' + JSON.stringify(f.r1)
          );
        }
      }
      expect.fail(lines.join('\n'));
    }
  }, 120_000);
});
