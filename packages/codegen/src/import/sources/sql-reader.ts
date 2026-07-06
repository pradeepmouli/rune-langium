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

import type { Node } from 'web-tree-sitter';
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

  const rawTables = collectTables(tree.rootNode, diagnostics);
  const { joinTables, ownerAttributes } = classifyJoinTables(rawTables);

  const enums: SourceEnum[] = [];
  const enumNameByColumn = new Map<string, string>(); // `${table}.${column}` -> enum name
  for (const table of rawTables) {
    if (joinTables.has(table.name)) continue;
    for (const col of table.columns) {
      const enumCheck = col.checkNodes.find((n) => isEnumCheck(n, col.name));
      if (enumCheck) {
        const sourceEnum = buildEnumFromCheck(table.name, col.name, enumCheck, diagnostics);
        if (sourceEnum) {
          enums.push(sourceEnum);
          enumNameByColumn.set(`${table.name}.${col.name}`, sourceEnum.name);
        }
      }
    }
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

function collectTables(root: Node, diagnostics: ImportDiagnostic[]): RawTable[] {
  const tables: RawTable[] = [];
  for (const statement of walkNamed(root, 'statement')) {
    const createTable = statement.namedChildren.find((n) => n?.type === 'create_table');
    if (!createTable) continue;
    const table = readCreateTable(createTable, diagnostics);
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

function readCreateTable(node: Node, diagnostics: ImportDiagnostic[]): RawTable | undefined {
  const objectRef = node.namedChildren.find((n) => n?.type === 'object_reference');
  if (!objectRef) return undefined;
  const name = lastIdentifierSegment(objectRef);

  const columnDefs = node.namedChildren.find((n) => n?.type === 'column_definitions');
  const columns: RawColumn[] = [];
  const foreignKeys: RawForeignKey[] = [];
  const tableChecks: Node[] = [];

  for (const child of columnDefs?.namedChildren ?? []) {
    if (!child) continue;
    if (child.type === 'column_definition') {
      const col = readColumnDefinition(child, name, diagnostics);
      if (col) columns.push(col);
    } else if (child.type === 'constraints') {
      for (const constraint of child.namedChildren) {
        if (constraint?.type !== 'constraint') continue;
        readTableConstraint(constraint, name, foreignKeys, tableChecks, diagnostics);
      }
    }
  }

  return { name, columns, foreignKeys, tableChecks };
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

function readColumnDefinition(node: Node, tableName: string, diagnostics: ImportDiagnostic[]): RawColumn | undefined {
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
    // T0 spike finding: a column-level `CHECK (... BETWEEN ...)` parses into
    // an ERROR node wrapping a valid `between_expression` (the grammar has
    // no column_definition rule path for BETWEEN specifically) — recover it
    // by searching the ERROR node's own subtree for a between_expression
    // rather than treating the whole column as unparseable.
    if (c.type === 'ERROR') {
      const between = [...walkNamed(c, 'between_expression')][0];
      if (between) checkNodes.push(between);
    }
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
    constraints.push(...attr.constraints);
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
  const field = checkNode.namedChildren.find((n) => n?.type === 'field');
  const list = checkNode.namedChildren.find((n) => n?.type === 'list');
  if (!field || !list) return false;
  return fieldColumnName(field) === columnName;
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
  const field = node.namedChildren.find((n) => n?.type === 'field');
  const literals = node.namedChildren.filter((n) => n?.type === 'literal');
  const resolvedPath = path ?? (field ? fieldColumnName(field) : undefined);
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
  const children = node.namedChildren.filter((n): n is Node => n !== null);
  const opNode = children.find((n) => n.type in COMPARISON_OPS || n.type === 'keyword_like' || n.type === 'keyword_in');
  if (!opNode) return undefined;

  if (opNode.type === 'keyword_like') {
    const field = children.find((n) => n.type === 'field');
    const resolvedPath = path ?? (field ? fieldColumnName(field) : undefined);
    const literal = children.find((n) => n.type === 'literal');
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

  const field = children.find((n) => n.type === 'field');
  const resolvedPath = path ?? (field ? fieldColumnName(field) : undefined);
  if (!resolvedPath) return undefined;

  const literalNode = lhs.type === 'literal' ? lhs : rhs.type === 'literal' ? rhs : undefined;
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
  return field ? fieldColumnName(field) : undefined;
}

function literalValue(literalNode: Node): Literal {
  const text = literalNode.text;
  if (text.startsWith("'")) return unquoteSqlLiteral(text);
  if (text === 'true' || text === 'TRUE') return true;
  if (text === 'false' || text === 'FALSE') return false;
  const n = Number(text);
  return Number.isNaN(n) ? text : n;
}
