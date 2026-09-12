#!/usr/bin/env node
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { mkdir, mkdtemp, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { createRuneDslServices, hydrateModelDocuments } from '../packages/core/dist/index.js';
import { generate } from '../packages/codegen/dist/src/export.js';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const { values: options } = parseArgs({ options: { zip: { type: 'string' } } });
const { URI } = await import(new URL('../packages/core/node_modules/langium/lib/index.js', import.meta.url));
const artifacts = 'dist/codegen-corpus-artifacts';
const pins = JSON.parse(await readFile('scripts/fixtures/codegen-corpus.json', 'utf8'));
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with status ${result.status}`);
}
await mkdir('dist', { recursive: true });
const directory = await mkdtemp('dist/codegen-strict-');
try {
  let files;
  if (options.zip) {
    const studioRequire = createRequire(new URL('../apps/studio/package.json', import.meta.url));
    const zip = await studioRequire('jszip').loadAsync(await readFile(options.zip));
    files = await Promise.all(
      Object.values(zip.files)
        .filter((file) => !file.dir && file.name.endsWith('.ts'))
        .map(async (file) => ({ relativePath: file.name, content: await file.async('string') }))
    );
  } else {
    run(process.execPath, [
      'scripts/build-serialized-artifacts.mjs',
      '--sources',
      'scripts/fixtures/codegen-corpus.json',
      '--out-dir',
      artifacts,
      '--cache-dir',
      'dist/codegen-corpus-cache'
    ]);
    const { RuneDsl } = createRuneDslServices();
    const entries = (
      await Promise.all(
        pins.map(async ({ id }) => {
          const artifact = JSON.parse(gunzipSync(await readFile(`${artifacts}/${id}/latest.serialized.json.gz`)));
          return artifact.documents.map((doc) => ({
            uri: URI.parse(`file:///[${id}]/${doc.path}`),
            json: doc.modelJson
          }));
        })
      )
    ).flat();
    const docs = hydrateModelDocuments({ RuneDsl, shared: RuneDsl.shared }, entries).map(({ document }) => document);
    files = await generate(docs, { target: 'typescript', typescript: { layout: 'barrel' } });
    const errors = files.flatMap((file) => file.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'));
    if (errors.length) throw new Error(JSON.stringify(errors, null, 2));
    console.log(`Linked ${docs.length} documents from pinned inputs:`, pins);
  }
  if (!files.length) throw new Error('No generated TypeScript files');
  for (const file of files) {
    const path = resolve(directory, file.relativePath);
    if (!path.startsWith(resolve(directory) + '/')) throw new Error(`Invalid output path: ${file.relativePath}`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.content);
  }
  await symlink(resolve('packages/codegen/node_modules'), `${directory}/node_modules`, 'dir');
  await writeFile(`${directory}/package.json`, '{"type":"module"}');
  await writeFile(
    `${directory}/tsconfig.json`,
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        target: 'ESNext',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        types: []
      },
      include: ['**/*.ts']
    })
  );
  run('pnpm', ['exec', 'tsc', '-p', directory]);
  console.log(
    `PASS: ${files.length} generated TypeScript files compile strictly${options.zip ? ` from ${options.zip}` : ''}.`
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
