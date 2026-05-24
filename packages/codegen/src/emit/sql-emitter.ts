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

export class SqlNamespaceEmitter implements NamespaceEmitter {
  private readonly dialect: Dialect;
  private readonly enumNames: ReadonlySet<string>;
  private readonly statements: string[] = [];
  private readonly diagnostics: GeneratorDiagnostic[] = [];
  private readonly relativePath: string;

  constructor(
    private readonly model: NamespaceWalkResult,
    options: GeneratorOptions,
    _registry: NamespaceRegistry = { namespaces: new Map() }
  ) {
    const sql: SqlOptions = options.sql ?? {};
    this.dialect = dialectFor(sql.dialect ?? 'postgres');
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
    const cols: string[] = [this.dialect.pkColumn('id')];
    const constraints: string[] = [];

    for (const attr of data.attributes) {
      const { lower, upper } = bounds(attr.card);
      if (upper === null || upper > 1) {
        this.diagnostics.push({
          severity: 'info', code: 'sql-multivalued-deferred',
          message: `Attribute '${data.name}.${attr.name}' is multi-valued; join-table emission lands in a later task.`
        });
        continue;
      }
      const ref = attr.typeCall?.type?.ref;
      const refText = attr.typeCall?.type?.$refText ?? '';
      const notNull = lower === 1 ? ' NOT NULL' : '';

      if ((ref && isRosettaEnumeration(ref)) || this.enumNames.has(refText)) {
        const enumNode = (ref && isRosettaEnumeration(ref) ? ref : this.model.enumByName.get(refText))!;
        cols.push(`${q(attr.name)} ${this.dialect.columnType('string')}${notNull}`);
        const values = enumNode.enumValues.map((v) => `'${v.name.replace(/'/g, "''")}'`).join(', ');
        constraints.push(`CHECK (${q(attr.name)} IN (${values}))`);
      } else if (ref && isData(ref)) {
        this.diagnostics.push({
          severity: 'info', code: 'sql-fk-deferred',
          message: `Attribute '${data.name}.${attr.name}' references type '${ref.name}'; FK emission lands in a later task.`
        });
      } else {
        const builtin = ref && isRosettaBasicType(ref) ? ref.name : refText;
        if (!builtin) {
          this.diagnostics.push({
            severity: 'warning', code: 'unresolved-ref',
            message: `Attribute '${data.name}.${attr.name}' has an unresolved type; emitting TEXT.`
          });
        }
        cols.push(`${q(attr.name)} ${this.dialect.columnType(builtin || 'string')}${notNull}`);
      }
    }

    const body = [...cols, ...constraints].map((line) => `  ${line}`).join(',\n');
    this.statements.push(`CREATE TABLE ${q(data.name)} (\n${body}\n);`);
  }

  finalize(): GeneratorOutput {
    const header = `-- SQL DDL generated from namespace ${this.model.namespace} (${this.dialect.name})\n`;
    const content = header + this.statements.join('\n\n') + (this.statements.length ? '\n' : '');
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
