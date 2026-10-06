// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { assertValidDocuments, createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../src/export.js';
import { generatedDirectory } from './helpers/generated-directory.js';
import { referenceCases, referenceFiles } from './helpers/cdm-reference.js';

// Execution lives in Studio's cdm-reference-parity test, so the matrix uses its
// actual adapters/module loader rather than maintaining a second evaluator here.
describe('SC-009 pinned CDM function compilation', () => {
  it('strictly compiles the dependency closure for every reference case', async () => {
    expect(referenceCases.length).toBeGreaterThanOrEqual(100);
    expect(new Set(referenceCases.map((c) => c.id)).size).toBe(referenceCases.length);
    for (const feature of ['alias', 'precondition', 'optional', 'cardinality', 'metadata', 'collection', 'temporal']) {
      expect(referenceCases.some((c) => c.features.includes(feature))).toBe(true);
    }
    const { RuneDsl } = createRuneDslServices();
    const documents = referenceFiles().map(({ uri, content }) =>
      RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(content, URI.parse(uri))
    );
    await RuneDsl.shared.workspace.DocumentBuilder.build(documents, { validation: false });
    assertValidDocuments(documents);
    const outputs = await generate(documents, { target: 'typescript', strict: true, typescript: { layout: 'barrel' } });
    const emitted = new Set(
      outputs.flatMap((output) =>
        output.funcs.map((func) => `${output.relativePath.replace(/\//g, '.').replace(/\.ts$/, '')}.${func.name}`)
      )
    );
    for (const testCase of referenceCases) expect(emitted.has(testCase.function), testCase.function).toBe(true);
    const directory = generatedDirectory(join(tmpdir(), 'rune-cdm-reference-'));
    try {
      for (const output of outputs) {
        const path = join(directory, output.relativePath);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, output.content);
      }
      await writeFile(join(directory, 'package.json'), '{"type":"module"}');
      await writeFile(
        join(directory, 'tsconfig.json'),
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
      const result = spawnSync('pnpm', ['exec', 'tsc', '-p', join(directory, 'tsconfig.json')], { encoding: 'utf8' });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stdout + result.stderr).toBe(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30000);
});
