// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../src/index.js';

const FIXTURES_DIR = resolve(new URL('.', import.meta.url).pathname, 'fixtures/reports');

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
      `Parse errors in reports/${fixtureName}: ${doc.parseResult.parserErrors.map((e) => e.message).join(', ')}`
    );
  }
  const outputs = generate(doc, { target });
  if (outputs.length === 0) throw new Error(`No output for reports/${fixtureName}`);
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

describe('US9: Report Codegen — TypeScript', () => {
  it('T073 basic report fixture emits types, rules, and runeReportRules', () =>
    assertFixture('basic', 'typescript'));
  it('T074 runeReportRules contains eligibility entry', async () => {
    const content = await runFixture('basic', 'typescript');
    expect(content).toContain(
      "'IsLargeTrade': { kind: 'eligibility' as const, inputType: 'Trade' }"
    );
  });
  it('T075 runeReportRules contains reporting entry', async () => {
    const content = await runFixture('basic', 'typescript');
    expect(content).toContain("'ExtractDate': { kind: 'reporting' as const, inputType: 'Trade' }");
  });
});
