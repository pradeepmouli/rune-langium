// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * US2 Constraint Conditions as Runtime Validation — Tier 1 fixture-diff tests.
 *
 * Each test parses a `.rune` file, runs the Zod generator, and asserts
 * byte-identical equality with the committed `expected.zod.ts` file.
 *
 * Tasks: T047–T051 (RED), T057 (GREEN sweep).
 * FR-010 (refine vs superRefine), FR-011 (single superRefine per type).
 * SC-007: byte-identical output required.
 */

import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../src/index.js';

const FIXTURES_DIR = resolve(new URL('.', import.meta.url).pathname, 'fixtures/conditions-simple');

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
    throw new Error(`Parse errors in conditions-simple/${fixtureName}/input.rune: ${msgs}`);
  }

  const outputs = generate(doc, { target: 'zod' });
  if (outputs.length === 0) {
    throw new Error(`Generator produced no output for conditions-simple/${fixtureName}`);
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

// T047
describe('US2: one-of fixture', () => {
  it('generates byte-identical output for one-of condition (single -> .refine())', async () => {
    await assertFixture('one-of');
  });
});

// T048
describe('US2: choice fixture', () => {
  it('generates byte-identical output for choice condition (single -> .refine())', async () => {
    await assertFixture('choice');
  });
});

// T049
describe('US2: exists-absent fixture', () => {
  it('generates byte-identical output for exists and is-absent conditions', async () => {
    await assertFixture('exists-absent');
  });
});

// T050
describe('US2: only-exists fixture', () => {
  it('generates byte-identical output for only-exists condition', async () => {
    await assertFixture('only-exists');
  });
});

// T051
describe('US2: multi-condition fixture', () => {
  it('generates byte-identical output for type with three named conditions (-> single .superRefine())', async () => {
    await assertFixture('multi-condition');
  });

  // FR-011 verification: exactly ONE .superRefine() and ZERO .refine() calls
  it('multi-condition: emits exactly one .superRefine() call (FR-011)', () => {
    const expectedPath = join(FIXTURES_DIR, 'multi-condition', 'expected.zod.ts');
    const output = readFileSync(expectedPath, 'utf-8');
    const superRefineCount = (output.match(/\.superRefine\(/g) ?? []).length;
    const refineCount = (output.match(/\.refine\(/g) ?? []).length;
    expect(superRefineCount).toBe(1);
    expect(refineCount).toBe(0);
  });
});
