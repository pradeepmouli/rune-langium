import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(new URL('./audit-comments.mjs', import.meta.url));

test('reports real comment paragraphs and references without changing source', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'rune-comment-audit-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, 'example #1.ts');
  const source = [
    '// SPDX-License-Identifier: MIT',
    '// Copyright (c) 2026 Example',
    '// @ts-expect-error issue #42',
    'const text = "é /* PR #99 */";',
    '// First line.',
    '// Second line.',
    '',
    'const first = 1; // isolated A',
    'const second = 2; // isolated B',
    '/**',
    ' * Keep this API contract.',
    ' */',
    '// See specs/017-types/spec.md.',
    '// @ts-expect-error issue #123',
    '// Separate paragraph.',
    '// Second line.',
    '// This previously used a different parser.'
  ].join('\n');
  writeFileSync(file, source);
  const result = JSON.parse(
    execFileSync(process.execPath, [script, '--json', file], { encoding: 'utf8', cwd: tmpdir() })
  );
  assert.deepEqual(
    result.map(({ start, end }) => [start, end]).sort((a, b) => a[0] - b[0]),
    [
      [5, 6],
      [10, 12],
      [13, 13],
      [15, 17]
    ]
  );
  assert.equal(result.find((c) => c.start === 13).reasons.includes('reference'), true);
  assert.equal(result.find((c) => c.start === 15).reasons.includes('history'), true);
  assert.equal(readFileSync(file, 'utf8'), source);
});

test('covers TSX and JavaScript while excluding tests and generated files', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'rune-comment-audit-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, 'view.tsx'), 'const view = <div title="// PR #99">{/* issue #42 */}</div>;');
  writeFileSync(join(directory, 'module.mjs'), '/*\n * Module docs.\n */\nexport const value = 1;');
  writeFileSync(join(directory, 'example.test.ts'), '// PR #99');
  mkdirSync(join(directory, 'generated'));
  writeFileSync(join(directory, 'generated', 'ast.ts'), '// PR #99');
  const result = JSON.parse(execFileSync(process.execPath, [script, '--json', directory], { encoding: 'utf8' }));
  assert.equal(result.length, 2);
  assert.equal(
    result.some((c) => c.text === '/* issue #42 */'),
    true
  );
  assert.equal(
    result.some((c) => c.text.includes('Module docs.')),
    true
  );
});
