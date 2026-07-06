// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * sql-reader T3 — dialect matrix (spec 021 Phase 2c Addendum item 4):
 * postgres + sqlserver DDL, matching the outbound emitter's own
 * `SqlDialectName` surface. Quoted identifiers, `NVARCHAR`, dialect-specific
 * length functions (`char_length` vs. `LEN`), and the documented,
 * non-blocking grammar tolerance limits (bracket-quoted identifiers,
 * `NVARCHAR(MAX)`, `GO` batch separators — see `sql-grammar-loader.test.ts`
 * / `.superpowers/sdd/sql-reader-report.md`'s T0 spike).
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { renderModel } from '../../src/emit/rosetta/rosetta-render-core.js';
import { readSql } from '../../src/import/sources/sql-reader.js';
import { buildModel } from '../../src/import/ast-builder.js';

async function importToRune(
  sql: string,
  dialect: 'postgres' | 'sqlserver'
): Promise<{ text: string; model: Awaited<ReturnType<typeof readSql>>['model'] }> {
  const { model } = await readSql(sql, { namespace: 'test.sql.dialect', dialect });
  const built = buildModel(model);
  const rendered = renderModel({ name: model.namespace, version: '0.0.0', elements: built.elements as never[] });
  const lines = rendered.split('\n');
  if (built.synonymSourceDeclaration) {
    const versionIdx = lines.findIndex((l) => l.startsWith('version '));
    lines.splice(versionIdx + 1, 0, '', built.synonymSourceDeclaration);
  }
  return { text: lines.join('\n'), model };
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

describe('sql-reader dialect matrix — postgres', () => {
  it('double-quoted identifiers import cleanly', async () => {
    const { text, model } = await importToRune(
      `CREATE TABLE "TradeEvent" ("Id" INT PRIMARY KEY, "PartyName" TEXT NOT NULL)`,
      'postgres'
    );
    expect(model.types.map((t) => t.name)).toEqual(['TradeEvent']);
    const t = model.types[0]!;
    expect(t.attributes.some((a) => a.sourceKey === 'PartyName')).toBe(true);
    await assertParses(text);
  });

  it('SERIAL primary key + NUMERIC(p,s) precision import cleanly', async () => {
    const { text, model } = await importToRune(
      `CREATE TABLE t (id SERIAL PRIMARY KEY, amount NUMERIC(18,4) NOT NULL)`,
      'postgres'
    );
    const t = model.types[0]!;
    expect(t.attributes.find((a) => a.sourceKey === 'amount')!.typeName).toBe('number');
    await assertParses(text);
  });

  it('unquoted schema-qualified table names drop the schema segment', async () => {
    const { model } = await importToRune(`CREATE TABLE public.trade_event (id INT PRIMARY KEY)`, 'postgres');
    expect(model.types.map((t) => t.name)).toEqual(['TradeEvent']);
  });

  it('char_length(col) >= n (the postgres-idiomatic length function) translates to a length condition', async () => {
    const { text } = await importToRune(`CREATE TABLE t (code TEXT CHECK (char_length(code) >= 3))`, 'postgres');
    expect(text).toContain('condition CodeLength:');
    expect(text).toContain('code count >= 3');
    await assertParses(text);
  });
});

describe('sql-reader dialect matrix — sqlserver', () => {
  it('NVARCHAR(n) + DECIMAL(p,s) import cleanly', async () => {
    const { text, model } = await importToRune(
      `CREATE TABLE t (id INT PRIMARY KEY, name NVARCHAR(100) NOT NULL, amount DECIMAL(18,4))`,
      'sqlserver'
    );
    const t = model.types[0]!;
    expect(t.attributes.find((a) => a.sourceKey === 'name')!.typeName).toBe('string');
    expect(t.attributes.find((a) => a.sourceKey === 'amount')!.typeName).toBe('number');
    await assertParses(text);
  });

  it('NVARCHAR(n) also produces a length condition, same as VARCHAR(n)', async () => {
    const { text } = await importToRune(`CREATE TABLE t (name NVARCHAR(50))`, 'sqlserver');
    expect(text).toContain('condition NameLength:');
    expect(text).toContain('name count <= 50');
    await assertParses(text);
  });

  it('LEN(col) >= n (the sqlserver-idiomatic length function) translates to a length condition', async () => {
    const { text } = await importToRune(`CREATE TABLE t (code TEXT CHECK (LEN(code) >= 3))`, 'sqlserver');
    expect(text).toContain('condition CodeLength:');
    expect(text).toContain('code count >= 3');
    await assertParses(text);
  });

  it('double-quoted identifiers (the sqlserver-tolerated alternative to bracket-quoting) import cleanly', async () => {
    const { text, model } = await importToRune(
      `CREATE TABLE "TradeEvent" ("Id" INT PRIMARY KEY, "Status" NVARCHAR(20))`,
      'sqlserver'
    );
    expect(model.types.map((t) => t.name)).toEqual(['TradeEvent']);
    await assertParses(text);
  });
});

describe('sql-reader dialect matrix — documented, non-blocking grammar tolerance limits (T0 spike findings)', () => {
  it('DOCUMENTED LIMITATION: bracket-quoted identifiers ([dbo].[Table]) are not tolerated by the grammar — surfaced as a sql-parse-error diagnostic, never silently dropped', async () => {
    const { diagnostics } = await readSql(`CREATE TABLE [dbo].[TradeEvent] ([Id] INT PRIMARY KEY)`, {
      namespace: 'test.sql.dialect',
      dialect: 'sqlserver'
    });
    expect(diagnostics.some((d) => d.code === 'sql-parse-error')).toBe(true);
  });

  it('DOCUMENTED LIMITATION: NVARCHAR(MAX) is not tolerated — surfaced as a sql-parse-error diagnostic; use a concrete size instead', async () => {
    const { diagnostics } = await readSql(`CREATE TABLE t (name NVARCHAR(MAX))`, {
      namespace: 'test.sql.dialect',
      dialect: 'sqlserver'
    });
    expect(diagnostics.some((d) => d.code === 'sql-parse-error')).toBe(true);
  });
});
