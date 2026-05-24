// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { Parser } from 'node-sql-parser';
import { generate } from '../src/index.js';

async function gen(source: string, sql: Record<string, unknown> = {}) {
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(source, URI.parse('inmemory:///t.rosetta'));
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc], { validation: false });
  return generate(doc, { target: 'sql', sql });
}
/**
 * Parsing throws on invalid DDL — a structural validity assertion with no DB.
 *
 * `node-sql-parser` v5 does not yet support the SQL:2003 `GENERATED ALWAYS AS
 * IDENTITY` clause for PostgreSQL. We normalise that clause to `BIGSERIAL`
 * (semantically equivalent in Postgres) so the parser can validate the rest
 * of the DDL structure without false-failing on a known parser gap.
 */
function assertParses(ddl: string, database: 'postgresql' | 'transactsql' = 'postgresql') {
  const normalised =
    database === 'postgresql'
      ? ddl.replace(/BIGINT GENERATED ALWAYS AS IDENTITY/g, 'BIGSERIAL')
      : ddl;
  new Parser().astify(normalised, { database });
}

describe('SqlNamespaceEmitter — scalar columns + enums', () => {
  it('emits a CREATE TABLE with a surrogate PK and typed columns; NOT NULL from cardinality', async () => {
    const out = await gen(`namespace test.basic

type Quantity:
  amount number (1..1)
  currency string (0..1)
`);
    expect(out).toHaveLength(1);
    expect(out[0]!.relativePath).toBe('test/basic.sql');
    const ddl = out[0]!.content;
    assertParses(ddl);
    expect(ddl).toContain('CREATE TABLE "Quantity"');
    expect(ddl).toMatch(/"id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY/);
    expect(ddl).toMatch(/"amount" NUMERIC NOT NULL/);
    expect(ddl).toMatch(/"currency" TEXT(?! NOT NULL)/); // (0..1) → nullable
    expect(out[0]!.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('emits an enum column with a CHECK constraint (enumStrategy default "check")', async () => {
    const out = await gen(`namespace test.enums

enum Color:
  Red
  Green

type Paint:
  color Color (1..1)
`);
    const ddl = out[0]!.content;
    assertParses(ddl);
    expect(ddl).toMatch(/"color" TEXT NOT NULL/);
    expect(ddl).toMatch(/CHECK\s*\(\s*"color" IN \('Red', 'Green'\)\s*\)/);
  });

  it('renders SQL Server dialect with [brackets] + BIT/NVARCHAR + IDENTITY', async () => {
    const out = await gen(`namespace test.basic

type Flag:
  on boolean (1..1)
  description string (1..1)
`, { dialect: 'sqlserver' });
    const ddl = out[0]!.content;
    assertParses(ddl, 'transactsql');
    expect(ddl).toContain('CREATE TABLE [Flag]');
    expect(ddl).toMatch(/\[id\] BIGINT IDENTITY\(1,1\) PRIMARY KEY/);
    expect(ddl).toMatch(/\[on\] BIT NOT NULL/);
    expect(ddl).toMatch(/\[description\] NVARCHAR\(MAX\) NOT NULL/);
  });
});
