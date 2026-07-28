// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, '../src');

// Transitively collect relative imports starting from a source entry, asserting
// the import graph never reaches generator.ts / index.ts / excel-emitter / exceljs.
function collectGraph(entryRel: string): Set<string> {
  const seen = new Set<string>();
  const stack = [resolve(srcDir, entryRel)];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const code = readFileSync(file, 'utf8');
    const importRe = /from\s+['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(code))) {
      const spec = m[1];
      if (spec === undefined) continue;
      if (spec.startsWith('.')) {
        const target = resolve(dirname(file), spec.replace(/\.js$/, '.ts'));
        stack.push(target);
      } else {
        seen.add(`pkg:${spec}`);
      }
    }
  }
  return seen;
}

describe('@rune-langium/codegen/rosetta isolation', () => {
  it('does not transitively import generator/index/excel/exceljs', () => {
    const graph = collectGraph('rosetta.ts');
    const joined = [...graph].join('\n');
    expect(joined).not.toMatch(/generator\.ts/);
    expect(joined).not.toMatch(/[/\\]index\.ts/);
    expect(joined).not.toMatch(/excel-emitter\.ts/);
    expect(graph.has('pkg:exceljs')).toBe(false);
  });

  it('re-exports renderNode', async () => {
    const mod = await import('../src/rosetta.js');
    expect(typeof mod.renderNode).toBe('function');
  });
});
