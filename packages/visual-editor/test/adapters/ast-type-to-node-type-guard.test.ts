// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Regression guard: ban the raw `AST_TYPE_TO_NODE_TYPE[…$type] ?? 'data'`
 * pattern in production code. Every site that needs a node-kind lookup must
 * go through resolveNodeKind so the curated fallback chain stays uniform.
 *
 * History: PR #208 (e2e-batch #1) added the fallback to selectedNodeType and
 * graphNodesToAdapterDocument but missed 9 sibling sites that all silently
 * degraded curated enum / choice / func / record entries to `'data'`. This
 * guard exists so the next addition cannot re-introduce the same bug class.
 * See feedback memory `fix-patterns-not-symptoms`.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

describe('AST_TYPE_TO_NODE_TYPE raw-lookup guard', () => {
  const ALLOWED = new Set<string>([
    'packages/visual-editor/src/adapters/model-helpers.ts',
    'packages/visual-editor/src/store/editor-store.ts'
  ]);

  const PATTERN = /AST_TYPE_TO_NODE_TYPE\s*\[[^\]]*\$type[^\]]*\]/;

  function walk(dir: string, out: string[]): string[] {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const st = statSync(p);
      if (st.isDirectory()) {
        if (entry === 'node_modules' || entry === 'dist' || entry === 'test') continue;
        walk(p, out);
      } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
        out.push(p);
      }
    }
    return out;
  }

  it('has no raw $type lookups outside the allowed sites', () => {
    const repoRoot = join(process.cwd(), '..', '..');
    const candidates: string[] = [];
    walk(join(repoRoot, 'packages', 'visual-editor', 'src'), candidates);
    walk(join(repoRoot, 'apps', 'studio', 'src'), candidates);

    const offenders: string[] = [];
    for (const file of candidates) {
      const rel = relative(repoRoot, file);
      if (ALLOWED.has(rel)) continue;
      const text = readFileSync(file, 'utf8');
      if (PATTERN.test(text)) offenders.push(rel);
    }

    expect(
      offenders,
      `Use resolveNodeKind() instead of indexing AST_TYPE_TO_NODE_TYPE with .$type directly. Offending files:\n  ${offenders.join('\n  ')}`
    ).toEqual([]);
  });
});
