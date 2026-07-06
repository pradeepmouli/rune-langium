// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * sql-reader T2 — constraint-gap closure (spec 021 Phase 2c Addendum item
 * 3's full constraint-gap table): every addendum row exercised end to end
 * through `readSql` -> `buildModel` -> `.rune` text, with tree-equivalence
 * against a hand-written `.rune` expectation for every condition-producing
 * row (mirrors `round-trip-conditions.test.ts`'s established pattern), plus
 * the multi-constraint column and table-level CHECK cases the addendum
 * calls out explicitly.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { treesEquivalent } from '../emit/rosetta/expression-tree-equivalence.js';
import { renderModel } from '../../src/emit/rosetta/rosetta-render-core.js';
import { readSql } from '../../src/import/sources/sql-reader.js';
import { buildModel } from '../../src/import/ast-builder.js';

type DataLike = { $type: string; conditions?: Array<{ name?: string; expression: unknown }> };

function firstDataElement(elements: readonly unknown[]): DataLike {
  const data = elements.find((e) => (e as DataLike).$type === 'Data') as DataLike | undefined;
  expect(data).toBeDefined();
  return data!;
}

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

async function importToRune(
  sql: string,
  options?: { dialect?: 'postgres' | 'sqlserver' }
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

describe('sql-reader constraints — CHECK (col >= n) and every comparison operator', () => {
  it('>= -> range { min }', async () => {
    const { text } = await importToRune(`CREATE TABLE t (notional NUMERIC CHECK (notional >= 0))`);
    const imported = await conditionsByName(text);
    const expected = await conditionsByName(
      'namespace test.expect\nversion "0.0.0"\n\ntype T:\n  notional number (0..1)\n\n  condition NotionalRange:\n    notional >= 0\n'
    );
    expect(treesEquivalent(Object.values(imported)[0], Object.values(expected)[0])).toBe(true);
    await assertParses(text);
  });

  it('<= -> range { max }', async () => {
    const { text } = await importToRune(`CREATE TABLE t (age INT CHECK (age <= 150))`);
    const imported = await conditionsByName(text);
    const expected = await conditionsByName(
      'namespace test.expect\nversion "0.0.0"\n\ntype T:\n  age int (0..1)\n\n  condition AgeRange:\n    age <= 150\n'
    );
    expect(treesEquivalent(Object.values(imported)[0], Object.values(expected)[0])).toBe(true);
  });

  it('> -> range { min, exclusive }', async () => {
    const { text } = await importToRune(`CREATE TABLE t (age INT CHECK (age > 0))`);
    const imported = await conditionsByName(text);
    const expected = await conditionsByName(
      'namespace test.expect\nversion "0.0.0"\n\ntype T:\n  age int (0..1)\n\n  condition AgeRange:\n    age > 0\n'
    );
    expect(treesEquivalent(Object.values(imported)[0], Object.values(expected)[0])).toBe(true);
  });

  it('< -> range { max, exclusive }', async () => {
    const { text } = await importToRune(`CREATE TABLE t (age INT CHECK (age < 150))`);
    const imported = await conditionsByName(text);
    const expected = await conditionsByName(
      'namespace test.expect\nversion "0.0.0"\n\ntype T:\n  age int (0..1)\n\n  condition AgeRange:\n    age < 150\n'
    );
    expect(treesEquivalent(Object.values(imported)[0], Object.values(expected)[0])).toBe(true);
  });

  it('= -> comparison', async () => {
    const { text } = await importToRune(`CREATE TABLE t (status TEXT CHECK (status = 'ACTIVE'))`);
    const imported = await conditionsByName(text);
    const expected = await conditionsByName(
      'namespace test.expect\nversion "0.0.0"\n\ntype T:\n  status string (0..1)\n\n  condition StatusCheck:\n    status = "ACTIVE"\n'
    );
    expect(treesEquivalent(Object.values(imported)[0], Object.values(expected)[0])).toBe(true);
    await assertParses(text);
  });

  it('<> -> comparison', async () => {
    const { text } = await importToRune(`CREATE TABLE t (status TEXT CHECK (status <> 'INACTIVE'))`);
    const imported = await conditionsByName(text);
    const expected = await conditionsByName(
      'namespace test.expect\nversion "0.0.0"\n\ntype T:\n  status string (0..1)\n\n  condition StatusCheck:\n    status <> "INACTIVE"\n'
    );
    expect(treesEquivalent(Object.values(imported)[0], Object.values(expected)[0])).toBe(true);
  });

  it('a literal-on-the-left comparison (n >= col) is normalized to column OP value', async () => {
    const { text } = await importToRune(`CREATE TABLE t (age INT CHECK (0 <= age))`);
    const imported = await conditionsByName(text);
    const expected = await conditionsByName(
      'namespace test.expect\nversion "0.0.0"\n\ntype T:\n  age int (0..1)\n\n  condition AgeRange:\n    age >= 0\n'
    );
    expect(treesEquivalent(Object.values(imported)[0], Object.values(expected)[0])).toBe(true);
  });
});

describe('sql-reader constraints — CHECK (col BETWEEN a AND b) -> range (inclusive both bounds)', () => {
  it('BETWEEN -> range { min, max }, both inclusive', async () => {
    const { text } = await importToRune(`CREATE TABLE t (age INT CHECK (age BETWEEN 0 AND 150))`);
    const imported = await conditionsByName(text);
    const expected = await conditionsByName(
      'namespace test.expect\nversion "0.0.0"\n\ntype T:\n  age int (0..1)\n\n  condition AgeRange:\n    age >= 0 and age <= 150\n'
    );
    expect(treesEquivalent(Object.values(imported)[0], Object.values(expected)[0])).toBe(true);
    await assertParses(text);
  });

  it('BETWEEN followed by another column with its own CHECK (the T0 spike ERROR-node-recovery case)', async () => {
    const { text, model, diagnostics } = await importToRune(
      `CREATE TABLE t (age INT CHECK (age BETWEEN 0 AND 150), code TEXT CHECK (code LIKE 'A%'))`
    );
    const t = model.types[0]!;
    const ageAttr = t.attributes.find((a) => a.sourceKey === 'age')!;
    const codeAttr = t.attributes.find((a) => a.sourceKey === 'code')!;
    expect(ageAttr.constraints).toEqual([{ kind: 'range', path: 'age', min: 0, max: 150 }]);
    expect(codeAttr.constraints).toEqual([{ kind: 'pattern', path: 'code', regex: 'A%' }]);
    // The fully-recovered ERROR-sibling shape (`parseIsolatedItem`'s doc)
    // must NOT itself surface a spurious sql-parse-error diagnostic.
    expect((diagnostics as Array<{ code: string }>).filter((d) => d.code === 'sql-parse-error')).toEqual([]);
    await assertParses(text);
  });
});

describe('sql-reader constraints — quoted-identifier regression coverage (operandColumnName / isQuotedIdentifierLiteral)', () => {
  it('a CHECK using BETWEEN on a quoted column resolves the real column, not a custom stub', async () => {
    const { text, model } = await importToRune(
      `CREATE TABLE t ("order_amount" NUMERIC(10,2) CHECK ("order_amount" BETWEEN 0 AND 10000))`
    );
    const t = model.types[0]!;
    const attr = t.attributes.find((a) => a.sourceKey === 'order_amount')!;
    expect(attr.constraints).toEqual([{ kind: 'range', path: 'order_amount', min: 0, max: 10000 }]);
    await assertParses(text);
  });

  it('a CHECK using LIKE on a quoted column resolves the column (not the pattern value) as the referenced attribute', async () => {
    const { text, model } = await importToRune(`CREATE TABLE t ("product_code" TEXT CHECK ("product_code" LIKE 'A%'))`);
    const t = model.types[0]!;
    const attr = t.attributes.find((a) => a.sourceKey === 'product_code')!;
    expect(attr.constraints).toEqual([{ kind: 'pattern', path: 'product_code', regex: 'A%' }]);
    await assertParses(text);
  });

  it('a plain comparison CHECK on a quoted column translates to range, not a custom fallback', async () => {
    const { text, model } = await importToRune(`CREATE TABLE t ("quantity" INT CHECK ("quantity" > 0))`);
    const t = model.types[0]!;
    const attr = t.attributes.find((a) => a.sourceKey === 'quantity')!;
    expect(attr.constraints).toEqual([{ kind: 'range', path: 'quantity', min: 0, exclusive: true }]);
    await assertParses(text);
  });

  it('a char_length CHECK on a quoted column (postgres) resolves the correct attribute for the length constraint', async () => {
    const { text, model } = await importToRune(
      `CREATE TABLE t ("description" VARCHAR(200) CHECK (char_length("description") <= 200))`
    );
    const t = model.types[0]!;
    const attr = t.attributes.find((a) => a.sourceKey === 'description')!;
    expect(attr.constraints).toEqual(expect.arrayContaining([{ kind: 'length', path: 'description', max: 200 }]));
    await assertParses(text);
  });

  it('a LEN CHECK on a quoted column (sqlserver) resolves the correct attribute for the length constraint', async () => {
    const { text, model } = await importToRune(
      `CREATE TABLE t ("description" VARCHAR(200) CHECK (LEN("description") <= 200))`,
      { dialect: 'sqlserver' }
    );
    const t = model.types[0]!;
    const attr = t.attributes.find((a) => a.sourceKey === 'description')!;
    expect(attr.constraints).toEqual(expect.arrayContaining([{ kind: 'length', path: 'description', max: 200 }]));
    await assertParses(text);
  });
});

describe('sql-reader constraints — CHECK (col IN (...)) -> enum + retype (not a condition)', () => {
  it('produces zero conditions for the enum-defining column', async () => {
    const { model } = await importToRune(`CREATE TABLE t (status TEXT CHECK (status IN ('NEW','DONE')))`);
    const t = model.types[0]!;
    const statusAttr = t.attributes.find((a) => a.sourceKey === 'status')!;
    expect(statusAttr.constraints).toEqual([]);
    expect(model.enums).toHaveLength(1);
  });
});

describe('sql-reader constraints — VARCHAR(n)/CHAR(n)/NVARCHAR(n) -> length { max: n }', () => {
  it('VARCHAR(n) -> length max', async () => {
    const { text } = await importToRune(`CREATE TABLE t (code VARCHAR(10))`);
    const imported = await conditionsByName(text);
    const expected = await conditionsByName(
      'namespace test.expect\nversion "0.0.0"\n\ntype T:\n  code string (0..1)\n\n  condition CodeLength:\n    code count <= 10\n'
    );
    expect(treesEquivalent(Object.values(imported)[0], Object.values(expected)[0])).toBe(true);
    await assertParses(text);
  });

  it('CHAR(n) -> length max', async () => {
    const { text } = await importToRune(`CREATE TABLE t (code CHAR(5))`);
    const imported = await conditionsByName(text);
    const expected = await conditionsByName(
      'namespace test.expect\nversion "0.0.0"\n\ntype T:\n  code string (0..1)\n\n  condition CodeLength:\n    code count <= 5\n'
    );
    expect(treesEquivalent(Object.values(imported)[0], Object.values(expected)[0])).toBe(true);
  });

  it('NVARCHAR(n) -> length max', async () => {
    const { text } = await importToRune(`CREATE TABLE t (name NVARCHAR(50))`, { dialect: 'sqlserver' });
    const imported = await conditionsByName(text);
    const expected = await conditionsByName(
      'namespace test.expect\nversion "0.0.0"\n\ntype T:\n  name string (0..1)\n\n  condition NameLength:\n    name count <= 50\n'
    );
    expect(treesEquivalent(Object.values(imported)[0], Object.values(expected)[0])).toBe(true);
    await assertParses(text);
  });
});

describe('sql-reader constraints — char_length(col) >= n / LEN(col) >= n (dialect fns) -> length', () => {
  it('char_length(col) >= n -> length min (postgres)', async () => {
    const { text } = await importToRune(`CREATE TABLE t (name TEXT CHECK (char_length(name) >= 1))`);
    const imported = await conditionsByName(text);
    const expected = await conditionsByName(
      'namespace test.expect\nversion "0.0.0"\n\ntype T:\n  name string (0..1)\n\n  condition NameLength:\n    name count >= 1\n'
    );
    expect(treesEquivalent(Object.values(imported)[0], Object.values(expected)[0])).toBe(true);
    await assertParses(text);
  });

  it('LEN(col) >= n -> length min (sqlserver)', async () => {
    const { text } = await importToRune(`CREATE TABLE t (name TEXT CHECK (LEN(name) >= 1))`, {
      dialect: 'sqlserver'
    });
    const imported = await conditionsByName(text);
    const expected = await conditionsByName(
      'namespace test.expect\nversion "0.0.0"\n\ntype T:\n  name string (0..1)\n\n  condition NameLength:\n    name count >= 1\n'
    );
    expect(treesEquivalent(Object.values(imported)[0], Object.values(expected)[0])).toBe(true);
    await assertParses(text);
  });
});

describe('sql-reader constraints — CHECK (col LIKE ...) -> pattern -> stub + diagnostic', () => {
  it('emits a stub condition + an untranslatable-construct diagnostic', async () => {
    const { text, diagnostics } = await importToRune(`CREATE TABLE t (code TEXT CHECK (code LIKE 'A%'))`);
    const untranslatable = (diagnostics as Array<{ code: string }>).filter(
      (d) => d.code === 'untranslatable-construct'
    );
    expect(untranslatable.length).toBeGreaterThanOrEqual(1);
    expect(text).toContain('TODO: manual translation required');
    await assertParses(text);
  });
});

describe('sql-reader constraints — FOREIGN KEY -> typed attribute; inheritance-FK -> extends', () => {
  it('a non-identity FK -> a typed attribute referencing the other type', async () => {
    const sql = `CREATE TABLE party (id INT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE trade (id INT PRIMARY KEY, party_id INT NOT NULL, FOREIGN KEY (party_id) REFERENCES party(id))`;
    const { model } = await importToRune(sql);
    const trade = model.types.find((t) => t.name === 'Trade')!;
    expect(trade.attributes.find((a) => a.sourceKey === 'party_id')!.typeName).toBe('Party');
  });

  it('FOREIGN KEY (id) REFERENCES Parent(id) -> extends, not a typed attribute', async () => {
    const sql = `CREATE TABLE party (id INT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE employee (id INT PRIMARY KEY, title TEXT, FOREIGN KEY (id) REFERENCES party(id))`;
    const { model } = await importToRune(sql);
    const employee = model.types.find((t) => t.name === 'Employee')!;
    expect(employee.extends).toBe('Party');
    expect(employee.attributes.some((a) => a.sourceKey === 'id')).toBe(false);
  });
});

describe('sql-reader constraints — PRIMARY KEY / UNIQUE / DEFAULT -> diagnostics-level notes, never silently dropped', () => {
  it('emits an info diagnostic for each, without producing a condition', async () => {
    // A natural-key (non-surrogate) PRIMARY KEY column — the synthesized
    // surrogate `id` PK (the outbound emitter's own convention, read in
    // reverse) is INTENTIONALLY consumed silently with no PK diagnostic
    // (it has no domain meaning to note); this test exercises the general
    // "any other PRIMARY KEY column has no Rune equivalent" rule instead.
    const { model, diagnostics } = await importToRune(
      `CREATE TABLE t (code TEXT PRIMARY KEY, name TEXT UNIQUE, status TEXT DEFAULT 'ACTIVE')`
    );
    const codes = (diagnostics as Array<{ code: string; severity: string }>).map((d) => d.code);
    expect(codes).toContain('sql-primary-key-note');
    expect(codes).toContain('sql-unique-note');
    expect(codes).toContain('sql-default-note');
    const t = model.types[0]!;
    expect(t.attributes.find((a) => a.sourceKey === 'name')!.constraints).toEqual([]);
    expect(t.attributes.find((a) => a.sourceKey === 'status')!.constraints).toEqual([]);
  });
});

describe('sql-reader constraints — unsupported CHECK expressions -> custom stub + diagnostic', () => {
  it('a column-to-column comparison (no single-attribute IR shape) falls back to custom', async () => {
    const { text, diagnostics } = await importToRune(`CREATE TABLE t (a INT, b INT, CHECK (a >= b))`);
    const untranslatable = (diagnostics as Array<{ code: string }>).filter(
      (d) => d.code === 'untranslatable-construct'
    );
    expect(untranslatable.length).toBeGreaterThanOrEqual(1);
    expect(text).toContain('TODO: manual translation required');
    await assertParses(text);
  });
});

describe('sql-reader constraints — multi-constraint column (multiple independent conditions on one attribute)', () => {
  it('VARCHAR(n) + a comparison CHECK on the same column both translate independently', async () => {
    const { text, model } = await importToRune(`CREATE TABLE t (code VARCHAR(10) CHECK (code <> 'BAD'))`);
    const t = model.types[0]!;
    const codeAttr = t.attributes.find((a) => a.sourceKey === 'code')!;
    expect(codeAttr.constraints).toEqual(
      expect.arrayContaining([
        { kind: 'length', path: 'code', max: 10 },
        { kind: 'comparison', op: '<>', path: 'code', value: 'BAD' }
      ])
    );
    expect(codeAttr.constraints).toHaveLength(2);
    await assertParses(text);
  });
});

describe('sql-reader constraints — table-level CHECK referencing one column', () => {
  it('CHECK (col >= n) declared at the table level (not attached to a column) still translates', async () => {
    const { text, model } = await importToRune(`CREATE TABLE t (age INT, CHECK (age >= 0))`);
    const t = model.types[0]!;
    expect(t.constraints).toEqual([{ kind: 'range', path: 'age', min: 0 }]);
    await assertParses(text);
    expect(text).toContain('condition AgeRange:');
  });
});
