// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Condition round-trip half of T5 (specs/021-codegen-inbound Phase 1 item
 * 7, split-oracle per the 2026-07-04 spec amendment).
 *
 * This half does NOT use the outbound JSON Schema emitter as its oracle —
 * that emitter's `x-rune-conditions` metadata is intentionally opaque (no
 * `minimum`/`maximum`/`minLength`/`oneOf` keyword, no expression content;
 * see json-schema-emitter.ts's own header comment and spec.md's "Round-Trip
 * as a Test Oracle"), so there is nothing to import FROM on that side.
 *
 * Instead: a HAND-WRITTEN JSON Schema fixture carries real constraint
 * keywords (the same shapes acceptance scenarios 5-6 already require).
 * Importing it is checked two ways for each condition:
 *   1. parse-first: the imported `.rune` text parses with zero errors
 *      (the hard invariant every test in this suite enforces).
 *   2. tree-equivalence: the imported condition's expression tree is
 *      compared, via `treesEquivalent` (expression-tree-equivalence.ts,
 *      shared with the outbound expression-roundtrip/corpus-sweep suites),
 *      against the expression tree obtained by parsing a HAND-WRITTEN
 *      `.rune` expectation through the real parser — i.e. both sides of
 *      the comparison go through `@rune-langium/core`'s parser, so the
 *      comparison is against real AST shape, not a hand-rolled fixture
 *      object that might silently drift from what the grammar actually
 *      produces.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { treesEquivalent } from '../emit/rosetta/expression-tree-equivalence.js';
import { importModel } from '../../src/import/index.js';

type DataLike = { $type: string; conditions?: Array<{ name?: string; expression: unknown }> };

/** Finds the first `Data` element — imported text also carries a leading `RosettaSynonymSource` declaration + per-node synonym annotations, so element 0 is not necessarily the type. */
function firstDataElement(elements: readonly unknown[]): DataLike {
  const data = elements.find((e) => (e as DataLike).$type === 'Data') as DataLike | undefined;
  expect(data).toBeDefined();
  return data!;
}

/** Parses `.rune` text and returns the first `Data` type's first condition's expression tree. */
async function firstConditionExpr(source: string): Promise<unknown> {
  const result = await parse(source);
  expect(result.hasErrors).toBe(false);
  const data = firstDataElement(result.value.elements);
  expect(data.conditions?.length).toBeGreaterThan(0);
  return data.conditions![0]!.expression;
}

/** Parses `.rune` text and returns ALL conditions on the first `Data` type, keyed by name. */
async function conditionsByName(source: string): Promise<Record<string, unknown>> {
  const result = await parse(source);
  expect(result.hasErrors).toBe(false);
  const data = firstDataElement(result.value.elements);
  const out: Record<string, unknown> = {};
  for (const c of data.conditions ?? []) {
    if (c.name) out[c.name] = c.expression;
  }
  return out;
}

describe('round-trip (condition half) — hand-written JSON Schema -> inbound -> .rune, tree-equivalence vs. hand-written .rune', () => {
  it('minimum -> range condition, tree-equivalent to a hand-written `value >= 0` condition', async () => {
    const schema = {
      $id: 'https://example.com/schemas/numeric.json',
      $defs: {
        NumericCheck: {
          type: 'object',
          properties: { value: { type: 'integer', minimum: 0 } },
          required: ['value']
        }
      }
    };
    const imported = await importModel(JSON.stringify(schema), { from: 'json-schema' });
    const parseResult = await parse(imported.text);
    expect(parseResult.hasErrors).toBe(false);

    const importedExpr = await firstConditionExpr(imported.text);
    const expectedExpr = await firstConditionExpr(
      'namespace test.expect\nversion "0.0.0"\n\ntype NumericCheck:\n  value int (1..1)\n\n  condition ValueRange:\n    value >= 0\n'
    );
    expect(treesEquivalent(importedExpr, expectedExpr)).toBe(true);
  });

  it('minLength -> length condition, tree-equivalent to a hand-written `code count >= 1` condition', async () => {
    const schema = {
      $id: 'https://example.com/schemas/lengthcheck.json',
      $defs: {
        LengthCheck: {
          type: 'object',
          properties: { code: { type: 'string', minLength: 1 } },
          required: ['code']
        }
      }
    };
    const imported = await importModel(JSON.stringify(schema), { from: 'json-schema' });
    const parseResult = await parse(imported.text);
    expect(parseResult.hasErrors).toBe(false);

    const importedExpr = await firstConditionExpr(imported.text);
    const expectedExpr = await firstConditionExpr(
      'namespace test.expect\nversion "0.0.0"\n\ntype LengthCheck:\n  code string (1..1)\n\n  condition CodeLength:\n    code count >= 1\n'
    );
    expect(treesEquivalent(importedExpr, expectedExpr)).toBe(true);
  });

  it('oneOf + discriminator -> required-choice condition, tree-equivalent to a hand-written `required choice` condition', async () => {
    const schema = {
      $id: 'https://example.com/schemas/priceable.json',
      $defs: {
        PriceableAmount: {
          type: 'object',
          oneOf: [
            { type: 'object', properties: { currency: { type: 'string' } }, required: ['currency'] },
            { type: 'object', properties: { capacityUnit: { type: 'string' } }, required: ['capacityUnit'] }
          ],
          discriminator: { propertyName: 'unitType' }
        }
      }
    };
    const imported = await importModel(JSON.stringify(schema), { from: 'json-schema' });
    const parseResult = await parse(imported.text);
    expect(parseResult.hasErrors).toBe(false);

    const importedExpr = await firstConditionExpr(imported.text);
    const expectedExpr = await firstConditionExpr(
      'namespace test.expect\nversion "0.0.0"\n\ntype PriceableAmount:\n  currency string (0..1)\n  capacityUnit string (0..1)\n\n  condition OneOf:\n    required choice currency, capacityUnit\n'
    );
    expect(treesEquivalent(importedExpr, expectedExpr)).toBe(true);

    // STRUCTURAL assertion (reviewer finding): the condition-tree comparison
    // alone does not prove the `currency`/`capacityUnit` attributes the
    // condition references actually EXIST on the imported type — a prior
    // version emitted this exact condition text over a type with ZERO
    // attributes. Assert the attributes are real, matching the hand-written
    // expectation's own declared shape.
    expect(imported.model.types[0]!.attributes.map((a) => a.name).sort()).toEqual(['capacityUnit', 'currency']);
  });

  it('combined fixture: minimum + minLength + oneOf together produce three tree-equivalent conditions', async () => {
    const schema = {
      $id: 'https://example.com/schemas/combined.json',
      $defs: {
        Combined: {
          type: 'object',
          oneOf: [
            { type: 'object', properties: { currency: { type: 'string' } }, required: ['currency'] },
            { type: 'object', properties: { capacityUnit: { type: 'string' } }, required: ['capacityUnit'] }
          ],
          discriminator: { propertyName: 'unitType' },
          properties: {
            value: { type: 'integer', minimum: 0 },
            code: { type: 'string', minLength: 1 }
          },
          required: ['value', 'code']
        }
      }
    };
    const imported = await importModel(JSON.stringify(schema), { from: 'json-schema' });
    const parseResult = await parse(imported.text);
    expect(parseResult.hasErrors).toBe(false);

    const importedConds = await conditionsByName(imported.text);
    const expectedConds = await conditionsByName(
      'namespace test.expect\nversion "0.0.0"\n\ntype Combined:\n  currency string (0..1)\n  capacityUnit string (0..1)\n  value int (1..1)\n  code string (1..1)\n\n  condition OneOf:\n    required choice currency, capacityUnit\n\n  condition ValueRange:\n    value >= 0\n\n  condition CodeLength:\n    code count >= 1\n'
    );

    expect(Object.keys(importedConds).sort()).toEqual(Object.keys(expectedConds).sort());
    for (const name of Object.keys(expectedConds)) {
      expect(treesEquivalent(importedConds[name], expectedConds[name])).toBe(true);
    }

    // STRUCTURAL assertion (reviewer finding, same as the standalone oneOf
    // test above): confirm currency/capacityUnit are real attributes, not
    // just referenced by the condition text.
    expect(imported.model.types[0]!.attributes.map((a) => a.name).sort()).toEqual([
      'capacityUnit',
      'code',
      'currency',
      'value'
    ]);
  });

  it('pattern still emits a stub (True) even inside a fixture with other real conditions', async () => {
    const schema = {
      $id: 'https://example.com/schemas/withpattern.json',
      $defs: {
        WithPattern: {
          type: 'object',
          properties: {
            value: { type: 'integer', minimum: 0 },
            code: { type: 'string', pattern: '^[A-Z]{3}$' }
          },
          required: ['value', 'code']
        }
      }
    };
    const imported = await importModel(JSON.stringify(schema), { from: 'json-schema' });
    const parseResult = await parse(imported.text);
    expect(parseResult.hasErrors).toBe(false);

    const importedConds = await conditionsByName(imported.text);
    const stubExpected = await firstConditionExpr(
      'namespace test.expect\nversion "0.0.0"\n\ntype T:\n  x boolean (1..1)\n\n  condition Stub:\n    True\n'
    );
    expect(treesEquivalent(importedConds['CodePattern'], stubExpected)).toBe(true);
    expect(imported.diagnostics.some((d) => d.code === 'untranslatable-construct')).toBe(true);
  });
});
