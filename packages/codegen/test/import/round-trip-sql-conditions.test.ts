// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * SQL constraint round-trip oracle (spec 021 Phase 2c Addendum item 5,
 * split-oracle per the Phase 1 precedent): a hand-written DDL fixture (the
 * outbound emitter never emits comparison CHECKs, so it cannot serve as
 * this half's oracle — see `round-trip-sql-structural.test.ts`'s own split-
 * oracle framing) imported and tree-compared, via `treesEquivalent`, against
 * a hand-written `.rune` expectation — mirroring `round-trip-conditions.
 * test.ts`'s established JSON Schema pattern exactly.
 *
 * A single, realistically-shaped hand-written DDL script (multiple tables,
 * multiple constraint kinds per table) rather than one-constraint-per-test
 * snippets — T2's `sql-reader-constraints.test.ts` already covers the
 * exhaustive per-construct matrix; this file's job is the ORACLE comparison
 * against a hand-written `.rune` file, which is what this task specifically
 * calls for.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { treesEquivalent } from '../emit/rosetta/expression-tree-equivalence.js';
import { renderModel } from '../../src/emit/rosetta/rosetta-render-core.js';
import { readSql } from '../../src/import/sources/sql-reader.js';
import { buildModel } from '../../src/import/ast-builder.js';

const HAND_WRITTEN_DDL = `
CREATE TABLE trade_event (
  id INT PRIMARY KEY,
  notional NUMERIC NOT NULL CHECK (notional >= 0),
  quantity INT CHECK (quantity BETWEEN 1 AND 1000),
  code VARCHAR(10) NOT NULL,
  status TEXT CHECK (status IN ('NEW', 'DONE')),
  party_id INT NOT NULL,
  FOREIGN KEY (party_id) REFERENCES party(id),
  CHECK (char_length(code) >= 3)
);

CREATE TABLE party (
  id INT PRIMARY KEY,
  party_name TEXT NOT NULL
);
`;

const HAND_WRITTEN_RUNE_EXPECTATION = `namespace test.expect
version "0.0.0"

type TradeEvent:
  notional number (1..1)
  quantity int (0..1)
  code string (1..1)
  status StatusEnum (0..1)
  party Party (1..1)

  condition NotionalRange:
    notional >= 0

  condition QuantityRange:
    quantity >= 1 and quantity <= 1000

  condition CodeLength:
    code count >= 3

  condition CodeLength2:
    code count <= 10

enum StatusEnum:
  NEW
  DONE

type Party:
  partyName string (1..1)
`;

type DataLike = { $type: string; name?: string; conditions?: Array<{ name?: string; expression: unknown }> };

function dataByName(elements: readonly unknown[], name: string): DataLike {
  const data = elements.find((e) => (e as DataLike).$type === 'Data' && (e as DataLike).name === name) as
    | DataLike
    | undefined;
  expect(data).toBeDefined();
  return data!;
}

async function conditionsByName(source: string, typeName: string): Promise<Record<string, unknown>> {
  const result = await parse(source);
  expect(result.hasErrors).toBe(false);
  const data = dataByName(result.value.elements, typeName);
  const out: Record<string, unknown> = {};
  for (const c of data.conditions ?? []) {
    if (c.name) out[c.name] = c.expression;
  }
  return out;
}

describe('round-trip (SQL constraint half) — hand-written DDL -> inbound -> .rune, tree-equivalence vs. hand-written .rune', () => {
  it('recovers every CHECK constraint as a tree-equivalent condition against the hand-written expectation', async () => {
    const { model, diagnostics: readerDiagnostics } = await readSql(HAND_WRITTEN_DDL, { namespace: 'test.expect' });
    const built = buildModel(model);
    const rendered = renderModel({ name: model.namespace, version: '0.0.0', elements: built.elements as never[] });
    const lines = rendered.split('\n');
    if (built.synonymSourceDeclaration) {
      const versionIdx = lines.findIndex((l) => l.startsWith('version '));
      lines.splice(versionIdx + 1, 0, '', built.synonymSourceDeclaration);
    }
    const text = lines.join('\n');

    const parseResult = await parse(text);
    expect(parseResult.hasErrors).toBe(false);

    const importedConds = await conditionsByName(text, 'TradeEvent');
    const expectedConds = await conditionsByName(HAND_WRITTEN_RUNE_EXPECTATION, 'TradeEvent');

    expect(Object.keys(importedConds).sort()).toEqual(Object.keys(expectedConds).sort());
    for (const name of Object.keys(expectedConds)) {
      expect(treesEquivalent(importedConds[name], expectedConds[name])).toBe(true);
    }

    // Structural assertions (the OTHER half of what this fixture proves):
    // the enum + reference-FK + inline-VARCHAR-length shapes all recovered
    // correctly alongside the conditions.
    expect(model.enums).toHaveLength(1);
    expect(model.enums[0]!.values.map((v) => v.name).sort()).toEqual(['DONE', 'NEW']);
    const tradeEvent = model.types.find((t) => t.name === 'TradeEvent')!;
    const partyAttr = tradeEvent.attributes.find((a) => a.sourceKey === 'party_id')!;
    expect(partyAttr.typeName).toBe('Party');
    const codeAttr = tradeEvent.attributes.find((a) => a.sourceKey === 'code')!;
    // VARCHAR(10) contributes an ADDITIONAL length condition alongside the
    // table-level char_length(code) >= 3 CHECK — both attach to the same
    // attribute, verifying the multi-constraint-column case at the ORACLE
    // level too (T2's own test already covers this in isolation).
    expect(codeAttr.constraints).toEqual(expect.arrayContaining([{ kind: 'length', path: 'code', max: 10 }]));

    // Both tables' PRIMARY KEY columns here are the surrogate `id`
    // convention, which is intentionally consumed silently (no diagnostic
    // — see sql-reader-constraints.test.ts's PRIMARY-KEY-note test and its
    // own doc comment) — this fixture legitimately produces zero
    // warning/error diagnostics, which is itself part of what the oracle
    // proves (a clean hand-authored script imports without noise).
    expect(readerDiagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
  });

  it('recovers the Party type structurally (the FK target)', async () => {
    const { model } = await readSql(HAND_WRITTEN_DDL, { namespace: 'test.expect' });
    const party = model.types.find((t) => t.name === 'Party')!;
    expect(party.attributes.find((a) => a.sourceKey === 'party_name')!.cardinality).toEqual({ inf: 1, sup: 1 });
  });
});
