// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Excel data-dictionary emitter — 019 Phase 1.
 *
 * Produces one `model.xlsx` workbook for the entire model. Sheets:
 *
 *   - Types         — one row per `data` type (namespace, name,
 *                     super-type, attribute count, condition count).
 *   - Enums         — one row per enumeration (namespace, name, member
 *                     count, comma-joined members).
 *   - TypeAliases   — one row per type alias (namespace, name, base
 *                     type).
 *   - Conditions    — one row per condition (namespace, owning type,
 *                     condition name, condition text). Conditions
 *                     inside `data` blocks.
 *
 * Hand-rolled WholeModelEmitter (not wrapped via `GenericModelEmitter`)
 * because Excel doesn't fit the per-namespace-then-aggregate pattern —
 * each sheet is its own cross-namespace concatenation with header rows,
 * column widths, etc.
 *
 * Runs in Node (Vitest), browser, and Cloudflare Workers — ExcelJS
 * supports all three; the studio's `wrangler.toml` already declares
 * `nodejs_compat` (needed for ExcelJS's stream APIs).
 */

import ExcelJS from 'exceljs';
import type { GeneratorOptions, GeneratorOutput } from '../types.js';
import type { WholeModelEmitter } from './namespace-emitter.js';
import type { NamespaceRegistry } from './namespace-registry.js';
import type { NamespaceWalkResult } from './namespace-walker.js';

/**
 * Style applied to every sheet's header row. Subtle gray fill + bold
 * matches an "office data dictionary" look without going overboard.
 */
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFEEEEEE' }
};
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true };

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: Array<{ header: string; key: string; width?: number }>
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = columns;
  // ExcelJS treats row 1 as the header when `columns` is set, so the
  // formatting below targets that row.
  const header = sheet.getRow(1);
  header.font = HEADER_FONT;
  header.fill = HEADER_FILL;
  header.commit();
  return sheet;
}

function attributeCount(data: { attributes?: { length?: number } }): number {
  return data.attributes?.length ?? 0;
}

function conditionCount(data: { conditions?: { length?: number } }): number {
  return data.conditions?.length ?? 0;
}

function superTypeName(data: { superType?: { ref?: { name?: unknown } | null } | null }): string {
  const refName = data.superType?.ref?.name;
  return typeof refName === 'string' ? refName : '';
}

function enumMemberNames(enumNode: { enumValues?: ReadonlyArray<{ name?: unknown }> }): string[] {
  return (enumNode.enumValues ?? []).map((v) => (typeof v.name === 'string' ? v.name : '')).filter((s) => s.length > 0);
}

function typeAliasBaseName(alias: { typeCall?: { type?: { ref?: { name?: unknown } | null } | null } | null }): string {
  const refName = alias.typeCall?.type?.ref?.name;
  return typeof refName === 'string' ? refName : '';
}

/**
 * Best-effort extraction of the raw source text for a `condition`
 * node. `$cstNode.text` is set by the Langium parser; if absent (e.g.
 * deserialized AST without text-regions), we fall back to the
 * condition's name.
 */
function conditionText(condition: { name?: unknown; $cstNode?: { text?: string } }): string {
  return condition.$cstNode?.text ?? (typeof condition.name === 'string' ? condition.name : '');
}

export class ExcelWholeModelEmitter implements WholeModelEmitter {
  async emit(
    walks: ReadonlyMap<string, NamespaceWalkResult>,
    _registry: NamespaceRegistry,
    _options: GeneratorOptions
  ): Promise<GeneratorOutput[]> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = '@rune-langium/codegen';
    workbook.created = new Date(0); // Deterministic timestamp (SC-007).

    const typesSheet = addSheet(workbook, 'Types', [
      { header: 'Namespace', key: 'namespace', width: 28 },
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Super Type', key: 'superType', width: 24 },
      { header: 'Attributes', key: 'attrCount', width: 12 },
      { header: 'Conditions', key: 'condCount', width: 12 }
    ]);
    const enumsSheet = addSheet(workbook, 'Enums', [
      { header: 'Namespace', key: 'namespace', width: 28 },
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Members', key: 'memberCount', width: 12 },
      { header: 'Member Names', key: 'memberNames', width: 60 }
    ]);
    const aliasSheet = addSheet(workbook, 'TypeAliases', [
      { header: 'Namespace', key: 'namespace', width: 28 },
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Base Type', key: 'baseType', width: 28 }
    ]);
    const conditionsSheet = addSheet(workbook, 'Conditions', [
      { header: 'Namespace', key: 'namespace', width: 28 },
      { header: 'Owning Type', key: 'owningType', width: 28 },
      { header: 'Condition', key: 'condition', width: 28 },
      { header: 'Expression', key: 'expression', width: 80 }
    ]);

    // Sort namespaces for deterministic output (SC-007). Within each
    // namespace, iterate the walker's declared maps; those preserve
    // insertion order, which matches the emit-order topological sort.
    const sortedNamespaces = Array.from(walks.keys()).sort();
    for (const namespace of sortedNamespaces) {
      const walk = walks.get(namespace)!;

      for (const [name, data] of walk.dataByName) {
        typesSheet.addRow({
          namespace,
          name,
          superType: superTypeName(data as { superType?: { ref?: { name?: unknown } | null } | null }),
          attrCount: attributeCount(data as { attributes?: { length?: number } }),
          condCount: conditionCount(data as { conditions?: { length?: number } })
        });
        const conditions = (data as { conditions?: ReadonlyArray<{ name?: unknown; $cstNode?: { text?: string } }> })
          .conditions;
        if (conditions) {
          for (const condition of conditions) {
            conditionsSheet.addRow({
              namespace,
              owningType: name,
              condition: typeof condition.name === 'string' ? condition.name : '',
              expression: conditionText(condition)
            });
          }
        }
      }

      for (const [name, enumNode] of walk.enumByName) {
        const members = enumMemberNames(enumNode as { enumValues?: ReadonlyArray<{ name?: unknown }> });
        enumsSheet.addRow({
          namespace,
          name,
          memberCount: members.length,
          memberNames: members.join(', ')
        });
      }

      for (const [name, alias] of walk.typeAliasByName) {
        aliasSheet.addRow({
          namespace,
          name,
          baseType: typeAliasBaseName(
            alias as { typeCall?: { type?: { ref?: { name?: unknown } | null } | null } | null }
          )
        });
      }
    }

    // `writeBuffer()` returns an ArrayBuffer in browser/Workers and a
    // Buffer in Node. Both are byte sequences, just different views.
    // Normalize to Uint8Array so `GeneratorOutput.binary` has a
    // consistent runtime shape across environments.
    const buffer = await workbook.xlsx.writeBuffer();
    const bytes = new Uint8Array(buffer as ArrayBuffer);

    return [
      {
        relativePath: 'model.xlsx',
        content: '', // Binary target — text content stays empty by convention.
        binary: bytes,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sourceMap: [],
        diagnostics: [],
        funcs: []
      }
    ];
  }
}
