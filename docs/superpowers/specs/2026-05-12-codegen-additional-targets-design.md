# Additional Codegen Targets — Design Spec

**Feature Branch**: `018-codegen-additional-targets`
**Status**: Draft — design review
**Created**: 2026-05-12
**Author**: Pradeep Mouli (with brainstorming via Claude Code)

## 1. Goal

Extend `@rune-langium/codegen` with four new emitter targets — **Excel data dictionary** (P1), **SQL DDL** (P2), **Markdown documentation** (P2), **GraphQL SDL** (P3) — and surface them in the studio app via a targets-table UX that distinguishes per-namespace **Preview** from whole-model **Download**.

## 2. Architecture

### 2.1 Two-track emitter contract

Today every emitter implements `NamespaceEmitter`, and `runGenerate()` calls it once per namespace, producing one `GeneratorOutput` per namespace. The new Excel and GraphQL emitters produce **one artifact for the entire model**, so we add a parallel contract:

```ts
// packages/codegen/src/emit/namespace-emitter.ts (extended)

export interface WholeModelEmitter {
  emit(
    walks: ReadonlyMap<string, NamespaceWalkResult>,
    registry: NamespaceRegistry,
    options: GeneratorOptions
  ): GeneratorOutput[];
}

export interface WholeModelEmitterConstructor {
  new (): WholeModelEmitter;
}

export type EmitterConstructor = NamespaceEmitterConstructor | WholeModelEmitterConstructor;

export function isWholeModelEmitter(c: EmitterConstructor): c is WholeModelEmitterConstructor;
```

`runGenerate()` dispatches on the contract:

```ts
if (isWholeModelEmitter(emitterClass)) {
  const walks = new Map<string, NamespaceWalkResult>();
  for (const [ns, docs] of byNamespace) walks.set(ns, walkNamespace(docs, ns));
  outputs.push(...new emitterClass().emit(walks, registry, options));
} else {
  // existing per-namespace loop
}
```

### 2.2 Target classification

| Target        | Contract            | Files emitted                                         |
|---------------|---------------------|--------------------------------------------------------|
| `zod`         | `NamespaceEmitter`  | `<ns>.zod.ts` per namespace                            |
| `typescript`  | `NamespaceEmitter`  | `<ns>.ts` per namespace                                |
| `json-schema` | `NamespaceEmitter`  | `<ns>.schema.json` per namespace                       |
| `sql`         | `NamespaceEmitter`  | `<ns>.sql` per namespace + `_all.sql` aggregator       |
| `markdown`    | `NamespaceEmitter`  | `<ns>.md` per namespace + `index.md` table of contents |
| `excel`       | `WholeModelEmitter` | `model.xlsx` (binary)                                  |
| `graphql`     | `WholeModelEmitter` | `schema.graphql`                                       |

**Download = always whole model, executed server-side.** Studio Downloads do **not** run codegen in the browser. The studio POSTs workspace files + target + options to a Cloudflare Pages Function at `/api/codegen` (colocated with the studio's static assets — same origin, same deploy, no CORS). The Pages Function imports `@rune-langium/codegen` and runs the emitter; for per-namespace targets it also packages the outputs into a `.zip`. The response streams the binary artifact (single file for whole-model targets, zip for per-namespace targets) directly to the browser, which triggers a download.

The CLI is **unchanged** by this server-side path — it continues to run codegen locally and write per-file outputs to disk under `-o`. The same `@rune-langium/codegen` package is consumed by three callers: CLI (Node.js), studio Preview (browser worker, per-namespace only), studio Download (Pages Function). The package itself remains isomorphic.

The `_all.sql` and `index.md` aggregators are produced by a small post-loop step inside `runGenerate()`, keyed off the target. Adding a third such case in the future will justify extracting an "aggregator" abstraction; two does not (YAGNI).

### 2.3 Binary content on `GeneratorOutput`

`GeneratorOutput.content` is currently `string`. An `.xlsx` is binary. We extend the type:

```ts
// packages/codegen/src/types.ts
export interface GeneratorOutput {
  relativePath: string;
  content: string;                // existing — utf-8 text
  binary?: Uint8Array;            // NEW — when present, content is empty and binary is the payload
  sourceMap: SourceMapEntry[];
  diagnostics: Diagnostic[];
  funcs: FuncMetadata[];
  mimeType?: string;              // NEW — hint for downstream consumers (download UI, file writers)
}
```

Consumers (CLI file-writer, studio download handler) check `output.binary` first, fall back to `output.content`. Text-emitting whole-model targets (GraphQL) keep using `content`.

### 2.4 Target descriptors — single source of truth

The studio targets table is data-driven from the codegen package:

```ts
// packages/codegen/src/types.ts (new export)
export type TargetDescriptor = {
  label: string;
  contract: 'namespace' | 'whole-model';
  desc: string;
  extension: string;
  mimeType?: string;
};

export const TARGET_DESCRIPTORS: Record<Target, TargetDescriptor> = {
  zod:           { label: 'Zod',          contract: 'namespace',   desc: 'Runtime validation schemas',           extension: '.zod.ts' },
  typescript:    { label: 'TypeScript',   contract: 'namespace',   desc: 'Type-only interfaces',                 extension: '.ts' },
  'json-schema': { label: 'JSON Schema',  contract: 'namespace',   desc: 'Draft 2020-12 schema documents',       extension: '.schema.json' },
  sql:           { label: 'SQL',          contract: 'namespace',   desc: 'DDL (Postgres / SQL Server)',          extension: '.sql' },
  markdown:      { label: 'Markdown',     contract: 'namespace',   desc: 'Reference documentation',              extension: '.md' },
  excel:         { label: 'Excel',        contract: 'whole-model', desc: 'Data dictionary workbook',             extension: '.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  graphql:       { label: 'GraphQL SDL',  contract: 'whole-model', desc: 'Schema definition language',           extension: '.graphql', mimeType: 'application/graphql' }
};
```

Adding an emitter in a future release: add a row here, codegen ships it, studio picks it up automatically on version bump.

### 2.5 Type union and path helper extensions

```ts
// packages/codegen/src/types.ts
export type Target = 'zod' | 'json-schema' | 'typescript' | 'sql' | 'markdown' | 'excel' | 'graphql';
```

`getTargetRelativePath()` in `namespace-walker.ts` adds branches for `sql` (`<ns>/<ns>.sql`), `markdown` (`<ns>.md`). The whole-model emitters (`excel`, `graphql`) compute their own filenames internally; the function returns the per-namespace path for the namespace-level targets and the function is simply not called for whole-model emitters.

## 3. User Stories

### US1 — Excel data dictionary (P1)

A CDM adoption lead receives a set of `.rune` files defining their firm's CDM profile. They need to share the model with compliance, legal, and business analysts who don't use the studio. They run `pnpm rune-codegen --target excel <input> -o model.xlsx` (or click "Download" on the Excel row in the studio's targets table) and receive a professionally formatted Excel workbook.

**Independent test**: 5 types (one inheritance chain), 2 enums, 3 conditions → opens in Excel/Google Sheets with frozen headers, auto-filter, hyperlinks, alternating row shading, summary sheet.

**Acceptance scenarios**: see Section 5.1.

### US2 — SQL DDL (P2)

A data engineer needs a relational schema to persist CDM trade data. They run `pnpm rune-codegen --target sql <input> -o schema.sql --sql-dialect postgres` and execute the result against their database.

**Independent test**: parent type, child type, enum, `(1..*)` cardinality → tables, foreign keys, check constraints, join table. Validated by parsing with `node-sql-parser` (no DB connection required for unit tests).

**Acceptance scenarios**: see Section 5.2.

### US3 — Markdown documentation (P2)

A developer publishes Markdown reference docs to a GitHub wiki / static site. They run `pnpm rune-codegen --target markdown <input> -o docs/` and get one `.md` per namespace plus an `index.md` table of contents.

**Independent test**: types, enums, conditions, inheritance → renders on GitHub with working anchor links, cross-namespace file links, type tables, condition subsections.

**Acceptance scenarios**: see Section 5.3.

### US4 — GraphQL SDL (P3)

A platform team building an API layer needs GraphQL types mirroring their Rune model. They run `pnpm rune-codegen --target graphql <input> -o schema.graphql` and use the output as the foundation for their server (resolvers added manually or via Pothos/Nexus).

**Independent test**: types, enums, inheritance → parses with `graphql-js`'s `parse()` and `buildSchema()`.

**Acceptance scenarios**: see Section 5.4.

### US5 — Targets table in studio (P0, lands with Phase 0)

A developer opens the studio's Code preview tab and sees a table of all available targets. For each per-namespace target (Zod, TypeScript, JSON Schema, SQL, Markdown), the row shows **Preview** (current namespace's output) and **Download** (zip of all per-namespace outputs plus any aggregator). For each whole-model target (Excel, GraphQL), the row shows **Download** only (single-artifact output).

**Independent test**: with 3 namespaces loaded, click Preview on Zod → existing code viewer shows the active namespace's Zod output; click `← Targets` → returns to table; click Download on Zod → browser saves `zod-output.zip` containing three `.zod.ts` files; click Download on Excel → browser saves `model.xlsx` and it opens cleanly.

## 4. Emitter Designs

### 4.1 Excel emitter (P1)

**Library**: `exceljs` ^4.4 (MIT, ~500KB, zero native deps). Runs in Node.js (CLI) and Cloudflare Workers runtime (Pages Function); requires `nodejs_compat` compatibility flag on the Pages Function for ExcelJS's `Buffer` / stream usage.

**Loading**: imported normally inside `ExcelWholeModelEmitter`. Because the studio's browser worker **does not run the Excel emitter** (Excel is download-only and downloads are server-side), the browser bundle is unaffected by the ExcelJS dependency. The Pages Function bundle includes it — well within Cloudflare Workers' 10MB bundle limit.

**Sheets**:

| Sheet      | Columns                                                                                                       | Rows                                                              |
|------------|---------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------|
| Types      | Namespace, Type, Extends, Description, Attribute, Attribute Type, Cardinality, Attribute Description, Inherited From | One row per attribute. Type-level rows have empty Attribute columns and act as group headers. |
| Enums      | Namespace, Enum, Description, Value, Display Name, Value Description                                          | One row per enum value. Enum-level rows act as group headers.    |
| Conditions | Namespace, Type, Condition Name, Kind, Expression, Description                                                | One row per condition.                                            |
| Functions  | Namespace, Function, Input Type, Output Type, Description                                                     | One row per function.                                             |
| Rules      | Namespace, Rule, Kind, Input Type, Description                                                                | One row per rule.                                                 |
| Summary    | Namespace, Types, Enums, Conditions, Functions, Rules                                                         | One row per namespace.                                            |

**Formatting**:
- Frozen header row, auto-filter on all columns
- Type/enum group header rows: bold, light-grey fill
- Alternating row shading within groups
- Column widths auto-calculated from content (max cap to avoid runaway widths on long descriptions)
- Cardinality conditional formatting: `(1..1)` green, `(0..1)` yellow, `(1..*)` blue, `(0..*)` grey
- Namespace column uses Excel data validation with the distinct namespace list as the dropdown source

**Hyperlinks**: Attribute Type cells use `HYPERLINK("#'Types'!A<row>", "<fqn>")` pointing to the corresponding type row. Implementation: during the Types sheet write pass, populate a `Map<string, number>` keyed by `<namespace>.<typeName>`; when emitting attribute rows, look up the target and emit a hyperlink formula. Cross-namespace references use the same map (it's already keyed by fully-qualified name).

**Output**:
```ts
{
  relativePath: 'model.xlsx',
  content: '',
  binary: <Uint8Array from workbook.xlsx.writeBuffer()>,
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  sourceMap: [],
  diagnostics: [],
  funcs: []
}
```

**Estimated size**: ~350 lines.

### 4.2 SQL DDL emitter (P2)

**Dialects**: Postgres (default), SQL Server. Selected via `--sql-dialect={postgres|sqlserver}` and `GeneratorOptions.sql.dialect`. MySQL and SQLite are deferred — flag stays open for future additions, none of which require contract changes.

**Dialect strategy interface**:

```ts
interface SqlDialect {
  quoteIdent(name: string): string;          // "name" | [name]
  typeOf(runeType: BasicType): string;
  bool: string;                              // BOOLEAN | BIT
  primaryKeySyntax(column: string): string;  // GENERATED ALWAYS AS IDENTITY | IDENTITY(1,1)
  enumCheckSyntax(column: string, values: string[]): string;
  reservedWords: ReadonlySet<string>;
}
```

**Type mapping**:

| Rune Type       | PostgreSQL    | SQL Server         |
|-----------------|---------------|--------------------|
| `string`        | `TEXT`        | `NVARCHAR(MAX)`    |
| `int`           | `INTEGER`     | `INT`              |
| `number`        | `NUMERIC`     | `DECIMAL(19,4)`    |
| `boolean`       | `BOOLEAN`     | `BIT`              |
| `date`          | `DATE`        | `DATE`             |
| `time`          | `TIME`        | `TIME`             |
| `zonedDateTime` | `TIMESTAMPTZ` | `DATETIMEOFFSET`   |

**Inheritance** (via `--sql-inheritance`):
- `single-table` (default): all attributes of a hierarchy in one table, `_type VARCHAR NOT NULL` discriminator.
- `table-per-type`: one table per concrete type, child tables hold a foreign key to the parent's surrogate PK.

**Enums** (via `--sql-enum-strategy`):
- `check` (default): `CHECK (column IN ('VALUE_1', 'VALUE_2', …))` constraint
- `table`: separate lookup table referenced by FK

**Multi-valued attributes** (`(0..*)`, `(1..*)`): join table named `{parent_table}_{attribute_name}` with composite FK to the parent surrogate key and `position INTEGER` for ordering.

**Naming**: `camelCase → snake_case`. Reserved words quoted with dialect-specific syntax (Postgres: `"order"`; SQL Server: `[order]`). Reserved-word set is loaded per dialect.

**Output**:
- One `<ns>.sql` per namespace, ordered by topo-sort
- One `_all.sql` aggregator with dialect-appropriate include directive (`\i` for Postgres, `:r` for SQL Server `sqlcmd`)

**Testing**:
- Unit tests: parse generated DDL with `node-sql-parser` (dialect-aware) → assert no syntax errors, expected table/column shape
- Optional integration job: `docker run postgres:16`, apply generated DDL, assert `\d+ table_name` matches expectations. Runs on a separate CI job (skip on PR, run on main / nightly).
- SQL Server: parse-only in CI (no integration job). Local execution path documented in plan but not enforced.

**Estimated size**: ~300 lines (one file plus the dialect modules).

### 4.3 Markdown emitter (P2)

**Output**: one `.md` per namespace + `index.md` table of contents. Aggregator emitted by the post-loop step in `runGenerate()`.

**Flavor**: GitHub-flavored Markdown. Anchors follow GitHub's auto-anchor rule (lowercase, non-alphanumerics stripped, spaces → hyphens).

**Per-namespace file structure**:

```markdown
# cdm.base.math

## Types

### Quantity
*extends [MeasureBase](#measurebase)*

> A quantity with a unit and optional frequency.

| Attribute   | Type                        | Cardinality | Description           |
|-------------|-----------------------------|-------------|-----------------------|
| value       | `number`                    | (1..1)      | The numeric value     |
| unit        | [UnitType](#unittype)       | (0..1)      | The unit of measure   |
| *multiplier*| `number`                    | (0..1)      | *inherited from MeasureBase* |

#### Constraints
- **NonNegative** (expression): `value >= 0`

## Enums

### DayCountFractionEnum

> Day count conventions for interest calculations.

| Value             | Display Name    | Description                       |
|-------------------|-----------------|-----------------------------------|
| `ACT_360`         | ACT/360         | Actual/360 convention             |
| `ACT_365_FIXED`   | ACT/365.FIXED   | Actual/365 fixed convention       |
```

**Cross-references**: same-namespace types → anchor link (`[TypeName](#typename)`). Cross-namespace types → relative file link (`[cdm.base.math.Quantity](cdm.base.math.md#quantity)`).

**Estimated size**: ~250 lines.

### 4.4 GraphQL SDL emitter (P3)

**Scope**: object types + enums + interfaces + `@constraint` directives. **No input types, no Query/Mutation roots, no scalar definitions for Rune temporal types** — those map to GraphQL `String` with a documentation comment noting the underlying Rune type. Users who want stricter scalars can post-process.

**Mapping**:

| Rune construct                         | GraphQL output                                                              |
|----------------------------------------|------------------------------------------------------------------------------|
| `type` with no subtypes                | `type TypeName { … }`                                                        |
| `type` that has subtypes               | `interface TypeName { … }` + each subtype as `type ChildName implements TypeName { … }` |
| `enum`                                 | `enum EnumName { VALUE_1 VALUE_2 … }`                                        |
| `(1..1)` attribute                     | `fieldName: Type!`                                                           |
| `(0..1)` attribute                     | `fieldName: Type`                                                            |
| `(0..*)` attribute                     | `fieldName: [Type!]`                                                         |
| `(1..*)` attribute                     | `fieldName: [Type!]!`                                                        |
| `condition`                            | `@constraint(name: "…", kind: "…", expression: "…")` on the parent type     |

**Preamble**: emitted once at the top of `schema.graphql`:

```graphql
directive @constraint(name: String!, kind: String!, expression: String) on OBJECT | INTERFACE
```

**Testing**: parse the output with `graphql`'s `parse()` and `buildSchema()` in unit tests. CDM smoke test: parse generated SDL from the full CDM, assert no errors.

**Estimated size**: ~250 lines.

## 5. Acceptance Scenarios

### 5.1 Excel (US1)

1. **Given** a Rune model with 10 types across 3 namespaces, **When** the Excel generator runs, **Then** the output `.xlsx` contains a "Types" sheet with one row per attribute (grouped under parent types), columns for Namespace, Type, Extends, Description, Attribute, Attribute Type, Cardinality, Attribute Description, Inherited From.
2. **Given** a Rune model with 3 enumerations, **When** the Excel generator runs, **Then** the output contains an "Enums" sheet with one row per enum value grouped under parent enums.
3. **Given** a Rune model with `condition` blocks, **When** the Excel generator runs, **Then** the output contains a "Conditions" sheet listing each condition with Kind (one-of / choice / exists / expression) and Expression columns.
4. **Given** a Rune model with functions, **When** the Excel generator runs, **Then** the output contains a "Functions" sheet with Function, Input Type, Output Type, Description.
5. **Given** a Rune model with cross-namespace type references, **When** the Excel generator runs, **Then** Attribute Type cells contain fully-qualified references and hyperlink to the corresponding Types-sheet row.
6. **Given** any generated workbook, **When** opened in Excel or Google Sheets, **Then** each sheet has frozen headers, auto-filter, auto-fit column widths, alternating row shading, and conditional formatting on the Cardinality column.

### 5.2 SQL (US2)

1. **Given** a Rune type with scalar attributes of varying cardinality, **When** the SQL generator runs with defaults, **Then** `(1..1)` attributes are `NOT NULL` columns, `(0..1)` are nullable, `(0..*)` and `(1..*)` produce a separate join table with FK to the parent.
2. **Given** a Rune type that extends a parent, **When** the SQL generator runs, **Then** the output uses single-table inheritance by default with a `_type` discriminator, switchable to table-per-type via `--sql-inheritance=table-per-type`.
3. **Given** a Rune enum, **When** the SQL generator runs, **Then** the output uses a `CHECK` constraint by default, switchable to a lookup table via `--sql-enum-strategy=table`.
4. **Given** the default Postgres dialect, **When** the SQL generator runs, **Then** `string → TEXT`, `int → INTEGER`, `number → NUMERIC`, `boolean → BOOLEAN`, `date → DATE`, `time → TIME`, `zonedDateTime → TIMESTAMPTZ`.
5. **Given** the `--sql-dialect=sqlserver` flag, **When** the SQL generator runs, **Then** the output uses bracket quoting, `BIT` booleans, `DATETIMEOFFSET` for zoned timestamps, `NVARCHAR(MAX)` for strings.

### 5.3 Markdown (US3)

1. **Given** a Rune model spanning multiple namespaces, **When** the Markdown generator runs, **Then** the output directory contains one `.md` file per namespace plus an `index.md` linking to all namespace files.
2. **Given** a Rune type with attributes, **When** the Markdown generator runs, **Then** the type section contains an attributes table with hyperlinked types.
3. **Given** a Rune type with conditions, **When** the Markdown generator runs, **Then** conditions appear under a "Constraints" subsection with name, kind, and expression.
4. **Given** a Rune type extending a parent, **When** the Markdown generator runs, **Then** the type heading shows `*extends [Parent](#parent)*` and inherited attributes are listed in italics with `*inherited from Parent*`.

### 5.4 GraphQL (US4)

1. **Given** a Rune type with attributes, **When** the GraphQL generator runs, **Then** the output contains a GraphQL `type` with `(1..1)` → `Field!`, `(0..1)` → `Field`, `(0..*)` → `[Field!]`, `(1..*)` → `[Field!]!`.
2. **Given** a Rune enum, **When** the GraphQL generator runs, **Then** the output contains a GraphQL `enum` with matching values.
3. **Given** a Rune type extending a parent, **When** the GraphQL generator runs, **Then** the parent is emitted as `interface` and the child uses `implements`.
4. **Given** a Rune type with conditions, **When** the GraphQL generator runs, **Then** `@constraint(...)` directives are emitted on the type and the directive definition is included in the schema preamble.
5. **Given** any generated SDL, **When** parsed with `graphql-js`'s `buildSchema()`, **Then** no errors are raised.

### 5.5 Studio targets table (US5)

1. **Given** the studio is open with at least one namespace loaded, **When** the Code preview panel is visible, **Then** the panel shows a targets table with one row per entry in `TARGET_DESCRIPTORS` **whose target is currently registered in `EMITTER_CLASSES`**, each row showing the label, description, and an Actions cell containing buttons per the `contract` field: per-namespace contracts show both **Preview** and **Download**; whole-model contracts show **Download** only. Unregistered targets are filtered out.
2. **Given** the targets table is visible, **When** the user clicks **Preview** on a per-namespace target, **Then** the panel switches to a code viewer showing the current namespace's generated output, with a `← Targets` link and a `Previewing: [target ▾]` dropdown listing only per-namespace targets.
3. **Given** the user is previewing a target, **When** they pick another per-namespace target from the dropdown, **Then** the viewer re-runs codegen and replaces the content without leaving viewer mode.
4. **Given** the targets table is visible, **When** the user clicks **Download** on a whole-model target, **Then** the studio POSTs the workspace files + target to `/api/codegen`, the Pages Function runs the emitter and returns the single artifact with `Content-Disposition: attachment; filename="<name>"`, the browser saves the file, and the table remains visible.
5. **Given** the targets table is visible, **When** the user clicks **Download** on a per-namespace target with multiple namespaces loaded, **Then** the studio POSTs files + target to `/api/codegen`, the Pages Function runs the emitter for every namespace + aggregator and zips the outputs into `<target>-output.zip`, the response streams back with the appropriate `Content-Disposition`, and the browser saves the zip.
6. **Given** a per-namespace target with only one namespace loaded, **When** the user clicks **Download**, **Then** the Pages Function returns the single output file directly (no zip wrapper).
7. **Given** an emitter constructor lookup fails at the boundary (e.g., a stale `Target` value reaches `runGenerate`), **When** the user triggers an action, **Then** the panel surfaces the existing `GeneratorDiagnostic` (`error` severity, code `'not-implemented'`, see `packages/codegen/src/generator.ts:91-105`) — the table itself does not crash. Unregistered targets are filtered out of the table per AS-1, so this path is only reachable via direct API misuse, not the UI.

## 6. Phasing

| Phase | Scope                                                                                                                                          | Gate to next                                                                                  |
|-------|------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| 0     | **Contract + UI shell + server endpoint.** Land `WholeModelEmitter` contract, `runGenerate` dispatch, `Target` union extension, `getTargetRelativePath` branches, `GeneratorOutput.binary` field, `TARGET_DESCRIPTORS` export (all seven entries declared). Studio: targets table replaces `TargetSwitcher`, in-preview dropdown, Download action wired to `/api/codegen`. New Pages Function at `apps/studio/functions/api/codegen.ts` with the request/response contract from Section 7.6. Local-dev path established (`wrangler pages dev` or `@cloudflare/vite-plugin` — decided at implementation). **Phase 0 ships no new emitters** — `TARGET_DESCRIPTORS` declares all seven entries but the table filters to only show targets whose constructor is present in `EMITTER_CLASSES`. The user sees three rows (Zod, TypeScript, JSON Schema). Download already works server-side for the three existing per-namespace emitters (zipped). | Existing emitters and tests pass; targets table renders and filters correctly; Preview round-trips work; Downloads return a valid zip from the Pages Function. |
| 1     | Excel emitter (P1). Fixture tests with ExcelJS read-back. CDM smoke test (row counts match). Studio Download action wired up.                  | Stakeholder-shareable `.xlsx` from a real model.                                              |
| 2     | SQL emitter (Postgres + SQL Server) and Markdown emitter, in parallel. SQL parse-only tests + optional Postgres integration. Markdown fixture and CDM smoke tests. | Generated DDL parses; Markdown renders on GitHub.                                             |
| 3     | GraphQL SDL emitter. graphql-js parse validation. CDM smoke test.                                                                              | SDL compiles via `buildSchema()` on full CDM.                                                 |

## 7. Studio UX — Targets Table (Phase 0)

### 7.1 Replacement of `TargetSwitcher`

Today: `apps/studio/src/components/TargetSwitcher.tsx` is a tablist with three buttons inside `CodePreviewPanel`. Clicking re-runs codegen for the current namespace.

After: targets table is the **landing view** of `CodePreviewPanel`. Clicking Preview transitions the panel to a code-viewer view. Clicking Download triggers a worker-driven file download without leaving the table.

### 7.2 Layout

```
┌─ Code ────────────────────────────────────────────────────────────────────────────┐
│                                                                                    │
│  Target          Description                            Actions                   │
│  ──────────────  ─────────────────────────────────────  ───────────────────────── │
│  Zod             Runtime validation schemas             [ 👁 Preview ] [ ⬇ Download ] │
│  TypeScript      Type-only interfaces                   [ 👁 Preview ] [ ⬇ Download ] │
│  JSON Schema     Draft 2020-12 schema documents         [ 👁 Preview ] [ ⬇ Download ] │
│  SQL             DDL (Postgres / SQL Server)            [ 👁 Preview ] [ ⬇ Download ] │
│  Markdown        Reference documentation                [ 👁 Preview ] [ ⬇ Download ] │
│  ──────────────  ─────────────────────────────────────  ───────────────────────── │
│  Excel           Data dictionary workbook (.xlsx)                     [ ⬇ Download ] │
│  GraphQL SDL     Schema definition language (.graphql)                [ ⬇ Download ] │
│                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────┘
```

Per-namespace target rows expose two buttons; whole-model rows expose Download only. Download always produces the **whole-model output** for that target — for per-namespace contracts, that means a `.zip` packaging all per-namespace files plus any aggregator (`_all.sql`, `index.md`); for whole-model contracts, the single artifact.

When previewing:

```
┌─ Code ──────────────────────────────────────────────────────────────────┐
│ [← Targets]   Previewing: [Zod ▾]                                       │
│ ──────────────────────────────────────────────────────────────────────  │
│ <existing code viewer for the current namespace>                        │
└──────────────────────────────────────────────────────────────────────────┘
```

The `[Zod ▾]` dropdown lists only `contract: 'namespace'` targets. Whole-model targets do not appear (their action is download, not preview).

### 7.3 Behavior rules

| Emitter contract     | Button       | Behavior                                                                                                                                                                                |
|----------------------|--------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `NamespaceEmitter`   | **Preview**  | Browser-side. Set `activeTarget = <target>` in `codegen-store`. The studio's existing in-browser codegen worker runs the per-namespace emitter for the current namespace; the panel renders the code viewer. `← Targets` link restores `activeTarget = null`. Dropdown switches `activeTarget` directly. |
| `NamespaceEmitter`   | **Download** | **Server-side.** Studio POSTs `{ files, target, options }` to `/api/codegen` (same-origin Pages Function). Function runs the emitter for every namespace + aggregator, zips with JSZip, streams response with `Content-Disposition: attachment; filename="<target>-output.zip"`. Studio's fetch handler triggers the browser save. Table stays visible. |
| `WholeModelEmitter`  | **Download** | **Server-side.** Studio POSTs to `/api/codegen` as above. Function runs the whole-model emitter, returns the single artifact with the descriptor's `mimeType` and `Content-Disposition: attachment; filename="model.xlsx"` (or `schema.graphql`). Studio triggers browser save. Table stays visible. |

### 7.4 Files affected in studio

| File                                                  | Change                                                                                                  |
|-------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| `apps/studio/src/components/CodePreviewPanel.tsx`     | Render `CodegenTargetsTable` when `activeTarget == null`; render code viewer + back link + dropdown when set. |
| `apps/studio/src/components/CodegenTargetsTable.tsx`  | **NEW** — renders the table, reads `TARGET_DESCRIPTORS`, dispatches preview/download.                   |
| `apps/studio/src/components/codegen-ui.ts`            | Drop local `TARGET_OPTIONS`; re-export `TARGET_DESCRIPTORS` from `@rune-langium/codegen`.               |
| `apps/studio/src/components/TargetSwitcher.tsx`       | **Delete** — replaced by the dropdown inside the code viewer (rendered inline in `CodePreviewPanel`).   |
| `apps/studio/src/store/codegen-store.ts`              | Add `activeTarget: Target \| null`. Initial value `null`.                                                |
| `apps/studio/src/services/codegen-service.ts`         | Add `downloadTarget(target: Target): Promise<void>` — POSTs `{ files, target, options }` to `/api/codegen` (same-origin), reads the response as a `Blob`, triggers download via `URL.createObjectURL` + temporary anchor using the `Content-Disposition` filename. No browser-side packaging or emitter work. |
| `apps/studio/src/workers/codegen-worker.ts`           | **Unchanged for Download.** Still handles Preview (per-namespace, browser-side). No new download message handler needed — Downloads bypass this worker entirely. |
| `apps/studio/functions/api/codegen.ts`                | **NEW Pages Function.** Imports `@rune-langium/codegen`, parses incoming `{ files, target, options }`, runs `runGenerate`, packages as needed (single artifact or zip via JSZip), streams binary response with `Content-Type` and `Content-Disposition`. Returns `application/json` error envelope on fatal diagnostics. |
| `apps/studio/functions/_middleware.ts` (or per-route) | Compatibility flags (`nodejs_compat`), error-to-JSON guard. |
| `apps/studio/wrangler.toml` (NEW)                     | Pages project config; declares the Functions directory and the `nodejs_compat` flag. |
| Studio Vite config or `package.json`                  | Add `wrangler` (or `@cloudflare/vite-plugin`) for local dev so `pnpm dev` serves the Pages Function alongside the SPA. Concrete tooling choice decided in the implementation plan. |
| **Not** added to studio: `exceljs`, `jszip`           | Both move to the Pages Function's dependency set, not the studio's. Browser bundle stays lean. |

### 7.5 License boundary

The `@rune-langium/codegen` package is MIT and now contains user-facing labels (`"Zod"`, `"Excel"`, etc.). This is acceptable — the labels are not the studio's branded UX, just identifiers for a generic capability. The studio (FSL-1.1-ALv2) renders the table; how it renders is its own concern.

The new Pages Function at `apps/studio/functions/api/codegen.ts` lives under `apps/studio/` and inherits the studio's **FSL-1.1-ALv2** license. The function imports MIT `@rune-langium/codegen` (allowed — FSL projects can consume MIT). No license-boundary violation.

### 7.6 Pages Function endpoint contract

**Route**: `POST /api/codegen`  (Cloudflare Pages Function at `apps/studio/functions/api/codegen.ts`, served at the studio's own origin)

**Request**:

```http
POST /api/codegen
Content-Type: application/json
```

```ts
type CodegenRequest = {
  files: Array<{ path: string; content: string }>;   // .rune source files
  target: Target;                                     // 'excel' | 'graphql' | 'zod' | 'typescript' | 'json-schema' | 'sql' | 'markdown'
  options?: {
    sql?: {
      dialect?: 'postgres' | 'sqlserver';
      inheritance?: 'single-table' | 'table-per-type';
      enumStrategy?: 'check' | 'table';
    };
  };
};
```

**Successful response** — binary stream, content-typed for the target:

```http
HTTP/1.1 200 OK
Content-Type: <descriptor.mimeType, e.g. application/vnd.openxmlformats-officedocument.spreadsheetml.sheet>
Content-Disposition: attachment; filename="<filename>"
```

`<filename>` is `model.xlsx` / `schema.graphql` for whole-model targets, `<target>-output.zip` for multi-file per-namespace targets, or the single output's `relativePath` for one-namespace-only models.

**Error response** — JSON envelope:

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json
```

```ts
type CodegenError = {
  ok: false;
  diagnostics: GeneratorDiagnostic[];        // reused from packages/codegen/src/diagnostics.ts
  error: string;                             // short human summary
};
```

Status codes:

| Status | Meaning                                                                          |
|--------|----------------------------------------------------------------------------------|
| 200    | Success; response body is the artifact (binary or zip).                          |
| 400    | Validation failure — bad request shape, unknown target, fatal generation diagnostics. JSON envelope. |
| 413    | Payload too large — workspace files exceed configured limit (e.g., 10MB POST cap). |
| 429    | Rate-limited (if/when rate-limiting is added; not in initial scope).             |
| 500    | Server error inside the emitter; JSON envelope with summary, no diagnostics.     |

**Runtime requirements**: Cloudflare Workers compatibility date matching the codegen-worker's, `nodejs_compat` flag enabled (for ExcelJS's `Buffer` usage). Studio's `wrangler.toml` declares both.

**No authentication in v1.** The endpoint is unauthenticated for the first cut — same posture as today's static studio. Rate-limiting can be added later via the existing patterns in `apps/codegen-worker/src/rate-limit.ts` if abuse emerges.

### 7.7 Strategic note — future server-side migrations

This spec moves Download to a Pages Function; it does **not** move Preview, parse, or LSP. Those remain browser-side for now. The Pages Function pattern established here is **reusable**: future spikes can migrate compute-heavy browser workers (parse-worker, preview-gen) to Pages Functions at the same origin under `apps/studio/functions/`, sharing the same wrangler config and local-dev tooling. Out of scope for this spec, but the architectural shape supports it.

## 8. Testing Strategy

### 8.1 Per-emitter unit tests

Each emitter gets a `packages/codegen/test/emit/<target>-emitter.test.ts` fixture suite:

- A handful of small `.rune` models cover the acceptance scenarios.
- Output is asserted by reading back (Excel: open with ExcelJS and check cell values; SQL: parse with `node-sql-parser`; GraphQL: `buildSchema()`; Markdown: snapshot test on output strings).

### 8.2 CDM smoke tests

`packages/codegen/test/cdm-smoke.test.ts` is extended with one block per new emitter:

- Excel: row counts in Types / Enums / Conditions sheets match the CDM model counts.
- SQL: every generated statement parses without error in Postgres dialect (parse-only).
- Markdown: every cross-namespace link resolves to a file the generator emitted.
- GraphQL: `buildSchema()` succeeds; every referenced type is defined.

CDM smoke tests are gated on the presence of `.resources/` (per project convention) — they skip when the corpus is absent rather than fail CI.

### 8.3 SQL integration (optional CI job)

A separate `pnpm test:sql-integration` script and CI job spins up a Postgres 16 container, applies the generated DDL from a fixture model, and asserts table existence. Runs on the main branch and nightly, not on every PR. SQL Server integration is not in CI; the dialect is parse-validated only.

### 8.4 Studio UX tests

`apps/studio/test/components/CodegenTargetsTable.test.tsx`:

- Renders one row per entry in `TARGET_DESCRIPTORS` whose target is in `EMITTER_CLASSES`.
- Per-namespace rows show both Preview and Download buttons.
- Whole-model rows show only Download.
- Clicking Preview updates `codegen-store.activeTarget`.
- Clicking Download invokes `codegen-service.downloadTarget(target)`, which is mocked to verify it issues a `POST /api/codegen` with the expected body.
- Mocked fetch responses for success (binary Blob) and error (JSON envelope) are handled correctly.

Playwright `apps/studio/test/e2e/codegen-targets.spec.ts`:

- Open the studio with a small fixture.
- Verify the targets table renders, filtered to currently-registered targets.
- Click Preview on Zod → assert code viewer is visible with non-empty content.
- Use the dropdown to switch to TypeScript → assert content changes without leaving viewer mode.
- Click `← Targets` → assert table is visible again.
- Click Download → assert a network request to `/api/codegen` and a browser-download event are both observed via Playwright's `page.waitForDownload()` and `page.waitForRequest()`.

### 8.5 Pages Function integration tests

`apps/studio/functions/api/codegen.test.ts` (or a dedicated test directory under `apps/studio/functions/test/`):

- Run the function locally via `wrangler pages dev` or via direct import (the function module exports `onRequestPost` which is testable as a plain async function with a `Request` argument).
- For each target, POST a minimal fixture and assert:
  - 200 status
  - Correct `Content-Type` and `Content-Disposition`
  - Response body length > 0
  - For zip targets, response is a valid zip (re-open with JSZip in the test and inspect entry list)
  - For Excel, response is a valid xlsx (re-open with ExcelJS and check at least one cell value)
- Error cases: malformed request body → 400; unknown target → 400; intentionally invalid `.rune` content → 400 with diagnostics in the envelope.

## 9. Out of Scope

Explicitly deferred — flag stays open, contract supports each, none requires another contract change:

- MySQL and SQLite SQL dialects
- GraphQL input types, Query/Mutation root types, custom scalars for Rune temporal types
- SQL migration diffing (`ALTER TABLE` generation between model versions)
- Excel macros, VBA, pivot tables, charts
- PDF or HTML documentation outputs
- Per-namespace download zip for `NamespaceEmitter` targets (users can run the CLI)
- Renaming `ExportDialog` (the remote-service codegen path) to align with the new table — these stay separate features for now

## 10. Risks and Open Questions

| Risk                                                                       | Mitigation                                                                                              |
|----------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| ExcelJS may hit edge cases in the Cloudflare Workers runtime (Buffer, streams). | Test early — Phase 0 should include a smoke test that runs ExcelJS in `wrangler pages dev` against a minimal model. If a hard incompatibility surfaces, the fallback is migrating Download to a Node.js process (already discussed; deferred to a follow-up if needed). |
| `GeneratorOutput.binary` field is a public API change.                     | Bumps minor version. All existing consumers continue to work (binary is optional). Document in CHANGELOG. |
| SQL Server dialect ships without CI integration test.                      | Document supported-but-unverified status in the SQL emitter's README; accept community PRs for CI integration. |
| `node-sql-parser` may not cover every Postgres / SQL Server feature.       | Use it for unit parse validation only; the optional Postgres container integration is the truth source for Postgres. |
| Studio's old `TargetSwitcher` is depended on in tests we haven't audited.  | Grep for references during Phase 0 implementation; delete or redirect each.                            |
| Local-dev parity — `vite dev` is Node, Pages Function is Workers runtime.  | Phase 0 picks one of: `wrangler pages dev` (proxies Vite + serves Functions), `@cloudflare/vite-plugin` (integrates Workers runtime into Vite). Document the choice in `apps/studio/README.md`. |
| Pages Function bundle could exceed Cloudflare's 10MB limit if more dependencies accrete. | Bundle size is monitored in CI (a `wrangler deploy --dry-run` step in PR checks); fail if size grows >2MB without a justification. |
| Same-origin POST of large `.rune` workspaces may hit Pages' 100MB request limit. | Document the limit in the function's README; for the CDM corpus (~1MB total source), this is comfortable. Add a 413 path with a clear error message. |
| The Pages Function path bypasses the codegen-worker's Turnstile + rate-limit. | Acceptable for v1 (the endpoint is open like the rest of the studio). If abuse appears, reuse the patterns in `apps/codegen-worker/src/rate-limit.ts` (KV-backed per-IP buckets). |

## 11. References

- Existing `NamespaceEmitter` contract: `packages/codegen/src/emit/namespace-emitter.ts`
- Existing emitters: `zod-emitter.ts`, `ts-emitter.ts`, `json-schema-emitter.ts` in `packages/codegen/src/emit/`
- Current target enumeration: `packages/codegen/src/types.ts:8`
- Path helper: `packages/codegen/src/emit/namespace-walker.ts:104`
- Studio code preview panel: `apps/studio/src/components/CodePreviewPanel.tsx`
- Current target switcher (to be removed): `apps/studio/src/components/TargetSwitcher.tsx`
- Prior art — Rosetta Excel generator: `com.regnosys.rosetta.code-generators:excel` (159 lines Xtend; two-sheet output)
- ExcelJS: <https://github.com/exceljs/exceljs>
- node-sql-parser: <https://github.com/taozhi8833998/node-sql-parser>
- graphql-js: <https://github.com/graphql/graphql-js>
- JSZip (server-side packaging): <https://github.com/Stuk/jszip>
- Cloudflare Pages Functions: <https://developers.cloudflare.com/pages/functions/>
- Workers `nodejs_compat`: <https://developers.cloudflare.com/workers/runtime-apis/nodejs/>
