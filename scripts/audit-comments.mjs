import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('..', import.meta.url));
const { values, positionals } = parseArgs({ options: { json: { type: 'boolean' } }, allowPositionals: true });
const excludes = [
  '**/scripts/**',
  '**/generated/**',
  '**/test/**',
  '**/tests/**',
  '**/__tests__/**',
  '**/fixtures/**',
  '**/*.test.*',
  '**/*.spec.*',
  '**/node_modules/**',
  '**/dist/**'
];
const output = execFileSync(
  'ast-grep',
  [
    'scan',
    '--rule',
    'rules/comment-audit.yml',
    '--json',
    ...excludes.flatMap((glob) => ['--globs', `!${glob}`]),
    ...(positionals.length ? positionals : ['apps', 'packages'])
  ],
  { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
);
const protectedComment =
  /SPDX-License-Identifier|Copyright|@instrumentation-codemod|@ts-|eslint|prettier-ignore|(?:istanbul|c8) ignore|\/\/\/\s*<reference/;
const reference =
  /\b(?:PR|issue|ADR)[\s#-]*\d+\b|#\d+\b|\b(?:spec|phase|task)[\s.:#-]*\d+\b|\b(?:FR|SC|US|T)-?\d{2,}\b|\bspec\.md\b|\bspecs\/|\bdocs\/(?:superpowers|plans)\//i;
const history =
  /\bpreviously\b|\bthis (?:fix|change)\b|\bwas added\b|\bused to\b|\bafter this (?:change|fix)\b|\bthe old (?:behavior|code|path)\b/i;
const sources = new Map();
const groups = [];

for (const match of JSON.parse(output).sort(
  (a, b) => a.file.localeCompare(b.file) || a.range.byteOffset.start - b.range.byteOffset.start
)) {
  if (protectedComment.test(match.text)) continue;
  const { file, text, range } = match;
  const start = range.start.line + 1;
  const end = range.end.line + 1;
  const previous = groups.at(-1);
  if (!sources.has(file)) sources.set(file, readFileSync(resolve(root, file)));
  const gap =
    previous?.file === file
      ? sources.get(file).subarray(previous.endByte, range.byteOffset.start).toString('utf8')
      : undefined;
  // Adjacent line comments form a paragraph only when no code separates them.
  if (
    previous?.file === file &&
    previous.end + 1 === start &&
    previous.text.startsWith('//') &&
    text.startsWith('//') &&
    !gap.trim()
  ) {
    previous.end = end;
    previous.endByte = range.byteOffset.end;
    previous.text += `\n${text}`;
  } else {
    groups.push({ file, start, end, endByte: range.byteOffset.end, text });
  }
}

const candidates = groups
  .flatMap(({ endByte: _endByte, ...group }) => {
    const reasons = [];
    if (reference.test(group.text)) reasons.push('reference');
    if (history.test(group.text)) reasons.push('history');
    if (group.end > group.start) reasons.push('multiline');
    return reasons.length ? [{ ...group, reasons }] : [];
  })
  .sort((a, b) => {
    const priority = (group) => Number(group.reasons.includes('reference')) + Number(group.reasons.includes('history'));
    return (
      priority(b) - priority(a) ||
      b.end - b.start - (a.end - a.start) ||
      a.file.localeCompare(b.file) ||
      a.start - b.start
    );
  });

if (values.json) {
  console.log(JSON.stringify(candidates, null, 2));
} else {
  for (const candidate of candidates) {
    console.log(`${candidate.file}:${candidate.start}-${candidate.end} [${candidate.reasons.join(', ')}]`);
  }
  console.log(
    `\n${candidates.length} candidate groups across ${new Set(candidates.map((c) => c.file)).size} files. Review only; no automatic fixes.`
  );
}
