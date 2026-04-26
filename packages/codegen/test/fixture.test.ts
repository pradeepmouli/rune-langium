// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tier 1 fixture test harness for @rune-langium/codegen.
 *
 * This module exports `runFixtureTests(dir, target?)` and `describeFixture(name, dir)`
 * for use by per-story test suites (Phase 3+).
 *
 * Each fixture directory contains:
 *   - input.rune       — the Rune source model
 *   - expected.zod.ts  — the committed expected output (byte-identical match required)
 *   - cases.json       — (optional) JSON battery cases { valid: unknown[], invalid: unknown[] }
 *
 * Phase 2: no fixture directories have content yet; per-story suites (us1-structural.test.ts, etc.)
 * will call describeFixture() starting in Phase 3 (US1).
 *
 * SC-007: byte-identical output required for all committed fixture pairs.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { generate } from '../src/index.js';
import type { Target } from '../src/types.js';

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
export async function runFixtureTests(dir: string, target: Target = 'zod'): Promise<void> {
  // Resolve the expected output file extension by target
  const expectedExt = target === 'json-schema' ? 'schema.json' : `${target}.ts`;

  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const fixtureDir = join(dir, entry.name);
    const inputPath = join(fixtureDir, 'input.rune');
    const expectedPath = join(fixtureDir, `expected.${expectedExt}`);

    // Skip placeholder directories (no input.rune)
    try {
      await stat(inputPath);
    } catch {
      continue;
    }

    it(`fixture: ${entry.name}`, async () => {
      const expectedContent = await readFile(expectedPath, 'utf-8');

      // Phase 3 will populate real parsing here.
      // For now, this placeholder exercises the harness structure.
      // TODO(Phase 3): Replace with real createRuneDslServices() + generate() call.
      const outputs = generate([] as never, { target });
      expect(outputs).toBeDefined();

      void expectedContent; // used in Phase 3
      throw new Error('Phase 2: fixture harness not yet wired to emitter (Phase 3 unlocks this)');
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
    void runFixtureTests(dir, target);
  });
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
