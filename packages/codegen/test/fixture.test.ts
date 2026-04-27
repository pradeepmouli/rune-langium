// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tier 1 fixture test harness for @rune-langium/codegen.
 *
 * This module exports `runFixtureTests(dir, target?)` and `describeFixture(name, dir)`
 * for use by per-story test suites (Phase 3+).
 *
 * Each fixture directory contains:
 *   - input.rune             — the Rune source model
 *   - expected.zod.ts        — committed expected output for the 'zod' target
 *   - expected.schema.json   — committed expected output for the 'json-schema' target
 *   - cases.json             — (optional) JSON battery cases { valid: unknown[], invalid: unknown[] }
 *
 * SC-007: byte-identical output required for all committed fixture pairs.
 */

import { existsSync, readdirSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../src/index.js';
import type { Target } from '../src/types.js';

// chevrotain@12 uses Object.groupBy which requires Node ≥ 22.
// Tests that invoke the Rune parser are skipped on earlier runtimes.
const skipIfNodeLt22 = it.skipIf(Number(process.versions.node.split('.')[0]) < 22);

const FIXTURES_DIR = resolve(new URL('.', import.meta.url).pathname, 'fixtures');

export interface FixtureCase {
  /** Fixture directory path (absolute). */
  dir: string;
  /** Fixture category name. */
  name: string;
}

/**
 * Runs all fixture tests in a given directory.
 *
 * For each subdirectory found:
 * 1. Parses input.rune via createRuneDslServices()
 * 2. Calls generate(doc, { target })
 * 3. Asserts byte-identical equality with expected.<target>.ts (or .schema.json for json-schema)
 *
 * Called by per-story suites (us1-structural.test.ts, etc.) starting in Phase 3.
 *
 * @param dir - Absolute path to the fixture category directory.
 * @param target - Generator target (default: 'zod').
 */
export function runFixtureTests(dir: string, target: Target = 'zod'): void {
  // Resolve the expected output file extension by target
  const expectedExt = target === 'json-schema' ? 'schema.json' : `${target}.ts`;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const fixtureDir = join(dir, entry.name);
    const inputPath = join(fixtureDir, 'input.rune');
    const expectedPath = join(fixtureDir, `expected.${expectedExt}`);

    // Skip placeholder directories (no input.rune)
    if (!existsSync(inputPath)) {
      continue;
    }

    // Skip if no expected file for this target (not all fixtures have all targets)
    if (!existsSync(expectedPath)) {
      continue;
    }

    it(`fixture: ${entry.name}`, async () => {
      const [inputContent, expectedContent] = await Promise.all([
        readFile(inputPath, 'utf-8'),
        readFile(expectedPath, 'utf-8')
      ]);

      const { RuneDsl } = createRuneDslServices();
      const fixtureId = `${entry.name}.rosetta`;
      const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
        inputContent,
        URI.parse(`inmemory:///${fixtureId}`)
      );
      await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
      assertDocumentReady(doc, `${entry.name}/input.rune`);

      const outputs = generate(doc, { target });
      if (outputs.length === 0) {
        throw new Error(`Generator produced no output for ${entry.name}`);
      }

      expect(outputs[0]!.content).toBe(expectedContent);
    });
  }
}

/**
 * Convenience wrapper: describes a named fixture suite and runs all fixtures in the given directory.
 *
 * Used by per-story test suites:
 * ```ts
 * // us1-structural.test.ts
 * import { describeFixture } from './fixture.test.js';
 * describeFixture('basic-types', new URL('./fixtures/basic-types', import.meta.url).pathname);
 * ```
 *
 * @param name - Human-readable name for the describe block.
 * @param dir - Absolute path to the fixture category directory.
 * @param target - Generator target (default: 'zod').
 */
export function describeFixture(name: string, dir: string, target: Target = 'zod'): void {
  describe(`fixtures: ${name}`, () => {
    runFixtureTests(dir, target);
  });
}

/**
 * T133 / SC-007 in-process determinism guard.
 *
 * For every Tier 1 fixture that has both an input.rune and an expected.zod.ts,
 * generate twice in the same vitest process and assert byte-identical output.
 *
 * This catches any generator state leakage that would violate SC-007.
 */
describe('fixture determinism (SC-007)', () => {
  skipIfNodeLt22(
    'all Tier 1 zod fixtures produce byte-identical output on repeated generation',
    async () => {
      const entries = await readdir(FIXTURES_DIR);
      // Create services once — chevrotain@12 re-initialisation in the same
      // process causes Object.groupBy errors on Node <22.
      const { RuneDsl } = createRuneDslServices();
      let checked = 0;
      for (const entry of entries) {
        const dir = join(FIXTURES_DIR, entry);
        const s = await stat(dir);
        if (!s.isDirectory()) continue;
        const inputPath = join(dir, 'input.rune');
        let input: string;
        try {
          input = await readFile(inputPath, 'utf-8');
        } catch {
          continue;
        }
        const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
          input,
          URI.parse(`inmemory:///${entry}.rosetta`)
        );
        await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
        assertDocumentReady(doc, `${entry}/input.rune`);
        const run1 = generate([doc], { target: 'zod' });
        const run2 = generate([doc], { target: 'zod' });
        expect(run2.length, `${entry}: second run produced different output count`).toBe(
          run1.length
        );
        for (let i = 0; i < run1.length; i++) {
          expect(run1[i]?.content, `${entry}[${i}]: second run differed`).toBe(run2[i]?.content);
        }
        checked++;
      }
      expect(checked, 'Expected at least one fixture to be checked').toBeGreaterThan(0);
    }
  );
});

function assertDocumentReady(
  doc: {
    parseResult: { parserErrors: { message: string }[] };
    diagnostics?: { severity?: number; message: string }[];
  },
  label: string
): void {
  if (doc.parseResult.parserErrors.length > 0) {
    const messages = doc.parseResult.parserErrors.map((error) => error.message).join(', ');
    throw new Error(`Parse errors in ${label}: ${messages}`);
  }

  const diagnostics = doc.diagnostics?.filter((diagnostic) => diagnostic.severity === 1) ?? [];
  if (diagnostics.length > 0) {
    const messages = diagnostics.map((diagnostic) => diagnostic.message).join(', ');
    throw new Error(`Diagnostic errors in ${label}: ${messages}`);
  }
}

/**
 * Phase 2: Smoke check — confirms the fixtures directory exists and all
 * ten placeholder category directories are present. This test will be
 * replaced by real fixture runs in Phase 3+.
 */
describe('fixture harness bootstrap', () => {
  const expectedCategories = [
    'basic-types',
    'cardinality',
    'circular',
    'conditions-complex',
    'conditions-simple',
    'enums',
    'inheritance',
    'key-refs',
    'meta-types',
    'reserved-words'
  ];

  it('has all ten fixture category directories', async () => {
    const entries = await readdir(FIXTURES_DIR, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    for (const cat of expectedCategories) {
      expect(dirs).toContain(cat);
    }
  });
});
