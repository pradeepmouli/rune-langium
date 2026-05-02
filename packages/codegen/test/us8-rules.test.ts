// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../src/index.js';

const FIXTURES_DIR = resolve(new URL('.', import.meta.url).pathname, 'fixtures/rules');

async function runFixture(fixtureName: string, target: 'zod' | 'typescript'): Promise<string> {
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
      `Parse errors in rules/${fixtureName}: ${doc.parseResult.parserErrors.map((e) => e.message).join(', ')}`
    );
  }
  const outputs = generate(doc, { target });
  if (outputs.length === 0) throw new Error(`No output for rules/${fixtureName}`);
  return outputs[0]!.content;
}

async function assertFixture(fixtureName: string, target: 'zod' | 'typescript'): Promise<void> {
  const ext = target === 'zod' ? '.zod.ts' : '.ts';
  const expectedPath = join(FIXTURES_DIR, fixtureName, 'expected' + ext);
  const [actual, expected] = await Promise.all([
    runFixture(fixtureName, target),
    readFile(expectedPath, 'utf-8')
  ]);
  expect(actual).toBe(expected);
}

describe('US8: Rule Codegen — TypeScript', () => {
  it('T028 eligibility rule', () => assertFixture('eligibility', 'typescript'));
  it('T029 reporting rule', () => assertFixture('reporting', 'typescript'));
  it('T030 complex expression rule', () => assertFixture('complex-expr', 'typescript'));
  it('T031 multiple rules', () => assertFixture('multi-rule', 'typescript'));
});

describe('US8: Rule Codegen — Zod', () => {
  it('T028 eligibility rule', () => assertFixture('eligibility', 'zod'));
  it('T029 reporting rule', () => assertFixture('reporting', 'zod'));
  it('T030 complex expression rule', () => assertFixture('complex-expr', 'zod'));
  it('T031 multiple rules', () => assertFixture('multi-rule', 'zod'));
});
