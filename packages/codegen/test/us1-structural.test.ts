// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * US1 Structural Zod Schemas — Tier 1 fixture-diff tests.
 *
 * Each test parses a `.rune` file (using `.rosetta` URI so Langium recognizes it),
 * runs the Zod generator, and asserts byte-identical equality with the committed
 * `expected.zod.ts` file.
 *
 * Tasks: T028–T033 (RED), T044 (GREEN sweep).
 * SC-007: byte-identical output required.
 */

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../src/index.js';

const FIXTURES_DIR = resolve(new URL('.', import.meta.url).pathname, 'fixtures');

/**
 * Parse a .rune fixture file and generate Zod output.
 * Uses .rosetta URI so the Langium service registry recognizes the extension.
 */
async function runFixture(fixtureName: string): Promise<string> {
  const fixtureDir = join(FIXTURES_DIR, fixtureName);
  const inputPath = join(fixtureDir, 'input.rune');

  const content = await readFile(inputPath, 'utf-8');

  const { RuneDsl } = createRuneDslServices();
  // Use .rosetta URI so the service registry recognizes the extension
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
    content,
    URI.parse(`inmemory:///${fixtureName}.rosetta`)
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);

  if (doc.parseResult.parserErrors.length > 0) {
    const msgs = doc.parseResult.parserErrors.map((e: { message: string }) => e.message).join(', ');
    throw new Error(`Parse errors in ${fixtureName}/input.rune: ${msgs}`);
  }

  const outputs = generate(doc, { target: 'zod' });
  if (outputs.length === 0) {
    throw new Error(`Generator produced no output for ${fixtureName}`);
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

// T028
describe('US1: basic-types fixture', () => {
  it('generates byte-identical output for basic scalar types and empty type', async () => {
    await assertFixture('basic-types');
  });
});

// T029
describe('US1: cardinality fixture', () => {
  it('generates byte-identical output for all six cardinality forms', async () => {
    await assertFixture('cardinality');
  });
});

// T030
describe('US1: enums fixture', () => {
  it('generates byte-identical output for enums with and without displayName', async () => {
    await assertFixture('enums');
  });
});

// T031
describe('US1: inheritance fixture', () => {
  it('generates byte-identical output for single and multi-level extends', async () => {
    await assertFixture('inheritance');
  });
});

// T032
describe('US1: circular fixture', () => {
  it('generates byte-identical output for mutual cycles and self-references using z.lazy()', async () => {
    await assertFixture('circular');
  });
});

// T033
describe('US1: reserved-words fixture', () => {
  it('generates byte-identical output with quoted reserved-word property keys', async () => {
    await assertFixture('reserved-words');
  });
});

// T137: meta-types fixture
// Note: The Rune grammar supports `metaType` declarations but the zod-emitter currently
// silently skips RosettaMetaType/RosettaBasicType/Annotation root elements (only data types and
// enumerations are emitted). The fixture verifies that
// models containing metaType declarations alongside regular type declarations do not crash
// the generator and produce deterministic output (SC-007).
describe('US1: meta-types fixture', () => {
  it('generates byte-identical output for a model with metaType declarations (T137)', async () => {
    await assertFixture('meta-types');
  });
});

// T137: key-refs fixture
// Note: The Rune grammar supports `as-key` expressions in func operation bodies, but the
// zod-emitter silently skips all RosettaFunction elements (FR-031 deferred). The fixture verifies
// that models with as-key func operations produce deterministic output for the type
// declarations they contain (SC-007).
describe('US1: key-refs fixture', () => {
  it('generates byte-identical output for a model with as-key func expressions (T137)', async () => {
    await assertFixture('key-refs');
  });
});
