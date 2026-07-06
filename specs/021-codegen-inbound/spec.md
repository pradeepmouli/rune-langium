# Feature Specification: Inbound Code Generation (Two-Way Codegen)

**Feature Branch**: `021-codegen-inbound` (renumbered at adoption 2026-07-04; the draft's provisional "019" collided with the additional-codegen-targets work)
**Created**: 2026-05-29
**Revised**: 2026-07-04 (against HEAD `720f8c6`); amended again 2026-07-04 during Phase 1 execution — split-oracle round-trip (US1 Independent Test, Phase 1 item 7, "Round-Trip as a Test Oracle"), `oneOf`/`choice` grammar-shape correction (`ChoiceOperation`, not `OneOfOperation`), `--out-file` CLI flag rename (commander parent/subcommand option-name collision).
**Adopted**: 2026-07-04 — decisions: classic synonyms (open question 1 RESOLVED); pattern constraints emit stub + diagnostic (open question 3 RESOLVED, see below); execution scope = Phase 1 MVP only (US1 + shared translation core); Phases 2–4 recorded as follow-up efforts.
**Status**: Adopted (Phase 1 in execution)
**Input**: Add inbound (reverse) code generation to `@rune-langium/codegen`: import Rune models *from* JSON Schema, TypeScript, SQL DDL, and Python (Pydantic). Use Rune's native mapping concept (synonyms / mapping logic) to capture the source→Rune correspondence so the import is reproducible and round-trippable. MVP centers on **real expression translation** — converting source-language constraints and validation logic into Rune `condition` expressions, not just structural shape.

## Context

The `@rune-langium/codegen` package currently emits *outbound* targets — Rune → Zod, Rune → TypeScript, Rune → JSON Schema (specs 015, 017), with Excel / SQL / Markdown / GraphQL planned (spec 018). All of these treat the Rune model as the source of truth and the target language as a derived artifact.

Inbound generation inverts this. The source is an external artifact (a `.json` schema, a `.ts` file, a SQL `CREATE TABLE` script, a Pydantic module) and the output is a `.rune` model. This is the on-ramp problem: a firm with an existing data model expressed in TypeScript or JSON Schema cannot adopt Rune without first translating that model by hand. Inbound generation removes that barrier.

Two capabilities already in the repo make this tractable:

1. **`renderModel()` / `renderNode()` / `renderExpression()`** (`@rune-langium/codegen/rosetta`, browser-safe subpath) convert a Rune AST — including full expression trees — back to `.rosetta` source text, corpus-validated with fixed-point + tree-equivalence guarantees. `renderModel` accepts a PLAIN dehydrated-shaped object (`{ name, version?, elements }` — verified at rosetta-render-core.ts:555), so inbound generation needs no Langium services to produce output. Critically, the emitter includes the **synonym surface** (class/attribute/enum synonyms with full mapping-body rendering, corpus-swept in PR #363), which is exactly what this spec's annotation output emits.
2. **The Langium grammar already models synonyms and mapping logic** (`RosettaSynonym`, `RosettaSynonymSource`, `RosettaMapping`, `RosettaMappingInstance`, `RosettaMapTest`, `RosettaMapPath`). The AST types are generated and exported from `@rune-langium/core`. We emit native Rune mapping annotations, not a bespoke sidecar format.

## The Native Mapping Concept

Rune/Rosetta has a first-class mechanism for expressing how an external representation maps onto a Rune model: **synonyms** with **mapping logic**. This is the construct ISDA/REGnosys use to map FpML, ISO 20022, FIX, and other source formats onto CDM.

A synonym binds a Rune attribute to one or more named source representations (a "synonym source"), optionally with conditional mapping logic:

```rune
synonym source FpML_5_10

type InterestRatePayout:
    [synonym FpML_5_10 value "interestRatePayout"]
    rateSpecification RateSpecification (0..1)
        [synonym FpML_5_10 value "rateSpecification"]
    dayCountFraction DayCountFractionEnum (0..1)
        [synonym FpML_5_10 value "dayCountFraction"]
```

Mapping logic supports conditional set/when rules and path tests:

```rune
[synonym FpML_5_10
    set to DayCountFractionEnum -> ACT_360 when path = "ACT/360",
    set to DayCountFractionEnum -> ACT_365 when path = "ACT/365"]
```

The grammar models the full surface: `set when`, `default to`, `set to ... when`, path equality / exists / absent tests (`RosettaMapTestExpression`), and `condition-func` for delegating to a named function (`RosettaMapTestFunc`).

**Inbound generation uses this construct in two ways:**

- **As the output annotation**: when importing from a source format, emit a `synonym source <SourceName>` and attach `[synonym <SourceName> value "..."]` annotations to every generated attribute, recording the source field name. The synonym source name identifies the origin (`JsonSchema`, `TypeScript`, `Sql`, `Pydantic`). This makes the import self-documenting and round-trippable — regenerating the source format from the Rune model is deterministic because the original field names are preserved.
- **As the expression-translation target**: source-language constraints (a JSON Schema `enum` + `const` discriminator, a Pydantic `@field_validator`, a SQL `CHECK` constraint) translate into either Rune `condition` blocks (when the logic is a model invariant) or synonym mapping logic (when the logic is a value transformation from the source representation).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Import a Rune model from JSON Schema (Priority: P1)

A developer has an existing JSON Schema describing their firm's trade data (hand-written, or exported from another tool). They run `pnpm rune-codegen import --from json-schema schema.json --out-file model.rune` and receive a `.rune` file with Rune types for each schema object, enums for each `enum`/`const` union, cardinality derived from `required` + `minItems`/`maxItems`, inheritance derived from `allOf`, and synonym annotations recording the original JSON property names. JSON Schema validation keywords that express invariants (`minimum`, `maximum`, `minLength`, `oneOf` discriminators) translate into Rune `condition` blocks; `pattern` emits a stub condition + diagnostic (see amendment in scenario 5). (The `import` subcommand's output flag is `--out-file`, not `-o`/`--output` — the root `rune-codegen` command already reserves `-o`/`--output` for the outbound output directory, and a commander subcommand redeclaring the same short flag OR long name as a parent option silently drops its own value; see the CLI Surface section.)

**Why this priority**: JSON Schema is the richest *inbound* source because it is itself a validation format — it carries the constraint information that the other sources lack. It is also the closest structural analog to the existing JSON Schema *outbound* emitter, so the STRUCTURAL half of the round-trip is testable against our own output (emit Rune→JSON Schema, then import JSON Schema→Rune, and compare). This is the MVP that proves the inbound architecture end-to-end including expression translation.

**Independent Test** (AMENDED 2026-07-04 — split-oracle, see "Round-Trip as a Test Oracle" below for why): Take a hand-written `.rune` model with types, enums, an inheritance chain, cardinality variants, and 3 conditions (a `one-of`, a numeric `>=`, and a length constraint).
1. **Structural half**: Emit it to JSON Schema with the existing outbound emitter. Import the resulting JSON Schema back to Rune. Verify the re-imported model is structurally equivalent to the original (same types, attributes, cardinalities, enums, inheritance).
2. **Condition half**: Import a SEPARATE, hand-written JSON Schema fixture carrying real constraint keywords (`minimum`/`maximum`/`minLength`/`oneOf`+`discriminator` — the same shapes acceptance scenarios 5-6 exercise). Verify the imported conditions parse with zero errors and are tree-equivalent (see `expression-tree-equivalence.ts`) to a hand-written `.rune` expectation.

The two halves are not run through one shared artifact: the outbound JSON Schema emitter's own `x-rune-conditions` metadata is intentionally opaque (see "Round-Trip as a Test Oracle"), so there is no single emitted file that carries both structural shape and real condition content to round-trip through.

**Acceptance Scenarios**:

1. **Given** a JSON Schema with an `object` definition with `properties` and a `required` array,
   **When** the importer runs,
   **Then** a Rune `type` is emitted with one attribute per property; properties in `required` get `(1..1)`, others get `(0..1)`; each attribute carries a `[synonym JsonSchema value "<propertyName>"]` annotation.
2. **Given** a JSON Schema property with `"type": "array"` and `minItems`/`maxItems`,
   **When** the importer runs,
   **Then** the attribute cardinality is `(minItems..maxItems)`, with `*` for an absent `maxItems` and `(1..*)` when `minItems: 1`.
3. **Given** a JSON Schema `"enum": [...]` or a `oneOf` of `const` values,
   **When** the importer runs,
   **Then** a Rune `enum` is emitted with one value per member; non-identifier-safe values (e.g. `"ACT/360"`) are converted to safe Rune names with the original retained as `displayName`.
4. **Given** a JSON Schema using `allOf` to compose a base definition with extra properties,
   **When** the importer runs,
   **Then** the Rune type `extends` the base type and declares only the additional attributes.
5. **Given** a JSON Schema property with `minimum`, `maximum`, or `minLength`,
   **When** the importer runs,
   **Then** a Rune `condition` is emitted expressing the constraint (e.g. `minimum: 0` → `condition ValueMin: value >= 0`), named deterministically after the attribute and constraint kind.
   **AMENDED (2026-07-04)**: `pattern` does NOT translate to a native condition — the Rune grammar has NO expression-level regex operator (`pattern` exists only as a synonym-mapping value transform, rune-dsl.langium:608/630/803). A `pattern` constraint emits the `custom`-stub form: a named condition with a `// TODO: manual translation required — source pattern: <regex>` comment body plus an untranslatable-construct diagnostic.
6. **Given** a JSON Schema with a discriminated union (`oneOf` + `discriminator`),
   **When** the importer runs,
   **Then** the discriminator translates into a Rune `one-of` or `choice` condition over the union member attributes.

---

### User Story 2 — Import a Rune model from TypeScript (Priority: P2) — FOLLOW-UP (not in Phase 1)

A platform team has domain types defined as TypeScript `interface`s and `type`s (optionally with Zod schemas). They run `pnpm rune-codegen import --from typescript types.ts --out-file model.rune` and receive a Rune model. Interfaces become Rune types, union string literals become enums, optional members (`?:`) become `(0..1)`, arrays become `(0..*)`, and `extends` clauses become Rune inheritance. When a companion Zod schema is present, its `.min()`, `.max()`, `.refine()`, and `.regex()` calls translate into Rune conditions (`.regex()` → stub per the pattern amendment).

**Independent Test**: Take the Zod output produced by the existing Rune→Zod emitter for a known model. Run the TypeScript importer over it. Verify the resulting Rune model recovers the cardinalities (from `.optional()`, `.array().min()`), the enums (from `z.enum()`), the inheritance (from `.extend()`), and the conditions (from `.refine()`/`.superRefine()`).

**Acceptance Scenarios**: (as drafted; deferred with the story)

1. Required/optional/array members → `(1..1)`/`(0..1)`/`(0..*)` + `[synonym TypeScript value "..."]`.
2. String-literal unions → Rune enums.
3. `extends` → Rune inheritance, inherited members omitted.
4. Companion Zod `.min/.max/.refine` → conditions; recognized `runeCheckOneOf(...)` → `one-of`.

---

### User Story 3 — Import a Rune model from SQL DDL (Priority: P2) — FOLLOW-UP (not in Phase 1)

Tables → types, columns → attributes, `NOT NULL` → cardinality, FKs → type references, `CHECK (col IN (...))` → enums, other `CHECK` expressions → conditions, join tables → multi-valued attributes. Round-trip oracle: the shipped SQL outbound emitter (core subset).

**Acceptance Scenarios**: (as drafted; deferred with the story)

1. `NOT NULL`/nullable → `(1..1)`/`(0..1)` + `[synonym Sql value "<column_name>"]` preserving `snake_case`.
2. `CHECK (col IN (...))` → enum.
3. `FOREIGN KEY` → referenced Rune type.
4. Join table `{parent}_{attr}` + position column → `(0..*)` attribute.
5. `CHECK (notional >= 0)` → condition.

---

### User Story 4 — Import a Rune model from Python / Pydantic (Priority: P3) — FOLLOW-UP (not in Phase 1)

Pydantic `BaseModel` → types; `Optional[...]`/`list[...]` → cardinality; `Enum` subclasses → enums; class inheritance → `extends`; `@field_validator`/`@model_validator` bodies in the structured subset → conditions, else stub + diagnostic.

**Acceptance Scenarios**: (as drafted; deferred with the story)

1. Fields → attributes with cardinality + `[synonym Pydantic value "<field_name>"]`.
2. `class X(Enum)` → Rune enum with `displayName` where values differ.
3. Inheritance → `extends`.
4. Structured validator bodies → conditions; the rest → stub + diagnostic.

---

## Technical Design

### Architecture: Inbound Pipeline

Inbound generation is the mirror of the outbound pipeline. Outbound is `Langium AST → emitter → text`. Inbound is `source text → source parser → SourceModel IR → AST builder → Rune AST → serializer → .rune text`.

```
source file (.json / .ts / .sql / .py)
        │
        ▼
  [source parser]         per-source: JSON Schema reader, ts-morph,
        │                 node-sql-parser, Python AST (via tree-sitter)
        ▼
   SourceModel IR          normalized, source-agnostic intermediate
        │                  (types, attrs, enums, constraints, refs)
        ▼
  [AST builder]            SourceModel IR → Rune AST-shaped nodes
        │                  + synonym annotations + condition blocks
        ▼
   Rune AST (partial)      Data / RosettaEnumeration / Condition /
        │                  RosettaSynonym plain-object nodes
        ▼
  renderModel()            shipped renderer (codegen/rosetta) — takes
        │                  plain { name, version?, elements }
        ▼
     .rune text
```

Two seams keep this maintainable:

1. **The `SourceModel` IR** decouples source parsing from Rune AST construction. Each importer's only job is `source → SourceModel`. The AST builder and serializer are shared across all four sources. This mirrors how the outbound side shares `NamespaceWalkResult` across all emitters.
2. **The expression translation layer** is shared. Source constraints normalize into a small **`ConstraintIR`** vocabulary (comparison, range, length, pattern, one-of, exists, custom). The Rune-condition emitter consumes `ConstraintIR` and is reused by every importer — the same way the outbound `transpiler.ts` is reused across Zod and TypeScript emitters. This is the inverse of `transpiler.ts`.

### Module Structure

```
packages/codegen/src/import/
├── index.ts                    # public API: importModel(source, options)
├── source-model.ts             # SourceModel + ConstraintIR type definitions
├── ast-builder.ts              # SourceModel IR → Rune AST-shaped nodes
├── synonym-builder.ts          # emit [synonym <Source> value "..."] annotations
├── constraint-translator.ts    # ConstraintIR → Rune condition AST  (MVP CORE)
├── sources/
│   ├── json-schema-reader.ts   # US1 — JSON Schema → SourceModel   (Phase 1)
│   ├── typescript-reader.ts    # US2 — ts-morph → SourceModel      (follow-up)
│   ├── sql-reader.ts           # US3 — node-sql-parser → SourceModel (follow-up)
│   └── python-reader.ts        # US4 — Python AST → SourceModel    (follow-up)
└── diagnostics.ts              # untranslatable-construct reporting
```

### The SourceModel IR

A source-agnostic description of an imported model. Deliberately close to the Rune AST shape but without Langium machinery.

```typescript
interface SourceModel {
  namespace: string;              // derived or supplied via --namespace
  sourceName: string;             // 'JsonSchema' | 'TypeScript' | 'Sql' | 'Pydantic'
  types: SourceType[];
  enums: SourceEnum[];
}

interface SourceType {
  name: string;
  extends?: string;               // parent type name, if any
  description?: string;
  attributes: SourceAttribute[];
  constraints: ConstraintIR[];    // type-level invariants → conditions
  sourceKey: string;              // original name in the source (for synonym)
}

interface SourceAttribute {
  name: string;                   // Rune-safe camelCase
  typeName: string;               // resolved Rune type / enum / builtin name
  cardinality: { inf: number; sup: number | '*' };
  description?: string;
  sourceKey: string;              // original property/column/field name
  constraints: ConstraintIR[];    // attribute-level → conditions or synonym logic
}

interface SourceEnum {
  name: string;
  values: SourceEnumValue[];
  sourceKey: string;
}

interface SourceEnumValue {
  name: string;                   // Rune-safe identifier
  sourceKey: string;               // AMENDED 2026-07-04 (implementation review): the ORIGINAL source enum literal — required for the per-value synonym annotation, which must record the round-trippable source value, never a display label (see amendment note below)
  displayName?: string;            // presentational only (e.g. from an outbound emitter's own enum-display extension); may differ from BOTH name and sourceKey
  description?: string;
}
```

**AMENDED (2026-07-04, implementation review)**: the draft's inline `values`
shape above omitted a per-value `sourceKey`, conflating it with
`displayName` — a real spec bug, not just an implementation gap. The two
are semantically distinct: `displayName` is a presentational label (which
may come from a source-specific display-name extension, e.g. the outbound
JSON Schema emitter's own `x-rune-enum-display`) and is NOT necessarily the
literal value the source schema used; `sourceKey` is that original literal,
and it is what the per-value `[synonym <Source> value "..."]` annotation
must record for the mapping to be round-trippable. An importer that emits
the synonym from `displayName` instead of `sourceKey` silently records the
WRONG value whenever a display-name map is present — caught during Phase 1
implementation review as a hard-invariant-adjacent mistranslation (the
output still parses; the synonym value is simply factually wrong).

### The ConstraintIR — MVP Core

This is the heart of the MVP. Every source carries validation logic in a different syntax; `ConstraintIR` is the normalized vocabulary they all reduce to, and the single place that knows how to render a Rune `condition`.

```typescript
type ConstraintIR =
  | { kind: 'comparison'; op: '=' | '<>' | '<' | '<=' | '>' | '>='; path: string; value: Literal }
  | { kind: 'range'; path: string; min?: number; max?: number; exclusive?: boolean }
  | { kind: 'length'; path: string; min?: number; max?: number }
  | { kind: 'pattern'; path: string; regex: string }   // AMENDED: always emits stub + diagnostic (no expression-level regex in the grammar)
  | { kind: 'oneOf'; paths: string[] }          // exactly one present
  | { kind: 'choice'; paths: string[] }         // at most one present
  | { kind: 'exists'; path: string }
  | { kind: 'absent'; path: string }
  | { kind: 'conditional'; if: ConstraintIR; then: ConstraintIR }
  | { kind: 'custom'; expressionText: string; translatable: false };  // emit stub + diagnostic
```

**Source → ConstraintIR mapping table** (the translation surface; Phase 1 = JSON Schema rows):

| Source construct | ConstraintIR |
|---|---|
| JSON Schema `minimum: n` | `range { min: n }` |
| JSON Schema `maximum: n` | `range { max: n }` |
| JSON Schema `exclusiveMinimum` | `range { min, exclusive: true }` |
| JSON Schema `minLength` / `maxLength` | `length { min, max }` |
| JSON Schema `pattern` | `pattern { regex }` → STUB + diagnostic |
| JSON Schema `oneOf` + `discriminator` | `oneOf { paths }` |
| JSON Schema `required` (conditional via `if`/`then`) | `conditional { if, then: exists }` |
| Zod `.min(n)` / `.max(n)` (number) | `range` *(follow-up)* |
| Zod `.min(n)` / `.max(n)` (array/string) | `length` *(follow-up)* |
| Zod `.regex(re)` | `pattern` → STUB *(follow-up)* |
| Zod `.refine(runeCheckOneOf(...))` | `oneOf` *(follow-up)* |
| Zod `.gte(n)` / `.lte(n)` | `comparison` *(follow-up)* |
| SQL `CHECK (c >= n)` | `comparison` *(follow-up)* |
| SQL `CHECK (c IN (...))` | (→ enum, not condition) *(follow-up)* |
| SQL `CHECK (c BETWEEN a AND b)` | `range` *(follow-up)* |
| SQL `NOT NULL` (already cardinality) | (→ cardinality, not condition) *(follow-up)* |
| Pydantic `Field(ge=n, le=n)` | `range` *(follow-up)* |
| Pydantic `Field(min_length=, max_length=)` | `length` *(follow-up)* |
| Pydantic `Field(pattern=)` | `pattern` → STUB *(follow-up)* |
| Pydantic `@field_validator` (comparison body) | `comparison` *(follow-up)* |
| Pydantic `@model_validator` (one-of body) | `oneOf` *(follow-up)* |

**ConstraintIR → Rune condition** (the emitter, inverse of `transpiler.ts`):

```
range { path: 'value', min: 0 }
    → condition ValueMin: value >= 0

length { path: 'partyId', min: 1 }
    → condition PartyIdLength: partyId count >= 1

oneOf { paths: ['currency','capacityUnit','financialUnit'] }
    → condition OneOf: required choice currency, capacityUnit, financialUnit

choice { paths: ['currency','capacityUnit'] }
    → condition Choice: optional choice currency, capacityUnit

pattern { path: 'code', regex: '^[A-Z]{3}$' }
    → condition CodePattern:
          <"TODO: manual translation required — source pattern: ^[A-Z]{3}$">
          True                  + diagnostic

custom { expressionText: '...', translatable: false }
    → condition <Name>:
          <"TODO: manual translation required — source: <expressionText>">
          True                  + diagnostic
```

**CORRECTION (2026-07-04, grounding)**: the draft above originally showed `oneOf`/`choice` rendering as `[...] one-of` — this is WRONG. The grammar's `OneOfOperation` is a UNARY postfix operator (`{infer OneOfOperation.argument=current} operator='one-of'`, rune-dsl.langium — renders `someAttr one-of`, meaning "exactly one child of someAttr's own collection," not "exactly one of N sibling attributes"). The construct that actually expresses "exactly one / at most one of N named sibling attributes present" is `ChoiceOperation`, discriminated by its `necessity` field (`'required'` = exactly one, matching this spec's `oneOf` IR kind; `'optional'` = at most one, matching this spec's `choice` IR kind) — confirmed against the grammar's `Necessity` rule and CDM/Rosetta domain usage. `ChoiceOperation.attributes` are `[Attribute:ValidID]` references (simple sibling-attribute names), so `oneOf`/`choice` IR `paths` must be simple identifiers local to the same type; a multi-segment path is not representable and falls back to the `custom` stub.

Also corrected: `Condition.expression` is NOT optional in the grammar (an empty body is a parse error), so the `pattern`/`custom` stub body is a real minimal expression (`RosettaBooleanLiteral{value: true}`, renders `True`) rather than a bare comment — the grammar has no comment-bearing node in the expression slot. The TODO text instead goes in `Condition.definition` (a `RosettaDefinable` fragment, renders as a `<"...">` doc string immediately after the condition's name line, shown above).

Condition names are generated deterministically: `<AttributeName><ConstraintKind>` (e.g. `ValueRange`, `CodePattern`), de-duplicated with numeric suffixes.

### Synonym Emission

Every imported attribute and type carries a synonym annotation recording its source name, using the source-specific synonym source declared once per file:

```rune
synonym source JsonSchema

type Party:
    [synonym JsonSchema value "party"]
    partyId string (1..1)
        [synonym JsonSchema value "partyId"]
    partyName string (0..1)
        [synonym JsonSchema value "partyName"]
```

When the source field name already equals the Rune name, the synonym is still emitted (MVP: always emit for round-trip fidelity; a `--no-synonyms` flag suppresses them for a cleaner model). Value transformations discovered during import (e.g. a JSON enum value `"ACT/360"` mapping to Rune `ACT_360`) are emitted as enum synonym mapping logic, which is exactly what the native construct is for:

```rune
enum DayCountFractionEnum:
    [synonym JsonSchema]
    ACT_360 displayName "ACT/360"
        [synonym JsonSchema value "ACT/360"]
```

### Source Parser Dependencies

| Source | Parser | License | Notes |
|---|---|---|---|
| JSON Schema | none (plain JSON); internal `$defs`/`definitions` `$ref` resolution hand-rolled for MVP; `@apidevtools/json-schema-ref-parser` optional later for external refs | MIT / Apache-2.0 | Draft 7 / 2020-12 |
| TypeScript | `ts-morph` | MIT | *(follow-up)* |
| SQL | `node-sql-parser` | Apache-2.0 | *(follow-up)* |
| Python | `web-tree-sitter` + `tree-sitter-python` | MIT | *(follow-up)* |

All run in Node and (with bundling) in the browser, preserving the no-JVM, browser-capable property of the outbound generators. This means inbound import can be a studio feature: paste a JSON Schema, get a Rune model.

### CLI Surface

```
rune-codegen import --from <json-schema|typescript|sql|python> <input> --out-file <output.rune>
    [--namespace <name>]        # override derived namespace
    [--no-synonyms]             # suppress synonym annotations
    [--no-conditions]           # structural import only, skip expression translation
    [--sql-dialect <d>]         # for SQL source, match outbound dialect flags
    [--on-untranslatable <stub|skip|error>]   # default: stub + diagnostic
```

**AMENDED (2026-07-04, implementation grounding)**: the output flag is `--out-file`, not `-o`/`--output` as originally drafted. `rune-codegen`'s ROOT command (the existing outbound path) already declares `-o, --output <dir>` (an output directory, for the multi-file outbound case). Verified with an isolated commander repro that a subcommand redeclaring the SAME short flag character OR the SAME long option name as a parent-declared option — either one alone is sufficient — silently drops its own option value from that subcommand's own parsed options, even though the subcommand redeclares the option itself; this reproduces independent of this codebase's own logic and appears to be an interaction with commander's documented "`.command()` automatically copies the inherited settings from the parent command" behavior. `--out-file` (distinct long name, no short flag) avoids the collision; `-o` remains reserved for the root's own `--output <dir>`.

`import` is a new subcommand alongside the existing default (outbound) behavior, registered in the commander program in `bin/rune-codegen.ts`. Phase 1 implements only `--from json-schema`; the other values error with "not yet supported".

## MVP Definition

The MVP is **US1 (JSON Schema) with full expression translation** (pattern excepted per the amendment), because:

1. JSON Schema is the only source that natively carries the constraint vocabulary the `ConstraintIR` is built around, so it exercises the entire translation layer without requiring a constraint-poor source to be augmented.
2. It is round-trip testable against the existing outbound JSON Schema emitter — the strongest correctness signal available without external fixtures.
3. It establishes the shared `SourceModel` IR, `ConstraintIR`, AST builder, synonym builder, and constraint translator that US2–US4 reuse. Once US1 lands, each additional source is *just* a new `sources/*-reader.ts` producing `SourceModel` + `ConstraintIR`.

Expression translation is in-scope for the MVP, not deferred. A structural-only import (shape without conditions) is explicitly *not* the MVP — the conditions are where the value is, because re-deriving business rules by hand is the expensive part of model adoption. The `--no-conditions` flag exists for users who want structure only, but the default and the headline capability is real expression translation.

## Implementation Phases

### Phase 1: JSON Schema importer + translation core (MVP, P1) — THIS EFFORT

1. Define `SourceModel` and `ConstraintIR` (`source-model.ts`)
2. Implement `constraint-translator.ts` — `ConstraintIR` → Rune condition AST (the inverse of `transpiler.ts`)
3. Implement `ast-builder.ts` — `SourceModel` → Rune AST-shaped nodes (Data, Enum, Condition)
4. Implement `synonym-builder.ts` — attach synonym annotations
5. Implement `json-schema-reader.ts` — JSON Schema → `SourceModel` + `ConstraintIR`
6. Wire `import` subcommand into the CLI
7. Round-trip tests (AMENDED 2026-07-04 — split-oracle): (a) structural half — `.rune` → (outbound JSON Schema) → (inbound) → `.rune`, assert structural equivalence (types/attrs/cardinalities/enums/inheritance); (b) condition half — a hand-written JSON Schema fixture with real constraint keywords → (inbound) → `.rune`, parse-first validate, assert condition-expression tree-equivalence against a hand-written `.rune` expectation. See "Round-Trip as a Test Oracle" for why these are two suites, not one.
8. CDM smoke test: import the FINOS CDM JSON Schema distribution (skipIf-guarded on a local copy), verify it parses and serializes to valid `.rune`

### Phase 2: TypeScript + SQL importers (P2) — follow-up

### Phase 3: Python importer (P3) — follow-up

### Phase 4: Studio integration — follow-up

## Open Questions — RESOLVED at adoption

1. **Modern mapping idiom**: RESOLVED — classic synonyms (user decision 2026-07-04). Broadest tool support, matches CDM's FpML/ISO precedent, renderer surface corpus-validated (#363). rule/ruleReference emission may become a configurable mode later.
2. **Namespace derivation**: MVP rule stands — derive from `$id` host+path (reverse-DNS-ish), fall back to `--namespace`; error if neither yields a valid namespace.
3. **`pattern` condition idiom**: RESOLVED — the grammar has NO expression-level regex operator (`pattern` exists only in synonym mapping bodies as a value transform, rune-dsl.langium:608/630/803). `pattern` constraints always emit the stub + diagnostic.
4. **Meta/reference types**: MVP rule stands — always inline unless a `$ref` is reused across ≥2 sites, then emit a named type.

## Strategic Notes

### On-Ramp, Not Just Output

Every outbound target answers "I have a Rune model, give me X." Inbound answers "I have X, give me a Rune model." That inverts the adoption cost. A firm with an existing JSON Schema or TypeScript domain model can be looking at a working `.rune` file — editable in the studio, with conditions intact — in one command, instead of weeks of manual translation. This is the single largest lever on Rune adoption for TypeScript-native firms, and no existing tool (REGnosys included) offers automated inbound generation into Rune from these formats.

### Round-Trip as a Test Oracle

Because the inbound and outbound sides share the same model, every outbound emitter doubles as a test oracle for its inbound counterpart — for STRUCTURE. `Rune → JSON Schema → Rune` is an identity for types/attributes/cardinalities/enums/inheritance (modulo synonyms); `Rune → Zod → Rune` likewise. This gives the inbound side a correctness signal that most code generators never have, and it is the reason to build inbound *after* the outbound emitters rather than in isolation.

**AMENDED (2026-07-04) — split oracle for conditions.** The identity does NOT extend to condition *content*: the outbound JSON Schema emitter (`json-schema-emitter.ts`) deliberately encodes a Rune `condition` as opaque `x-rune-conditions: [{ name, kind: 'condition' }]` metadata — no `minimum`/`maximum`/`minLength`/`pattern`/`oneOf` keyword, no expression payload at all. This was an intentional decision from spec 015/017 (the module's own header comment: "conditions are not promised in JSON Schema output... This design is intentional"), not an oversight, and is out of scope for THIS effort to change (the outbound emitters are shipped, corpus-validated machinery). Consequently `Rune → JSON Schema → Rune` cannot round-trip a condition's expression through the SAME emitted file — the information needed to reconstruct `value >= 0` from `{name: "ValueRange", kind: "condition"}` simply isn't present.

The round-trip suite (Phase 1 item 7) therefore splits into two independent halves: the STRUCTURAL half still uses the real outbound emitter as its oracle (exactly as originally designed); the CONDITION half uses a hand-written JSON Schema fixture carrying real constraint keywords (the same shape acceptance scenarios 5-6 already require) as its oracle, since that's what a hand-authored/CDM-style JSON Schema — the importer's actual target audience — legitimately has.

**Recorded follow-up (not this effort):** teaching the outbound JSON Schema emitter to ALSO emit real constraint keywords for translatable condition kinds (`range`→`minimum`/`maximum`, `length`→`minLength`/`maxLength`, `oneOf`(`required choice`)→`oneOf`+`discriminator`) alongside (or instead of) the opaque `x-rune-conditions` metadata would restore a single-artifact round-trip AND independently improve the outbound JSON Schema target for non-Rune consumers who want real validation, not just structure. Worth its own effort; not bundled into inbound Phase 1.

### Mapping as a First-Class Artifact

Emitting native synonyms (rather than a bespoke mapping sidecar) means the import is expressed in the same language as the model. A user can hand-edit the synonyms to refine the mapping, re-run, and the correspondence is version-controlled alongside the model. This is the same design principle REGnosys uses for FpML/ISO mappings onto CDM — we are reusing the language's own mapping facility rather than inventing one.

### Licensing

Inbound generation lives in the MIT-licensed `@rune-langium/codegen` package, consistent with the outbound emitters. It strengthens the same funnel: lower the cost of getting *into* Rune, and more users reach the studio.

---

## Phase 2 Addendum (adopted 2026-07-04, user directives)

**Reader architecture (BINDING for all readers from Phase 2 on):**

1. **The intermediate IS `Dehydrated<T>`** — no invented node types. `ast-builder`/`constraint-translator` output is typed as core's `Dehydrated<Data>`/`Dehydrated<Attribute>`/`Dehydrated<RosettaEnumeration>`/etc. (type-only imports; zero runtime weight). Phase 1's local `DataNode`/`AttributeNode`/`EnumerationNode`/`EnumValueNode`/`ConditionNode` interfaces are RETROFITTED away — any type error the swap surfaces is a drift finding, not friction.
2. **Tree-sitter across the board for language sources** (TypeScript/SQL/Python readers): `web-tree-sitter` WASM runtime + per-language grammars. `ts-morph` REJECTED (drags the full TS compiler as a runtime dep). Consequence: companion-Zod extraction is SYNTACTIC (same-file / explicitly-listed schema files; no cross-file import resolution). `node-sql-parser` superseded by `tree-sitter-sql` (dialect-coverage check at that reader's design time).
3. **Typed schema libraries for document sources**: `@types/json-schema` (retrofit the shipped reader's hand-rolled shapes) and `openapi-types` — both types-only, zero runtime bytes.
4. **Subpath restructure — CLEAN FLIP** (package unpublished, zero external consumers, all migration in-repo):
   - `@rune-langium/codegen/export` — the outbound emitters (generate(), all emitters, namespace walker)
   - `@rune-langium/codegen/import` — the inbound surface (readers, SourceModel/ConstraintIR, builders, importModel)
   - `@rune-langium/codegen/rosetta` — UNCHANGED (the shared Rune-text writer, consumed by both directions)
   - The main barrel `.` empties to shared types only (or is removed if nothing genuinely shared remains); every in-repo consumer migrates in the same PR.
5. **Phase 2 order REORDERED: OpenAPI reader FIRST** (TypeScript/SQL move later). OpenAPI `components.schemas` ARE JSON Schema: OAS 3.1 ≈ direct delegation to the shipped json-schema machinery; OAS 3.0 dialect normalization layer (nullable: true → optionality; `discriminator` OBJECT {propertyName, mapping} → choice/oneOf IR incl. mapping-driven branch resolution; allOf composition). Synonym source name: `OpenApi`. **YAML: in scope** via the `yaml` package (MIT, browser-safe) — OpenAPI documents in the wild are predominantly YAML; a JSON-only OpenAPI importer would miss the point. This is the import subpath's first (and only, so far) runtime dependency, isolated behind `/import`.

**Phase 2 (OpenAPI) task order:** (1) Dehydrated<T> retrofit → (2) subpath clean flip (/import + /export; consumer migration same PR) → (3) @types/json-schema retrofit → (4) openapi-reader (3.0 normalization + 3.1 passthrough + YAML) with fixtures for both OAS versions → (5) oracles: round-trip a Rune model through outbound JSON Schema wrapped as an OAS component set; petstore-class public fixture; inbound hard invariant throughout.

---

## Phase 2b (recorded 2026-07-04, user-directed — NOT in the Phase 2 PR)

Two paired follow-ups forming the next OpenAPI increment:

1. **Outbound OpenAPI emitter** (`Rune → OpenAPI`): wrap the JSON Schema emitter's per-type output into `components.schemas`; absorb the recorded constraint-keywords follow-up (real `minimum`/`maximum`/`minLength`/`oneOf` for translatable conditions — an OpenAPI emitter without them would repeat the opaque-metadata round-trip gap); OAS 3.1 dialect; **YAML output required** (not just JSON — the `yaml` package is already a runtime dep of this package, so `/export` reuses it; emit format follows the requested output extension or an explicit flag).
2. **Functions ↔ operations mapping (both directions)**: Rune `func` ↔ OpenAPI path operation. Inbound: `paths.*.{method}` → `RosettaFunction` (`operationId` → sanitized func name; parameters + requestBody schema → inputs with required→cardinality; 2xx response schema → output; summary/description → definition; parameter constraints → conditions). Outbound: the inverse. **Plus CRUD generation as an EMITTER OPTION (user, 2026-07-04)**: the outbound emitter gains an opt-in option to generate the standard CRUD operation set (`GET /xs`, `GET /xs/{id}`, `POST /xs`, `PUT|PATCH /xs/{id}`, `DELETE /xs/{id}`) for selected types — an emitter option, not default behavior, and not an inbound requirement. (Inbound CRUD-shape recognition mapping to conventionally-named funcs like CDM's `Create_*` idiom is a possible later refinement, not Phase 2b scope.) DESIGN-TIME VERIFICATION: whether the grammar permits synonym annotations on funcs — if not, the operation↔func correspondence needs a different carrier (definition text or naming convention); settle in the Phase 2b brainstorm.

Together these make the OpenAPI pair a true two-way target: schemas ↔ types AND operations ↔ funcs, with the outbound emitter serving as the inbound reader's single-artifact round-trip oracle (the oracle the JSON Schema pair couldn't have).

---

## Phase 2b Implementation Addendum (adopted 2026-07-04)

**Grammar verification RESOLVED**: funcs do NOT accept synonym annotations (`RosettaFunction` takes `(References | Annotations)*` — `AnnotationRef` only; the `Synonyms` fragment is absent, rune-dsl.langium:147-159). The operation↔func correspondence carrier is therefore ONE OF: (a) a declared custom annotation consumed via `AnnotationRef` (e.g. `annotation openApi: ...` attached as `[openApi ...]` — parse-first validate the exact shape the grammar's AnnotationRef supports, including whether it can carry a string payload); or (b) a deterministic naming/definition-text convention. Prefer (a) if AnnotationRef can carry the operation string; fall back to (b) with the choice documented. Either way the correspondence must survive the round trip.

**Architecture decisions:**

1. **Constraint keywords via a shared recognizer** — NEW module: condition-expression → `ConstraintIR` RECOGNIZER (the inverse of the inbound `constraint-translator`; pattern-matches the translatable condition shapes: `x >= n`/comparisons, `x count >= n`, `required|optional choice a, b`, `x exists/absent`) + `ConstraintIR` → JSON Schema keyword rendering. `ConstraintIR` is the shared vocabulary — internal cross-module sharing within the package is fine (subpaths are PUBLIC surface only); house the shared types where both sides can import them without public cross-subpath re-exports. Unrecognizable conditions keep the existing opaque `x-rune-conditions` metadata (nothing lost, keywords are additive).
2. **Scope: OpenAPI emitter only** — the existing JSON Schema emitter's output is UNCHANGED in Phase 2b (its tests, fixtures, and the inbound structural round-trip stay byte-stable). Teaching the JSON Schema emitter keywords behind an option is a later, separate item.
3. **The emitter**: new outbound target `-t openapi` registered like the existing targets (TARGET_DESCRIPTORS etc.); document skeleton = OAS 3.1 (`openapi: 3.1.x`, `info` from namespace + version, `components.schemas` from the JSON-Schema-emitter-shaped per-type output PLUS recognized constraint keywords). **YAML output required**: emit YAML or JSON per the output file extension (or an explicit format option); the `yaml` package (already a runtime dep) serializes.
4. **Funcs → operations (MVP shape)**: RPC-style — each func becomes `POST /functions/{FuncName}` (or the OAS-conventional equivalent the implementer grounds), `operationId` = func name, inputs → requestBody schema (an inline object of the func's inputs, respecting cardinality), output → the 200 response schema, definition → summary/description, recognizable pre-conditions → parameter/requestBody constraints where they map. Inbound (the Phase 2 reader) gains the matching `paths` consumption so the round trip closes: reader maps operations back to funcs via the correspondence carrier.
5. **CRUD generation as an opt-in EMITTER OPTION** (per the user scoping): option (CLI flag + programmatic option, mirroring existing per-target option conventions like excel-options) that generates the standard CRUD operation set (`GET /xs`, `GET /xs/{id}`, `POST /xs`, `PUT /xs/{id}`, `DELETE /xs/{id}`) for selected (or all) Data types, schemas referencing `components.schemas`. NOT default. Inbound recognition of CRUD shapes is OUT of Phase 2b.
6. **THE ORACLE (acceptance centerpiece)**: the single-artifact round trip the JSON Schema pair couldn't have — `Rune → OpenAPI emitter → OpenAPI reader → Rune` as an identity for: types/attributes/cardinality/enums/inheritance, RECOGNIZABLE conditions (through keywords), and funcs (through operations + the carrier). Structural + tree-equivalence comparison, parse-first throughout, inbound hard invariant unchanged.

---

## Phase 2c Addendum (adopted 2026-07-05, user-directed): SQL reader, tree-sitter, constraint-gap closure

**Order change**: SQL reader precedes the TypeScript reader (user, 2026-07-05).

1. **Parser: tree-sitter** per the Phase 2 Addendum directive — `web-tree-sitter` (WASM runtime) + a SQL grammar shipping PREBUILT wasm (candidate: DerekStride's tree-sitter-sql; building grammar wasm from source requires emscripten and is OUT — a viability spike gates the effort: if no installable prebuilt-wasm SQL grammar exists, STOP and report options rather than compromising the toolchain). WASM loading must work in Node now and be browser-loadable in principle (the /import subpath's isolation point); abstract the wasm source location.
2. **Naming (user-explicit)**: `snake_case` tables → **PascalCase** Rune types; `snake_case` columns → camelCase attributes; enum-ish CHECK values → safe enum member names. Originals ALWAYS retained via `[synonym Sql value "<original>"]` (types, attributes, enum values) — the established converters and collision-dedup rules apply.
3. **Constraint-gap closure (user-directed — the reader translates every ConstraintIR-expressible SQL construct, not a token subset):**
   - `NOT NULL` / nullable → cardinality (1..1)/(0..1) — never a condition
   - `CHECK (col >= n)` and all comparison operators → `comparison`/`range` IR (per-bound exclusivity rules as established)
   - `CHECK (col BETWEEN a AND b)` → `range` (inclusive both bounds per SQL semantics)
   - `CHECK (col IN ('A','B',...))` → Rune enum + attribute retyped to it (not a condition)
   - `VARCHAR(n)`/`CHAR(n)`/`NVARCHAR(n)` → `length { max: n }`; `CHECK (char_length(col) >= n)` / `LEN(col)` (dialect fns) → `length`
   - `CHECK (col LIKE ...)` / regex operators → `pattern` → stub + diagnostic (the established rule; no expression-level regex in Rune)
   - `FOREIGN KEY` → attribute typed as the referenced Rune type; the emitter's inheritance-FK convention (`FOREIGN KEY (id) REFERENCES Parent(id)`) → `extends`
   - Join table `{parent}_{attr}` with parent FK + element FK (+ optional position column) → parent gains a `(0..*)` attribute of the element type; the join table itself is not emitted as a type
   - `PRIMARY KEY`/`UNIQUE`/`DEFAULT` → recorded as diagnostics-level notes (no Rune equivalent in scope), never silently dropped
   - Unsupported CHECK expressions → `custom` stub + diagnostic (`--on-untranslatable` honored)
4. **Dialects**: postgres + sqlserver (matching the outbound emitter's `SqlDialectName` surface) are the tested matrix; `--sql-dialect` CLI flag per the spec's original surface. The tree-sitter grammar's dialect tolerance is part of the T0 spike report.
5. **Oracles (split, per the Phase 1 precedent)**: STRUCTURAL round trip through the real outbound SQL emitter (both dialects): types, cardinality, enum CHECKs → enums, reference FKs → typed attributes, inheritance FK → extends. CONSTRAINT round trip through hand-written DDL fixtures (the emitter does not emit comparison CHECKs), tree-equivalence against hand-written `.rune` expectations. Inbound hard invariant throughout.

## Phase 2c Addendum 2 (adopted 2026-07-06, user-directed): typed tree-sitter node access via generated node-types

**Motivation**: every real bug found across T0–T4 and the post-merge PR review that involved tree-sitter node shape (the anonymous-operator-token confusion, the `char_length(col) <= n` backwards bound-selection bug, the quoted-identifier-as-`literal`-not-`field` confusion, the BETWEEN ERROR-sibling recovery) stems from `sql-reader.ts` accessing child nodes by POSITION or by scanning `namedChildren`/`children` for a matching `.type`, with zero compile-time guarantee the assumed shape is correct. Every tree-sitter grammar ships a `src/node-types.json` — a machine-readable description of every node kind's real, NAMED fields (verified: `@l1xnan/tree-sitter-sql`'s ships 552 entries; `binary_expression` declares real `left`/`operator`/`right` fields; `between_expression` declares `low`/`high`/`left`/`operator`; `column_definition` declares `name`/`type`/`custom_type`; `field` declares `name` among others; `invocation` declares `parameter`). `web-tree-sitter`'s `Node.childForFieldName(name)` already exposes this at runtime — `sql-reader.ts` never uses it.

1. **No-codegen (pure type-level derivation from an imported `node-types.json`) was spiked and REJECTED**: TypeScript's `resolveJsonModule` always widens primitive types on import (confirmed on the real 552-entry file AND on a minimal one-property control case — not a size/complexity artifact). Neither `as const` (rejects import references outright, TS1355) nor a `const` type parameter (cannot restore literal-ness already lost at the import boundary) recovers it. Getting a real literal-typed discriminated union requires the data to exist as an actual `.ts` literal expression at the point the assertion applies.
2. **Decision: a small, one-time/rarely-run GENERATOR, not a live build step.** A generic, parameterized script — `--input <path to a node-types.json>`, `--output <path to emit>`, `--prefix <TypeName prefix>` — reads any tree-sitter grammar's `node-types.json` and emits a generated `.ts` file: `export const <PREFIX>_NODE_TYPES = [...] as const;` (the full raw entry set — no curation; the whole grammar's vocabulary, not just the subset one reader currently uses) plus derived types `<Prefix>NodeKind` (union of every `type` value) and `<Prefix>NodeFields<K>` (the field-name union for a given kind, `never` if the kind has none). The script is GENERIC to any grammar's `node-types.json` — not SQL-specific — so a future tree-sitter reader (if one is ever built) adds its own `generate:<x>-node-types` package script pointing at its own grammar's file, reusing the same generator rather than writing a new one.
3. **The runtime field-accessor wrapper is hand-written, not generated** (it's logic, not data): a small `typedField<K extends SqlNodeKind>(node, kind, field: SqlNodeFields<K> & string)` wrapping `childForFieldName`, living alongside `sql-reader.ts`.
4. **Retrofit scope**: replace positional/`.find()`-based access with the typed field accessor ONLY where the grammar genuinely declares a field — `binary_expression` (left/operator/right — retires the manual lhs/rhs/operator-scan logic that caused two real bugs this session), `between_expression` (low/high/left/operator), `column_definition` (name/type), `field` (name), `invocation` (parameter, replacing the two-step `walkNamed('field')`-then-`walkNamed('literal')` fallback with one direct lookup). Node kinds with NO declared fields (`column_definitions`, `constraints`, `create_table`, `ordered_columns`, `list`, `program`) keep the existing children-scan approach — not a gap, the grammar genuinely exposes no fields there. This is a BEHAVIOR-PRESERVING refactor: the full existing test suite (94 files / 1203+ tests) must stay green with zero changes to emitted `.rune` output — the goal is compile-time safety and clarity, not new translation behavior.
5. **Exact-pin `@l1xnan/tree-sitter-sql`** (move from the current `^0.4.7` caret range to an exact `pnpm-workspace.yaml` override, matching this repo's established convention for generator-adjacent dependencies — `langium-zod`, the `@zod-to-form` trio). Generated code is tied to one exact grammar version's shape; a caret range could silently drift the installed grammar without regenerating.
6. **Drift-detection test**: at test time, re-read the actually-installed package's `node-types.json` and deep-compare it against the generated file's baked-in data. A silent version bump without regeneration must fail LOUDLY (a real test failure), not corrupt output quietly.
