// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * SQL DDL target emitter (codegen-additional-targets §US2). One CREATE TABLE
 * per Data type with a surrogate BIGINT identity PK. Scalar attributes → typed
 * columns (NOT NULL when mandatory); enum-typed attributes → a text column with
 * a CHECK constraint (enumStrategy 'check', the default). Foreign keys, join
 * tables, and inheritance are layered in by later tasks. Dialect rendering is
 * delegated to sql-dialect.ts.
 */
import {
  isData,
  isRosettaEnumeration,
  isRosettaBasicType,
  isRosettaTypeAlias,
  type Data,
  type RosettaEnumeration,
  type RosettaCardinality,
  type RosettaTypeAlias
} from '@rune-langium/core';
import type { GeneratorOptions, GeneratorOutput, GeneratorDiagnostic, SqlOptions } from '../types.js';
import { type NamespaceEmitter, emitNamespaceWithContract } from './namespace-emitter.js';
import type { NamespaceRegistry } from './namespace-registry.js';
import { getTargetRelativePath, type NamespaceWalkResult } from './namespace-walker.js';
import { dialectFor, type Dialect } from './sql-dialect.js';

/** Read (lower, upper) from a cardinality; upper === null means unbounded. */
function bounds(card: RosettaCardinality): { lower: number; upper: number | null } {
  return { lower: card.inf, upper: card.unbounded ? null : (card.sup ?? card.inf) };
}

/**
 * Walk a user-defined type-alias chain to its underlying basic-type name
 * (e.g. `Amount: number` → 'number'). Handles the case where the Langium
 * cross-reference to a RosettaBasicType is unresolved (ref===undefined) by
 * falling back to `$refText`. Returns undefined for non-alias / non-builtin.
 */
function resolveAliasBuiltin(ref: unknown, depth = 0): string | undefined {
  if (!ref || depth > 16) return undefined;
  if (isRosettaBasicType(ref as never)) return (ref as { name: string }).name;
  if (isRosettaTypeAlias(ref as never)) {
    const typeCallType = (ref as { typeCall?: { type?: { ref?: unknown; $refText?: string } } }).typeCall?.type;
    // ref may be undefined for built-in types (e.g. `number`) that are not
    // normal AST nodes in the Langium index — fall back to $refText.
    const innerRef = typeCallType?.ref;
    if (innerRef) return resolveAliasBuiltin(innerRef, depth + 1);
    const innerRefText = typeCallType?.$refText;
    if (innerRefText) return innerRefText; // e.g. 'number' → caller passes to columnType()
    return undefined;
  }
  return undefined;
}

export class SqlNamespaceEmitter implements NamespaceEmitter {
  private readonly dialect: Dialect;
  private readonly inheritance: 'single-table' | 'table-per-type';
  private readonly enumStrategy: 'check' | 'table';
  private enumTableFallbackFlagged = false;
  private readonly enumNames: ReadonlySet<string>;
  private readonly statements: string[] = [];
  private readonly joinTables: string[] = [];
  private readonly diagnostics: GeneratorDiagnostic[] = [];
  private readonly relativePath: string;

  constructor(
    private readonly model: NamespaceWalkResult,
    options: GeneratorOptions,
    _registry: NamespaceRegistry = { namespaces: new Map() }
  ) {
    const sql: SqlOptions = options.sql ?? {};
    this.dialect = dialectFor(sql.dialect ?? 'postgres');
    this.inheritance = sql.inheritance ?? 'table-per-type';
    this.enumStrategy = sql.enumStrategy ?? 'check';
    this.enumNames = new Set(model.enumByName.keys());
    this.relativePath = getTargetRelativePath(model.namespace, 'sql');
  }

  emitEnumeration(_e: RosettaEnumeration): void {
    // Enums render inline as CHECK constraints on referencing columns (enumStrategy 'check').
  }

  emitTypeAlias(_a: RosettaTypeAlias): void {
    // Type aliases collapse to their underlying column type at the use site.
  }

  emitData(data: Data): void {
    const q = (id: string) => this.dialect.quote(id);
    const fkType = this.dialect.fkColumnType();
    const cols: string[] = [];
    const constraints: string[] = [];

    const superRef = data.superType?.ref;
    if (superRef) {
      if (this.inheritance === 'single-table') {
        this.diagnostics.push({
          severity: 'info',
          code: 'sql-single-table-unsupported',
          message: `Inheritance 'single-table' is not yet supported for '${data.name}'; emitting table-per-type.`
        });
      }
      // table-per-type: the child's PK IS a foreign key to the parent (shared identity).
      cols.push(`${q('id')} ${fkType} PRIMARY KEY`);
      constraints.push(`FOREIGN KEY (${q('id')}) REFERENCES ${q(superRef.name)} (${q('id')})`);
    } else {
      cols.push(this.dialect.pkColumn('id'));
    }

    for (const attr of data.attributes) {
      const { lower, upper } = bounds(attr.card);
      const ref = attr.typeCall?.type?.ref;
      const refText = attr.typeCall?.type?.$refText ?? '';
      const notNull = lower >= 1 ? ' NOT NULL' : '';
      const refData = ref && isData(ref) ? ref : undefined;
      const enumNode =
        ref && isRosettaEnumeration(ref)
          ? ref
          : this.enumNames.has(refText)
            ? this.model.enumByName.get(refText)
            : undefined;

      // Multi-valued → a separate join/child table (emitted after the owner tables).
      if (upper === null || upper > 1) {
        this.joinTables.push(this.buildJoinTable(data.name, attr.name, refData, enumNode, ref, refText));
        continue;
      }

      if (refData) {
        // Scalar reference to another type → FK column + table-level constraint.
        const fkCol = `${attr.name}_id`;
        cols.push(`${q(fkCol)} ${fkType}${notNull}`);
        constraints.push(`FOREIGN KEY (${q(fkCol)}) REFERENCES ${q(refData.name)} (${q('id')})`);
      } else if (enumNode) {
        this.flagEnumTableFallback();
        cols.push(`${q(attr.name)} ${this.dialect.columnType('string')}${notNull}`);
        const values = enumNode.enumValues.map((v) => `'${v.name.replace(/'/g, "''")}'`).join(', ');
        constraints.push(`CHECK (${q(attr.name)} IN (${values}))`);
      } else {
        const aliasBuiltin = resolveAliasBuiltin(ref);
        const builtin = isRosettaBasicType(ref) ? ref.name : (aliasBuiltin ?? refText);
        // Warn when the type didn't resolve to anything we recognize: not a basic
        // type, not an alias→builtin, and not even a known builtin NAME (an
        // unresolved ref like `MissingType` has a truthy refText but maps to TEXT
        // only by fallback — surface that rather than silently emitting TEXT).
        const resolved = isRosettaBasicType(ref) || aliasBuiltin !== undefined || this.dialect.isKnownBuiltin(builtin);
        if (!resolved) {
          this.diagnostics.push({
            severity: 'warning',
            code: 'unresolved-ref',
            message: `Attribute '${data.name}.${attr.name}': type '${refText || '<unknown>'}' did not resolve; emitting ${this.dialect.columnType('string')}.`
          });
        }
        cols.push(`${q(attr.name)} ${this.dialect.columnType(builtin || 'string')}${notNull}`);
      }
    }

    const body = [...cols, ...constraints].map((line) => `  ${line}`).join(',\n');
    this.statements.push(`CREATE TABLE ${q(data.name)} (\n${body}\n);`);
  }

  /**
   * A multi-valued attribute becomes its own table: an FK back to the owner
   * plus either an FK to the element type (Data) or a `value` column
   * (enum → CHECK; builtin → typed column).
   */
  private buildJoinTable(
    ownerName: string,
    attrName: string,
    refData: Data | undefined,
    enumNode: RosettaEnumeration | undefined,
    ref: unknown,
    refText: string
  ): string {
    const q = (id: string) => this.dialect.quote(id);
    const fkType = this.dialect.fkColumnType();
    const tableName = `${ownerName}_${attrName}`;
    const ownerFk = `${ownerName.toLowerCase()}_id`;
    const cols: string[] = [`${q(ownerFk)} ${fkType} NOT NULL`];
    const constraints: string[] = [`FOREIGN KEY (${q(ownerFk)}) REFERENCES ${q(ownerName)} (${q('id')})`];

    if (refData) {
      const targetFk = `${refData.name.toLowerCase()}_id`;
      const safeTargetFk = targetFk === ownerFk ? `${attrName.toLowerCase()}_id` : targetFk;
      cols.push(`${q(safeTargetFk)} ${fkType} NOT NULL`);
      constraints.push(`FOREIGN KEY (${q(safeTargetFk)}) REFERENCES ${q(refData.name)} (${q('id')})`);
    } else if (enumNode) {
      this.flagEnumTableFallback();
      cols.push(`${q('value')} ${this.dialect.columnType('string')} NOT NULL`);
      const values = enumNode.enumValues.map((v) => `'${v.name.replace(/'/g, "''")}'`).join(', ');
      constraints.push(`CHECK (${q('value')} IN (${values}))`);
    } else {
      const builtin = isRosettaBasicType(ref as never)
        ? (ref as { name: string }).name
        : (resolveAliasBuiltin(ref) ?? refText);
      cols.push(`${q('value')} ${this.dialect.columnType(builtin || 'string')} NOT NULL`);
    }

    const body = [...cols, ...constraints].map((line) => `  ${line}`).join(',\n');
    return `CREATE TABLE ${q(tableName)} (\n${body}\n);`;
  }

  /**
   * The `'table'` enum strategy (a lookup table + FK per enum) is not yet
   * implemented; we fall back to the `'check'` strategy. Surface that once
   * (not per enum column) as an info diagnostic so the option isn't silently
   * ignored — mirrors the `single-table` inheritance fallback.
   */
  private flagEnumTableFallback(): void {
    if (this.enumStrategy !== 'table' || this.enumTableFallbackFlagged) return;
    this.enumTableFallbackFlagged = true;
    this.diagnostics.push({
      severity: 'info',
      code: 'sql-enum-table-unsupported',
      message: `enumStrategy 'table' is not yet supported in namespace '${this.model.namespace}'; emitting CHECK constraints.`
    });
  }

  finalize(): GeneratorOutput {
    const header = `-- SQL DDL generated from namespace ${this.model.namespace} (${this.dialect.name})\n`;
    const all = [...this.statements, ...this.joinTables];
    const content = header + all.join('\n\n') + (all.length ? '\n' : '');
    return { relativePath: this.relativePath, content, sourceMap: [], diagnostics: this.diagnostics, funcs: [] };
  }
}

export function emitNamespace(
  model: NamespaceWalkResult,
  options: GeneratorOptions,
  registry: NamespaceRegistry = { namespaces: new Map() }
): GeneratorOutput {
  return emitNamespaceWithContract(model, options, registry, SqlNamespaceEmitter);
}
