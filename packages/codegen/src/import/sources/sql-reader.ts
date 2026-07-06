// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * sql-reader — SQL DDL (`CREATE TABLE`) → `SourceModel` (spec.md User Story
 * 3 + Phase 2c Addendum, this effort's active importer).
 *
 * Parser: `web-tree-sitter` + `@l1xnan/tree-sitter-sql`'s prebuilt wasm
 * grammar (see `sql-grammar-loader.ts` and `.superpowers/sdd/
 * sql-reader-report.md`'s T0 spike for the viability evidence and the real,
 * bounded dialect gaps this reader works around: bracket-quoted identifiers
 * and `NVARCHAR(MAX)` are not tolerated by the grammar at all; a
 * column-level `CHECK (... BETWEEN ...)` parses into an `ERROR` node that
 * still wraps a valid `between_expression` subtree, handled explicitly
 * below rather than treated as an unrecoverable parse failure).
 *
 * Scope (per spec.md's Phase 2c Addendum item 3's constraint-gap table):
 *  - `CREATE TABLE` → `SourceType`; `snake_case` table name → PascalCase
 *    Rune type name; `snake_case` column name → camelCase attribute name.
 *    Originals always retained via `sourceKey` (the synonym-builder reads
 *    this the same way every other reader's `sourceKey` does).
 *  - `NOT NULL` / nullable → cardinality (never a condition).
 *  - Column type → Rune builtin (`INT`/`BIGINT`→`int`,
 *    `NUMERIC`/`DECIMAL`→`number`, `TEXT`/`VARCHAR`/`CHAR`/`NVARCHAR`→
 *    `string`, `BOOLEAN`→`boolean`, `DATE`→`date`,
 *    `TIMESTAMP`/`DATETIME`→`dateTime` — grounded against `sql-dialect.ts`'s
 *    `POSTGRES_TYPES`/`SQLSERVER_TYPES` column-type maps, the outbound
 *    emitter's own builtin vocabulary, read in reverse).
 *  - `CHECK (col >= n)` and every comparison operator → `comparison`/`range`
 *    ConstraintIR (T2).
 *  - `CHECK (col BETWEEN a AND b)` → `range` (inclusive both bounds).
 *  - `CHECK (col IN (...))` → a Rune `enum`, with the attribute retyped to
 *    it (NOT a condition) — the exact inverse of the outbound emitter's
 *    `enumStrategy: 'check'` default.
 *  - `VARCHAR(n)`/`CHAR(n)`/`NVARCHAR(n)` → `length { max: n }`;
 *    `char_length(col) >= n` / `LEN(col) >= n` (dialect functions) →
 *    `length`.
 *  - `CHECK (col LIKE ...)` → `pattern` (always stub + diagnostic, per the
 *    established rule — no expression-level regex/LIKE operator in Rune).
 *  - `FOREIGN KEY (col) REFERENCES Other(id)` → a typed attribute
 *    referencing `Other`; the special case `FOREIGN KEY (id) REFERENCES
 *    Parent(id)` (the shared-identity/inheritance convention the outbound
 *    emitter's `table-per-type` mode itself emits) → `extends`, and the
 *    `id` column is consumed as the inheritance marker, not re-emitted as
 *    a regular attribute.
 *  - A join table (`{parent}_{attr}`, an owner FK + an element FK, optional
 *    position column) → the owner type gains a `(0..*)` attribute of the
 *    element type; the join table itself is never emitted as a `SourceType`.
 *  - `PRIMARY KEY` / `UNIQUE` / `DEFAULT` → diagnostics-level notes (no
 *    Rune equivalent in scope), never silently dropped.
 *  - An unrecognized `CHECK` expression shape → `custom` stub + diagnostic.
 *
 * This module has zero Rune-AST awareness — its only job is
 * `SQL DDL text → SourceModel`. `ast-builder.ts` / `constraint-translator.ts`
 * do the Rune-specific work, exactly as for every other reader.
 */

import type { Node, Parser } from 'web-tree-sitter';
import type { ConstraintIR, Literal, SourceAttribute, SourceEnum, SourceModel, SourceType } from '../source-model.js';
import { pushDiagnostic, type ImportDiagnostic } from '../diagnostics.js';
import { createSqlParser, type WasmSource } from './sql-grammar-loader.js';

// --- naming ------------------------------------------------------------

/** `trade_event` -> `TradeEvent`; also tolerates already-PascalCase / camelCase input (splits on `_` only, capitalizing each segment). */
function toPascalCase(snake: string): string {
  const parts = snake.split(/[_\s]+/).filter(Boolean);
  if (parts.length === 0) return sanitizeFallback(snake);
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

/** `party_id` -> `partyId`. */
function toCamelCase(snake: string): string {
  const pascal = toPascalCase(snake);
  return pascal.length === 0 ? pascal : pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function sanitizeFallback(raw: string): string {
  let cleaned = raw.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (cleaned.length === 0) cleaned = 'Value';
  if (/^[0-9]/.test(cleaned)) cleaned = `_${cleaned}`;
  return cleaned;
}

/** Sanitizes a non-ValidID-safe enum literal (e.g. `"ACT/360"`) into a Rune-safe identifier — same rule `json-schema-reader.ts`'s `sanitizeEnumValue` applies. */
function sanitizeEnumValue(raw: string): string {
  let cleaned = raw.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (cleaned.length === 0) cleaned = 'VALUE';
  if (/^[0-9]/.test(cleaned)) cleaned = `_${cleaned}`;
  return cleaned;
}

function dedupeIdentifier(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

// --- column type -> Rune builtin ----------------------------------------

/**
 * Grammar column-type node `type` -> Rune builtin, grounded against
 * `sql-dialect.ts`'s `POSTGRES_TYPES`/`SQLSERVER_TYPES` maps read in
 * reverse (this reader's builtin vocabulary must be the SAME set the
 * outbound SQL emitter targets, for the structural round trip to close).
 */
const COLUMN_TYPE_MAP: Readonly<Record<string, string>> = {
  int: 'int',
  integer: 'int',
  bigint: 'int',
  smallint: 'int',
  numeric: 'number',
  decimal: 'number',
  float: 'number',
  double: 'number', // the grammar's REAL/DOUBLE PRECISION node type is `double`, not `real`
  real: 'number',
  double_precision: 'number',
  text: 'string',
  varchar: 'string',
  char: 'string',
  nvarchar: 'string',
  nchar: 'string',
  boolean: 'boolean',
  bit: 'boolean',
  // DATE/DATETIME are bare `keyword_*` leaf tokens in this grammar (no
  // wrapping node), unlike TIMESTAMP/TIME/NUMERIC/etc., which nest under a
  // named node — both forms are handled by `isTypeNode`/`resolveColumnType`.
  keyword_date: 'date',
  timestamp: 'dateTime',
  keyword_datetime: 'dateTime',
  datetime2: 'dateTime',
  time: 'time'
};

// --- reader options -------------------------------------------------------

export interface SqlImportOptions {
  /** Rune namespace (SQL DDL has no namespace concept of its own — always required, unlike the JSON Schema/OpenAPI readers' `$id`-derived fallback). */
  namespace: string;
  /**
   * Matches the outbound SQL emitter's `SqlDialectName` surface
   * (`sql-dialect.ts`), spec.md's `--sql-dialect` CLI flag. The
   * `web-tree-sitter` grammar itself is dialect-tolerant (both dialects'
   * DDL shapes parse without a mode switch — confirmed by the T0 spike's
   * dialect-matrix probes), so this is currently informational/reserved
   * for future dialect-specific reader behavior (e.g. a diagnostic that
   * only makes sense for one dialect's own conventions) rather than a
   * parsing-mode switch. Default: `'postgres'` (matches the outbound
   * emitter's own default).
   */
  dialect?: 'postgres' | 'sqlserver';
  /** Structural import only — never populate `constraints` arrays (spec.md CLI `--no-conditions`). Default: translate constraints. */
  skipConditions?: boolean;
  /** Overrides the default `web-tree-sitter` wasm loading (see `sql-grammar-loader.ts`'s `WasmSource`) — primarily for browser callers. */
  wasmSource?: WasmSource;
}

interface RawTable {
  name: string;
  columns: RawColumn[];
  foreignKeys: RawForeignKey[];
  tableChecks: Node[];
}

interface RawColumn {
  name: string;
  typeNode: Node;
  notNull: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  hasDefault: boolean;
  checkNodes: Node[];
}

interface RawForeignKey {
  /** The single local column this FK constrains (composite FKs are out of scope — diagnosed). */
  column: string;
  refTable: string;
  refColumn: string;
}

/** Reads a full SQL DDL script (one or more `CREATE TABLE` statements) into a `SourceModel`. */
export async function readSql(
  sql: string,
  options: SqlImportOptions
): Promise<{ model: SourceModel; diagnostics: ImportDiagnostic[] }> {
  const diagnostics: ImportDiagnostic[] = [];
  const parser = await createSqlParser(options.wasmSource);
  const tree = parser.parse(sql);
  if (tree === null) {
    throw new Error('rune-codegen import: the SQL parser returned no tree (empty input?)');
  }
  // NOTE: the FULL script's own top-level `tree.rootNode.hasError` is
  // deliberately NOT checked here — a BETWEEN-CHECK column followed by
  // another item always leaves that top-level parse `hasError: true` (the
  // grammar's own recovery artifact, T2's finding), even though per-item
  // isolation (`parseIsolatedItem`, below) fully and correctly recovers
  // it. Checking the top-level tree would falsely flag every such
  // (correctly-handled) case as broken. Genuine, UNRECOVERABLE syntax
  // problems (bracket-quoted identifiers, `NVARCHAR(MAX)`) are instead
  // surfaced per-item, from each isolated re-parse's OWN `hasError` —
  // see `parseIsolatedItem`'s `sql-parse-error` diagnostic below.

  const rawTables = collectTables(tree.rootNode, parser, diagnostics);
  const { joinTables, ownerAttributes } = classifyJoinTables(rawTables);

  const enums: SourceEnum[] = [];
  const enumNameByColumn = new Map<string, string>(); // `${table}.${column}` -> enum name
  const consumedTableChecks = new Set<Node>();
  for (const table of rawTables) {
    if (joinTables.has(table.name)) continue;
    for (const col of table.columns) {
      // An enum CHECK can appear EITHER inline on the column definition
      // (`status TEXT CHECK (status IN (...))`, the T1/T2 fixtures' own
      // shape) OR as a separate table-level constraint (`CHECK (status IN
      // (...))`, declared after the column list) — the LATTER is exactly
      // what the REAL outbound SQL emitter always produces (`sql-
      // emitter.ts`'s `constraints.push(CHECK (...) IN (...))`, appended
      // to the table's own constraint list, never inline on the column) —
      // a real gap found via the structural round-trip oracle: every prior
      // T1/T2 test fixture happened to use the inline shape, which masked
      // this entirely. Both shapes are scanned here.
      const enumCheck =
        col.checkNodes.find((n) => isEnumCheck(n, col.name)) ??
        table.tableChecks.find((n) => !consumedTableChecks.has(n) && isEnumCheck(n, col.name));
      if (enumCheck) {
        consumedTableChecks.add(enumCheck);
        const sourceEnum = buildEnumFromCheck(table.name, col.name, enumCheck, diagnostics);
        if (sourceEnum) {
          enums.push(sourceEnum);
          enumNameByColumn.set(`${table.name}.${col.name}`, sourceEnum.name);
        }
      }
    }
  }

  // Remove every table-level CHECK consumed above as an enum declaration —
  // `buildType`'s own table-level-CHECK translation loop must not ALSO
  // re-translate it as a `custom`/comparison condition (double-counting
  // the same source constraint under two different representations).
  for (const table of rawTables) {
    table.tableChecks = table.tableChecks.filter((n) => !consumedTableChecks.has(n));
  }

  const types: SourceType[] = [];
  const usedTypeNames = new Set<string>();
  for (const table of rawTables) {
    if (joinTables.has(table.name)) continue;
    types.push(
      buildType(
        table,
        rawTables,
        joinTables,
        ownerAttributes,
        enumNameByColumn,
        usedTypeNames,
        diagnostics,
        options.skipConditions ?? false
      )
    );
  }

  return {
    model: { namespace: options.namespace, sourceName: 'Sql', types, enums, funcs: [] },
    diagnostics
  };
}

// --- statement / table collection ----------------------------------------

function collectTables(root: Node, parser: Parser, diagnostics: ImportDiagnostic[]): RawTable[] {
  const tables: RawTable[] = [];
  for (const statement of walkNamed(root, 'statement')) {
    const createTable = statement.namedChildren.find((n) => n?.type === 'create_table');
    if (!createTable) continue;
    const table = readCreateTable(createTable, parser, diagnostics);
    if (table) tables.push(table);
  }
  return tables;
}

function* walkNamed(node: Node, type: string): Generator<Node> {
  for (const child of node.namedChildren) {
    if (!child) continue;
    if (child.type === type) yield child;
    else yield* walkNamed(child, type);
  }
}

function readCreateTable(node: Node, parser: Parser, diagnostics: ImportDiagnostic[]): RawTable | undefined {
  const objectRef = node.namedChildren.find((n) => n?.type === 'object_reference');
  if (!objectRef) return undefined;
  const name = lastIdentifierSegment(objectRef);

  const columnDefs = node.namedChildren.find((n) => n?.type === 'column_definitions');
  const columns: RawColumn[] = [];
  const foreignKeys: RawForeignKey[] = [];
  const tableChecks: Node[] = [];

  // T0/T2 finding: when a column-level `CHECK (... BETWEEN ...)` is
  // followed by ANY further column or table-level constraint item, the
  // grammar's error recovery merges everything after it into a SINGLE
  // malformed `column_definition` node — the following item's own
  // identifier is unrecoverable from that merged subtree (its type token
  // may survive as a stray sibling, but with no attached name; confirmed
  // via isolated probes in `.superpowers/sdd/sql-reader-report.md`'s T2
  // notes). Rather than special-case detection, every table's column-list
  // is ALWAYS split at the text level (respecting paren/quote nesting) and
  // each item is re-parsed as its own isolated single-item table — this
  // sidesteps the recovery bug entirely instead of trying to reconstruct
  // a merged, ambiguous subtree.
  const itemTexts = columnDefs ? splitTopLevelItems(columnDefs.text) : [];
  for (const itemText of itemTexts) {
    const isolated = parseIsolatedItem(parser, name, itemText, diagnostics);
    if (!isolated) continue;
    if (isolated.kind === 'column') {
      const col = readColumnDefinition(isolated.node, name, diagnostics, isolated.extraErrorSibling);
      if (col) columns.push(col);
    } else {
      readTableConstraint(isolated.node, name, foreignKeys, tableChecks, diagnostics);
    }
  }

  return { name, columns, foreignKeys, tableChecks };
}

/**
 * Splits a `column_definitions` node's own text (including its outer
 * parens) into individual top-level item texts (one per column definition
 * or table-level constraint), respecting nested parens and single-quoted
 * string literals (which may themselves contain commas or parens, e.g.
 * `DEFAULT 'a, b'` or `CHECK (code LIKE '(%')`).
 */
function splitTopLevelItems(columnDefsText: string): string[] {
  // Strip the outer `(` ... `)` — `columnDefsText` is the FULL
  // `column_definitions` node text, which includes them.
  const inner = columnDefsText.replace(/^\s*\(/, '').replace(/\)\s*$/, '');
  const items: string[] = [];
  let depth = 0;
  let inString = false;
  let current = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (inString) {
      current += ch;
      if (ch === "'" && inner[i + 1] === "'") {
        current += inner[++i]!; // escaped '' inside a string literal — not the closing quote
      } else if (ch === "'") {
        inString = false;
      }
      continue;
    }
    if (ch === "'") {
      inString = true;
      current += ch;
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      items.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim().length > 0) items.push(current.trim());
  return items;
}

type IsolatedItem = { kind: 'column'; node: Node; extraErrorSibling?: Node } | { kind: 'constraint'; node: Node };

/** A table-level-constraint item starts with `FOREIGN KEY` or a bare `CHECK` (not a column name followed by a type). */
const TABLE_CONSTRAINT_ITEM_RE = /^\s*(FOREIGN\s+KEY|CHECK)\b/i;

/**
 * `GENERATED BY DEFAULT AS IDENTITY` (the postgres surrogate-PK phrase the
 * REAL outbound SQL emitter itself emits, `sql-dialect.ts`'s `pkColumn`) is
 * NOT tolerated by this grammar (`BY DEFAULT` has no rule at all — a real
 * gap found via the structural round-trip oracle) — but `GENERATED ALWAYS
 * AS IDENTITY` (the SQL-standard alternative, semantically equivalent for
 * this reader's purposes: neither form carries any information this reader
 * uses, since identity/auto-increment has no Rune equivalent, same
 * category as PRIMARY KEY/DEFAULT) DOES parse cleanly. Normalizing `BY
 * DEFAULT` → `ALWAYS` before parsing is a deterministic, lossless-for-this-
 * reader's-purposes text fix (not a guess at semantic content) that lets a
 * real, common postgres DDL idiom import without a spurious, non-
 * actionable parse-error diagnostic on a column that is either the
 * always-discarded surrogate `id` PK or (if used on a non-`id` column) one
 * whose identity/auto-increment behavior this reader was never going to
 * represent regardless of which GENERATED variant was used.
 */
function normalizeGeneratedIdentity(itemText: string): string {
  return itemText.replace(/GENERATED\s+BY\s+DEFAULT\s+AS\s+IDENTITY/gi, 'GENERATED ALWAYS AS IDENTITY');
}

/**
 * Re-parses one column-definition or table-constraint item text in
 * isolation, sidestepping the BETWEEN error-recovery merge (see
 * `readCreateTable`'s doc). A separate, made-up table name (`<owner>_iso`)
 * avoids any accidental self-reference collision with the real table name
 * inside a FK item's own text.
 *
 * A bare table-level constraint item (`FOREIGN KEY (...)`/`CHECK (...)`)
 * does not parse standalone at all — the grammar's `constraints` rule
 * requires at least one real `column_definition` before it (confirmed via
 * an isolated probe: `CREATE TABLE t (FOREIGN KEY (a) REFERENCES b(c))`
 * alone produces `hasError: true`) — so a constraint item is parsed with a
 * harmless dummy leading column prepended, and the SECOND top-level item
 * (past the dummy) is extracted instead of the first.
 *
 * A column item whose own `CHECK (... BETWEEN ...)` clause doesn't attach
 * cleanly to the `column_definition` node still produces a TRAILING
 * `ERROR` node as a SIBLING of `column_definition` under
 * `column_definitions` (NOT nested inside it, despite how it renders in a
 * naive recursive tree dump) — this ERROR sibling carries the
 * `between_expression` `readColumnDefinition` needs; it is threaded back
 * as `extraErrorSibling` for the caller to fold in. That specific shape is
 * the FULLY-RECOVERED case (every field is still recoverable) and must
 * NOT itself trigger a diagnostic — only when the isolated re-parse still
 * has an error AND no `between_expression` is recoverable from it (a
 * genuinely unrecoverable shape — e.g. a bracket-quoted identifier or
 * `NVARCHAR(MAX)`, T0's documented grammar-tolerance gaps) does this push
 * `sql-parse-error`.
 */
function parseIsolatedItem(
  parser: Parser,
  ownerTable: string,
  itemText: string,
  diagnostics: ImportDiagnostic[]
): IsolatedItem | undefined {
  const isConstraint = TABLE_CONSTRAINT_ITEM_RE.test(itemText);
  const normalizedItemText = normalizeGeneratedIdentity(itemText);
  const isolatedSql = isConstraint
    ? `CREATE TABLE ${ownerTable}_iso (__rune_iso_dummy__ INT, ${normalizedItemText})`
    : `CREATE TABLE ${ownerTable}_iso (${normalizedItemText})`;
  const tree = parser.parse(isolatedSql);
  if (!tree) return undefined;
  const createTable = [...walkNamed(tree.rootNode, 'create_table')][0];
  const columnDefs = createTable?.namedChildren.find((n) => n?.type === 'column_definitions');
  const siblings = columnDefs?.namedChildren.filter((n): n is Node => n !== null) ?? [];
  for (let i = 0; i < siblings.length; i++) {
    const child = siblings[i]!;
    if (child.type === 'column_definition' && !isConstraint) {
      const next = siblings[i + 1];
      const extraErrorSibling = next?.type === 'ERROR' ? next : undefined;
      const recoveredBetween = extraErrorSibling && [...walkNamed(extraErrorSibling, 'between_expression')][0];
      if (tree.rootNode.hasError && !recoveredBetween) {
        pushDiagnostic(diagnostics, {
          severity: 'warning',
          code: 'sql-parse-error',
          message:
            `${ownerTable}: the column item '${itemText}' did not parse cleanly — the imported column may be ` +
            `incomplete or missing; common causes: a bracket-quoted identifier ([name]) or NVARCHAR(MAX), ` +
            `neither tolerated by this reader's grammar (use a double-quoted identifier / a concrete NVARCHAR size instead)`
        });
      }
      return { kind: 'column', node: child, ...(extraErrorSibling && { extraErrorSibling }) };
    }
    if (child.type === 'constraints') {
      const constraint = child.namedChildren.find((n) => n?.type === 'constraint');
      if (constraint) return { kind: 'constraint', node: constraint };
    }
  }
  if (tree.rootNode.hasError) {
    pushDiagnostic(diagnostics, {
      severity: 'warning',
      code: 'sql-parse-error',
      message: `${ownerTable}: the item '${itemText}' did not parse cleanly and was skipped entirely`
    });
  }
  return undefined;
}

/** `dbo.trade_event` -> `trade_event` (schema-qualification is not modeled — the schema segment is dropped, matching the outbound emitter's own single-schema-per-namespace assumption). Bracket-quoted segments are not tolerated by the grammar at all (T0 spike finding) so never appear here; double-quoted segments have their quotes stripped. */
function lastIdentifierSegment(objectRef: Node): string {
  const idents = objectRef.namedChildren.filter((n) => n?.type === 'identifier');
  const last = idents[idents.length - 1] ?? objectRef;
  return stripQuotes(last.text);
}

function stripQuotes(text: string): string {
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) return text.slice(1, -1);
  return text;
}

function readColumnDefinition(
  node: Node,
  tableName: string,
  diagnostics: ImportDiagnostic[],
  extraErrorSibling?: Node
): RawColumn | undefined {
  const identNode = node.namedChildren.find((n) => n?.type === 'identifier' || n?.type === 'literal');
  if (!identNode) return undefined;
  const name = stripQuotes(identNode.text);

  // The column-type node is the first named child that isn't the identifier
  // itself and isn't one of the constraint-keyword/CHECK nodes below.
  const typeNode = node.namedChildren.find((n) => n && n !== identNode && isTypeNode(n.type));
  if (!typeNode) {
    pushDiagnostic(diagnostics, {
      severity: 'warning',
      code: 'sql-unresolved-column-type',
      message: `${tableName}.${name}: could not identify a column type node — defaulting to 'string'`
    });
  }

  let notNull = false;
  let isPrimaryKey = false;
  let isUnique = false;
  let hasDefault = false;
  const checkNodes: Node[] = [];

  const children = node.namedChildren;
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (!c) continue;
    if (c.type === 'keyword_not' && children[i + 1]?.type === 'keyword_null') notNull = true;
    if (c.type === 'keyword_primary') isPrimaryKey = true;
    if (c.type === 'keyword_unique') isUnique = true;
    if (c.type === 'keyword_default') hasDefault = true;
    if (c.type === 'keyword_check') {
      // The CHECK's parenthesized expression is the next sibling(s); grab
      // every named child after the CHECK keyword up to (but not including)
      // another top-level keyword, which in practice is exactly the single
      // expression node the grammar nests directly under column_definition.
      const exprNode = children[i + 1]?.type === '(' ? children[i + 2] : children[i + 1];
      if (exprNode) checkNodes.push(exprNode);
    }
    // T0/T2 finding: a column-level `CHECK (... BETWEEN ...)` parses into an
    // `ERROR` node wrapping a valid `between_expression` (the grammar has no
    // `column_definition` rule path for BETWEEN specifically) — recover it
    // by searching the ERROR node's own subtree for a `between_expression`
    // rather than treating the whole column as unparseable. This ERROR node
    // is a SIBLING of `column_definition` at the `column_definitions` level
    // (not nested inside it, despite how a naive recursive dump renders it),
    // so it's threaded in here as `extraErrorSibling` by the caller
    // (`parseIsolatedItem`/`readCreateTable`) rather than found among
    // `node.namedChildren` directly.
    if (c.type === 'ERROR') {
      const between = [...walkNamed(c, 'between_expression')][0];
      if (between) checkNodes.push(between);
    }
  }
  if (extraErrorSibling) {
    const between = [...walkNamed(extraErrorSibling, 'between_expression')][0];
    if (between) checkNodes.push(between);
  }

  return { name, typeNode: typeNode ?? node, notNull, isPrimaryKey, isUnique, hasDefault, checkNodes };
}

function isTypeNode(type: string): boolean {
  return (
    type in COLUMN_TYPE_MAP ||
    ['varchar', 'nvarchar', 'char', 'nchar', 'numeric', 'decimal'].includes(type) ||
    type === 'keyword_text' ||
    type === 'keyword_boolean' ||
    type === 'serial'
  );
}

function readTableConstraint(
  node: Node,
  tableName: string,
  foreignKeys: RawForeignKey[],
  tableChecks: Node[],
  diagnostics: ImportDiagnostic[]
): void {
  const hasForeignKeyword = node.namedChildren.some((n) => n?.type === 'keyword_foreign');
  if (hasForeignKeyword) {
    const orderedCols = node.namedChildren.find((n) => n?.type === 'ordered_columns');
    const localCols = (orderedCols?.namedChildren ?? [])
      .filter((n) => n?.type === 'column')
      .map((n) => stripQuotes((n!.namedChildren.find((c) => c?.type === 'identifier') ?? n!).text));
    const refTableRef = node.namedChildren.find((n) => n?.type === 'object_reference');
    const refTable = refTableRef ? lastIdentifierSegment(refTableRef) : undefined;
    // The referenced column is the bare identifier inside the trailing `(...)`.
    const refColIdent = [...node.namedChildren].reverse().find((n) => n?.type === 'identifier');
    const refCol = refColIdent ? stripQuotes(refColIdent.text) : 'id';

    if (localCols.length !== 1 || !refTable) {
      pushDiagnostic(diagnostics, {
        severity: 'warning',
        code: 'sql-unsupported-composite-fk',
        message: `${tableName}: a FOREIGN KEY constraint with ${localCols.length} local column(s) is not supported (composite FKs are out of scope) — skipped`
      });
      return;
    }
    foreignKeys.push({ column: localCols[0]!, refTable, refColumn: refCol });
    return;
  }
  const hasCheckKeyword = node.namedChildren.some((n) => n?.type === 'keyword_check');
  if (hasCheckKeyword) {
    const exprNode = node.namedChildren.find(
      (n) => n && n.type !== 'keyword_check' && n.type !== '(' && n.type !== ')'
    );
    if (exprNode) tableChecks.push(exprNode);
    return;
  }
  // PRIMARY KEY / UNIQUE table-level constraints: no Rune equivalent in
  // scope — recorded as a diagnostic, never silently dropped.
  pushDiagnostic(diagnostics, {
    severity: 'info',
    code: 'sql-unsupported-table-constraint',
    message: `${tableName}: a table-level constraint (${node.text.slice(0, 60)}) has no Rune equivalent in scope — skipped`
  });
}

// --- join-table classification --------------------------------------------

interface OwnerAttribute {
  ownerTable: string;
  attrName: string;
  elementTable: string;
}

/**
 * A join table is `{parent}_{attr}` shaped: exactly two FK columns (an
 * owner FK + an element FK), each referencing a distinct other table, with
 * at most one additional (non-FK) column (an optional position column,
 * order is not modeled). Recognized join tables are excluded from
 * `types` entirely; the owner type instead gains a `(0..*)` attribute.
 */
function classifyJoinTables(tables: readonly RawTable[]): {
  joinTables: ReadonlySet<string>;
  ownerAttributes: ReadonlyMap<string, OwnerAttribute>;
} {
  const tableNames = new Set(tables.map((t) => t.name));
  const joinTables = new Set<string>();
  const ownerAttributes = new Map<string, OwnerAttribute>();

  for (const table of tables) {
    if (table.foreignKeys.length !== 2) continue;
    const nonFkColumns = table.columns.filter((c) => !table.foreignKeys.some((fk) => fk.column === c.name));
    if (nonFkColumns.length > 1) continue; // more than an optional position column — not a plain join table
    const [fk1, fk2] = table.foreignKeys;
    if (!fk1 || !fk2 || fk1.refTable === fk2.refTable) continue;
    if (!tableNames.has(fk1.refTable) || !tableNames.has(fk2.refTable)) continue;

    // Disambiguate owner vs. element by the naming convention: the table
    // name is `{owner}_{attr}` — the owner segment should match one of the
    // two referenced tables' snake_case name (case-insensitively, since the
    // reader compares raw sourceKeys, not the sanitized Rune names).
    const ownerCandidate = [fk1, fk2].find((fk) => table.name.toLowerCase().startsWith(`${fk.refTable}_`));
    const [ownerFk, elementFk] = ownerCandidate ? [ownerCandidate, ownerCandidate === fk1 ? fk2 : fk1] : [fk1, fk2]; // naming didn't disambiguate — fall back to declaration order, still a valid join table
    joinTables.add(table.name);
    const attrName = table.name.slice(ownerFk.refTable.length + 1) || toCamelCase(elementFk.refTable);
    ownerAttributes.set(table.name, {
      ownerTable: ownerFk.refTable,
      attrName: toCamelCase(attrName),
      elementTable: elementFk.refTable
    });
  }

  return { joinTables, ownerAttributes };
}

// --- type building ----------------------------------------------------------

function buildType(
  table: RawTable,
  allTables: readonly RawTable[],
  joinTables: ReadonlySet<string>,
  ownerAttributes: ReadonlyMap<string, OwnerAttribute>,
  enumNameByColumn: ReadonlyMap<string, string>,
  usedTypeNames: Set<string>,
  diagnostics: ImportDiagnostic[],
  skipConditions: boolean
): SourceType {
  const typeName = dedupeIdentifier(toPascalCase(table.name), usedTypeNames);

  // Inheritance-FK convention: `FOREIGN KEY (id) REFERENCES Parent(id)` —
  // the referenced table becomes `extends`, and the `id` column is
  // consumed as the inheritance marker rather than re-emitted as a
  // regular attribute (mirrors the outbound emitter's own
  // table-per-type shared-identity FK exactly, read in reverse).
  const inheritanceFk = table.foreignKeys.find((fk) => fk.column === 'id' && fk.refColumn === 'id');
  const extendsName = inheritanceFk ? toPascalCase(inheritanceFk.refTable) : undefined;

  const attributes: SourceAttribute[] = [];
  const constraints: ConstraintIR[] = [];
  const usedAttrNames = new Set<string>();

  for (const col of table.columns) {
    if (col.name === 'id' && (inheritanceFk || !table.foreignKeys.some((fk) => fk.column === 'id'))) {
      // The surrogate `id` PK (own-identity or shared-with-parent) carries
      // no domain meaning — never emitted as an attribute, matching the
      // outbound emitter's own synthesized surrogate PK (which has no
      // Rune-side counterpart to round-trip back from).
      continue;
    }
    const fk = table.foreignKeys.find((f) => f.column === col.name);
    if (fk) {
      attributes.push(buildFkAttribute(col, fk, usedAttrNames));
      continue;
    }
    const enumName = enumNameByColumn.get(`${table.name}.${col.name}`);
    const attr = buildScalarAttribute(table.name, col, enumName, usedAttrNames, diagnostics, skipConditions);
    attributes.push(attr.attribute);
    // NOT also pushed into the type-level `constraints` array here: this
    // attribute's own `attr.attribute.constraints` already carries them,
    // and `ast-builder.ts`'s `buildDataType` independently walks BOTH
    // `type.constraints` AND every `attr.constraints` to build the final
    // condition list — pushing the same IR into both arrays double-
    // translates it into two duplicate `Condition` nodes (a real bug found
    // via the T4 constraint round-trip oracle; `json-schema-reader.ts`'s
    // own `SourceType.constraints` never does this, only ever holding
    // GENUINELY type-level constraints like `oneOf`, and this reader's
    // `constraints` array must honor that same contract).
  }

  // Join-table-derived (0..*) attributes owned by this table.
  for (const [joinTableName, owner] of ownerAttributes) {
    if (owner.ownerTable !== table.name) continue;
    const joinTable = allTables.find((t) => t.name === joinTableName);
    const positionCol = joinTable?.columns.find((c) => !joinTable.foreignKeys.some((fk) => fk.column === c.name));
    if (positionCol) {
      pushDiagnostic(diagnostics, {
        severity: 'info',
        code: 'sql-join-table-position-ignored',
        message: `join table '${joinTableName}' has a position column ('${positionCol.name}') — element order is not modeled; the attribute is unordered (0..*)`
      });
    }
    attributes.push({
      name: dedupeIdentifier(owner.attrName, usedAttrNames),
      typeName: toPascalCase(owner.elementTable),
      cardinality: { inf: 0 },
      sourceKey: joinTableName,
      constraints: []
    });
  }

  // Table-level CHECK constraints (not tied to one column).
  if (!skipConditions) {
    for (const checkNode of table.tableChecks) {
      const ir = translateCheckNode(checkNode, undefined, diagnostics);
      if (ir) constraints.push(ir);
    }
  }

  return {
    name: typeName,
    ...(extendsName !== undefined && { extends: extendsName }),
    sourceKey: table.name,
    attributes,
    constraints
  };
}

function buildFkAttribute(col: RawColumn, fk: RawForeignKey, usedAttrNames: Set<string>): SourceAttribute {
  // The attribute name derives from the referenced type, not the raw
  // `<attr>_id` column name (`party_id` -> `party`), matching how a
  // hand-written Rune model would name a typed reference — the FK column
  // name is preserved via `sourceKey` for the synonym.
  const baseName = col.name.replace(/_id$/i, '') || fk.refTable;
  return {
    name: dedupeIdentifier(toCamelCase(baseName), usedAttrNames),
    typeName: toPascalCase(fk.refTable),
    cardinality: col.notNull ? { inf: 1, sup: 1 } : { inf: 0, sup: 1 },
    sourceKey: col.name,
    constraints: []
  };
}

function buildScalarAttribute(
  tableName: string,
  col: RawColumn,
  enumName: string | undefined,
  usedAttrNames: Set<string>,
  diagnostics: ImportDiagnostic[],
  skipConditions: boolean
): { attribute: SourceAttribute; constraints: ConstraintIR[] } {
  const attrName = dedupeIdentifier(toCamelCase(col.name), usedAttrNames);
  const constraints: ConstraintIR[] = [];

  if (col.isPrimaryKey) {
    pushDiagnostic(diagnostics, {
      severity: 'info',
      code: 'sql-primary-key-note',
      message: `${tableName}.${col.name}: PRIMARY KEY has no Rune equivalent in scope — cardinality/typing imported, uniqueness constraint dropped`
    });
  }
  if (col.isUnique) {
    pushDiagnostic(diagnostics, {
      severity: 'info',
      code: 'sql-unique-note',
      message: `${tableName}.${col.name}: UNIQUE has no Rune equivalent in scope — dropped`
    });
  }
  if (col.hasDefault) {
    pushDiagnostic(diagnostics, {
      severity: 'info',
      code: 'sql-default-note',
      message: `${tableName}.${col.name}: DEFAULT has no Rune equivalent in scope — dropped`
    });
  }

  if (enumName) {
    if (!skipConditions) {
      // The enum-defining CHECK is consumed as the enum declaration itself
      // (T2/buildEnumFromCheck), never re-emitted as a `comparison`/`custom`
      // condition — avoids double-translating the same CHECK.
    }
    return {
      attribute: {
        name: attrName,
        typeName: enumName,
        cardinality: col.notNull ? { inf: 1, sup: 1 } : { inf: 0, sup: 1 },
        sourceKey: col.name,
        constraints: []
      },
      constraints: []
    };
  }

  const { typeName, lengthMax } = resolveColumnType(col.typeNode, diagnostics, `${tableName}.${col.name}`);
  if (lengthMax !== undefined && !skipConditions) {
    constraints.push({ kind: 'length', path: col.name, max: lengthMax });
  }

  if (!skipConditions) {
    for (const checkNode of col.checkNodes) {
      const ir = translateCheckNode(checkNode, col.name, diagnostics);
      if (ir) constraints.push(ir);
    }
  }

  return {
    attribute: {
      name: attrName,
      typeName,
      cardinality: col.notNull ? { inf: 1, sup: 1 } : { inf: 0, sup: 1 },
      sourceKey: col.name,
      constraints
    },
    constraints
  };
}

function resolveColumnType(
  typeNode: Node,
  diagnostics: ImportDiagnostic[],
  where: string
): { typeName: string; lengthMax?: number } {
  const mapped = COLUMN_TYPE_MAP[typeNode.type];
  if (mapped) {
    if (['varchar', 'char', 'nvarchar', 'nchar'].includes(typeNode.type)) {
      const sizeLiteral = typeNode.namedChildren.find((n) => n?.type === 'literal');
      const size = sizeLiteral ? Number(sizeLiteral.text) : undefined;
      return { typeName: mapped, ...(Number.isFinite(size) && size !== undefined && { lengthMax: size }) };
    }
    return { typeName: mapped };
  }
  if (typeNode.type === 'keyword_text') return { typeName: 'string' };
  if (typeNode.type === 'keyword_boolean') return { typeName: 'boolean' };
  if (typeNode.type === 'serial') return { typeName: 'int' };
  pushDiagnostic(diagnostics, {
    severity: 'warning',
    code: 'sql-unresolved-column-type',
    message: `${where}: unrecognized column type '${typeNode.type}' ('${typeNode.text}') — defaulting to 'string'`
  });
  return { typeName: 'string' };
}

// --- enum CHECK detection --------------------------------------------------

/** True when `checkNode` is a `binary_expression` shaped `col IN (lit, lit, ...)` over exactly `columnName`. */
function isEnumCheck(checkNode: Node, columnName: string): boolean {
  if (checkNode.type !== 'binary_expression') return false;
  const op = checkNode.namedChildren.find((n) => n?.type === 'keyword_in');
  if (!op) return false;
  const list = checkNode.namedChildren.find((n) => n?.type === 'list');
  if (!list) return false;
  const columnRef = checkNode.namedChildren.find((n) => n && n !== list && operandColumnName(n) !== undefined);
  return columnRef !== undefined && operandColumnName(columnRef) === columnName;
}

/** A double-quoted identifier (`"status"`) parses as a bare `literal` node in this grammar — indistinguishable at the node-type level from a real string literal EXCEPT by quote character (SQL identifiers use `"`, string values use `'`). */
function isQuotedIdentifierLiteral(text: string): boolean {
  return text.length >= 2 && text.startsWith('"') && text.endsWith('"');
}

/**
 * Resolves a column name from EITHER shape an unqualified column reference
 * can take in this grammar: a `field` node (the common, unquoted-identifier
 * case) or a bare `literal` node whose text is double-quoted (a quoted
 * identifier — e.g. `"status"` in `CHECK ("status" IN (...))`, which this
 * grammar tokenizes identically to how it would tokenize a `field`'s own
 * quoted identifier, just without the `field` wrapper). Returns `undefined`
 * for anything else (a real string/numeric literal, an `invocation`, etc.).
 */
function operandColumnName(node: Node): string | undefined {
  if (node.type === 'field') return fieldColumnName(node);
  if (node.type === 'literal' && isQuotedIdentifierLiteral(node.text)) return stripQuotes(node.text);
  return undefined;
}

function fieldColumnName(field: Node): string | undefined {
  const ident = field.namedChildren.find((n) => n?.type === 'identifier');
  return ident ? stripQuotes(ident.text) : undefined;
}

function buildEnumFromCheck(
  tableName: string,
  columnName: string,
  checkNode: Node,
  diagnostics: ImportDiagnostic[]
): SourceEnum | undefined {
  const list = checkNode.namedChildren.find((n) => n?.type === 'list');
  const literals = (list?.namedChildren ?? []).filter((n) => n?.type === 'literal');
  if (literals.length === 0) {
    pushDiagnostic(diagnostics, {
      severity: 'warning',
      code: 'sql-empty-enum-check',
      message: `${tableName}.${columnName}: CHECK (... IN (...)) has no literal values — enum not emitted`
    });
    return undefined;
  }
  const used = new Set<string>();
  const values = literals.map((lit) => {
    const original = unquoteSqlLiteral(lit!.text);
    const name = dedupeIdentifier(sanitizeEnumValue(original), used);
    return {
      name,
      sourceKey: original,
      ...(name !== original && { displayName: original })
    };
  });
  return { name: toPascalCase(`${columnName}_enum`), sourceKey: columnName, values };
}

/** `'NEW'` -> `NEW` (SQL string literals use `''` to escape an embedded quote). */
function unquoteSqlLiteral(text: string): string {
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  return text;
}

// --- CHECK expression -> ConstraintIR --------------------------------------

type ComparisonOp = '=' | '<>' | '<' | '<=' | '>' | '>=';

const COMPARISON_OPS: Readonly<Record<string, ComparisonOp>> = {
  '=': '=',
  '<>': '<>',
  '<': '<',
  '<=': '<=',
  '>': '>',
  '>=': '>='
};

/** Translates one `CHECK (...)` expression node into a `ConstraintIR`, or `undefined` when column-scoped context couldn't be established (falls back to `custom` otherwise). `path` is the column this CHECK is attached to; `undefined` for a table-level CHECK (the field name is read directly off the expression instead). */
function translateCheckNode(node: Node, path: string | undefined, diagnostics: ImportDiagnostic[]): ConstraintIR {
  if (node.type === 'between_expression') {
    return translateBetween(node, path, diagnostics);
  }
  if (node.type === 'binary_expression') {
    const ir = translateBinaryExpression(node, path, diagnostics);
    if (ir) return ir;
  }
  return {
    kind: 'custom',
    expressionText: node.text,
    translatable: false
  };
}

function translateBetween(node: Node, path: string | undefined, diagnostics: ImportDiagnostic[]): ConstraintIR {
  const columnNode = node.namedChildren.find((n) => n?.type === 'field' || n?.type === 'literal');
  const resolvedPath = path ?? (columnNode ? operandColumnName(columnNode) : undefined);
  // A quoted-identifier column node is itself a `literal` (see
  // `operandColumnName`'s doc) — excluded here so it never gets mistaken
  // for one of the two NUMERIC bounds below.
  const literals = node.namedChildren.filter((n): n is Node => n?.type === 'literal' && n !== columnNode);
  const min = literals[0] ? Number(literals[0].text) : undefined;
  const max = literals[1] ? Number(literals[1].text) : undefined;
  if (!resolvedPath || min === undefined || max === undefined || Number.isNaN(min) || Number.isNaN(max)) {
    pushDiagnostic(diagnostics, {
      severity: 'warning',
      code: 'untranslatable-construct',
      message: `unable to resolve a BETWEEN constraint's column/bounds from '${node.text}' — emitting a stub condition`
    });
    return { kind: 'custom', expressionText: node.text, translatable: false };
  }
  // BETWEEN is inclusive on both bounds per SQL semantics (spec.md item 3).
  return { kind: 'range', path: resolvedPath, min, max };
}

function translateBinaryExpression(
  node: Node,
  path: string | undefined,
  diagnostics: ImportDiagnostic[]
): ConstraintIR | undefined {
  // The comparison-operator token (`>=`, `<>`, `<`, etc.) is an ANONYMOUS
  // node (`isNamed: false`) in this grammar — it is present in `node.
  // children` (ALL children) but never in `node.namedChildren`, which only
  // ever surfaces the two named operand nodes (`field`/`literal`/
  // `invocation`). `LIKE`/`IN` ARE named (`keyword_like`/`keyword_in`), so
  // the search must cover both children arrays.
  const allChildren = [...Array(node.childCount).keys()].map((i) => node.child(i)).filter((n): n is Node => n !== null);
  const children = node.namedChildren.filter((n): n is Node => n !== null);
  const opNode = allChildren.find(
    (n) => n.type in COMPARISON_OPS || n.type === 'keyword_like' || n.type === 'keyword_in'
  );
  if (!opNode) return undefined;

  if (opNode.type === 'keyword_like') {
    const columnNode = children.find(
      (n) => n.type === 'field' || (n.type === 'literal' && isQuotedIdentifierLiteral(n.text))
    );
    const resolvedPath = path ?? (columnNode ? operandColumnName(columnNode) : undefined);
    // The pattern VALUE is a `literal` too, but a real (single-quoted)
    // string — distinct from `columnNode`, which (when it's a quoted
    // identifier) is ALSO a `literal` node, just double-quoted.
    const literal = children.find((n) => n.type === 'literal' && n !== columnNode);
    pushDiagnostic(diagnostics, {
      severity: 'warning',
      code: 'untranslatable-construct',
      message: `LIKE pattern constraint on '${resolvedPath ?? '<unknown>'}' has no Rune expression-level equivalent — emitting a stub condition`
    });
    return { kind: 'pattern', path: resolvedPath ?? 'value', regex: literal ? unquoteSqlLiteral(literal.text) : '' };
  }
  if (opNode.type === 'keyword_in') {
    // A non-enum-shaped IN (already excluded by isEnumCheck upstream, e.g.
    // the values aren't all literals, or this is a table-level CHECK) has
    // no ConstraintIR representation — stub.
    return undefined;
  }

  const op = COMPARISON_OPS[opNode.type];
  if (!op) return undefined;

  const lhs = children[0];
  const rhs = children[children.length - 1];
  if (!lhs || !rhs) return undefined;

  // `char_length(col) >= n` / `LEN(col) >= n` -> a length constraint;
  // `col >= n` -> a range constraint. Disambiguated by whether the LHS is
  // an `invocation` (a dialect length function) or a bare `field`.
  const invocation = children.find((n) => n.type === 'invocation');
  if (invocation && isLengthFunction(invocation)) {
    const resolvedPath = path ?? fieldNameFromInvocation(invocation);
    const bound = Number((op === '>=' || op === '>' ? rhs : lhs).text);
    if (resolvedPath && Number.isFinite(bound)) {
      return op === '>=' || op === '>'
        ? { kind: 'length', path: resolvedPath, min: bound }
        : { kind: 'length', path: resolvedPath, max: bound };
    }
  }

  // The column operand is EITHER a `field` node (unquoted identifier) or a
  // `literal` node whose text is double-quoted (a quoted identifier —
  // `operandColumnName`'s doc explains why a quoted column reference and a
  // real string VALUE literal are otherwise indistinguishable by node type
  // alone). Resolve it from whichever side actually names a column, so the
  // OTHER side is unambiguously the value literal — a prior version always
  // treated `lhs`/`field` as the column, which mistook a quoted-identifier
  // column for the value literal whenever it appeared as `lhs`.
  const columnNode = [lhs, rhs].find((n) => operandColumnName(n) !== undefined);
  const resolvedPath = path ?? (columnNode ? operandColumnName(columnNode) : undefined);
  if (!resolvedPath) return undefined;

  const literalNode = [lhs, rhs].find((n) => n !== columnNode && n.type === 'literal');
  if (!literalNode) return undefined; // e.g. a column-to-column comparison — no single-column IR shape fits; falls back to `custom`.
  const value = literalValue(literalNode);

  // Range vs. comparison: `>=`/`<=`/`>`/`<` against a NUMERIC literal is a
  // `range` IR (matches the outbound emitter's own vocabulary and the
  // established per-bound-exclusivity discipline); `=`/`<>`, or any
  // operator against a non-numeric literal, is a plain `comparison`.
  if (typeof value === 'number' && (op === '>=' || op === '>' || op === '<=' || op === '<')) {
    const literalIsRhs = literalNode === rhs;
    // Normalize so the constraint always reads "column OP value" — SQL
    // permits `n >= col` as well as `col >= n`; flip the operator when the
    // literal is on the LEFT.
    const normalizedOp = literalIsRhs ? op : flipComparisonOp(op);
    if (normalizedOp === '>=' || normalizedOp === '>') {
      return { kind: 'range', path: resolvedPath, min: value, ...(normalizedOp === '>' && { exclusive: true }) };
    }
    return { kind: 'range', path: resolvedPath, max: value, ...(normalizedOp === '<' && { exclusive: true }) };
  }

  return { kind: 'comparison', op, path: resolvedPath, value };
}

function flipComparisonOp(op: '<' | '<=' | '>' | '>='): '<' | '<=' | '>' | '>=' {
  return op === '<' ? '>' : op === '<=' ? '>=' : op === '>' ? '<' : '<=';
}

function isLengthFunction(invocation: Node): boolean {
  const ref = invocation.namedChildren.find((n) => n?.type === 'object_reference');
  const name = ref ? lastIdentifierSegment(ref).toLowerCase() : '';
  return name === 'char_length' || name === 'len' || name === 'length' || name === 'datalength';
}

function fieldNameFromInvocation(invocation: Node): string | undefined {
  const field = [...walkNamed(invocation, 'field')][0];
  if (field) return fieldColumnName(field);
  // A quoted-identifier argument (`char_length("name")`) parses as a bare
  // `literal` node (wrapped in an intermediate `term`), never a `field` —
  // same root cause `operandColumnName`'s doc explains.
  const quotedIdentLiteral = [...walkNamed(invocation, 'literal')].find((n) => isQuotedIdentifierLiteral(n.text));
  return quotedIdentLiteral ? stripQuotes(quotedIdentLiteral.text) : undefined;
}

function literalValue(literalNode: Node): Literal {
  const text = literalNode.text;
  if (text.startsWith("'")) return unquoteSqlLiteral(text);
  if (text === 'true' || text === 'TRUE') return true;
  if (text === 'false' || text === 'FALSE') return false;
  const n = Number(text);
  return Number.isNaN(n) ? text : n;
}
