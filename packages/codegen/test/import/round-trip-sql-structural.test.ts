// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * SQL structural round-trip oracle (spec 021 Phase 2c Addendum item 5,
 * split-oracle per the Phase 1 precedent): `.rune` → (real outbound SQL
 * emitter) → (inbound `sql-reader.ts`) → `.rune`, asserting structural
 * equivalence: types, cardinality, enum CHECKs → enums, reference FKs →
 * typed attributes, inheritance FK → extends.
 *
 * **POSTGRES ONLY — a real, reported grammar-dialect limitation, not an
 * oversight.** The outbound emitter's sqlserver dialect (`sql-dialect.ts`'s
 * `quote: (id) => \`[${id}]\``) unconditionally bracket-quotes EVERY
 * identifier in EVERY statement it emits — there is no option to disable
 * this. `@l1xnan/tree-sitter-sql`'s grammar does not tolerate bracket-
 * quoted identifiers AT ALL (T0's own documented finding, `sql-grammar-
 * loader.test.ts`) — every such statement is a genuine, unrecoverable
 * syntax error, not a translation gap this reader's own logic could work
 * around without silently guessing at a lossy text transform the addendum
 * explicitly warns against ("grammar dialect gaps that would silently
 * misparse — report, don't guess"). This is demonstrated below (`sqlserver
 * dialect — grammar limitation demonstrated`), not hidden: the outbound
 * emitter's raw sqlserver output is fed to the reader and asserted to
 * surface a `sql-parse-error` diagnostic rather than a false "it worked".
 *
 * The sqlserver HALF of the constraint-gap-closure oracle (T3's dialect
 * matrix, `sql-reader-dialects.test.ts`) is unaffected — those fixtures are
 * hand-written specifically to avoid bracket-quoting (double-quoted or
 * unquoted identifiers), which is exactly what a real-world hand-authored
 * SQL Server DDL script legitimately has (this reader's actual target
 * audience — the same "hand-authored, not necessarily emitter-produced"
 * framing the Phase 1 JSON Schema split-oracle used for its own condition
 * half).
 */

import { describe, it, expect } from 'vitest';
import { createRuneDslServices, parse } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../../src/export.js';
import { readSql } from '../../src/import/sources/sql-reader.js';
import { buildModel } from '../../src/import/ast-builder.js';
import { renderModel } from '../../src/emit/rosetta/rosetta-render-core.js';

const SOURCE_RUNE = `namespace test.sqlroundtrip
version "1.0.0"

enum StatusEnum:
    NEW
    DONE

type Party:
    partyId string (1..1)
    partyName string (0..1)

type Trade extends Party:
    status StatusEnum (1..1)
    counterparty Party (0..1)
`;

async function emitSql(source: string, dialect: 'postgres' | 'sqlserver'): Promise<string> {
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
    source,
    URI.parse('inmemory:///sqlroundtrip.rosetta')
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
  expect(doc.parseResult.parserErrors).toHaveLength(0);

  const outputs = await generate(doc, { target: 'sql', sql: { dialect } });
  expect(outputs.length).toBeGreaterThan(0);
  return outputs[0]!.content;
}

async function importToRune(sql: string, dialect: 'postgres' | 'sqlserver') {
  const { model, diagnostics } = await readSql(sql, { namespace: 'test.sqlroundtrip', dialect });
  const built = buildModel(model);
  const rendered = renderModel({ name: model.namespace, version: '0.0.0', elements: built.elements as never[] });
  const lines = rendered.split('\n');
  if (built.synonymSourceDeclaration) {
    const versionIdx = lines.findIndex((l) => l.startsWith('version '));
    lines.splice(versionIdx + 1, 0, '', built.synonymSourceDeclaration);
  }
  return { text: lines.join('\n'), model, diagnostics: [...diagnostics, ...built.diagnostics] };
}

describe('round-trip (SQL structural half, postgres) — .rune -> outbound SQL emitter -> inbound -> .rune', () => {
  it('recovers the same types, attributes, and cardinalities', async () => {
    const ddl = await emitSql(SOURCE_RUNE, 'postgres');
    const { model, diagnostics } = await importToRune(ddl, 'postgres');
    expect(diagnostics.filter((d) => d.severity === 'warning' || d.severity === 'error')).toEqual([]);

    const typeNames = model.types.map((t) => t.name).sort();
    expect(typeNames).toEqual(['Party', 'Trade']);

    const party = model.types.find((t) => t.name === 'Party')!;
    const partyAttrs = Object.fromEntries(party.attributes.map((a) => [a.sourceKey, a.cardinality]));
    expect(partyAttrs['partyId']).toEqual({ inf: 1, sup: 1 });
    expect(partyAttrs['partyName']).toEqual({ inf: 0, sup: 1 });
  });

  it('recovers the inheritance relationship (Trade extends Party) via the shared-identity FK convention', async () => {
    const ddl = await emitSql(SOURCE_RUNE, 'postgres');
    const { model } = await importToRune(ddl, 'postgres');
    const trade = model.types.find((t) => t.name === 'Trade')!;
    expect(trade.extends).toBe('Party');
    // The shared-identity `id` FK column is consumed as the inheritance
    // marker, never re-emitted as a regular attribute.
    expect(trade.attributes.some((a) => a.sourceKey === 'id')).toBe(false);
  });

  it('recovers the reference FK (Trade.counterparty -> Party) as a typed attribute', async () => {
    const ddl = await emitSql(SOURCE_RUNE, 'postgres');
    const { model } = await importToRune(ddl, 'postgres');
    const trade = model.types.find((t) => t.name === 'Trade')!;
    const counterparty = trade.attributes.find((a) => a.typeName === 'Party');
    expect(counterparty).toBeDefined();
    expect(counterparty!.cardinality).toEqual({ inf: 0, sup: 1 });
  });

  it('recovers the enum CHECK column as a Rune enum, with the attribute retyped to it', async () => {
    const ddl = await emitSql(SOURCE_RUNE, 'postgres');
    const { model } = await importToRune(ddl, 'postgres');
    expect(model.enums).toHaveLength(1);
    const statusEnum = model.enums[0]!;
    expect(statusEnum.values.map((v) => v.name).sort()).toEqual(['DONE', 'NEW']);
    const trade = model.types.find((t) => t.name === 'Trade')!;
    const statusAttr = trade.attributes.find((a) => a.sourceKey === 'status')!;
    expect(statusAttr.typeName).toBe(statusEnum.name);
    expect(statusAttr.cardinality).toEqual({ inf: 1, sup: 1 });
  });

  it('the re-imported .rune text parses with zero errors end to end (hard invariant)', async () => {
    const ddl = await emitSql(SOURCE_RUNE, 'postgres');
    const { text } = await importToRune(ddl, 'postgres');
    const parseResult = await parse(text);
    expect(parseResult.hasErrors).toBe(false);
    expect(text).toContain('type Party:');
    expect(text).toContain('type Trade extends Party:');
    expect(text).toContain('enum StatusEnum:');
  });
});

describe('sqlserver dialect — grammar limitation demonstrated (not silently worked around)', () => {
  it("the outbound emitter's real sqlserver output (bracket-quoted identifiers) is NOT tolerated by this reader's grammar — surfaced as sql-parse-error, never silently misparsed", async () => {
    const ddl = await emitSql(SOURCE_RUNE, 'sqlserver');
    expect(ddl).toContain('[Party]'); // confirms the emitter really does bracket-quote every identifier
    const { diagnostics } = await importToRune(ddl, 'sqlserver');
    expect(diagnostics.some((d) => d.code === 'sql-parse-error')).toBe(true);
  });
});
