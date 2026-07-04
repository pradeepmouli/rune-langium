// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Fixture-based acceptance coverage for the OpenAPI importer (spec 021
 * Phase 2 Addendum T4): a hand-trimmed, petstore-class OAS 3.0 YAML
 * fixture and its OAS 3.1 JSON counterpart, both committed under
 * test/fixtures/openapi/, exercising the shapes T4's brief calls out —
 * nullable, discriminator + mapping, allOf-extends, enums with unsafe
 * values, and range/length constraints — through the full
 * `importModel(source, { from: 'openapi' })` pipeline (not just
 * `readOpenApi` directly, unlike openapi-reader.test.ts's inline-object
 * unit coverage).
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { importModel } from '../../src/import/index.js';

const FIXTURES_DIR = resolve(new URL('.', import.meta.url).pathname, '../fixtures/openapi');

async function importFixture(fileName: string) {
  const source = await readFile(resolve(FIXTURES_DIR, fileName), 'utf-8');
  return importModel(source, { from: 'openapi' });
}

async function assertParses(text: string): Promise<void> {
  const result = await parse(text);
  if (result.hasErrors) {
    throw new Error(
      `expected zero parse errors for:\n${text}\ngot: ${JSON.stringify([...result.lexerErrors, ...result.parserErrors])}`
    );
  }
  expect(result.hasErrors).toBe(false);
}

describe.each([
  ['petstore-3.0.yaml', 'OAS 3.0 (YAML, nullable + boolean exclusiveMinimum dialect)'],
  ['petstore-3.1.json', 'OAS 3.1 (JSON, 2020-12 type-union nullable + numeric exclusiveMinimum dialect)']
])('openapi-reader fixture — %s (%s)', (fileName) => {
  it('imports cleanly with zero parse errors (the inbound hard invariant)', async () => {
    const result = await importFixture(fileName);
    await assertParses(result.text);
  });

  it('allOf-extends: Pet extends Category', async () => {
    const result = await importFixture(fileName);
    expect(result.text).toContain('type Pet extends Category:');
  });

  it('nullable/optional property: Category.name is (0..1)', async () => {
    const result = await importFixture(fileName);
    expect(result.text).toContain('name string (0..1)');
  });

  it('enum with an unsafe value ("out-of-stock") is sanitized with a displayName', async () => {
    const result = await importFixture(fileName);
    expect(result.text).toContain('enum PetStatus:');
    expect(result.text).toContain('out_of_stock displayName "out-of-stock"');
  });

  it('length constraint: Pet.name minLength/maxLength -> a count condition', async () => {
    const result = await importFixture(fileName);
    expect(result.text).toContain('name count >= 1');
    expect(result.text).toContain('name count <= 100');
  });

  it('range constraint: age minimum:0 -> a >= condition', async () => {
    const result = await importFixture(fileName);
    expect(result.text).toContain('age >= 0');
  });

  it('discriminator + mapping: PaymentMethod merges both branches and emits required choice', async () => {
    const result = await importFixture(fileName);
    const paymentMethod = result.model.types.find((t) => t.name === 'PaymentMethod')!;
    expect(paymentMethod.attributes.map((a) => a.name).sort()).toEqual(['amount', 'deposit']);
    expect(result.text).toContain('condition OneOf:');
    expect(result.text).toContain('required choice amount, deposit');
  });

  it('synonym source is OpenApi', async () => {
    const result = await importFixture(fileName);
    expect(result.text).toContain('synonym source OpenApi');
  });
});
