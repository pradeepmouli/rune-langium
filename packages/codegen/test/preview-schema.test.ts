// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generatePreviewSchemas } from '../src/index.js';

const skipIfNodeLt22 = it.skipIf(Number(process.versions.node.split('.')[0]) < 22);
const REAL_CDM_ADJUSTABLE_DATE_FIXTURES = [
  new URL('../../../.resources/cdm/base-datetime-enum.rosetta', import.meta.url),
  new URL('../../../.resources/cdm/base-datetime-type.rosetta', import.meta.url)
] as const;
const skipIfAdjustableDateFixturesUnavailable = it.skipIf(
  Number(process.versions.node.split('.')[0]) < 22 ||
    !REAL_CDM_ADJUSTABLE_DATE_FIXTURES.every((fixtureUrl) => existsSync(fixtureUrl))
);

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

async function parseFixture(relativePath: string) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  return parseModel(source);
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

  skipIfNodeLt22(
    'marks duplicate target ids as unsupported instead of silently overwriting',
    async () => {
      const first = await parseModel(`
      namespace "test.preview"
      version "1"

      type Trade:
        tradeId string (1..1)
    `);
      const second = await parseModel(`
      namespace "test.preview"
      version "1"

      type Trade:
        settlementDate string (0..1)
    `);

      const [trade] = generatePreviewSchemas([first, second], { targetId: 'test.preview.Trade' });

      expect(trade).toMatchObject({
        targetId: 'test.preview.Trade',
        status: 'unsupported',
        fields: [],
        unsupportedFeatures: ['duplicate-target:test.preview.Trade']
      });
    }
  );

  skipIfAdjustableDateFixturesUnavailable(
    'generates a stable preview schema for the real CDM AdjustableDate type',
    async () => {
      const enumDoc = await parseFixture('../../../.resources/cdm/base-datetime-enum.rosetta');
      const typeDoc = await parseFixture('../../../.resources/cdm/base-datetime-type.rosetta');

      const [adjustableDate] = generatePreviewSchemas([enumDoc, typeDoc], {
        targetId: 'cdm.base.datetime.AdjustableDate'
      });

      expect(adjustableDate).toMatchObject({
        targetId: 'cdm.base.datetime.AdjustableDate',
        title: 'AdjustableDate'
      });
      expect(adjustableDate?.fields.map((field) => field.path)).toEqual([
        'unadjustedDate',
        'dateAdjustments',
        'dateAdjustmentsReference',
        'adjustedDate'
      ]);
      expect(
        adjustableDate?.fields.find((field) => field.path === 'dateAdjustments')
      ).toMatchObject({
        kind: 'object'
      });
    }
  );

  // ── T037: Type Alias Preview ─────────────────────────────────────────────

  skipIfNodeLt22('generates a scalar field for a primitive type alias (typeAlias)', async () => {
    const doc = await parseModel(`
        namespace "test.preview"
        version "1"

        typeAlias ProductCode:
          string
      `);

    const schemas = generatePreviewSchemas([doc]);
    const alias = schemas.find((s) => s.targetId === 'test.preview.ProductCode');

    expect(alias).toMatchObject({
      schemaVersion: 1,
      kind: 'typeAlias',
      targetId: 'test.preview.ProductCode',
      title: 'ProductCode',
      status: 'ready'
    });
    expect(alias?.fields).toEqual([
      { path: 'value', label: 'ProductCode', kind: 'string', required: true }
    ]);
  });

  skipIfNodeLt22(
    'generates object fields for a data-type alias (typeAlias referencing a type)',
    async () => {
      const doc = await parseModel(`
        namespace "test.preview"
        version "1"

        type Address:
          street string (1..1)
          city string (1..1)

        typeAlias BillingAddress:
          Address
      `);

      const schemas = generatePreviewSchemas([doc]);
      const alias = schemas.find((s) => s.targetId === 'test.preview.BillingAddress');

      expect(alias).toMatchObject({
        schemaVersion: 1,
        kind: 'typeAlias',
        targetId: 'test.preview.BillingAddress',
        title: 'BillingAddress',
        status: 'ready'
      });
      expect(alias?.fields.map((f) => f.path)).toEqual(['street', 'city']);
      expect(alias?.fields[0]).toMatchObject({ kind: 'string', required: true });
    }
  );

  // ── T038: Choice Preview ─────────────────────────────────────────────────

  // ── T054: Function Preview ───────────────────────────────────────────────

  skipIfNodeLt22('generates a function schema with input fields (T054)', async () => {
    const doc = await parseModel(`
      namespace "test.funcpreview"
      version "1"

      func AddTwo:
        inputs:
          a number (1..1)
          b number (1..1)
        output:
          result number (1..1)
    `);

    const schemas = generatePreviewSchemas(doc);
    const funcSchema = schemas.find((s) => s.kind === 'function');

    expect(funcSchema).toBeDefined();
    expect(funcSchema!.title).toBe('AddTwo');
    expect(funcSchema!.targetId).toBe('test.funcpreview.AddTwo');
    expect(funcSchema!.status).toBe('ready');
    expect(funcSchema!.fields).toHaveLength(2);
    expect(funcSchema!.fields[0].label).toBe('a');
    expect(funcSchema!.fields[1].label).toBe('b');
  });

  skipIfNodeLt22('generates a choice schema with one field per option', async () => {
    const doc = await parseModel(`
      namespace "test.preview"
      version "1"

      type Cash:
        amount number (1..1)

      type Securities:
        isin string (1..1)

      choice Collateral:
        Cash
        Securities
    `);

    const schemas = generatePreviewSchemas([doc]);
    const choice = schemas.find((s) => s.targetId === 'test.preview.Collateral');

    expect(choice).toMatchObject({
      schemaVersion: 1,
      kind: 'choice',
      targetId: 'test.preview.Collateral',
      title: 'Collateral',
      status: 'ready'
    });
    expect(choice?.fields.map((f) => f.path)).toEqual(['Cash', 'Securities']);
    // Each option is required: false because only one may be chosen
    expect(choice?.fields.every((f) => f.required === false)).toBe(true);
    expect(choice?.fields.find((f) => f.path === 'Cash')).toMatchObject({
      kind: 'object'
    });
    expect(choice?.fields.find((f) => f.path === 'Securities')).toMatchObject({
      kind: 'object'
    });
  });
});
