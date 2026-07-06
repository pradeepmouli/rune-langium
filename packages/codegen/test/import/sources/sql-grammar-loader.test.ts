// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * T0 viability spike (spec 021 Phase 2c Addendum item 1) — proves
 * `web-tree-sitter` + `@l1xnan/tree-sitter-sql`'s prebuilt wasm loads in
 * Node and parses real DDL, and documents the dialect-tolerance gaps found
 * (all outside the constraint-gap-closure surface `sql-reader.ts` needs —
 * see `.superpowers/sdd/sql-reader-report.md` for the full spike evidence).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import type { Parser } from 'web-tree-sitter';
import { createSqlParser } from '../../../src/import/sources/sql-grammar-loader.js';

describe('sql-grammar-loader (T0 viability spike)', () => {
  let parser: Parser;

  beforeAll(async () => {
    parser = await createSqlParser();
  });

  it('parses the spec.md T0 acceptance DDL with zero errors', () => {
    const ddl = `CREATE TABLE trade_event (id INT PRIMARY KEY, notional NUMERIC NOT NULL CHECK (notional >= 0), status TEXT CHECK (status IN ('NEW','DONE')))`;
    const tree = parser.parse(ddl);
    expect(tree?.rootNode.hasError).toBe(false);
  });

  it('walks the parsed tree into a CREATE TABLE / column_definition / CHECK shape', () => {
    const ddl = `CREATE TABLE t (id INT PRIMARY KEY, notional NUMERIC CHECK (notional >= 0))`;
    const tree = parser.parse(ddl)!;
    const createTable = tree.rootNode.child(0)!.child(0)!;
    expect(createTable.type).toBe('create_table');
    const objectRef = createTable.namedChildren.find((n) => n?.type === 'object_reference');
    expect(objectRef?.text).toBe('t');
    const columnDefs = createTable.namedChildren.find((n) => n?.type === 'column_definitions');
    const columnDefinitions = columnDefs?.namedChildren.filter((n) => n?.type === 'column_definition') ?? [];
    expect(columnDefinitions).toHaveLength(2);
  });

  describe('postgres dialect tolerance', () => {
    it('parses double-quoted identifiers', () => {
      const tree = parser.parse(`CREATE TABLE "TradeEvent" ("Id" INT PRIMARY KEY)`);
      expect(tree?.rootNode.hasError).toBe(false);
    });

    it('parses SERIAL + numeric precision', () => {
      const tree = parser.parse(`CREATE TABLE t (id SERIAL PRIMARY KEY, amount NUMERIC(18,4))`);
      expect(tree?.rootNode.hasError).toBe(false);
    });

    it('parses unquoted schema-qualified table names', () => {
      const tree = parser.parse(`CREATE TABLE dbo.TradeEvent (id INT)`);
      expect(tree?.rootNode.hasError).toBe(false);
    });
  });

  describe('sqlserver dialect tolerance', () => {
    it('parses NVARCHAR(n) and DECIMAL precision', () => {
      const tree = parser.parse(`CREATE TABLE t (name NVARCHAR(50) NOT NULL, amount DECIMAL(18,4))`);
      expect(tree?.rootNode.hasError).toBe(false);
    });

    it('parses IDENTITY-style surrogate columns via a plain PRIMARY KEY (IDENTITY(1,1) itself is a KNOWN GAP, see below)', () => {
      const tree = parser.parse(`CREATE TABLE t (id INT PRIMARY KEY)`);
      expect(tree?.rootNode.hasError).toBe(false);
    });

    // KNOWN GAP (T0 spike finding, documented in sql-reader-report.md):
    // bracket-quoted identifiers (`[dbo].[TradeEvent]`, SQL Server's own
    // quoting convention) are NOT tolerated by this grammar — every bracket
    // token produces an ERROR node. sql-reader.ts's sqlserver fixtures use
    // unquoted or double-quoted identifiers instead; this is recorded as a
    // real, non-blocking dialect gap (T3's dialect matrix documents it),
    // not silently worked around.
    it('KNOWN GAP: bracket-quoted identifiers are not tolerated', () => {
      const tree = parser.parse(`CREATE TABLE [dbo].[TradeEvent] ([Id] INT PRIMARY KEY)`);
      expect(tree?.rootNode.hasError).toBe(true);
    });

    // KNOWN GAP: NVARCHAR(MAX) (no numeric size) is not tolerated by this
    // grammar's `nvarchar` rule (only a numeric-literal size argument
    // parses). sql-reader.ts must not rely on the MAX form.
    it('KNOWN GAP: NVARCHAR(MAX) (no numeric size) is not tolerated', () => {
      const tree = parser.parse(`CREATE TABLE t (name NVARCHAR(MAX))`);
      expect(tree?.rootNode.hasError).toBe(true);
    });

    // KNOWN GAP: GO batch separators (a sqlcmd/SSMS convention, not real T-SQL
    // syntax) are not tolerated — expected and out of scope (spec.md's own
    // dialect matrix only requires DDL statement parsing, not batch tooling).
    it('KNOWN GAP: GO batch separators are not tolerated', () => {
      const tree = parser.parse(`CREATE TABLE t (id INT);\nGO`);
      expect(tree?.rootNode.hasError).toBe(true);
    });
  });

  describe('constraint-gap-closure shapes (all parse cleanly)', () => {
    it('parses CHECK (col IN (...))', () => {
      const tree = parser.parse(`CREATE TABLE t (status TEXT CHECK (status IN ('NEW','DONE')))`);
      expect(tree?.rootNode.hasError).toBe(false);
    });

    it('parses FOREIGN KEY ... REFERENCES', () => {
      const tree = parser.parse(
        `CREATE TABLE t (id INT PRIMARY KEY, parent_id INT, FOREIGN KEY (parent_id) REFERENCES parent(id))`
      );
      expect(tree?.rootNode.hasError).toBe(false);
    });

    it('parses CHECK (col LIKE ...)', () => {
      const tree = parser.parse(`CREATE TABLE t (code TEXT CHECK (code LIKE 'A%'))`);
      expect(tree?.rootNode.hasError).toBe(false);
    });

    it('parses CHECK (char_length(col) >= n)', () => {
      const tree = parser.parse(`CREATE TABLE t (name TEXT CHECK (char_length(name) >= 1))`);
      expect(tree?.rootNode.hasError).toBe(false);
    });

    it('parses CHECK (LEN(col) >= n) (sqlserver dialect function)', () => {
      const tree = parser.parse(`CREATE TABLE t (name TEXT CHECK (LEN(name) >= 1))`);
      expect(tree?.rootNode.hasError).toBe(false);
    });

    // KNOWN GAP (T0 spike finding): a column-level `CHECK (... BETWEEN a AND
    // b)` clause is NOT accepted by this grammar's `column_definition` rule
    // (an otherwise-correctly-parsed `between_expression` subtree gets
    // wrapped in an ERROR node) — even though `BETWEEN` parses fine in a
    // `WHERE` clause. sql-reader.ts's BETWEEN handling (spec item 3, "CHECK
    // (col BETWEEN a AND b) -> range") must therefore walk the ERROR node's
    // children to find the `between_expression`, not assume a clean
    // `column_definition -> ... -> between_expression` path.
    it('KNOWN GAP: column-level CHECK (col BETWEEN a AND b) parses with an ERROR node wrapping a valid between_expression', () => {
      const tree = parser.parse(`CREATE TABLE t (age INT CHECK (age BETWEEN 0 AND 150))`)!;
      expect(tree.rootNode.hasError).toBe(true);
      const text = tree.rootNode.toString();
      expect(text).toContain('between_expression');
    });
  });
});
