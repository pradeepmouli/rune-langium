// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * sql-reader T1 — structural acceptance tests (spec 021 Phase 2c Addendum
 * item 3's structural rows + the User Story 3 acceptance scenarios carried
 * forward from spec.md's original draft): naming conversion (snake_case ->
 * PascalCase types / camelCase attributes), NOT NULL -> cardinality, FK ->
 * typed attribute, inheritance-FK convention -> extends, join-table
 * reconstruction.
 *
 * Parse-first: every test asserts the imported `.rune` text reparses with
 * zero errors (the inbound hard invariant) in addition to structural shape.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { renderModel } from '../../src/emit/rosetta/rosetta-render-core.js';
import { readSql } from '../../src/import/sources/sql-reader.js';
import { buildModel } from '../../src/import/ast-builder.js';

async function importToRune(
  sql: string,
  options?: { namespace?: string; dialect?: 'postgres' | 'sqlserver' }
): Promise<{ text: string; model: Awaited<ReturnType<typeof readSql>>['model']; diagnostics: unknown[] }> {
  const { model, diagnostics: readerDiagnostics } = await readSql(sql, { namespace: 'test.sql', ...options });
  const built = buildModel(model);
  const rendered = renderModel({ name: model.namespace, version: '0.0.0', elements: built.elements as never[] });
  const lines = rendered.split('\n');
  if (built.synonymSourceDeclaration) {
    const versionIdx = lines.findIndex((l) => l.startsWith('version '));
    lines.splice(versionIdx + 1, 0, '', built.synonymSourceDeclaration);
  }
  return { text: lines.join('\n'), model, diagnostics: [...readerDiagnostics, ...built.diagnostics] };
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

describe('sql-reader — naming: snake_case table -> PascalCase type, snake_case column -> camelCase attribute', () => {
  it('converts trade_event -> TradeEvent, party_id -> partyId, with synonyms recording the originals', async () => {
    const sql = `CREATE TABLE trade_event (
      id INT PRIMARY KEY,
      party_id INT NOT NULL,
      trade_date DATE
    )`;
    const { text, model } = await importToRune(sql);
    expect(model.types.map((t) => t.name)).toEqual(['TradeEvent']);
    const type = model.types[0]!;
    expect(type.sourceKey).toBe('trade_event');
    const partyId = type.attributes.find((a) => a.sourceKey === 'party_id')!;
    expect(partyId.name).toBe('partyId');
    expect(text).toContain('type TradeEvent:');
    expect(text).toContain('[synonym Sql value "trade_event"]');
    expect(text).toContain('[synonym Sql value "party_id"]');
    await assertParses(text);
  });
});

describe('sql-reader — acceptance scenario 1: NOT NULL / nullable -> cardinality', () => {
  it('NOT NULL columns get (1..1), nullable columns get (0..1)', async () => {
    const sql = `CREATE TABLE party (
      id INT PRIMARY KEY,
      party_name TEXT NOT NULL,
      nickname TEXT
    )`;
    const { text, model } = await importToRune(sql);
    const party = model.types.find((t) => t.name === 'Party')!;
    const name = party.attributes.find((a) => a.sourceKey === 'party_name')!;
    const nickname = party.attributes.find((a) => a.sourceKey === 'nickname')!;
    expect(name.cardinality).toEqual({ inf: 1, sup: 1 });
    expect(nickname.cardinality).toEqual({ inf: 0, sup: 1 });
    expect(text).toContain('partyName string (1..1)');
    expect(text).toContain('nickname string (0..1)');
    await assertParses(text);
  });
});

describe('sql-reader — column type mapping to Rune builtins', () => {
  it('maps INT/BIGINT->int, NUMERIC/DECIMAL->number, TEXT/VARCHAR->string, BOOLEAN->boolean, DATE->date, TIMESTAMP->dateTime', async () => {
    const sql = `CREATE TABLE t (
      id INT PRIMARY KEY,
      big_num BIGINT,
      amount NUMERIC,
      price DECIMAL,
      name TEXT,
      code VARCHAR(10),
      active BOOLEAN,
      as_of DATE,
      created_at TIMESTAMP
    )`;
    const { model } = await importToRune(sql);
    const t = model.types[0]!;
    const typeOf = (col: string) => t.attributes.find((a) => a.sourceKey === col)!.typeName;
    expect(typeOf('big_num')).toBe('int');
    expect(typeOf('amount')).toBe('number');
    expect(typeOf('price')).toBe('number');
    expect(typeOf('name')).toBe('string');
    expect(typeOf('code')).toBe('string');
    expect(typeOf('active')).toBe('boolean');
    expect(typeOf('as_of')).toBe('date');
    expect(typeOf('created_at')).toBe('dateTime');
  });
});

describe('sql-reader — acceptance scenario 3: FOREIGN KEY -> referenced Rune type', () => {
  it('a scalar FK column becomes an attribute typed as the referenced type', async () => {
    const sql = `CREATE TABLE party (id INT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE trade (
  id INT PRIMARY KEY,
  party_id INT NOT NULL,
  FOREIGN KEY (party_id) REFERENCES party(id)
)`;
    const { text, model } = await importToRune(sql);
    const trade = model.types.find((t) => t.name === 'Trade')!;
    const partyAttr = trade.attributes.find((a) => a.sourceKey === 'party_id')!;
    expect(partyAttr.typeName).toBe('Party');
    expect(partyAttr.name).toBe('party');
    expect(text).toContain('party Party (1..1)');
    await assertParses(text);
  });
});

describe('sql-reader — inheritance-FK convention -> extends', () => {
  it('FOREIGN KEY (id) REFERENCES Parent(id) is recognized as inheritance, not a typed attribute', async () => {
    const sql = `CREATE TABLE party (id INT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE employee (
  id INT PRIMARY KEY,
  title TEXT,
  FOREIGN KEY (id) REFERENCES party(id)
)`;
    const { text, model } = await importToRune(sql);
    const employee = model.types.find((t) => t.name === 'Employee')!;
    expect(employee.extends).toBe('Party');
    // The shared-identity FK column must NOT also appear as a regular attribute.
    expect(employee.attributes.some((a) => a.sourceKey === 'id')).toBe(false);
    expect(text).toContain('type Employee extends Party:');
    await assertParses(text);
  });
});

describe('sql-reader — join table -> multi-valued attribute', () => {
  it('a {parent}_{attr} join table with parent FK + element FK becomes a (0..*) attribute', async () => {
    const sql = `CREATE TABLE party (id INT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE trade (id INT PRIMARY KEY, name TEXT);
CREATE TABLE trade_party (
  trade_id INT NOT NULL,
  party_id INT NOT NULL,
  FOREIGN KEY (trade_id) REFERENCES trade(id),
  FOREIGN KEY (party_id) REFERENCES party(id)
)`;
    const { text, model } = await importToRune(sql);
    // The join table itself must NOT be emitted as its own Rune type.
    expect(model.types.map((t) => t.name)).not.toContain('TradeParty');
    const trade = model.types.find((t) => t.name === 'Trade')!;
    const partyAttr = trade.attributes.find((a) => a.name === 'party')!;
    expect(partyAttr.typeName).toBe('Party');
    expect(partyAttr.cardinality).toEqual({ inf: 0 });
    expect(text).toContain('party Party (0..*)');
    await assertParses(text);
  });

  it('a join table with a position column still reduces to a (0..*) attribute (order is not modeled)', async () => {
    const sql = `CREATE TABLE party (id INT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE trade (id INT PRIMARY KEY, name TEXT);
CREATE TABLE trade_party (
  trade_id INT NOT NULL,
  party_id INT NOT NULL,
  position INT,
  FOREIGN KEY (trade_id) REFERENCES trade(id),
  FOREIGN KEY (party_id) REFERENCES party(id)
)`;
    const { model } = await importToRune(sql);
    const trade = model.types.find((t) => t.name === 'Trade')!;
    const partyAttr = trade.attributes.find((a) => a.name === 'party')!;
    expect(partyAttr.cardinality).toEqual({ inf: 0 });
  });
});

describe('sql-reader — enum-ish CHECK values -> safe enum member names', () => {
  it('CHECK (col IN (...)) becomes a Rune enum with the attribute retyped to it', async () => {
    const sql = `CREATE TABLE trade (
      id INT PRIMARY KEY,
      status TEXT CHECK (status IN ('NEW', 'DONE'))
    )`;
    const { text, model } = await importToRune(sql);
    expect(model.enums).toHaveLength(1);
    const statusEnum = model.enums[0]!;
    expect(statusEnum.values.map((v) => v.name).sort()).toEqual(['DONE', 'NEW']);
    const trade = model.types.find((t) => t.name === 'Trade')!;
    const statusAttr = trade.attributes.find((a) => a.sourceKey === 'status')!;
    expect(statusAttr.typeName).toBe(statusEnum.name);
    await assertParses(text);
  });

  it('sanitizes non-identifier-safe CHECK values and retains the original via synonym', async () => {
    const sql = `CREATE TABLE t (
      day_count TEXT CHECK (day_count IN ('ACT/360', 'ACT/365'))
    )`;
    const { text, model } = await importToRune(sql);
    const dayCountEnum = model.enums[0]!;
    const act360 = dayCountEnum.values.find((v) => v.sourceKey === 'ACT/360')!;
    expect(act360.name).toBe('ACT_360');
    expect(text).toContain('[synonym Sql value "ACT/360"]');
    await assertParses(text);
  });
});

describe('sql-reader — normalizeGeneratedIdentity (GENERATED BY DEFAULT AS IDENTITY tolerance)', () => {
  it('a column using GENERATED BY DEFAULT AS IDENTITY imports cleanly (no sql-parse-error)', async () => {
    const sql = `CREATE TABLE t (id INT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, name TEXT)`;
    const { text, diagnostics } = await importToRune(sql);
    const codes = (diagnostics as Array<{ code: string }>).map((d) => d.code);
    expect(codes).not.toContain('sql-parse-error');
    await assertParses(text);
  });

  it('a DEFAULT string value containing the literal phrase is safely (if incidentally) rewritten by the regex, but has NO observable effect on the imported model — DEFAULT clause values are always discarded, never round-tripped', async () => {
    // The regex scopes to a single isolated column/constraint item's text
    // (`normalizeGeneratedIdentity`'s doc), so a DEFAULT string literal that
    // happens to contain this exact phrase would also get rewritten before
    // parsing. This is documented as safe-as-scoped rather than fixed
    // (quote-awareness is out of scope) because DEFAULT values are always
    // dropped wholesale — only a `sql-default-note` diagnostic fires, and
    // the value itself never appears in the imported model or output text.
    const sql = `CREATE TABLE t (id INT PRIMARY KEY, note TEXT DEFAULT 'GENERATED BY DEFAULT AS IDENTITY')`;
    const { text, model, diagnostics } = await importToRune(sql);
    const codes = (diagnostics as Array<{ code: string; severity: string }>).map((d) => d.code);
    expect(codes).toContain('sql-default-note');
    expect(codes).not.toContain('sql-parse-error');
    const t = model.types[0]!;
    const noteAttr = t.attributes.find((a) => a.sourceKey === 'note')!;
    expect(noteAttr.constraints).toEqual([]);
    expect(text).not.toContain('GENERATED');
    await assertParses(text);
  });
});
