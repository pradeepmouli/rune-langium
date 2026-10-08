// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const source = await readFile(new URL('../src/projection/python-runtime.py', import.meta.url), 'utf8');
const output = new URL('../src/projection/generated/python-runtime-source.ts', import.meta.url);
const raw =
  '// SPDX-License-Identifier: MIT\n// Copyright (c) 2026 Pradeep Mouli\n// Generated from ../python-runtime.py; do not edit.\n\nexport const PYTHON_RUNTIME_SOURCE = ' +
  JSON.stringify(source) +
  ';\n';
const generated = execFileSync('pnpm', ['exec', 'oxfmt', '--stdin-filepath', fileURLToPath(output)], {
  input: raw,
  encoding: 'utf8'
});
if (process.argv.includes('--check')) {
  if ((await readFile(output, 'utf8').catch(() => '')) !== generated)
    throw new Error('Python runtime string is stale. Run generate:python-runtime.');
} else {
  await mkdir(new URL('.', output), { recursive: true });
  await writeFile(output, generated);
}
