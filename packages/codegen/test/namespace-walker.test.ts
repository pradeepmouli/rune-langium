// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { createRuneDslServices, isRosettaModel } from '@rune-langium/core';
import { URI } from 'langium';
import { emitNamespace as emitJsonSchemaNamespace } from '../src/emit/json-schema-emitter.js';
import { emitNamespace as emitTsNamespace } from '../src/emit/ts-emitter.js';
import { walkNamespace } from '../src/emit/namespace-walker.js';
import { emitNamespace as emitZodNamespace } from '../src/emit/zod-emitter.js';

const FIXTURES_DIR = resolve(new URL('.', import.meta.url).pathname, 'fixtures');

async function parseFixture(fixtureName: string) {
  const inputPath = join(FIXTURES_DIR, fixtureName, 'input.rune');
  const content = await readFile(inputPath, 'utf-8');
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
    content,
    URI.parse(`inmemory:///${fixtureName}.rosetta`)
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
  return doc;
}

function getNamespaceName(doc: import('langium').LangiumDocument): string {
  const model = doc.parseResult?.value;
  if (!model || !isRosettaModel(model)) {
    throw new Error('Expected a RosettaModel fixture document');
  }

  const name = model.name;
  if (typeof name === 'string') {
    return name.replace(/^"|"$/g, '');
  }
  if (name && typeof name === 'object' && 'segments' in name) {
    return (name as { segments: string[] }).segments.join('.');
  }
  return String(name ?? '');
}

describe('namespace walker', () => {
  it('can be reused across emitters without mutating shared namespace state', async () => {
    const doc = await parseFixture('circular');
    const namespace = getNamespaceName(doc);
    const walkedNamespace = walkNamespace([doc], namespace);
    const originalEmitOrder = Array.from(walkedNamespace.emitOrder);
    const originalCyclicTypes = Array.from(walkedNamespace.cyclicTypes).sort();

    const firstZod = emitZodNamespace(walkedNamespace, {});
    const secondZod = emitZodNamespace(walkedNamespace, {});
    const typescript = emitTsNamespace(walkedNamespace, {});
    const jsonSchema = emitJsonSchemaNamespace(walkedNamespace, {});

    expect(firstZod).toEqual(secondZod);
    expect(Array.from(walkedNamespace.emitOrder)).toEqual(originalEmitOrder);
    expect(Array.from(walkedNamespace.cyclicTypes).sort()).toEqual(originalCyclicTypes);
    expect(firstZod.relativePath.endsWith('.zod.ts')).toBe(true);
    expect(typescript.relativePath.endsWith('.ts')).toBe(true);
    expect(jsonSchema.relativePath.endsWith('.schema.json')).toBe(true);
  });
});
