// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generatePreviewSchemas } from '../src/index.js';

const skipIfNodeLt22 = it.skipIf(Number(process.versions.node.split('.')[0]) < 22);

async function parseModel(source: string) {
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
    source,
    URI.parse('inmemory:///preview-schema.rosetta')
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
  const parseErrors = doc.parseResult.parserErrors.map((error) => error.message);
  expect(parseErrors).toEqual([]);
  return doc;
}

describe('FormPreviewSchema generation', () => {
  skipIfNodeLt22('serializes scalar, optional, array, enum, and nested fields', async () => {
    const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      enum Side:
        Buy displayName "Buy side"
        Sell

      type Party:
        name string (1..1)

      type Trade:
        id string (1..1)
        quantity int (0..1)
        tags string (0..*)
        side Side (1..1)
        party Party (1..1)
    `);

    const schemas = generatePreviewSchemas([doc]);
    const trade = schemas.find((schema) => schema.targetId === 'test.preview.Trade');

    expect(trade).toMatchObject({
      schemaVersion: 1,
      targetId: 'test.preview.Trade',
      title: 'Trade',
      status: 'ready'
    });
    expect(trade?.sourceMap).toEqual([
      {
        fieldPath: 'id',
        sourceUri: 'inmemory:/preview-schema.rosetta',
        sourceLine: 13,
        sourceChar: 9
      },
      {
        fieldPath: 'quantity',
        sourceUri: 'inmemory:/preview-schema.rosetta',
        sourceLine: 14,
        sourceChar: 9
      },
      {
        fieldPath: 'tags',
        sourceUri: 'inmemory:/preview-schema.rosetta',
        sourceLine: 15,
        sourceChar: 9
      },
      {
        fieldPath: 'side',
        sourceUri: 'inmemory:/preview-schema.rosetta',
        sourceLine: 16,
        sourceChar: 9
      },
      {
        fieldPath: 'party',
        sourceUri: 'inmemory:/preview-schema.rosetta',
        sourceLine: 17,
        sourceChar: 9
      },
      {
        fieldPath: 'party.name',
        sourceUri: 'inmemory:/preview-schema.rosetta',
        sourceLine: 10,
        sourceChar: 9
      }
    ]);
    expect(trade?.fields).toEqual([
      { path: 'id', label: 'id', kind: 'string', required: true },
      {
        path: 'quantity',
        label: 'quantity',
        kind: 'number',
        required: false,
        cardinality: { min: 0, max: 1 }
      },
      {
        path: 'tags',
        label: 'tags',
        kind: 'array',
        required: false,
        cardinality: { min: 0, max: 'unbounded' },
        children: [{ path: 'tags[]', label: 'tags item', kind: 'string', required: true }]
      },
      {
        path: 'side',
        label: 'side',
        kind: 'enum',
        required: true,
        enumValues: [
          { value: 'Buy', label: 'Buy side' },
          { value: 'Sell', label: 'Sell' }
        ]
      },
      {
        path: 'party',
        label: 'party',
        kind: 'object',
        required: true,
        children: [{ path: 'party.name', label: 'name', kind: 'string', required: true }]
      }
    ]);
  });

  skipIfNodeLt22(
    'marks recursive expansion as unsupported instead of expanding forever',
    async () => {
      const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      type Node:
        value string (1..1)
        child Node (0..1)
    `);

      const [node] = generatePreviewSchemas([doc], { maxDepth: 1 });

      expect(node?.targetId).toBe('test.preview.Node');
      expect(node?.unsupportedFeatures).toContain('recursive-reference:Node');
      expect(node?.fields).toEqual([
        { path: 'value', label: 'value', kind: 'string', required: true },
        {
          path: 'child',
          label: 'child',
          kind: 'unknown',
          required: false,
          cardinality: { min: 0, max: 1 },
          description: 'Recursive reference to Node is not expanded in form preview.'
        }
      ]);
    }
  );

  skipIfNodeLt22('can return one fully-qualified target schema by id', async () => {
    const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      type Same:
        value string (1..1)

      type Container:
        same Same (1..1)
    `);

    const schemas = generatePreviewSchemas([doc], { targetId: 'test.preview.Container' });

    expect(schemas.map((schema) => schema.targetId)).toEqual(['test.preview.Container']);
  });

  skipIfNodeLt22('covers all supported preview field kinds plus unknown fallback', async () => {
    const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      enum Side:
        Buy
        Sell

      type Party:
        name string (1..1)

      type Trade:
        tradeId string (1..1)
        quantity int (0..1)
        active boolean (0..1)
        side Side (1..1)
        party Party (1..1)
        aliases string (0..*)
        missing MissingType (0..1)
    `);

    const [trade] = generatePreviewSchemas([doc], { targetId: 'test.preview.Trade' });
    const kinds = new Set<string>();
    for (const field of trade?.fields ?? []) {
      kinds.add(field.kind);
      for (const child of field.children ?? []) {
        kinds.add(child.kind);
      }
    }

    expect(Array.from(kinds).sort()).toEqual([
      'array',
      'boolean',
      'enum',
      'number',
      'object',
      'string',
      'unknown'
    ]);
    expect(trade?.unsupportedFeatures).toContain('unresolved-reference:MissingType');
  });
});
