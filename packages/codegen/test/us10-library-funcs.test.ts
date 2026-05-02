// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../src/index.js';

const FIXTURES_DIR = resolve(new URL('.', import.meta.url).pathname, 'fixtures/library-funcs');

async function runFixture(fixtureName: string, target: 'typescript'): Promise<string> {
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
      `Parse errors in library-funcs/${fixtureName}: ${doc.parseResult.parserErrors.map((e) => e.message).join(', ')}`
    );
  }
  const outputs = generate(doc, { target });
  if (outputs.length === 0) throw new Error(`No output for library-funcs/${fixtureName}`);
  return outputs[0]!.content;
}

async function assertFixture(fixtureName: string, target: 'typescript'): Promise<void> {
  const ext = '.ts';
  const expectedPath = join(FIXTURES_DIR, fixtureName, 'expected' + ext);
  const [actual, expected] = await Promise.all([
    runFixture(fixtureName, target),
    readFile(expectedPath, 'utf-8')
  ]);
  expect(actual).toBe(expected);
}

describe('US10: Library Function Codegen — TypeScript', () => {
  it('T076 basic library-funcs fixture matches snapshot', () =>
    assertFixture('basic', 'typescript'));
  it('T077 Sum emits array parameter type alias', async () => {
    const content = await runFixture('basic', 'typescript');
    expect(content).toContain('export type Sum = (values: number[]) => number;');
  });
  it('T078 Concat emits two-param string type alias', async () => {
    const content = await runFixture('basic', 'typescript');
    expect(content).toContain('export type Concat = (a: string, b: string) => string;');
  });
  it('T079 library func types are sorted alphabetically', async () => {
    const content = await runFixture('basic', 'typescript');
    const concatPos = content.indexOf('export type Concat');
    const sumPos = content.indexOf('export type Sum');
    expect(concatPos).toBeGreaterThan(-1);
    expect(sumPos).toBeGreaterThan(-1);
    expect(concatPos).toBeLessThan(sumPos);
  });
});
