// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../src/index.js';

const FIXTURES_DIR = resolve(new URL('.', import.meta.url).pathname, 'fixtures/type-aliases');

async function runFixture(
  fixtureName: string,
  target: 'zod' | 'typescript' | 'json-schema'
): Promise<string> {
  const inputPath = join(FIXTURES_DIR, fixtureName, 'input.rune');
  const content = await readFile(inputPath, 'utf-8');
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
    content,
    URI.parse(`inmemory:///${fixtureName}.rosetta`)
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
  if (doc.parseResult.parserErrors.length > 0) {
    throw new Error(
      `Parse errors in type-aliases/${fixtureName}: ${doc.parseResult.parserErrors.map((e) => e.message).join(', ')}`
    );
  }
  const outputs = generate(doc, { target });
  if (outputs.length === 0) throw new Error(`No output for type-aliases/${fixtureName}`);
  return outputs[0]!.content;
}

async function assertFixture(
  fixtureName: string,
  target: 'zod' | 'typescript' | 'json-schema'
): Promise<void> {
  const ext = target === 'zod' ? '.zod.ts' : target === 'typescript' ? '.ts' : '.schema.json';
  const expectedPath = join(FIXTURES_DIR, fixtureName, 'expected' + ext);
  const [actual, expected] = await Promise.all([
    runFixture(fixtureName, target),
    readFile(expectedPath, 'utf-8')
  ]);
  expect(actual).toBe(expected);
}

describe('US7: Type Alias Codegen — Zod', () => {
  it('T016 primitive type alias', () => assertFixture('primitive', 'zod'));
  it('T017 data-ref type alias', () => assertFixture('data-ref', 'zod'));
  it('T018 with-condition type alias', () => assertFixture('with-condition', 'zod'));
  it('T019 chained type alias', () => assertFixture('chained', 'zod'));
  it('T020 parameterized type alias', () => assertFixture('parameterized', 'zod'));
});

describe('US7: Type Alias Codegen — TypeScript', () => {
  it('T016 primitive type alias', () => assertFixture('primitive', 'typescript'));
  it('T017 data-ref type alias', () => assertFixture('data-ref', 'typescript'));
  it('T018 with-condition type alias', () => assertFixture('with-condition', 'typescript'));
  it('T019 chained type alias', () => assertFixture('chained', 'typescript'));
  it('T020 parameterized type alias', () => assertFixture('parameterized', 'typescript'));
});

describe('US7: Type Alias Codegen — JSON Schema', () => {
  it('T016 primitive type alias', () => assertFixture('primitive', 'json-schema'));
  it('T017 data-ref type alias', () => assertFixture('data-ref', 'json-schema'));
  it('T018 with-condition type alias', () => assertFixture('with-condition', 'json-schema'));
  it('T019 chained type alias', () => assertFixture('chained', 'json-schema'));
  it('T020 parameterized type alias', () => assertFixture('parameterized', 'json-schema'));
});
