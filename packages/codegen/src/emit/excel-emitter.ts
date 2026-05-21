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
import { resolveExcelSheets } from '../options/excel-options.js';
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

function superTypeName(data: { superType?: { ref?: { name?: unknown } | null; $refText?: string } | null }): string {
  const refName = data.superType?.ref?.name;
  if (typeof refName === 'string') return refName;
  // Fall back to the source-text spelling when the ref didn't resolve to
  // an in-scope AST node (e.g., a primitive parent type or a curated-
  // bundle hydration that left $refText set). Mirrors what zod/ts
  // emitters already do for unresolved refs.
  return data.superType?.$refText ?? '';
}

function enumMemberNames(enumNode: { enumValues?: ReadonlyArray<{ name?: unknown }> }): string[] {
  return (enumNode.enumValues ?? []).map((v) => (typeof v.name === 'string' ? v.name : '')).filter((s) => s.length > 0);
}

function typeAliasBaseName(alias: {
  typeCall?: {
    type?: { ref?: { name?: unknown } | null; $refText?: string } | null;
  } | null;
}): string {
  const refName = alias.typeCall?.type?.ref?.name;
  if (typeof refName === 'string') return refName;
  // Codex review on PR #167 — primitive aliases like `typeAlias Label: string`
  // don't resolve `ref` (string has no AST node), so `ref.name` is undefined
  // and the Base Type cell would be blank. The source-text spelling lives on
  // the reference as `$refText`; other emitters already use this fallback.
  return alias.typeCall?.type?.$refText ?? '';
}

/**
 * Best-effort extraction of the raw source text for a condition's
 * expression. Copilot review on PR #167: previously read the condition
 * node's `$cstNode.text`, which includes the `condition <name>:` header
 * — useful for source location but misleading in a column labeled
 * "Expression". The expression node's own CST text gives just the
 * expression body, which is what the column advertises.
 *
 * Falls back to the condition's name if the expression CST is missing
 * (e.g. deserialized AST without text-regions on a curated bundle).
 */
function conditionExpressionText(condition: {
  name?: unknown;
  expression?: { $cstNode?: { text?: string } } | null;
}): string {
  const exprText = condition.expression?.$cstNode?.text;
  if (typeof exprText === 'string' && exprText.length > 0) return exprText;
  return typeof condition.name === 'string' ? condition.name : '';
}

export class ExcelWholeModelEmitter implements WholeModelEmitter {
  async emit(
    walks: ReadonlyMap<string, NamespaceWalkResult>,
    _registry: NamespaceRegistry,
    options: GeneratorOptions
  ): Promise<GeneratorOutput[]> {
    // §5.1 sheet toggles. Defaults are all-true (resolveExcelSheets applies
    // the schema defaults), so a request without `options.excel` keeps
    // producing the full workbook. The modal narrows the set per-download.
    const sheets = resolveExcelSheets(options.excel);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = '@rune-langium/codegen';
    // SC-007 determinism: ExcelJS serializes BOTH `created` and `modified`
    // into the workbook's core properties. Pin both to epoch 0 so the
    // .xlsx bytes are stable across runs (Codex + Copilot review on PR #167).
    const epoch = new Date(0);
    workbook.created = epoch;
    workbook.modified = epoch;

    const typesSheet = sheets.types
      ? addSheet(workbook, 'Types', [
          { header: 'Namespace', key: 'namespace', width: 28 },
          { header: 'Name', key: 'name', width: 28 },
          { header: 'Super Type', key: 'superType', width: 24 },
          { header: 'Attributes', key: 'attrCount', width: 12 },
          { header: 'Conditions', key: 'condCount', width: 12 }
        ])
      : undefined;
    const enumsSheet = sheets.enums
      ? addSheet(workbook, 'Enums', [
          { header: 'Namespace', key: 'namespace', width: 28 },
          { header: 'Name', key: 'name', width: 28 },
          { header: 'Members', key: 'memberCount', width: 12 },
          { header: 'Member Names', key: 'memberNames', width: 60 }
        ])
      : undefined;
    const aliasSheet = sheets.typeAliases
      ? addSheet(workbook, 'TypeAliases', [
          { header: 'Namespace', key: 'namespace', width: 28 },
          { header: 'Name', key: 'name', width: 28 },
          { header: 'Base Type', key: 'baseType', width: 28 }
        ])
      : undefined;
    const conditionsSheet = sheets.conditions
      ? addSheet(workbook, 'Conditions', [
          { header: 'Namespace', key: 'namespace', width: 28 },
          { header: 'Owning Type', key: 'owningType', width: 28 },
          { header: 'Condition', key: 'condition', width: 28 },
          { header: 'Expression', key: 'expression', width: 80 }
        ])
      : undefined;

    // ExcelJS requires at least one worksheet to write a valid workbook.
    // If every sheet was toggled off, add a placeholder so writeBuffer()
    // doesn't throw — an empty-but-valid .xlsx is a saner result than a
    // 500. (The modal disables Generate when no sheet is selected, so this
    // is a defensive floor, not a routine path.)
    if (!typesSheet && !enumsSheet && !aliasSheet && !conditionsSheet) {
      addSheet(workbook, 'Model', [{ header: 'Namespace', key: 'namespace', width: 28 }]);
    }

    // Sort namespaces for deterministic output (SC-007). Within each
    // namespace, the walker's `emitOrder` is the authoritative topo-sort
    // for data types (Copilot review on PR #167 — `dataByName` iteration
    // order is source-insertion, not topo). For types not listed in
    // emitOrder (cyclic + their dependencies, or any walker-skipped
    // entries), append in `dataByName` insertion order.
    const sortedNamespaces = Array.from(walks.keys()).sort();
    for (const namespace of sortedNamespaces) {
      const walk = walks.get(namespace)!;

      // Walk data types when EITHER the Types or Conditions sheet is on —
      // condition rows are derived from data-type bodies, so they share the
      // same iteration even though they land on different sheets.
      if (typesSheet || conditionsSheet) {
        const dataIterationOrder: string[] = [];
        const seen = new Set<string>();
        for (const typeName of walk.emitOrder) {
          if (walk.dataByName.has(typeName)) {
            dataIterationOrder.push(typeName);
            seen.add(typeName);
          }
        }
        for (const typeName of walk.dataByName.keys()) {
          if (!seen.has(typeName)) dataIterationOrder.push(typeName);
        }

        for (const name of dataIterationOrder) {
          const data = walk.dataByName.get(name)!;
          typesSheet?.addRow({
            namespace,
            name,
            superType: superTypeName(data as { superType?: { ref?: { name?: unknown } | null } | null }),
            attrCount: attributeCount(data as { attributes?: { length?: number } }),
            condCount: conditionCount(data as { conditions?: { length?: number } })
          });
          if (conditionsSheet) {
            const conditions = (
              data as {
                conditions?: ReadonlyArray<{
                  name?: unknown;
                  expression?: { $cstNode?: { text?: string } } | null;
                }>;
              }
            ).conditions;
            if (conditions) {
              for (const condition of conditions) {
                conditionsSheet.addRow({
                  namespace,
                  owningType: name,
                  condition: typeof condition.name === 'string' ? condition.name : '',
                  expression: conditionExpressionText(condition)
                });
              }
            }
          }
        }
      }

      if (enumsSheet) {
        for (const [name, enumNode] of walk.enumByName) {
          const members = enumMemberNames(enumNode as { enumValues?: ReadonlyArray<{ name?: unknown }> });
          enumsSheet.addRow({
            namespace,
            name,
            memberCount: members.length,
            memberNames: members.join(', ')
          });
        }
      }

      if (aliasSheet) {
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
