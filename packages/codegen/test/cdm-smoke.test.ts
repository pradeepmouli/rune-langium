// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * CDM Smoke Test Suite.
 *
 * Validates that the generator produces TypeScript-compilable Zod schemas
 * from the curated CDM schema fixtures, and that the JSON battery cases
 * parse correctly.
 *
 * Phase 3: Zod-target section activated (T046).
 * JSON battery sub-tests remain .todo until Phase 4.
 *
 * SC-002: tsc --noEmit over generated output must pass with zero errors.
 * FR-023: Generated Zod schemas must compile with tsc.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, mkdir, readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../src/index.js';
import type { GeneratorOutput } from '../src/types.js';

const execFileAsync = promisify(execFile);

const FIXTURES_DIR = resolve(new URL('.', import.meta.url).pathname, 'fixtures');
const PKG_DIR = resolve(new URL('.', import.meta.url).pathname, '..');

/**
 * Runs `tsc --project <tsconfigPath> --noEmit` in the given working directory
 * and returns the exit code and stderr output.
 *
 * Used in Phase 3+ to verify that generated Zod schemas compile cleanly.
 * SC-002.
 *
 * @param tsconfigPath - Path to the tsconfig file to use.
 * @param cwd - Working directory for the tsc invocation.
 */
export async function runTscNoEmit(
  tsconfigPath: string,
  cwd: string
): Promise<{ exitCode: number; stderr: string }> {
  try {
    await execFileAsync('tsc', ['--project', tsconfigPath, '--noEmit'], { cwd });
    return { exitCode: 0, stderr: '' };
  } catch (err) {
    const error = err as NodeJS.ErrnoException & {
      code?: number;
      stderr?: string;
      stdout?: string;
    };
    return {
      exitCode: typeof error.code === 'number' ? error.code : 1,
      stderr: [error.stderr, error.stdout].filter(Boolean).join('\n')
    };
  }
}

/**
 * Runs a JSON battery against a generated Zod schema using Zod's safeParse.
 * Returns counts of passing and failing cases.
 *
 * Used in Phase 4+ to verify condition semantics.
 *
 * @param schema - A Zod schema object (z.ZodType).
 * @param validCases - JSON payloads that should parse successfully.
 * @param invalidCases - JSON payloads that should fail to parse.
 */
export function runJsonBattery(
  schema: { safeParse: (input: unknown) => { success: boolean } },
  validCases: unknown[],
  invalidCases: unknown[]
): { pass: number; fail: number } {
  let pass = 0;
  let fail = 0;

  for (const c of validCases) {
    if (schema.safeParse(c).success) pass++;
    else fail++;
  }
  for (const c of invalidCases) {
    if (!schema.safeParse(c).success) pass++;
    else fail++;
  }

  return { pass, fail };
}

// Type alias for generator output (used in activated phases)
type GeneratorOutputArray = GeneratorOutput[];
void (null as unknown as GeneratorOutputArray); // suppress unused type warning

/**
 * Parse a fixture input.rune file and return the Langium document.
 */
async function parseFixture(
  fixtureName: string,
  services: ReturnType<typeof createRuneDslServices>
): Promise<import('langium').LangiumDocument> {
  const inputPath = join(FIXTURES_DIR, fixtureName, 'input.rune');
  const content = await readFile(inputPath, 'utf-8');
  const doc = services.RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
    content,
    URI.parse(`inmemory:///${fixtureName}.rosetta`)
  );
  await services.RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
  return doc;
}

describe('cdm-smoke: Zod target', () => {
  /**
   * T046: Activate the Zod-target section.
   *
   * Generates Zod schemas for all six US1 fixture documents,
   * writes them to a temp directory, and verifies they compile
   * with tsc --noEmit (FR-023, SC-002).
   */
  it('generates Zod schemas for US1 fixture documents and tsc --noEmit exits 0 (FR-023)', async () => {
    const fixtureNames = [
      'basic-types',
      'cardinality',
      'enums',
      'inheritance',
      'circular',
      'reserved-words'
    ];

    const services = createRuneDslServices();
    const docs = await Promise.all(fixtureNames.map((name) => parseFixture(name, services)));

    const outputs = generate(docs, { target: 'zod' });
    expect(outputs.length).toBeGreaterThan(0);

    // Write outputs to a temp dir
    const tmpDir = await mkdtemp(join(tmpdir(), 'rune-codegen-smoke-'));

    for (const output of outputs) {
      const outPath = join(tmpDir, output.relativePath);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, output.content, 'utf-8');
    }

    // Build a tsconfig pointing at the generated files.
    // We do NOT extend the package tsconfig to avoid inheriting "types": ["node"]
    // which is unavailable in the tmp dir. Generated Zod output only needs
    // standard lib types — no node types required.
    const smokeTsconfig = {
      compilerOptions: {
        noEmit: true,
        composite: false,
        incremental: false,
        strict: true,
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        target: 'ES2020',
        skipLibCheck: true,
        paths: {
          zod: [join(PKG_DIR, 'node_modules/zod/index.d.ts')]
        }
      },
      include: outputs.map((o) => join(tmpDir, o.relativePath))
    };

    const smokeTsconfigPath = join(tmpDir, 'tsconfig.smoke.json');
    await writeFile(smokeTsconfigPath, JSON.stringify(smokeTsconfig, null, 2), 'utf-8');

    // Run tsc --noEmit
    const { exitCode, stderr } = await runTscNoEmit(smokeTsconfigPath, tmpDir);
    if (exitCode !== 0) {
      throw new Error(`tsc --noEmit failed (exit ${exitCode}):\n${stderr}`);
    }
    expect(exitCode).toBe(0);
  }, 30_000);

  it('generation is deterministic: identical input produces byte-identical output (SC-007)', async () => {
    const services1 = createRuneDslServices();
    const services2 = createRuneDslServices();

    const inputPath = join(FIXTURES_DIR, 'basic-types', 'input.rune');
    const content = await readFile(inputPath, 'utf-8');

    const doc1 = services1.RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
      content,
      URI.parse('inmemory:///basic-types.rosetta')
    );
    await services1.RuneDsl.shared.workspace.DocumentBuilder.build([doc1]);

    const doc2 = services2.RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
      content,
      URI.parse('inmemory:///basic-types.rosetta')
    );
    await services2.RuneDsl.shared.workspace.DocumentBuilder.build([doc2]);

    const outputs1 = generate(doc1, { target: 'zod' });
    const outputs2 = generate(doc2, { target: 'zod' });

    expect(outputs1.length).toBe(outputs2.length);
    for (let i = 0; i < outputs1.length; i++) {
      expect(outputs1[i]!.content).toBe(outputs2[i]!.content);
    }
  });

  it.todo('generates Zod schemas for the full CDM curated schema (SC-002)');
  it.todo('generated Zod schemas parse valid CDM JSON payloads');
  it.todo('generated Zod schemas reject invalid CDM JSON payloads');
  it.todo('generation completes within 5 seconds for the full CDM namespace set (SC-009)');
});

describe('cdm-smoke: json-schema target', () => {
  it.todo('generates JSON Schema for the full CDM curated schema');
  it.todo('generated JSON Schema is valid draft 2020-12');
  it.todo('generated JSON Schema accepts valid CDM JSON payloads (ajv)');
  it.todo('generated JSON Schema rejects invalid CDM JSON payloads (ajv)');
});

describe('cdm-smoke: typescript target', () => {
  it.todo('generates TypeScript interfaces and classes for the full CDM curated schema');
  it.todo('tsc --noEmit over generated TypeScript output exits 0');
  it.todo('generated TypeScript funcs are callable at runtime');
});
