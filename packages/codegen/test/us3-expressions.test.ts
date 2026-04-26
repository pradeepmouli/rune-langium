// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * US3 Full Expression Language Transpiler — Tier 1 fixture-diff tests.
 *
 * Each test parses a `.rune` file, runs the Zod generator, and asserts
 * byte-identical equality with the committed `expected.zod.ts` file.
 *
 * Tasks: T058–T065 (RED), T076 (GREEN sweep).
 * FR-012 (all expression forms), FR-013 (optional chaining), SC-003 (≥99% parity).
 * SC-007: byte-identical output required.
 */

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../src/index.js';

const FIXTURES_DIR = resolve(new URL('.', import.meta.url).pathname, 'fixtures/conditions-complex');

/**
 * Parse a fixture and generate Zod output.
 */
async function runFixture(fixtureName: string): Promise<string> {
  const fixtureDir = join(FIXTURES_DIR, fixtureName);
  const inputPath = join(fixtureDir, 'input.rune');

  const content = await readFile(inputPath, 'utf-8');

  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
    content,
    URI.parse(`inmemory:///${fixtureName}.rosetta`)
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);

  if (doc.parseResult.parserErrors.length > 0) {
    const msgs = doc.parseResult.parserErrors.map((e: { message: string }) => e.message).join(', ');
    throw new Error(`Parse errors in conditions-complex/${fixtureName}/input.rune: ${msgs}`);
  }

  const outputs = generate(doc, { target: 'zod' });
  if (outputs.length === 0) {
    throw new Error(`Generator produced no output for conditions-complex/${fixtureName}`);
  }
  return outputs[0]!.content;
}

/**
 * Assert byte-identical match with the committed expected file.
 */
async function assertFixture(fixtureName: string): Promise<void> {
  const fixtureDir = join(FIXTURES_DIR, fixtureName);
  const expectedPath = join(fixtureDir, 'expected.zod.ts');

  const [actual, expected] = await Promise.all([
    runFixture(fixtureName),
    readFile(expectedPath, 'utf-8')
  ]);

  expect(actual).toBe(expected);
}

// T058
describe('US3: literals fixture', () => {
  it('generates byte-identical output for literal conditions (string, int, boolean)', async () => {
    await assertFixture('literals');
  });
});

// T059
describe('US3: navigation fixture', () => {
  it('generates byte-identical output for path-navigation conditions (a -> b -> c)', async () => {
    await assertFixture('navigation');
  });
});

// T060
describe('US3: arithmetic fixture', () => {
  it('generates byte-identical output for arithmetic/comparison conditions', async () => {
    await assertFixture('arithmetic');
  });
});

// T061
describe('US3: boolean fixture', () => {
  it('generates byte-identical output for boolean and/or conditions', async () => {
    await assertFixture('boolean');
  });
});

// T062
describe('US3: set-ops fixture', () => {
  it('generates byte-identical output for contains/disjoint set-operation conditions', async () => {
    await assertFixture('set-ops');
  });
});

// T063
describe('US3: aggregations fixture', () => {
  it('generates byte-identical output for count/first/aggregation conditions', async () => {
    await assertFixture('aggregations');
  });
});

// T064
describe('US3: higher-order fixture', () => {
  it('generates byte-identical output for filter/map higher-order conditions', async () => {
    await assertFixture('higher-order');
  });
});

// T065
describe('US3: conditional fixture', () => {
  it('generates byte-identical output for if-then-else conditional conditions', async () => {
    await assertFixture('conditional');
  });
});
