# SQL DDL Codegen Emitter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `sql` codegen target — emit relational DDL (`CREATE TABLE`, FKs, enums, join tables, inheritance) from Rune models, for Postgres + SQL Server, so `--target sql` produces real output instead of a `not-implemented` diagnostic.

**Architecture:** A `SqlNamespaceEmitter implements NamespaceEmitter` (mirrors `JsonSchemaNamespaceEmitter`) emits one `<ns>.sql` per namespace; a `sqlProfile: LanguageProfile<'sql'>` provides the single-file `model.sql` bundling via `concatenate()`. Both register in `generator.ts` (`NAMESPACE_EMITTERS` + `PROFILES`), which auto-wires dispatch + flips `IMPLEMENTED_TARGETS`. Dialect-specific rendering (identifier quoting, column types, identity/PK, boolean) lives in a pure `sql-dialect.ts` helper. Output is validated in tests by parsing it with `node-sql-parser` — no database needed.

**Tech Stack:** TypeScript (ESM, `tsgo`), Vitest, `@rune-langium/core` (Langium AST: `Data`, `Attribute`, `RosettaCardinality`, `RosettaEnumeration`, type guards `isData`/`isRosettaEnumeration`/`isRosettaBasicType`), `node-sql-parser` (test-only DDL validation).

**Spec:** `docs/superpowers/specs/2026-05-12-codegen-additional-targets-design.md` §US2 (SQL DDL, P2). All work in `packages/codegen`. MIT license header on new files: `// SPDX-License-Identifier: MIT` + `// Copyright (c) 2026 Pradeep Mouli`.

**Validation commands:** `pnpm --filter @rune-langium/codegen test`, `pnpm --filter @rune-langium/codegen run type-check`.

---

## Key facts the engineer needs (verified against current code)

- **`NamespaceEmitter` contract** (`src/emit/namespace-emitter.ts`): ctor `(model: NamespaceWalkResult, options: NamespaceEmitterOptions, registry: NamespaceRegistry)`. Required methods: `emitEnumeration(e)`, `emitTypeAlias(a)`, `emitData(d)`, `finalize(): GeneratorOutput`. Optional: `emitHeader?()`, `emitCrossNamespaceImports?()`, `emitRule?()`, etc. The driver `emitNamespaceWithContract` calls header → enums → typeAliases → `emitDataPrelude?` → data (in `model.emitOrder`) → rules → `finalize()`.
- **`GeneratorOutput`** (`src/types.ts`): `{ relativePath, content, sourceMap: SourceMapEntry[], diagnostics: GeneratorDiagnostic[], funcs: GeneratedFunc[], binary?, mimeType? }`. SQL: `funcs: []`, `sourceMap: []` (acceptable — SQL has no per-line source-map requirement), populate `diagnostics`.
- **Reading the model** (from `JsonSchemaNamespaceEmitter`): a `Data` has `.name`, `.attributes: Attribute[]`, `.superType?.ref` (a `Data`), `.conditions`. An `Attribute` has `.name`, `.card: RosettaCardinality`, `.typeCall?.type?.ref` (resolved `Data`|`RosettaEnumeration`|`RosettaBasicType`|…) and `.typeCall?.type?.$refText` (string fallback). `RosettaCardinality`: `.inf` (number, lower), `.sup` (number, upper), `.unbounded` (boolean). Cardinality reading idiom: `const lower = card.inf; const upper = card.unbounded ? null : (card.sup ?? lower);`. Type-guard with `isData(ref)`, `isRosettaEnumeration(ref)`, `isRosettaBasicType(ref)` from `@rune-langium/core`. A `RosettaEnumeration` has `.name`, `.enumValues: Array<{ name; display? }>`.
- **`getTargetRelativePath(namespace, 'sql')`** (`src/emit/namespace-walker.ts`) is already generic — returns `cdm/base/math.sql` (descriptor-driven, `.sql` ext from `TARGET_DESCRIPTORS.sql`). **No change needed there.**
- **`TARGET_DESCRIPTORS.sql`** already exists: `{ label:'SQL', contract:'namespace', desc:'DDL (Postgres / SQL Server)', extension:'.sql' }`.
- **`SqlOptions`** (`src/types.ts`): `{ dialect?: 'postgres'|'sqlserver'; inheritance?: 'single-table'|'table-per-type'; enumStrategy?: 'check'|'table'; layout?: 'per-namespace'|'single-file' }`. Read via `options.sql`. **Defaults:** `dialect='postgres'`, `inheritance='table-per-type'`, `enumStrategy='check'`.
- **`LIBRARY_DEFAULT_LAYOUT.sql`** is already `'per-namespace'` in `generator.ts`.
- **Dispatch:** adding `sql` to `NAMESPACE_EMITTERS` + `PROFILES` makes `resolveEmitter` return the emitter for per-namespace layout and synthesize a `GenericModelEmitter` (using `sqlProfile.concatenate`) for `single-file`. `IMPLEMENTED_TARGETS` (derived from the registries) auto-includes `sql`.
- **Test harness idiom** (`test/dispatch.test.ts`): build a doc via `createRuneDslServices()` → `RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(source, URI.parse('inmemory:///x.rosetta'))` → `await DocumentBuilder.build([doc], { validation:false })`, then `await generate(doc, { target:'sql', sql:{...} })`. `generate` is exported from `src/index.js`.
- **`node-sql-parser` is NOT yet a dependency** — add to `devDependencies` (test-only, like `ajv` is for JSON Schema).

---

## File Structure

- **Create** `src/emit/sql-dialect.ts` — pure dialect helper: identifier quoting, builtin→column-type map, PK/identity clause, boolean literal. One responsibility: "how does dialect X render a primitive?"
- **Create** `src/emit/sql-emitter.ts` — `SqlNamespaceEmitter` class + `emitNamespace()` convenience wrapper (mirrors `json-schema-emitter.ts`).
- **Create** `src/emit/sql-profile.ts` — `sqlProfile: LanguageProfile<'sql'>` (mirrors `json-schema-profile.ts`); `concatenate()` builds the single-file `model.sql`.
- **Modify** `src/generator.ts` — import + register in `NAMESPACE_EMITTERS` and `PROFILES`.
- **Modify** `package.json` — add `node-sql-parser` devDep.
- **Modify** `test/dispatch.test.ts` — `sql` is now implemented; switch the not-implemented exemplar to `markdown`; update `IMPLEMENTED_TARGETS` expectation.
- **Create** `test/sql-dialect.test.ts`, `test/sql-emitter.test.ts` — unit tests (DDL validated via `node-sql-parser`).

---

## Task 1: Add `node-sql-parser` devDependency

**Files:** Modify `packages/codegen/package.json`

- [ ] **Step 1: Add the dep**

```bash
cd packages/codegen && pnpm add -D node-sql-parser
```
Expected: `node-sql-parser` appears under `devDependencies` in `packages/codegen/package.json`; lockfile updates.

- [ ] **Step 2: Verify it imports + parses both dialects**

Run: `cd packages/codegen && node -e "const {Parser}=require('node-sql-parser'); const p=new Parser(); p.astify('CREATE TABLE \"t\" (id INTEGER PRIMARY KEY)', {database:'postgresql'}); p.astify('CREATE TABLE [t] (id INT PRIMARY KEY)', {database:'transactsql'}); console.log('ok')"`
Expected: prints `ok` (confirms the dialect keys we'll use: `postgresql`, `transactsql`).

- [ ] **Step 3: Commit**

```bash
git add packages/codegen/package.json ../../pnpm-lock.yaml
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "build(codegen): add node-sql-parser devDep for SQL DDL test validation"
```

---

## Task 2: `sql-dialect.ts` — pure dialect rendering helper

**Files:** Create `src/emit/sql-dialect.ts`; Test `test/sql-dialect.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/sql-dialect.test.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { dialectFor } from '../src/emit/sql-dialect.js';

describe('sql-dialect', () => {
  it('quotes identifiers per dialect', () => {
    expect(dialectFor('postgres').quote('Trade')).toBe('"Trade"');
    expect(dialectFor('sqlserver').quote('Trade')).toBe('[Trade]');
  });
  it('maps builtins to dialect column types', () => {
    const pg = dialectFor('postgres');
    expect(pg.columnType('string')).toBe('TEXT');
    expect(pg.columnType('boolean')).toBe('BOOLEAN');
    expect(pg.columnType('int')).toBe('INTEGER');
    expect(pg.columnType('number')).toBe('NUMERIC');
    expect(pg.columnType('date')).toBe('DATE');
    expect(pg.columnType('dateTime')).toBe('TIMESTAMP');
    const ss = dialectFor('sqlserver');
    expect(ss.columnType('string')).toBe('NVARCHAR(MAX)');
    expect(ss.columnType('boolean')).toBe('BIT');
    expect(ss.columnType('dateTime')).toBe('DATETIME2');
  });
  it('falls back to TEXT/NVARCHAR for unknown builtins', () => {
    expect(dialectFor('postgres').columnType('mysteryType')).toBe('TEXT');
    expect(dialectFor('sqlserver').columnType('mysteryType')).toBe('NVARCHAR(MAX)');
  });
  it('renders a surrogate primary-key column', () => {
    expect(dialectFor('postgres').pkColumn('id')).toBe('"id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY');
    expect(dialectFor('sqlserver').pkColumn('id')).toBe('[id] BIGINT IDENTITY(1,1) PRIMARY KEY');
  });
});
```

- [ ] **Step 2: Run → FAIL** (`pnpm --filter @rune-langium/codegen test -- sql-dialect`) — "Cannot find module sql-dialect".

- [ ] **Step 3: Implement `src/emit/sql-dialect.ts`**

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Pure, AST-free dialect rendering for the SQL DDL emitter. One `Dialect`
 * object knows how a given database renders the small set of primitives the
 * emitter needs: identifier quoting, builtin → column type, the surrogate
 * primary-key clause, and the foreign-key column type (must match the PK type).
 */
export type SqlDialectName = 'postgres' | 'sqlserver';

export interface Dialect {
  readonly name: SqlDialectName;
  /** node-sql-parser database key for test validation. */
  readonly parserDatabase: 'postgresql' | 'transactsql';
  quote(identifier: string): string;
  columnType(builtinName: string): string;
  /** The surrogate PK column definition, e.g. `"id" BIGINT ... PRIMARY KEY`. */
  pkColumn(name: string): string;
  /** The column type used for FK columns — must equal the referenced PK's type. */
  fkColumnType(): string;
}

// Rune builtin basic/record/typeAlias names → dialect column type.
const POSTGRES_TYPES: Record<string, string> = {
  string: 'TEXT', pattern: 'TEXT', boolean: 'BOOLEAN', number: 'NUMERIC', int: 'INTEGER',
  date: 'DATE', dateTime: 'TIMESTAMP', zonedDateTime: 'TIMESTAMPTZ', time: 'TIME',
  productType: 'TEXT', eventType: 'TEXT', calculation: 'TEXT'
};
const SQLSERVER_TYPES: Record<string, string> = {
  string: 'NVARCHAR(MAX)', pattern: 'NVARCHAR(MAX)', boolean: 'BIT', number: 'DECIMAL(38,10)', int: 'INT',
  date: 'DATE', dateTime: 'DATETIME2', zonedDateTime: 'DATETIMEOFFSET', time: 'TIME',
  productType: 'NVARCHAR(MAX)', eventType: 'NVARCHAR(MAX)', calculation: 'NVARCHAR(MAX)'
};

export function dialectFor(name: SqlDialectName): Dialect {
  if (name === 'sqlserver') {
    return {
      name, parserDatabase: 'transactsql',
      quote: (id) => `[${id}]`,
      columnType: (b) => SQLSERVER_TYPES[b] ?? 'NVARCHAR(MAX)',
      pkColumn: (n) => `[${n}] BIGINT IDENTITY(1,1) PRIMARY KEY`,
      fkColumnType: () => 'BIGINT'
    };
  }
  return {
    name: 'postgres', parserDatabase: 'postgresql',
    quote: (id) => `"${id}"`,
    columnType: (b) => POSTGRES_TYPES[b] ?? 'TEXT',
    pkColumn: (n) => `"${n}" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`,
    fkColumnType: () => 'BIGINT'
  };
}
```

- [ ] **Step 4: Run → PASS** (`pnpm --filter @rune-langium/codegen test -- sql-dialect`).
- [ ] **Step 5: Commit** — `feat(codegen): sql-dialect helper (postgres + sqlserver rendering)`

---

## Task 3: `SqlNamespaceEmitter` — scalar columns + enums (minimum viable table)

**Files:** Create `src/emit/sql-emitter.ts`; Test `test/sql-emitter.test.ts`

This task gets a parseable `CREATE TABLE` with scalar columns + NOT NULL + enum CHECK constraints. FKs/join-tables/inheritance come in Tasks 4-6.

- [ ] **Step 1: Write the failing test** (uses the dispatch-test harness + `node-sql-parser` to validate)

```ts
// test/sql-emitter.test.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { Parser } from 'node-sql-parser';
import { generate } from '../src/index.js';

async function gen(source: string, sql: Record<string, unknown> = {}) {
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(source, URI.parse('inmemory:///t.rosetta'));
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc], { validation: false });
  return generate(doc, { target: 'sql', sql });
}
/** Parsing throws on invalid DDL — a structural validity assertion with no DB. */
function assertParses(ddl: string, database: 'postgresql' | 'transactsql' = 'postgresql') {
  new Parser().astify(ddl, { database });
}

describe('SqlNamespaceEmitter — scalar columns + enums', () => {
  it('emits a CREATE TABLE with a surrogate PK and typed columns; NOT NULL from cardinality', async () => {
    const out = await gen(`namespace test.basic

type Quantity:
  amount number (1..1)
  currency string (0..1)
`);
    expect(out).toHaveLength(1);
    expect(out[0]!.relativePath).toBe('test/basic.sql');
    const ddl = out[0]!.content;
    assertParses(ddl);
    expect(ddl).toContain('CREATE TABLE "Quantity"');
    expect(ddl).toMatch(/"id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY/);
    expect(ddl).toMatch(/"amount" NUMERIC NOT NULL/);
    expect(ddl).toMatch(/"currency" TEXT(?! NOT NULL)/); // (0..1) → nullable
    expect(out[0]!.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('emits an enum column with a CHECK constraint (enumStrategy default "check")', async () => {
    const out = await gen(`namespace test.enums

enum Color:
  Red
  Green

type Paint:
  color Color (1..1)
`);
    const ddl = out[0]!.content;
    assertParses(ddl);
    expect(ddl).toMatch(/"color" TEXT NOT NULL/);
    expect(ddl).toMatch(/CHECK\s*\(\s*"color" IN \('Red', 'Green'\)\s*\)/);
  });

  it('renders SQL Server dialect with [brackets] + BIT/NVARCHAR + IDENTITY', async () => {
    const out = await gen(`namespace test.basic

type Flag:
  on boolean (1..1)
  label string (1..1)
`, { dialect: 'sqlserver' });
    const ddl = out[0]!.content;
    assertParses(ddl, 'transactsql');
    expect(ddl).toContain('CREATE TABLE [Flag]');
    expect(ddl).toMatch(/\[id\] BIGINT IDENTITY\(1,1\) PRIMARY KEY/);
    expect(ddl).toMatch(/\[on\] BIT NOT NULL/);
    expect(ddl).toMatch(/\[label\] NVARCHAR\(MAX\) NOT NULL/);
  });
});
```

- [ ] **Step 2: Run → FAIL** — `generate({target:'sql'})` still returns the not-implemented diagnostic (no emitter registered yet) and `node-sql-parser`-based asserts won't be reached / will mismatch.

- [ ] **Step 3: Implement `src/emit/sql-emitter.ts`** (scalar + enum scope; FK/join/inheritance are stubbed to diagnostics until later tasks)

```ts
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
  type Attribute,
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
    // Enums are rendered inline as CHECK constraints on referencing columns
    // (enumStrategy 'check'). The 'table' strategy lands in a later task.
  }

  emitTypeAlias(_a: RosettaTypeAlias): void {
    // Type aliases collapse to their underlying column type at the use site;
    // no standalone DDL object. (Resolved in column rendering.)
  }

  emitData(data: Data): void {
    const q = (id: string) => this.dialect.quote(id);
    const cols: string[] = [this.dialect.pkColumn('id')];
    const constraints: string[] = [];

    for (const attr of data.attributes) {
      const { lower, upper } = bounds(attr.card);
      if (upper === null || upper > 1) {
        // Multi-valued → join table (Task 4). Skip the column for now + flag.
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
        // Scalar reference to another type → FK column (Task 4). Defer.
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
```

- [ ] **Step 4: Register in `generator.ts`** so dispatch reaches the emitter. Add the import + the `NAMESPACE_EMITTERS` entry:

```ts
// near the other emitter imports:
import { SqlNamespaceEmitter } from './emit/sql-emitter.js';
// ...
const NAMESPACE_EMITTERS: Partial<Record<Target, NamespaceEmitterConstructor>> = {
  zod: ZodNamespaceEmitter,
  'json-schema': JsonSchemaNamespaceEmitter,
  typescript: TsNamespaceEmitter,
  sql: SqlNamespaceEmitter
};
```
(Do NOT add to `PROFILES` yet — that's Task 7, needed only for `single-file` layout. Per-namespace works with just the `NAMESPACE_EMITTERS` entry.)

- [ ] **Step 5: Run → PASS** (`pnpm --filter @rune-langium/codegen test -- sql-emitter`) + `type-check`.
- [ ] **Step 6: Commit** — `feat(codegen): SQL emitter — scalar columns + enum CHECK constraints (per-namespace)`

---

## Task 4: Foreign keys + multi-valued join tables

**Files:** Modify `src/emit/sql-emitter.ts`; extend `test/sql-emitter.test.ts`

- [ ] **Step 1: Add failing tests**

```ts
describe('SqlNamespaceEmitter — references + cardinality', () => {
  it('scalar reference to another type emits an FK column + REFERENCES', async () => {
    const out = await gen(`namespace test.ref

type Party:
  name string (1..1)

type Trade:
  buyer Party (1..1)
`);
    const ddl = out[0]!.content;
    assertParses(ddl);
    expect(ddl).toMatch(/"buyer_id" BIGINT NOT NULL/);
    expect(ddl).toMatch(/(FOREIGN KEY \("buyer_id"\) REFERENCES "Party" ?\("id"\)|REFERENCES "Party" ?\("id"\))/);
  });

  it('multi-valued attribute of a type emits a join table with two FKs', async () => {
    const out = await gen(`namespace test.multi

type Leg:
  rate number (1..1)

type Swap:
  legs Leg (1..*)
`);
    const ddl = out[0]!.content;
    assertParses(ddl);
    expect(ddl).toContain('CREATE TABLE "Swap_legs"');
    expect(ddl).toMatch(/"swap_id" BIGINT NOT NULL/);
    expect(ddl).toMatch(/"leg_id" BIGINT NOT NULL/);
    expect(ddl).toMatch(/REFERENCES "Swap" ?\("id"\)/);
    expect(ddl).toMatch(/REFERENCES "Leg" ?\("id"\)/);
  });

  it('multi-valued scalar emits a child value table', async () => {
    const out = await gen(`namespace test.multiscalar

type Basket:
  tags string (0..*)
`);
    const ddl = out[0]!.content;
    assertParses(ddl);
    expect(ddl).toContain('CREATE TABLE "Basket_tags"');
    expect(ddl).toMatch(/"basket_id" BIGINT NOT NULL/);
    expect(ddl).toMatch(/"value" TEXT/);
  });
});
```

- [ ] **Step 2: Run → FAIL** (FK/join currently deferred to diagnostics).

- [ ] **Step 3: Implement.** In `emitData`, replace the two "deferred" diagnostic branches:
  - **Scalar Data ref** (`upper<=1`, `isData(ref)`): push column `${q(attr.name+'_id')} ${this.dialect.fkColumnType()}${notNull}` and a table-level constraint `FOREIGN KEY (${q(attr.name+'_id')}) REFERENCES ${q(ref.name)} (${q('id')})` (push into `constraints`).
  - **Multi-valued** (`upper===null || upper>1`): instead of `continue`, record a deferred join-table spec and emit it AFTER the owner table. Add a private `joinTables: string[]` collected during `emitData` and appended in `finalize`. For an attr of Data type `T`: `CREATE TABLE "<Owner>_<attr>" ( "<owner_lc>_id" BIGINT NOT NULL, "<t_lc>_id" BIGINT NOT NULL, FOREIGN KEY("<owner_lc>_id") REFERENCES "<Owner>"("id"), FOREIGN KEY("<t_lc>_id") REFERENCES "T"("id") )`. For a scalar/enum element type: `CREATE TABLE "<Owner>_<attr>" ( "<owner_lc>_id" BIGINT NOT NULL, "value" <coltype>, FOREIGN KEY("<owner_lc>_id") REFERENCES "<Owner>"("id") )` (+ CHECK if the element is an enum). Use `<name>.toLowerCase()` for the FK column prefix; join-table name is `${data.name}_${attr.name}`.
  - Append `this.joinTables` to `this.statements` in `finalize()` (after the owner tables, so FKs reference already-declared tables — though within one file ordering only matters for some engines; keep owner-tables-first for readability).

- [ ] **Step 4: Run → PASS** + type-check.
- [ ] **Step 5: Commit** — `feat(codegen): SQL FKs for scalar refs + join tables for multi-valued attributes`

---

## Task 5: Inheritance (`table-per-type`, default)

**Files:** Modify `src/emit/sql-emitter.ts`; extend `test/sql-emitter.test.ts`

- [ ] **Step 1: Add failing test**

```ts
describe('SqlNamespaceEmitter — inheritance', () => {
  it('table-per-type: child table shares the PK and FKs to the parent', async () => {
    const out = await gen(`namespace test.inh

type Animal:
  name string (1..1)

type Dog extends Animal:
  breed string (1..1)
`);
    const ddl = out[0]!.content;
    assertParses(ddl);
    expect(ddl).toContain('CREATE TABLE "Animal"');
    expect(ddl).toContain('CREATE TABLE "Dog"');
    // Child PK is also an FK to the parent (shared identity).
    expect(ddl).toMatch(/CREATE TABLE "Dog"[\s\S]*"id" BIGINT PRIMARY KEY/);
    expect(ddl).toMatch(/CREATE TABLE "Dog"[\s\S]*REFERENCES "Animal" ?\("id"\)/);
    expect(ddl).toMatch(/CREATE TABLE "Dog"[\s\S]*"breed" TEXT NOT NULL/);
  });
});
```

- [ ] **Step 2: Run → FAIL** (child currently gets its own identity PK + ignores `superType`).

- [ ] **Step 3: Implement.** In `emitData`, when `data.superType?.ref` is set and `inheritance !== 'single-table'` (default `table-per-type`):
  - Replace the surrogate `pkColumn('id')` with a shared-PK-as-FK column: `${q('id')} ${this.dialect.fkColumnType()} PRIMARY KEY` plus a constraint `FOREIGN KEY (${q('id')}) REFERENCES ${q(data.superType.ref.name)} (${q('id')})`.
  - Emit only the child's OWN attributes as columns (do NOT inline parent attributes — they live in the parent table). The driver already calls `emitData` once per type, so the parent table is emitted separately.
  - Read `inheritance` from `options.sql?.inheritance ?? 'table-per-type'` in the constructor; store as `this.inheritance`.
  - (`single-table` — flatten parent columns into the child and emit no separate child-PK FK — is out of scope for this task; if `inheritance === 'single-table'`, push an `info` diagnostic `sql-single-table-unsupported` and fall back to table-per-type so output stays valid. A follow-up task can implement true single-table.)

- [ ] **Step 4: Run → PASS** + type-check.
- [ ] **Step 5: Commit** — `feat(codegen): SQL table-per-type inheritance (child PK = FK to parent)`

---

## Task 6: `sqlProfile` + single-file `model.sql` bundling

**Files:** Create `src/emit/sql-profile.ts`; Modify `src/generator.ts`; extend `test/sql-emitter.test.ts`

- [ ] **Step 1: Add failing test** (single-file layout across two namespaces)

```ts
describe('SQL single-file layout', () => {
  it("layout 'single-file' concatenates all namespaces into one model.sql", async () => {
    const { RuneDsl } = createRuneDslServices();
    const f = RuneDsl.shared.workspace.LangiumDocumentFactory;
    const a = f.fromString('namespace a\n\ntype X:\n  v string (1..1)\n', URI.parse('inmemory:///a.rosetta'));
    const b = f.fromString('namespace b\n\ntype Y:\n  v string (1..1)\n', URI.parse('inmemory:///b.rosetta'));
    await RuneDsl.shared.workspace.DocumentBuilder.build([a, b], { validation: false });
    const out = await generate([a, b], { target: 'sql', sql: { layout: 'single-file' } });
    const paths = out.map((o) => o.relativePath).sort();
    expect(paths).toEqual(['model.sql']);
    const ddl = out[0]!.content;
    assertParses(ddl);
    expect(ddl).toContain('CREATE TABLE "X"');
    expect(ddl).toContain('CREATE TABLE "Y"');
  });
});
```
(Note: `generate` accepts a single doc OR an array — see `runGenerate(docs)`. The dispatch test passes a single doc; passing an array is supported by `groupByNamespace`.)

- [ ] **Step 2: Run → FAIL** — without a `PROFILES.sql` entry, `single-file` layout has no `GenericModelEmitter` to synthesize, so `resolveEmitter` returns `undefined` → not-implemented diagnostic.

- [ ] **Step 3: Implement `src/emit/sql-profile.ts`** (mirror `json-schema-profile.ts`; SQL has no barrel/sidecar/limits)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * SQL LanguageProfile. SQL has no module system (no barrel) and no runtime
 * sidecar. `single-file` bundling concatenates every per-namespace DDL into one
 * `model.sql`, preserving each namespace's statements in dependency order as
 * produced by the per-namespace emitter. No singleFileLimits — one script is
 * the canonical deliverable for DDL.
 */
import type { GeneratorOutput } from '../types.js';
import type { LanguageProfile } from './language-profile.js';

export const sqlProfile: LanguageProfile<'sql'> = {
  target: 'sql',
  extension: '.sql',
  basicTypeMap: { boolean: 'BOOLEAN', number: 'NUMERIC', string: 'TEXT', time: 'TIME', pattern: 'TEXT' },
  recordTypeMap: { date: 'DATE', dateTime: 'TIMESTAMP', zonedDateTime: 'TIMESTAMPTZ' },
  typeAliasMap: { int: 'INTEGER', productType: 'TEXT', eventType: 'TEXT', calculation: 'TEXT' },
  libraryFuncMap: {},
  makeBarrel() {
    return undefined; // SQL has no module system.
  },
  concatenate(perNs): GeneratorOutput {
    const sorted = [...perNs].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    const content = sorted.map((o) => o.content.trimEnd()).join('\n\n') + '\n';
    return { relativePath: 'model.sql', content, sourceMap: [], diagnostics: sorted.flatMap((o) => o.diagnostics), funcs: [] };
  },
  makeSharedArtifacts() {
    return [];
  }
};
```

- [ ] **Step 4: Register the profile in `generator.ts`**

```ts
import { sqlProfile } from './emit/sql-profile.js';
// ...
const PROFILES: Partial<Record<Target, LanguageProfile<Target>>> = {
  zod: zodProfile,
  typescript: typescriptProfile,
  'json-schema': jsonSchemaProfile,
  sql: sqlProfile
};
```

- [ ] **Step 5: Run → PASS** + type-check.
- [ ] **Step 6: Commit** — `feat(codegen): sqlProfile + single-file model.sql bundling`

---

## Task 7: Flip dispatch tests — `sql` is implemented; `markdown` is the not-implemented exemplar

**Files:** Modify `test/dispatch.test.ts`

- [ ] **Step 1: Update the not-implemented tests** to target `markdown` (still unregistered), so the not-implemented contract stays covered:

Replace the body of `'rejects targets without a registered emitter with a not-implemented diagnostic'`:
```ts
const doc = await parseInput();
const outputs = await generate(doc, { target: 'markdown' });
// markdown is registered in a later phase; sql now ships in Phase 2.
expect(outputs).toHaveLength(1);
expect(outputs[0]?.diagnostics.some((d) => d.code === 'not-implemented')).toBe(true);
expect(outputs[0]?.diagnostics[0]?.message).toContain("'markdown'");
```
And in `'throws GeneratorError when strict: true and the target is not implemented'`:
```ts
await expect(generate(doc, { target: 'markdown', strict: true })).rejects.toBeInstanceOf(GeneratorError);
```

- [ ] **Step 2: Update `IMPLEMENTED_TARGETS` expectation** (the test at "IMPLEMENTED_TARGETS lists exactly..."):
```ts
expect([...IMPLEMENTED_TARGETS].sort()).toEqual(['excel', 'json-schema', 'sql', 'typescript', 'zod']);
```
Also update the comment from `Phase 2/3 will add sql, markdown, graphql.` to `Phase 2 added sql; markdown + graphql pending.`

- [ ] **Step 3: Add a positive sql dispatch assertion** alongside the zod one:
```ts
it('produces one .sql output per namespace for the sql target', async () => {
  const doc = await parseInput();
  const outputs = await generate(doc, { target: 'sql' });
  expect(outputs).toHaveLength(1);
  expect(outputs[0]?.relativePath).toBe('cdm/base/math.sql');
  expect(outputs[0]?.content).toContain('CREATE TABLE "Quantity"');
});
```

- [ ] **Step 4: Run the full codegen suite** — `pnpm --filter @rune-langium/codegen test` — all green (dispatch + sql + sql-dialect + the pre-existing zod/ts/json-schema suites unaffected).
- [ ] **Step 5: Commit** — `test(codegen): sql is implemented; markdown is the not-implemented dispatch exemplar`

---

## Task 8: Full verification

- [ ] `pnpm --filter @rune-langium/codegen test` — all suites pass.
- [ ] `pnpm --filter @rune-langium/codegen run type-check` — clean.
- [ ] Manual smoke: a CDM-ish multi-namespace fixture → `generate(docs, { target:'sql', sql:{ dialect:'sqlserver', layout:'single-file' } })` parses via `node-sql-parser` `transactsql`.
- [ ] superpowers:finishing-a-development-branch → push + PR (do NOT merge locally). PR title: `feat(codegen): SQL DDL emitter (Phase 2 of codegen-additional-targets)`.

## Notes / scope boundaries
- **Out of scope (per spec phasing):** Markdown (also P2) + GraphQL (P3) emitters — separate plans.
- **`enumStrategy: 'table'`** (enum lookup table + FK) — Task 3 implements only the default `'check'`. If `'table'` is requested, emit an `info` diagnostic and fall back to CHECK; a follow-up can implement the lookup-table strategy. (Don't silently ignore the option — surface it.)
- **`inheritance: 'single-table'`** — Task 5 falls back to table-per-type with an `info` diagnostic; true single-table flattening is a follow-up.
- **Cross-namespace FKs:** within a per-namespace `<ns>.sql`, a reference to a type in another namespace produces an FK to a table name that isn't declared in that file. That's expected for per-namespace layout (the `model.sql` single-file bundle has all tables). Keep FK target as the bare type name; do not attempt schema-qualification in this phase (note it as a known limitation in the PR).
- **DRY:** `bounds()` + `dialectFor()` are the shared primitives; reuse them across Tasks 3-6 rather than re-reading `card.inf/.sup` inline.
