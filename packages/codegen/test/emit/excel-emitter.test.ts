// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Fixture-based tests for `ExcelWholeModelEmitter` (019 Phase 1).
 *
 * The emitter produces a single binary `model.xlsx`. Tests use ExcelJS
 * to read the binary back and assert per-sheet row counts + a sampling
 * of cell values. This is the only Phase 0.5/Phase 1 target that
 * produces binary output, so the tests exercise the
 * `GeneratorOutput.binary` field end-to-end.
 */

import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../../src/index.js';

const SOURCE_A = `namespace foo

type Trade:
  tradeId string (1..1)
  quantity number (1..1)

  condition NonNegativeQuantity:
    quantity >= 0

enum Side:
  Buy
  Sell

typeAlias Label: string
`;

const SOURCE_B = `namespace bar

type Party:
  name string (1..1)
`;

async function parseTwoNamespaces() {
  const { RuneDsl } = createRuneDslServices();
  const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
  const builder = RuneDsl.shared.workspace.DocumentBuilder;
  const docA = factory.fromString(SOURCE_A, URI.parse('inmemory:///foo.rosetta'));
  const docB = factory.fromString(SOURCE_B, URI.parse('inmemory:///bar.rosetta'));
  await builder.build([docA, docB], { validation: false });
  return [docA, docB];
}

async function loadWorkbook(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  // ExcelJS's `load` expects an ArrayBuffer / Buffer-like. The .buffer
  // backing the Uint8Array works in Node, browser, and Workers.
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return wb;
}

describe('ExcelWholeModelEmitter (019 Phase 1)', () => {
  it('produces a single model.xlsx binary output with the workbook mimeType', async () => {
    const docs = await parseTwoNamespaces();
    const outputs = await generate(docs, { target: 'excel' });

    expect(outputs).toHaveLength(1);
    const out = outputs[0]!;
    expect(out.relativePath).toBe('model.xlsx');
    expect(out.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(out.binary).toBeInstanceOf(Uint8Array);
    expect((out.binary as Uint8Array).byteLength).toBeGreaterThan(0);
    // Binary-only target — content should stay empty.
    expect(out.content).toBe('');
  });

  it('writes the expected sheets (Types, Enums, TypeAliases, Conditions)', async () => {
    const docs = await parseTwoNamespaces();
    const outputs = await generate(docs, { target: 'excel' });
    const wb = await loadWorkbook(outputs[0]!.binary!);

    const sheetNames = wb.worksheets.map((s) => s.name).sort();
    // Alphabetic order: 'TypeAliases' < 'Types' because 'A' (65) < 's' (115).
    expect(sheetNames).toEqual(['Conditions', 'Enums', 'TypeAliases', 'Types']);
  });

  // Column indices (1-based) used in the assertions below. ExcelJS
  // doesn't preserve `column.key` names through save/load, so we read
  // by position. The order matches the `columns: [...]` declarations
  // in `excel-emitter.ts` — keep these in sync if columns ever reorder.
  const COL = {
    types: { namespace: 1, name: 2, superType: 3, attrCount: 4, condCount: 5 },
    enums: { namespace: 1, name: 2, memberCount: 3, memberNames: 4 },
    conditions: { namespace: 1, owningType: 2, condition: 3, expression: 4 }
  } as const;

  it('Types sheet has one row per data type with the namespace and name', async () => {
    const docs = await parseTwoNamespaces();
    const outputs = await generate(docs, { target: 'excel' });
    const wb = await loadWorkbook(outputs[0]!.binary!);

    const types = wb.getWorksheet('Types')!;
    // foo.Trade + bar.Party = 2 data types across the two namespaces.
    expect(types.rowCount - 1).toBe(2);

    const found = new Set<string>();
    for (let r = 2; r <= types.rowCount; r++) {
      const row = types.getRow(r);
      found.add(`${row.getCell(COL.types.namespace).value}.${row.getCell(COL.types.name).value}`);
    }
    expect(found).toContain('foo.Trade');
    expect(found).toContain('bar.Party');
  });

  it('Enums sheet captures member counts and member names', async () => {
    const docs = await parseTwoNamespaces();
    const outputs = await generate(docs, { target: 'excel' });
    const wb = await loadWorkbook(outputs[0]!.binary!);

    const enums = wb.getWorksheet('Enums')!;
    expect(enums.rowCount - 1).toBe(1); // only foo.Side
    const sideRow = enums.getRow(2);
    expect(sideRow.getCell(COL.enums.namespace).value).toBe('foo');
    expect(sideRow.getCell(COL.enums.name).value).toBe('Side');
    expect(sideRow.getCell(COL.enums.memberCount).value).toBe(2);
    const memberNames = String(sideRow.getCell(COL.enums.memberNames).value);
    expect(memberNames).toMatch(/Buy/);
    expect(memberNames).toMatch(/Sell/);
  });

  it('Conditions sheet captures conditions inside data types', async () => {
    const docs = await parseTwoNamespaces();
    const outputs = await generate(docs, { target: 'excel' });
    const wb = await loadWorkbook(outputs[0]!.binary!);

    const conditions = wb.getWorksheet('Conditions')!;
    expect(conditions.rowCount - 1).toBe(1);
    const row = conditions.getRow(2);
    expect(row.getCell(COL.conditions.namespace).value).toBe('foo');
    expect(row.getCell(COL.conditions.owningType).value).toBe('Trade');
    expect(row.getCell(COL.conditions.condition).value).toBe('NonNegativeQuantity');
    // Copilot review on PR #167: Expression cell should hold the
    // expression body (`quantity >= 0`), NOT the full condition source
    // text (`condition NonNegativeQuantity:\n    quantity >= 0`).
    const expression = String(row.getCell(COL.conditions.expression).value);
    expect(expression).toMatch(/quantity\s*>=\s*0/);
    expect(expression).not.toMatch(/condition\s+NonNegativeQuantity/);
  });

  it('TypeAliases sheet captures aliases with their base type spelling', async () => {
    const docs = await parseTwoNamespaces();
    const outputs = await generate(docs, { target: 'excel' });
    const wb = await loadWorkbook(outputs[0]!.binary!);

    const aliases = wb.getWorksheet('TypeAliases')!;
    // Fixture defines one alias: `typeAlias Label: string` under namespace foo.
    expect(aliases.rowCount - 1).toBe(1);
    const row = aliases.getRow(2);
    expect(row.getCell(1).value).toBe('foo');
    expect(row.getCell(2).value).toBe('Label');
    // Codex review on PR #167: primitive aliases like `typeAlias Label: string`
    // don't resolve `ref` (string has no AST node), so the Base Type cell
    // must use the `$refText` fallback to surface the source-text spelling.
    expect(row.getCell(3).value).toBe('string');
  });

  it('namespaces are listed in sorted order across all sheets (SC-007 determinism)', async () => {
    const docs = await parseTwoNamespaces();
    const outputs = await generate(docs, { target: 'excel' });
    const wb = await loadWorkbook(outputs[0]!.binary!);

    const types = wb.getWorksheet('Types')!;
    const namespacesInOrder: string[] = [];
    for (let r = 2; r <= types.rowCount; r++) {
      namespacesInOrder.push(String(types.getRow(r).getCell(COL.types.namespace).value));
    }
    // 'bar' < 'foo' alphabetically.
    expect(namespacesInOrder).toEqual([...namespacesInOrder].sort());
  });

  // Copilot review on PR #167: this test used to claim it exercised a
  // per-namespace layout request, but the options object didn't actually
  // set a layout, so it tested the default path twice. Now passes
  // `layout: 'per-namespace'` explicitly through a cast — Excel has no
  // namespace emitter, so the dispatch must still pick the registered
  // WholeModelEmitter regardless of the layout value.
  it('is registered as a whole-model emitter (an explicit per-namespace layout still resolves to it)', async () => {
    const docs = await parseTwoNamespaces();
    const outputs = await generate(docs, {
      target: 'excel',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      excel: { layout: 'per-namespace' } as any
    });
    expect(outputs[0]?.binary).toBeDefined();
    expect(outputs[0]?.relativePath).toBe('model.xlsx');
  });
});
